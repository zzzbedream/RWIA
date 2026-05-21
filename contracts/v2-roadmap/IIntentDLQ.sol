// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Client} from "./interfaces/ccip/Client.sol";

interface IIntentDLQ {
    function park(
        bytes32 messageId,
        uint64 sourceChainSelector,
        bytes calldata sender,
        bytes calldata payload,
        string calldata reason
    ) external;

    function isParked(bytes32 messageId) external view returns (bool);
}
