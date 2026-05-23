// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {IntentAggregator} from "../src/IntentAggregator.sol";

/// @notice Transfers governance from the deployer EOA to a real multisig
///         (e.g. a Ronin Safe). Includes pre-flight safeguards to prevent
///         irreversible bricking of the admin chain:
///
///           1. `multisig.code.length > 0` — destination is a contract
///           2. `staticcall(getOwners())` — it's an initialized Safe with
///              at least one signer
///           3. `staticcall(getThreshold())` — threshold is sane (>=1)
///
///         Env vars required:
///           AGGREGATOR_PROXY
///           TIMELOCK_ADDRESS
///           MULTISIG_ADDRESS
///           PRIVATE_KEY (current admin EOA)
///         Optional:
///           SKIP_RENOUNCE = "1" for staged migration (deployer keeps roles)
contract HandoffToMultisig is Script {
    function run() external {
        address aggregatorProxy = vm.envAddress("AGGREGATOR_PROXY");
        address timelockAddr = vm.envAddress("TIMELOCK_ADDRESS");
        address multisig = vm.envAddress("MULTISIG_ADDRESS");
        bool skipRenounce = vm.envOr("SKIP_RENOUNCE", false);

        _validateInputs(aggregatorProxy, timelockAddr, multisig);
        _validateSafe(multisig);

        vm.startBroadcast();
        address deployer = msg.sender;
        console2.log("Handing off from deployer:", deployer);
        console2.log("Target multisig:          ", multisig);

        _grantToMultisig(timelockAddr, aggregatorProxy, multisig);
        if (!skipRenounce) {
            _renounceFromDeployer(timelockAddr, aggregatorProxy, deployer);
        } else {
            console2.log("SKIP_RENOUNCE=1: deployer keeps roles (staged migration)");
        }
        vm.stopBroadcast();

        _verifyPostconditions(timelockAddr, aggregatorProxy, multisig, deployer);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    function _validateInputs(address agg, address timelock, address multisig) internal view {
        require(multisig != address(0), "MULTISIG_ADDRESS=0");
        require(agg != address(0), "AGGREGATOR_PROXY=0");
        require(timelock != address(0), "TIMELOCK_ADDRESS=0");
        require(multisig.code.length > 0, "MULTISIG has no code (would brick governance)");
        require(agg.code.length > 0, "AGGREGATOR_PROXY has no code");
        require(timelock.code.length > 0, "TIMELOCK_ADDRESS has no code");
    }

    function _validateSafe(address multisig) internal view {
        (bool ok, bytes memory data) = multisig.staticcall(abi.encodeWithSignature("getOwners()"));
        require(ok, "multisig has no getOwners(): not a Safe");
        require(data.length >= 64, "getOwners() returned malformed data");
        address[] memory owners = abi.decode(data, (address[]));
        require(owners.length > 0, "multisig has zero owners");
        console2.log("Multisig getOwners() returned signers:", owners.length);

        (bool tOk, bytes memory tData) = multisig.staticcall(abi.encodeWithSignature("getThreshold()"));
        if (tOk && tData.length >= 32) {
            uint256 threshold = abi.decode(tData, (uint256));
            require(threshold >= 1, "Safe threshold=0 is invalid");
            console2.log("Multisig threshold:", threshold);
            if (threshold == 1 && owners.length == 1) {
                console2.log("WARNING: 1-of-1 Safe is operationally equivalent to an EOA");
            }
        }
    }

    function _grantToMultisig(address timelockAddr, address aggregatorProxy, address multisig) internal {
        TimelockController timelock = TimelockController(payable(timelockAddr));
        IntentAggregator agg = IntentAggregator(aggregatorProxy);
        timelock.grantRole(timelock.PROPOSER_ROLE(), multisig);
        timelock.grantRole(timelock.CANCELLER_ROLE(), multisig);
        agg.grantRole(agg.DEFAULT_ADMIN_ROLE(), multisig);
        agg.grantRole(agg.ADMIN_ROLE(), multisig);
        console2.log("Granted multisig roles on timelock + aggregator");
    }

    function _renounceFromDeployer(address timelockAddr, address aggregatorProxy, address deployer) internal {
        TimelockController timelock = TimelockController(payable(timelockAddr));
        IntentAggregator agg = IntentAggregator(aggregatorProxy);
        timelock.renounceRole(timelock.PROPOSER_ROLE(), deployer);
        timelock.renounceRole(timelock.CANCELLER_ROLE(), deployer);
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);
        agg.renounceRole(agg.ADMIN_ROLE(), deployer);
        agg.renounceRole(agg.DEFAULT_ADMIN_ROLE(), deployer);
        console2.log("Deployer renounced all governance roles");
    }

    function _verifyPostconditions(address timelockAddr, address aggregatorProxy, address multisig, address deployer)
        internal
        view
    {
        TimelockController timelock = TimelockController(payable(timelockAddr));
        IntentAggregator agg = IntentAggregator(aggregatorProxy);
        bytes32 proposerRole = timelock.PROPOSER_ROLE();
        bytes32 aggAdmin = agg.ADMIN_ROLE();
        console2.log("=== Post-handoff state ===");
        console2.log("timelock proposer (multisig)?", IAccessControl(timelockAddr).hasRole(proposerRole, multisig));
        console2.log("timelock proposer (deployer)?", IAccessControl(timelockAddr).hasRole(proposerRole, deployer));
        console2.log("aggregator admin (multisig)? ", IAccessControl(aggregatorProxy).hasRole(aggAdmin, multisig));
        console2.log("aggregator admin (deployer)? ", IAccessControl(aggregatorProxy).hasRole(aggAdmin, deployer));
    }
}
