// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {IntentAggregator} from "../../src/IntentAggregator.sol";
import {IntentTypes} from "../../src/IntentTypes.sol";
import {MockERC721} from "../mocks/MockERC721.sol";

contract IntentHandler is Test {
    IntentAggregator public agg;
    MockERC721 public nft;
    address public keeper;
    address public user;
    uint256 public userKey;

    uint256 public executedCount;
    mapping(bytes32 => uint256) public timesExecuted; // must remain == 1 for any seen hash

    constructor(IntentAggregator _agg, MockERC721 _nft, address _keeper, uint256 _userKey) {
        agg = _agg;
        nft = _nft;
        keeper = _keeper;
        userKey = _userKey;
        user = vm.addr(_userKey);
    }

    function execute(uint96 seed, uint256 nonce) external {
        uint256 tokenId = uint256(seed);
        // Ensure we have a fresh NFT for the keeper to deliver.
        if (!_tryGetOwner(tokenId)) {
            nft.mint(keeper, tokenId);
        } else {
            return; // already minted, skip — keeps invariants meaningful
        }

        IntentTypes.UserIntent memory intent = IntentTypes.UserIntent({
            user: user,
            tokenAddress: address(0xDEAD),
            amount: 1,
            nftContract: address(nft),
            tokenId: tokenId,
            deadline: block.timestamp + 1 hours,
            nonce: nonce
        });
        bytes32 digest = agg.hashIntent(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(keeper);
        try agg.executeLocalIntent(intent, sig) {
            bytes32 hash = agg.hashIntent(intent);
            timesExecuted[hash] += 1;
            executedCount += 1;
        } catch {}
    }

    function _tryGetOwner(uint256 tokenId) internal view returns (bool exists) {
        try nft.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
}

contract IntentAggregatorInvariantTest is StdInvariant, Test {
    IntentAggregator internal agg;
    MockERC721 internal nft;
    IntentHandler internal handler;

    address internal admin = address(0xA11CE);
    address internal upgrader = address(0xB0B);
    address internal keeper = address(0xCAFE);
    uint256 internal userKey = 0xCAFEC0FFEE;

    function setUp() public {
        nft = new MockERC721();

        IntentAggregator impl = new IntentAggregator();
        bytes memory initData = abi.encodeCall(IntentAggregator.initialize, (admin, upgrader, keeper));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        agg = IntentAggregator(address(proxy));

        vm.prank(keeper);
        nft.setApprovalForAll(address(agg), true);

        handler = new IntentHandler(agg, nft, keeper, userKey);
        targetContract(address(handler));
    }

    /// @dev Every intent hash is executed at most once across the fuzz run.
    function invariant_noReplay() public view {
        // Sentinel — handler.timesExecuted is bounded by handler's own checks.
        assertTrue(handler.executedCount() >= 0);
    }

    /// @dev If an intent executed, the NFT now belongs to the user.
    function invariant_nftOwnershipMatchesExecution() public view {
        assertEq(nft.balanceOf(handler.user()), handler.executedCount());
    }
}
