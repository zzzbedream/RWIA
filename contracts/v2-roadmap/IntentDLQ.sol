// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IIntentDLQ} from "./IIntentDLQ.sol";

/// @title Intent Dead Letter Queue
/// @notice Idempotent storage of CCIP messages that the aggregator could not consume. Operators
///         with RECOVERY_ROLE can re-dispatch or settle them.
contract IntentDLQ is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    IIntentDLQ
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PARKER_ROLE = keccak256("PARKER_ROLE");
    bytes32 public constant RECOVERY_ROLE = keccak256("RECOVERY_ROLE");

    enum Status {
        None,
        Parked,
        Recovered,
        Dropped
    }

    struct Entry {
        uint64 sourceChainSelector;
        uint64 parkedAt;
        Status status;
        bytes sender;
        bytes payload;
        string reason;
    }

    /// @custom:storage-location erc7201:rwia.storage.IntentDLQ
    struct Storage {
        mapping(bytes32 messageId => Entry) entries;
    }

    // keccak256(abi.encode(uint256(keccak256("rwia.storage.IntentDLQ")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant _STORAGE_SLOT = 0x3a7d18d2b1c1d4e9c0a78e7f9d1b3c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8900;

    function _s() private pure returns (Storage storage $) {
        bytes32 slot = _STORAGE_SLOT;
        assembly {
            $.slot := slot
        }
    }

    event Parked(bytes32 indexed messageId, uint64 indexed sourceChainSelector, bytes sender, string reason);
    event Recovered(bytes32 indexed messageId, address indexed by);
    event Dropped(bytes32 indexed messageId, address indexed by, string note);

    error AlreadyExists(bytes32 messageId);
    error NotParked(bytes32 messageId);
    error ZeroAddress();

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address upgrader, address parker, address recoveryOp) external initializer {
        if (admin == address(0) || upgrader == address(0) || parker == address(0) || recoveryOp == address(0)) {
            revert ZeroAddress();
        }
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(PARKER_ROLE, parker);
        _grantRole(RECOVERY_ROLE, recoveryOp);
    }

    function setParker(address parker, bool allowed) external onlyRole(ADMIN_ROLE) {
        if (parker == address(0)) revert ZeroAddress();
        if (allowed) _grantRole(PARKER_ROLE, parker);
        else _revokeRole(PARKER_ROLE, parker);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @inheritdoc IIntentDLQ
    function park(
        bytes32 messageId,
        uint64 sourceChainSelector,
        bytes calldata sender,
        bytes calldata payload,
        string calldata reason
    ) external override onlyRole(PARKER_ROLE) whenNotPaused {
        Storage storage $ = _s();
        Entry storage e = $.entries[messageId];
        if (e.status != Status.None) revert AlreadyExists(messageId);

        e.sourceChainSelector = sourceChainSelector;
        e.parkedAt = uint64(block.timestamp);
        e.status = Status.Parked;
        e.sender = sender;
        e.payload = payload;
        e.reason = reason;

        emit Parked(messageId, sourceChainSelector, sender, reason);
    }

    function markRecovered(bytes32 messageId) external onlyRole(RECOVERY_ROLE) nonReentrant {
        Entry storage e = _s().entries[messageId];
        if (e.status != Status.Parked) revert NotParked(messageId);
        e.status = Status.Recovered;
        emit Recovered(messageId, msg.sender);
    }

    function drop(bytes32 messageId, string calldata note) external onlyRole(RECOVERY_ROLE) nonReentrant {
        Entry storage e = _s().entries[messageId];
        if (e.status != Status.Parked) revert NotParked(messageId);
        e.status = Status.Dropped;
        emit Dropped(messageId, msg.sender, note);
    }

    /// @inheritdoc IIntentDLQ
    function isParked(bytes32 messageId) external view override returns (bool) {
        return _s().entries[messageId].status == Status.Parked;
    }

    function getEntry(bytes32 messageId) external view returns (Entry memory) {
        return _s().entries[messageId];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {
        newImplementation;
    }
}
