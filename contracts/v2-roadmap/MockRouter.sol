// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRouterClient} from "../../src/interfaces/ccip/IRouterClient.sol";
import {IAny2EVMMessageReceiver} from "../../src/interfaces/ccip/IAny2EVMMessageReceiver.sol";
import {Client} from "../../src/interfaces/ccip/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockRouter is IRouterClient {
    mapping(uint64 => bool) public supported;
    uint256 public mockFee = 0.01 ether;
    uint256 public nonce;

    function setSupported(uint64 sel, bool v) external {
        supported[sel] = v;
    }

    function setFee(uint256 f) external {
        mockFee = f;
    }

    function isChainSupported(uint64 sel) external view returns (bool) {
        return supported[sel];
    }

    function getFee(uint64, Client.EVM2AnyMessage memory) external view returns (uint256) {
        return mockFee;
    }

    function ccipSend(uint64 destChainSelector, Client.EVM2AnyMessage calldata message)
        external
        payable
        returns (bytes32)
    {
        require(supported[destChainSelector], "dest not supported");
        require(msg.value >= mockFee, "fee");

        for (uint256 i = 0; i < message.tokenAmounts.length; i++) {
            Client.EVMTokenAmount memory ta = message.tokenAmounts[i];
            IERC20(ta.token).transferFrom(msg.sender, address(this), ta.amount);
        }
        nonce++;
        return keccak256(abi.encode(destChainSelector, message, nonce, block.number));
    }

    function deliver(
        address receiver,
        bytes32 messageId,
        uint64 sourceChainSelector,
        bytes calldata sender,
        bytes calldata data,
        Client.EVMTokenAmount[] calldata destTokenAmounts
    ) external {
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
