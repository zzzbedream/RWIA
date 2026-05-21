// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IRouterClient} from "./interfaces/ccip/IRouterClient.sol";
import {IAny2EVMMessageReceiver} from "./interfaces/ccip/IAny2EVMMessageReceiver.sol";
import {Client} from "./interfaces/ccip/Client.sol";

import {IntentTypes} from "./IntentTypes.sol";
import {IIntentDLQ} from "./IIntentDLQ.sol";

/// @title Ronin Waypoint Intent Aggregator
/// @notice Aggregates EIP-712 signed cross-chain intents and dispatches them via Chainlink CCIP.
///         Failed inbound messages are parked in an IntentDLQ for safe recovery.
contract IntentAggregator is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    EIP712Upgradeable,
    IAny2EVMMessageReceiver
{
    using SafeERC20 for IERC20;
    using IntentTypes for IntentTypes.UserIntent;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public constant MAX_INTENTS_PER_TX = 16;

    /// @custom:storage-location erc7201:rwia.storage.IntentAggregator
    struct Storage {
        IRouterClient router;
        IIntentDLQ dlq;
        mapping(address user => uint96 nonce) nonces;
        mapping(uint64 destChainSelector => bool allowed) destChainAllowed;
        mapping(uint64 srcChainSelector => mapping(bytes sender => bool allowed)) srcSenderAllowed;
        mapping(bytes32 messageId => bool consumed) consumedMessages;
        uint64 defaultGasLimit;
    }

    // keccak256(abi.encode(uint256(keccak256("rwia.storage.IntentAggregator")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant _STORAGE_SLOT = 0xa14c4dec3aac3f9b09a5e1d59a8826c4e2d6da08e9d3e9b3a8d31be6f5cf4a00;

    function _s() private pure returns (Storage storage $) {
        bytes32 slot = _STORAGE_SLOT;
        assembly {
            $.slot := slot
        }
    }

    event IntentDispatched(
        bytes32 indexed messageId,
        address indexed user,
        uint64 indexed destinationChainSelector,
        address token,
        uint128 amount,
        bytes receiver,
        uint96 nonce
    );

    event IntentReceived(bytes32 indexed messageId, uint64 indexed sourceChainSelector, bytes sender);
    event IntentParked(bytes32 indexed messageId, string reason);
    event DestChainAllowlistUpdated(uint64 indexed destChainSelector, bool allowed);
    event SrcSenderAllowlistUpdated(uint64 indexed srcChainSelector, bytes sender, bool allowed);
    event RouterUpdated(address indexed router);
    event DLQUpdated(address indexed dlq);
    event DefaultGasLimitUpdated(uint64 gasLimit);

    error ZeroAddress();
    error EmptyBatch();
    error TooManyIntents(uint256 provided, uint256 max);
    error IntentExpired(uint64 deadline);
    error InvalidNonce(uint96 expected, uint96 provided);
    error InvalidSignature();
    error DestinationChainNotAllowed(uint64 destChainSelector);
    error SourceChainNotAllowed(uint64 sourceChainSelector);
    error SenderNotAllowed(uint64 sourceChainSelector, bytes sender);
    error MessageAlreadyConsumed(bytes32 messageId);
    error InsufficientFee(uint256 required, uint256 provided);
    error CallerNotRouter(address caller, address router);
    error ZeroAmount();
    error EmptyReceiver();
    error NotMatchingUser(address signer, address user);

    modifier onlyRouter() {
        if (msg.sender != address(_s().router)) revert CallerNotRouter(msg.sender, address(_s().router));
        _;
    }

    /// @dev Disables initializers on the implementation, per UUPS best practices.
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address upgrader,
        address keeper,
        IRouterClient router_,
        IIntentDLQ dlq_,
        uint64 defaultGasLimit_
    ) external initializer {
        if (admin == address(0) || upgrader == address(0) || keeper == address(0)) {
            revert ZeroAddress();
        }
        if (address(router_) == address(0) || address(dlq_) == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __Pausable_init();
        __EIP712_init("RoninWaypointIntentAggregator", "1");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(KEEPER_ROLE, keeper);

        Storage storage $ = _s();
        $.router = router_;
        $.dlq = dlq_;
        $.defaultGasLimit = defaultGasLimit_;

        emit RouterUpdated(address(router_));
        emit DLQUpdated(address(dlq_));
        emit DefaultGasLimitUpdated(defaultGasLimit_);
    }

    // -- Admin --------------------------------------------------------------------------------

    function setDestChainAllowed(uint64 destChainSelector, bool allowed) external onlyRole(ADMIN_ROLE) {
        _s().destChainAllowed[destChainSelector] = allowed;
        emit DestChainAllowlistUpdated(destChainSelector, allowed);
    }

    function setSrcSenderAllowed(uint64 srcChainSelector, bytes calldata sender, bool allowed)
        external
        onlyRole(ADMIN_ROLE)
    {
        _s().srcSenderAllowed[srcChainSelector][sender] = allowed;
        emit SrcSenderAllowlistUpdated(srcChainSelector, sender, allowed);
    }

    function setRouter(IRouterClient router_) external onlyRole(ADMIN_ROLE) {
        if (address(router_) == address(0)) revert ZeroAddress();
        _s().router = router_;
        emit RouterUpdated(address(router_));
    }

    function setDLQ(IIntentDLQ dlq_) external onlyRole(ADMIN_ROLE) {
        if (address(dlq_) == address(0)) revert ZeroAddress();
        _s().dlq = dlq_;
        emit DLQUpdated(address(dlq_));
    }

    function setDefaultGasLimit(uint64 gasLimit) external onlyRole(ADMIN_ROLE) {
        _s().defaultGasLimit = gasLimit;
        emit DefaultGasLimitUpdated(gasLimit);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // -- Views --------------------------------------------------------------------------------

    function router() external view returns (IRouterClient) {
        return _s().router;
    }

    function dlq() external view returns (IIntentDLQ) {
        return _s().dlq;
    }

    function defaultGasLimit() external view returns (uint64) {
        return _s().defaultGasLimit;
    }

    function nonces(address user) external view returns (uint96) {
        return _s().nonces[user];
    }

    function isDestChainAllowed(uint64 destChainSelector) external view returns (bool) {
        return _s().destChainAllowed[destChainSelector];
    }

    function isSrcSenderAllowed(uint64 srcChainSelector, bytes calldata sender) external view returns (bool) {
        return _s().srcSenderAllowed[srcChainSelector][sender];
    }

    function isMessageConsumed(bytes32 messageId) external view returns (bool) {
        return _s().consumedMessages[messageId];
    }

    function hashIntent(IntentTypes.UserIntent calldata intent) public view returns (bytes32) {
        return _hashTypedDataV4(IntentTypes.hashStruct(intent));
    }

    function verifyIntentSignature(IntentTypes.UserIntent calldata intent, bytes calldata signature)
        public
        view
        returns (bool)
    {
        bytes32 digest = hashIntent(intent);
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError) return false;
        return signer == intent.user;
    }

    // -- Core ---------------------------------------------------------------------------------

    /// @notice Dispatches a batch of EIP-712 signed intents to their destination chains via CCIP.
    ///         msg.value is consumed for CCIP native fees. Caller must pre-approve token transfers
    ///         on behalf of each intent.user (or be the user) and the contract pulls tokens with
    ///         SafeERC20.
    function executeIntents(IntentTypes.UserIntent[] calldata intents, bytes[] calldata signatures)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32[] memory messageIds)
    {
        uint256 n = intents.length;
        if (n == 0) revert EmptyBatch();
        if (n > MAX_INTENTS_PER_TX) revert TooManyIntents(n, MAX_INTENTS_PER_TX);
        if (signatures.length != n) revert TooManyIntents(signatures.length, n);

        Storage storage $ = _s();
        messageIds = new bytes32[](n);
        uint256 remainingFee = msg.value;

        for (uint256 i = 0; i < n; ++i) {
            IntentTypes.UserIntent calldata intent = intents[i];

            if (intent.amount == 0) revert ZeroAmount();
            if (intent.receiver.length == 0) revert EmptyReceiver();
            if (block.timestamp > intent.deadline) revert IntentExpired(intent.deadline);
            if (!$.destChainAllowed[intent.destinationChainSelector]) {
                revert DestinationChainNotAllowed(intent.destinationChainSelector);
            }

            uint96 expectedNonce = $.nonces[intent.user];
            if (intent.nonce != expectedNonce) revert InvalidNonce(expectedNonce, intent.nonce);

            if (!verifyIntentSignature(intent, signatures[i])) revert InvalidSignature();

            unchecked {
                $.nonces[intent.user] = expectedNonce + 1;
            }

            IERC20(intent.token).safeTransferFrom(intent.user, address(this), intent.amount);
            IERC20(intent.token).forceApprove(address($.router), intent.amount);

            Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
            tokenAmounts[0] = Client.EVMTokenAmount({token: intent.token, amount: intent.amount});

            Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
                receiver: intent.receiver,
                data: abi.encode(intent.user, intent.nonce),
                tokenAmounts: tokenAmounts,
                feeToken: address(0),
                extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: $.defaultGasLimit}))
            });

            uint256 fee = $.router.getFee(intent.destinationChainSelector, message);
            if (fee > remainingFee) revert InsufficientFee(fee, remainingFee);
            unchecked {
                remainingFee -= fee;
            }

            bytes32 messageId = $.router.ccipSend{value: fee}(intent.destinationChainSelector, message);
            messageIds[i] = messageId;

            emit IntentDispatched(
                messageId,
                intent.user,
                intent.destinationChainSelector,
                intent.token,
                intent.amount,
                intent.receiver,
                intent.nonce
            );
        }

        if (remainingFee > 0) {
            (bool ok,) = payable(msg.sender).call{value: remainingFee}("");
            require(ok, "refund failed");
        }
    }

    // -- CCIP receive -------------------------------------------------------------------------

    /// @inheritdoc IAny2EVMMessageReceiver
    function ccipReceive(Client.Any2EVMMessage calldata message)
        external
        override
        onlyRouter
        whenNotPaused
        nonReentrant
    {
        Storage storage $ = _s();

        if (!$.srcSenderAllowed[message.sourceChainSelector][message.sender]) {
            _park(message, "src/sender not allowed");
            return;
        }
        if ($.consumedMessages[message.messageId]) {
            _park(message, "duplicate messageId");
            return;
        }

        $.consumedMessages[message.messageId] = true;
        emit IntentReceived(message.messageId, message.sourceChainSelector, message.sender);
        // Application-specific inbound processing intentionally left to upgrades.
    }

    function _park(Client.Any2EVMMessage calldata message, string memory reason) private {
        Storage storage $ = _s();
        bytes memory payload = abi.encode(message.data, message.destTokenAmounts);
        $.dlq.park(message.messageId, message.sourceChainSelector, message.sender, payload, reason);
        emit IntentParked(message.messageId, reason);
    }

    // -- UUPS ---------------------------------------------------------------------------------

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {
        // newImplementation address is validated by AccessControl + upgrader role gating.
        newImplementation;
    }

    // -- ERC165 -------------------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId) public view override(AccessControlUpgradeable) returns (bool) {
        return interfaceId == type(IAny2EVMMessageReceiver).interfaceId || super.supportsInterface(interfaceId);
    }

    receive() external payable {}
}
