// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {IntentAggregator} from "../src/IntentAggregator.sol";

/// @notice Deploys IntentAggregator V1 behind an ERC1967 proxy with upgrades
///         gated by a TimelockController.
///
///         V1 is native-NFT-settlement only: no CCIP, no DLQ. The UUPS hook
///         lets V2 introduce CCIP cross-chain dispatch without state loss.
contract Deploy is Script {
    struct Config {
        address admin;
        address keeper;
        uint256 timelockDelay;
    }

    function run() external returns (address aggregatorProxy, address aggregatorImpl, address timelock) {
        Config memory cfg = _loadConfig();

        vm.startBroadcast();

        timelock = _deployTimelock(cfg.admin, cfg.timelockDelay);

        IntentAggregator impl = new IntentAggregator();
        aggregatorImpl = address(impl);

        bytes memory initData = abi.encodeCall(IntentAggregator.initialize, (cfg.admin, timelock, cfg.keeper));
        ERC1967Proxy proxy = new ERC1967Proxy(aggregatorImpl, initData);
        aggregatorProxy = address(proxy);

        vm.stopBroadcast();

        console2.log("TimelockController:     ", timelock);
        console2.log("IntentAggregator impl:  ", aggregatorImpl);
        console2.log("IntentAggregator proxy: ", aggregatorProxy);
        console2.log("Admin:                  ", cfg.admin);
        console2.log("Keeper:                 ", cfg.keeper);
        console2.log("Timelock delay (s):     ", cfg.timelockDelay);
    }

    function _deployTimelock(address admin, uint256 minDelay) internal returns (address) {
        address[] memory proposers = new address[](1);
        proposers[0] = admin;
        address[] memory executors = new address[](1);
        executors[0] = address(0); // open executor — anyone can fire a ready op
        return address(new TimelockController(minDelay, proposers, executors, admin));
    }

    function _loadConfig() internal view returns (Config memory cfg) {
        cfg.admin = vm.envAddress("ADMIN_ADDRESS");
        cfg.keeper = vm.envAddress("KEEPER_ADDRESS");
        // 2 days default delay; production should use 7 days for upgrades.
        cfg.timelockDelay = vm.envOr("TIMELOCK_DELAY_SECONDS", uint256(2 days));
    }
}
