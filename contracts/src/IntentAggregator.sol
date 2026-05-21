// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {IntentTypes} from "./IntentTypes.sol";

/// @title  Ronin Waypoint Intent Aggregator — V1 (Native NFT settlement)
/// @notice V1 settles NFT-purchase intents natively on Ronin: a Keeper that
///         has been paid off-chain in fiat or a stablecoin executes the
///         intent on-chain, transferring an NFT it already owns to the user.
///         The contract validates the user's EIP-712 signature, enforces the
///         deadline, and prevents replay via an intent-hash mapping.
///
///         CCIP-based cross-chain dispatch is intentionally NOT in V1. The
///         UUPS upgrade hook is gated by an external TimelockController, so
///         V2 can introduce CCIP without state loss.
/// @dev    Storage uses ERC-7201 namespaced layout; the root storage layout
///         is empty so this contract is upgrade-safe by construction.
contract IntentAggregator is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    EIP712Upgradeable
{
    using IntentTypes for IntentTypes.UserIntent;

    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------

    /// @notice Allowed to pause, unpause, and rotate Keepers.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Allowed to call _authorizeUpgrade. Set to a TimelockController.
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @notice Allowed to call executeLocalIntent. The Keeper is the entity
    ///         that received fiat off-chain and now delivers the NFT.
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    // ---------------------------------------------------------------------
    // ERC-7201 namespaced storage
    // ---------------------------------------------------------------------

    /// @custom:storage-location erc7201:rwia.storage.IntentAggregatorV1
    struct Storage {
        /// @dev Tracks executed intent hashes to prevent replay.
        mapping(bytes32 intentHash => bool executed) executedIntents;
    }

    // keccak256(abi.encode(uint256(keccak256("rwia.storage.IntentAggregatorV1")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant _STORAGE_SLOT = 0x8f7ffa7830ed47936fdfb086a94b9b3d7c14998a38c285d9f30fbd1926fd4400;

    function _s() private pure returns (Storage storage $) {
        bytes32 slot = _STORAGE_SLOT;
        assembly {
            $.slot := slot
        }
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice Emitted exactly once per intent on successful execution.
    event IntentExecuted(
        bytes32 indexed intentHash,
        address indexed user,
        address indexed nftContract,
        uint256 tokenId,
        address tokenAddress,
        uint256 amount,
        address keeper
    );

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error IntentExpired(uint256 deadline, uint256 currentTimestamp);
    error InvalidSignature();
    error IntentAlreadyExecuted(bytes32 intentHash);
    error InvalidNftContract();

    // ---------------------------------------------------------------------
    // Constructor / initializer
    // ---------------------------------------------------------------------

    /// @dev Locks the implementation; the proxy must call `initialize`.
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time initializer invoked through the ERC1967 proxy.
    /// @param admin     Address granted DEFAULT_ADMIN_ROLE + ADMIN_ROLE.
    ///                  Should be a multisig on mainnet.
    /// @param upgrader  Address granted UPGRADER_ROLE. MUST be a
    ///                  TimelockController in production.
    /// @param keeper    Address granted KEEPER_ROLE (operator that pays gas
    ///                  and delivers NFTs).
    function initialize(address admin, address upgrader, address keeper) external initializer {
        if (admin == address(0) || upgrader == address(0) || keeper == address(0)) {
            revert ZeroAddress();
        }
        __AccessControl_init();
        __Pausable_init();
        __EIP712_init("RoninWaypointIntentAggregator", "1");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(KEEPER_ROLE, keeper);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice EIP-712 digest the user must sign for a given intent.
    function hashIntent(IntentTypes.UserIntent calldata intent) public view returns (bytes32) {
        return _hashTypedDataV4(IntentTypes.hashStruct(intent));
    }

    /// @notice True iff the digest of `intent` recovers to `intent.user`.
    /// @dev    Uses `tryRecover` to avoid reverting on malformed signatures —
    ///         callers see a boolean and emit a clean InvalidSignature error.
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

    /// @notice Whether `intentHash` has already been executed.
    function isIntentExecuted(bytes32 intentHash) external view returns (bool) {
        return _s().executedIntents[intentHash];
    }

    // ---------------------------------------------------------------------
    // Core
    // ---------------------------------------------------------------------

    /// @notice Keeper-only: validates the user's EIP-712 signature, marks the
    ///         intent as executed, and transfers the NFT from the Keeper's
    ///         wallet to the user.
    ///
    /// @dev    Preconditions:
    ///         - Keeper must hold or be approved for `intent.tokenId` on
    ///           `intent.nftContract` BEFORE calling.
    ///         - Keeper must call `setApprovalForAll(thisContract, true)` (or
    ///           per-token `approve`) so the aggregator can pull the NFT.
    ///
    ///         Effects (state changes occur strictly BEFORE the external
    ///         `safeTransferFrom`, satisfying checks-effects-interactions):
    ///         1. Mark intent hash as executed.
    ///         2. Emit IntentExecuted.
    ///         3. Call safeTransferFrom (external interaction).
    ///
    /// @param intent    The user's signed intent.
    /// @param signature The user's EIP-712 signature over `intent`.
    function executeLocalIntent(IntentTypes.UserIntent calldata intent, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        onlyRole(KEEPER_ROLE)
    {
        // --- Validation ---------------------------------------------------
        if (intent.user == address(0)) revert ZeroAddress();
        if (intent.nftContract == address(0)) revert InvalidNftContract();
        if (intent.amount == 0) revert ZeroAmount();
        if (block.timestamp > intent.deadline) revert IntentExpired(intent.deadline, block.timestamp);

        bytes32 intentHash = hashIntent(intent);
        Storage storage $ = _s();
        if ($.executedIntents[intentHash]) revert IntentAlreadyExecuted(intentHash);

        if (!verifyIntentSignature(intent, signature)) revert InvalidSignature();

        // --- Effects ------------------------------------------------------
        $.executedIntents[intentHash] = true;

        emit IntentExecuted(
            intentHash, intent.user, intent.nftContract, intent.tokenId, intent.tokenAddress, intent.amount, msg.sender
        );

        // --- Interactions -------------------------------------------------
        // The Keeper must own the NFT (or be approved) and must have granted
        // this contract operator status. safeTransferFrom will revert otherwise.
        IERC721(intent.nftContract).safeTransferFrom(msg.sender, intent.user, intent.tokenId);
    }

    // ---------------------------------------------------------------------
    // UUPS
    // ---------------------------------------------------------------------

    /// @dev Only the TimelockController-granted UPGRADER_ROLE may authorise
    ///      an upgrade. The `newImplementation` parameter is validated by the
    ///      role gate; we silence the unused-parameter warning explicitly.
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {
        newImplementation;
    }
}
