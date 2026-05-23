// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Client} from "./Client.sol";

interface IAny2EVMMessageReceiver {
    function ccipReceive(Client.Any2EVMMessage calldata message) external;
}
