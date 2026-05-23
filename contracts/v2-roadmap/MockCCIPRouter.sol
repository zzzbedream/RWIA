// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRouterClient} from "../interfaces/ccip/IRouterClient.sol";
import {IAny2EVMMessageReceiver} from "../interfaces/ccip/IAny2EVMMessageReceiver.sol";
import {Client} from "../interfaces/ccip/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal CCIP router stand-in for testnets that do not have real CCIP
///         (Ronin Saigon at time of writing). Accepts ccipSend, pulls tokens,
///         and exposes a `deliver()` helper so operators can simulate inbound
///         CCIP messages end-to-end. NOT FOR MAINNET.
contract MockCCIPRouter is IRouterClient {
    mapping(uint64 destSelector => bool allowed) public supported;
    uint256 public mockFee = 0.01 ether;
    uint256 public nonce;

    address public owner;

    error NotOwner();
    error DestNotSupported(uint64 sel);
    error InsufficientFee(uint256 required, uint256 provided);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_) {
        owner = owner_ == address(0) ? msg.sender : owner_;
    }

    function setSupported(uint64 sel, bool v) external onlyOwner {
        supported[sel] = v;
    }

    function setFee(uint256 f) external onlyOwner {
        mockFee = f;
    }

    function isChainSupported(uint64 sel) external view override returns (bool) {
        return supported[sel];
    }

    function getFee(uint64, Client.EVM2AnyMessage memory) external view override returns (uint256) {
        return mockFee;
    }

    function ccipSend(uint64 destChainSelector, Client.EVM2AnyMessage calldata message)
        external
        payable
        override
        returns (bytes32)
    {
        if (!supported[destChainSelector]) revert DestNotSupported(destChainSelector);
        if (msg.value < mockFee) revert InsufficientFee(mockFee, msg.value);
        for (uint256 i = 0; i < message.tokenAmounts.length; i++) {
            Client.EVMTokenAmount memory ta = message.tokenAmounts[i];
            IERC20(ta.token).transferFrom(msg.sender, address(this), ta.amount);
        }
        unchecked {
            nonce++;
        }
        return keccak256(abi.encode(destChainSelector, message, nonce, block.number));
    }

    /// @notice Operator-triggered inbound CCIP message for end-to-end testnet sims.
    function deliver(
        address receiver,
        bytes32 messageId,
        uint64 sourceChainSelector,
        bytes calldata sender,
        bytes calldata data,
        Client.EVMTokenAmount[] calldata destTokenAmounts
    ) external onlyOwner {
        Client.Any2EVMMessage memory msg_ = Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: sourceChainSelector,
            sender: sender,
            data: data,
            destTokenAmounts: destTokenAmounts
        });
        IAny2EVMMessageReceiver(receiver).ccipReceive(msg_);
    }
}
