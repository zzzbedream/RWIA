// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {IntentAggregator} from "../src/IntentAggregator.sol";
import {IntentTypes} from "../src/IntentTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC721} from "./mocks/MockERC721.sol";

contract IntentAggregatorTest is Test {
    IntentAggregator agg;
    MockERC20 payToken;
    MockERC721 nft;

    address admin = address(0xA11CE);
    address upgrader = address(0xB0B);
    address keeper = address(0xCAFE);

    uint256 userKey = 0xDEADBEEFCAFE;
    address user;

    uint256 constant NFT_TOKEN_ID = 1337;

    function setUp() public {
        user = vm.addr(userKey);
        payToken = new MockERC20();
        nft = new MockERC721();
        nft.mint(keeper, NFT_TOKEN_ID);

        IntentAggregator impl = new IntentAggregator();
        bytes memory initData = abi.encodeCall(IntentAggregator.initialize, (admin, upgrader, keeper));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        agg = IntentAggregator(address(proxy));

        vm.prank(keeper);
        nft.setApprovalForAll(address(agg), true);
    }

    function _intent(uint256 tokenId) internal view returns (IntentTypes.UserIntent memory) {
        return IntentTypes.UserIntent({
            user: user,
            tokenAddress: address(payToken),
            amount: 100e6, // e.g. 100 USDC paid off-chain
            nftContract: address(nft),
            tokenId: tokenId,
            deadline: block.timestamp + 1 hours,
            nonce: 1
        });
    }

    function _sign(IntentTypes.UserIntent memory intent) internal view returns (bytes memory) {
        bytes32 digest = agg.hashIntent(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------------------
    // Init / RBAC
    // ------------------------------------------------------------------------

    function test_initialize_sets_roles() public view {
        assertTrue(agg.hasRole(agg.ADMIN_ROLE(), admin));
        assertTrue(agg.hasRole(agg.UPGRADER_ROLE(), upgrader));
        assertTrue(agg.hasRole(agg.KEEPER_ROLE(), keeper));
        assertTrue(agg.hasRole(agg.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_disableInitializers_on_implementation() public {
        IntentAggregator impl = new IntentAggregator();
        vm.expectRevert();
        impl.initialize(admin, upgrader, keeper);
    }

    function test_initialize_rejects_zero_address() public {
        IntentAggregator impl = new IntentAggregator();
        bytes memory bad = abi.encodeCall(IntentAggregator.initialize, (address(0), upgrader, keeper));
        vm.expectRevert(IntentAggregator.ZeroAddress.selector);
        new ERC1967Proxy(address(impl), bad);
    }

    // ------------------------------------------------------------------------
    // executeLocalIntent — happy path
    // ------------------------------------------------------------------------

    function test_executeLocalIntent_transfers_nft_to_user() public {
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        bytes memory sig = _sign(intent);

        assertEq(nft.ownerOf(NFT_TOKEN_ID), keeper);

        vm.prank(keeper);
        agg.executeLocalIntent(intent, sig);

        assertEq(nft.ownerOf(NFT_TOKEN_ID), user);
        assertTrue(agg.isIntentExecuted(agg.hashIntent(intent)));
    }

    function test_executeLocalIntent_emits_event() public {
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        bytes memory sig = _sign(intent);
        bytes32 hash = agg.hashIntent(intent);

        vm.expectEmit(true, true, true, true, address(agg));
        emit IntentAggregator.IntentExecuted(hash, user, address(nft), NFT_TOKEN_ID, address(payToken), 100e6, keeper);
        vm.prank(keeper);
        agg.executeLocalIntent(intent, sig);
    }

    // ------------------------------------------------------------------------
    // executeLocalIntent — failure modes
    // ------------------------------------------------------------------------

    function test_executeLocalIntent_only_keeper() public {
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        bytes memory sig = _sign(intent);
        vm.expectRevert();
        agg.executeLocalIntent(intent, sig);
    }

    function test_executeLocalIntent_rejects_bad_signature() public {
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        bytes memory sig = _sign(intent);
        intent.amount = 999e6; // tampered after signing
        vm.prank(keeper);
        vm.expectRevert(IntentAggregator.InvalidSignature.selector);
        agg.executeLocalIntent(intent, sig);
    }

    function test_executeLocalIntent_rejects_expired_deadline() public {
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        intent.deadline = block.timestamp - 1;
        bytes memory sig = _sign(intent);
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(IntentAggregator.IntentExpired.selector, intent.deadline, block.timestamp)
        );
        agg.executeLocalIntent(intent, sig);
    }

    function test_executeLocalIntent_rejects_zero_amount() public {
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        intent.amount = 0;
        bytes memory sig = _sign(intent);
        vm.prank(keeper);
        vm.expectRevert(IntentAggregator.ZeroAmount.selector);
        agg.executeLocalIntent(intent, sig);
    }

    function test_executeLocalIntent_rejects_replay() public {
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        bytes memory sig = _sign(intent);

        vm.startPrank(keeper);
        agg.executeLocalIntent(intent, sig);
        vm.stopPrank();

        // Mint another NFT to keeper so re-execution would otherwise succeed;
        // the replay guard must trip before the transfer attempt.
        nft.mint(keeper, NFT_TOKEN_ID + 1);

        bytes32 hash = agg.hashIntent(intent);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IntentAggregator.IntentAlreadyExecuted.selector, hash));
        agg.executeLocalIntent(intent, sig);
    }

    function test_executeLocalIntent_rejects_zero_user() public {
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        intent.user = address(0);
        bytes memory sig = _sign(intent);
        vm.prank(keeper);
        vm.expectRevert(IntentAggregator.ZeroAddress.selector);
        agg.executeLocalIntent(intent, sig);
    }

    function test_executeLocalIntent_rejects_zero_nft_contract() public {
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        intent.nftContract = address(0);
        bytes memory sig = _sign(intent);
        vm.prank(keeper);
        vm.expectRevert(IntentAggregator.InvalidNftContract.selector);
        agg.executeLocalIntent(intent, sig);
    }

    function test_pause_blocks_execute() public {
        vm.prank(admin);
        agg.pause();

        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        bytes memory sig = _sign(intent);
        vm.prank(keeper);
        vm.expectRevert();
        agg.executeLocalIntent(intent, sig);
    }

    function test_unpause_restores_execute() public {
        vm.prank(admin);
        agg.pause();
        vm.prank(admin);
        agg.unpause();

        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        bytes memory sig = _sign(intent);
        vm.prank(keeper);
        agg.executeLocalIntent(intent, sig);
        assertEq(nft.ownerOf(NFT_TOKEN_ID), user);
    }

    // ------------------------------------------------------------------------
    // Fuzz
    // ------------------------------------------------------------------------

    function testFuzz_executeLocalIntent_various_tokenIds(uint96 tokenIdSeed) public {
        uint256 tokenId = uint256(tokenIdSeed) + 1_000_000;
        nft.mint(keeper, tokenId);

        IntentTypes.UserIntent memory intent = _intent(tokenId);
        intent.nonce = uint256(keccak256(abi.encode(tokenId)));
        bytes memory sig = _sign(intent);

        vm.prank(keeper);
        agg.executeLocalIntent(intent, sig);

        assertEq(nft.ownerOf(tokenId), user);
        assertTrue(agg.isIntentExecuted(agg.hashIntent(intent)));
    }

    function testFuzz_executeLocalIntent_amount_invariant(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max);
        IntentTypes.UserIntent memory intent = _intent(NFT_TOKEN_ID);
        intent.amount = amount;
        bytes memory sig = _sign(intent);
        vm.prank(keeper);
        agg.executeLocalIntent(intent, sig);
        assertEq(nft.ownerOf(NFT_TOKEN_ID), user);
    }

    // ------------------------------------------------------------------------
    // ERC-7201 Storage Slot Compliance
    // ------------------------------------------------------------------------

    function test_StorageSlotCompliance() public pure {
        // Validate the exact ERC-7201 formula:
        // keccak256(abi.encode(uint256(keccak256("rwia.storage.IntentAggregatorV1")) - 1)) & ~bytes32(uint256(0xff))
        bytes32 expectedSlot =
            keccak256(abi.encode(uint256(keccak256("rwia.storage.IntentAggregatorV1")) - 1)) & ~bytes32(uint256(0xff));

        // This MUST match the _STORAGE_SLOT constant in IntentAggregator.sol
        bytes32 actualSlot = 0x8f7ffa7830ed47936fdfb086a94b9b3d7c14998a38c285d9f30fbd1926fd4400;

        assertEq(actualSlot, expectedSlot, "ERC-7201 storage slot mismatch - update _STORAGE_SLOT in contract");
    }
}
