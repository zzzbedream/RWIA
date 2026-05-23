// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {IntentAggregator} from "../src/IntentAggregator.sol";
import {IntentDLQ} from "../src/IntentDLQ.sol";
import {IIntentDLQ} from "../src/IIntentDLQ.sol";
import {IntentTypes} from "../src/IntentTypes.sol";
import {IRouterClient} from "../src/interfaces/ccip/IRouterClient.sol";
import {Client} from "../src/interfaces/ccip/Client.sol";

import {MockRouter} from "./mocks/MockRouter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract IntentAggregatorTest is Test {
    IntentAggregator agg;
    IntentDLQ dlq;
    MockRouter router;
    MockERC20 token;

    address admin = address(0xA11CE);
    address upgrader = address(0xB0B);
    address keeper = address(0xCAFE);
    uint256 userKey = 0xDEADBEEFCAFE;
    address user;
    uint64 constant DEST_CHAIN = 14_767_482_510_784_806_043; // arbitrary CCIP selector
    uint64 constant SRC_CHAIN = 5_009_297_550_715_157_269;

    function setUp() public {
        user = vm.addr(userKey);
        router = new MockRouter();
        router.setSupported(DEST_CHAIN, true);
        token = new MockERC20();

        IntentDLQ dlqImpl = new IntentDLQ();
        // Bootstrap with admin as parker; we override to aggregator below via grantRole.
        bytes memory dlqInit = abi.encodeCall(IntentDLQ.initialize, (admin, upgrader, admin, admin));
        ERC1967Proxy dlqProxy = new ERC1967Proxy(address(dlqImpl), dlqInit);
        dlq = IntentDLQ(payable(address(dlqProxy)));

        IntentAggregator aggImpl = new IntentAggregator();
        bytes memory aggInit = abi.encodeCall(
            IntentAggregator.initialize,
            (admin, upgrader, keeper, IRouterClient(address(router)), IIntentDLQ(address(dlq)), uint64(200_000))
        );
        ERC1967Proxy aggProxy = new ERC1967Proxy(address(aggImpl), aggInit);
        agg = IntentAggregator(payable(address(aggProxy)));

        vm.startPrank(admin);
        // grant PARKER_ROLE on DLQ to aggregator
        dlq.grantRole(dlq.PARKER_ROLE(), address(agg));
        agg.setDestChainAllowed(DEST_CHAIN, true);
        vm.stopPrank();

        token.mint(user, 1000 ether);
        vm.prank(user);
        token.approve(address(agg), type(uint256).max);

        vm.deal(address(this), 100 ether);
    }

    function _sign(IntentTypes.UserIntent memory intent) internal view returns (bytes memory) {
        bytes32 digest = agg.hashIntent(intent);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _intent(uint128 amount, uint96 nonce) internal view returns (IntentTypes.UserIntent memory) {
        return IntentTypes.UserIntent({
            user: user,
            token: address(token),
            amount: amount,
            destinationChainSelector: DEST_CHAIN,
            deadline: uint64(block.timestamp + 1 hours),
            nonce: nonce,
            receiver: abi.encode(address(0xBEEF))
        });
    }

    function test_initialize_sets_roles_and_state() public view {
        assertTrue(agg.hasRole(agg.ADMIN_ROLE(), admin));
        assertTrue(agg.hasRole(agg.UPGRADER_ROLE(), upgrader));
        assertTrue(agg.hasRole(agg.KEEPER_ROLE(), keeper));
        assertEq(address(agg.router()), address(router));
        assertEq(address(agg.dlq()), address(dlq));
    }

    function test_disableInitializers_on_implementation() public {
        IntentAggregator impl = new IntentAggregator();
        vm.expectRevert();
        impl.initialize(admin, upgrader, keeper, IRouterClient(address(router)), IIntentDLQ(address(dlq)), 200_000);
    }

    function test_executeIntents_happy_path() public {
        IntentTypes.UserIntent memory intent = _intent(100 ether, 0);
        bytes memory sig = _sign(intent);

        IntentTypes.UserIntent[] memory intents = new IntentTypes.UserIntent[](1);
        intents[0] = intent;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = sig;

        uint256 feeBefore = address(this).balance;
        bytes32[] memory ids = agg.executeIntents{value: 1 ether}(intents, sigs);
        uint256 feeAfter = address(this).balance;

        assertEq(ids.length, 1);
        assertEq(token.balanceOf(address(router)), 100 ether);
        assertEq(agg.nonces(user), 1);
        // contract refunds remainder
        assertGt(feeAfter, feeBefore - 1 ether);
    }

    function test_executeIntents_rejects_bad_signature() public {
        IntentTypes.UserIntent memory intent = _intent(100 ether, 0);
        bytes memory sig = _sign(intent);
        intent.amount = 999 ether; // tampered post-sign

        IntentTypes.UserIntent[] memory intents = new IntentTypes.UserIntent[](1);
        intents[0] = intent;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = sig;

        vm.expectRevert(IntentAggregator.InvalidSignature.selector);
        agg.executeIntents{value: 1 ether}(intents, sigs);
    }

    function test_executeIntents_rejects_replay() public {
        IntentTypes.UserIntent memory intent = _intent(50 ether, 0);
        bytes memory sig = _sign(intent);

        IntentTypes.UserIntent[] memory intents = new IntentTypes.UserIntent[](1);
        intents[0] = intent;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = sig;

        agg.executeIntents{value: 1 ether}(intents, sigs);
        vm.expectRevert(abi.encodeWithSelector(IntentAggregator.InvalidNonce.selector, uint96(1), uint96(0)));
        agg.executeIntents{value: 1 ether}(intents, sigs);
    }

    function test_executeIntents_expired_deadline_reverts() public {
        IntentTypes.UserIntent memory intent = _intent(10 ether, 0);
        intent.deadline = uint64(block.timestamp - 1);
        bytes memory sig = _sign(intent);

        IntentTypes.UserIntent[] memory intents = new IntentTypes.UserIntent[](1);
        intents[0] = intent;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = sig;

        vm.expectRevert(abi.encodeWithSelector(IntentAggregator.IntentExpired.selector, intent.deadline));
        agg.executeIntents{value: 1 ether}(intents, sigs);
    }

    function test_executeIntents_dest_chain_not_allowed_reverts() public {
        IntentTypes.UserIntent memory intent = _intent(10 ether, 0);
        intent.destinationChainSelector = 999;
        bytes memory sig = _sign(intent);

        IntentTypes.UserIntent[] memory intents = new IntentTypes.UserIntent[](1);
        intents[0] = intent;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = sig;

        vm.expectRevert(abi.encodeWithSelector(IntentAggregator.DestinationChainNotAllowed.selector, uint64(999)));
        agg.executeIntents{value: 1 ether}(intents, sigs);
    }

    function test_executeIntents_too_many_reverts() public {
        IntentTypes.UserIntent[] memory intents = new IntentTypes.UserIntent[](17);
        bytes[] memory sigs = new bytes[](17);
        for (uint256 i = 0; i < 17; i++) {
            intents[i] = _intent(1 ether, uint96(i));
            sigs[i] = _sign(intents[i]);
        }
        vm.expectRevert(abi.encodeWithSelector(IntentAggregator.TooManyIntents.selector, uint256(17), uint256(16)));
        agg.executeIntents{value: 1 ether}(intents, sigs);
    }

    function test_pause_blocks_execute() public {
        vm.prank(admin);
        agg.pause();

        IntentTypes.UserIntent memory intent = _intent(10 ether, 0);
        bytes memory sig = _sign(intent);
        IntentTypes.UserIntent[] memory intents = new IntentTypes.UserIntent[](1);
        intents[0] = intent;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = sig;

        vm.expectRevert();
        agg.executeIntents{value: 1 ether}(intents, sigs);
    }

    function test_ccipReceive_only_router() public {
        Client.Any2EVMMessage memory m;
        vm.expectRevert();
        agg.ccipReceive(m);
    }

    function test_ccipReceive_parks_unknown_sender() public {
        bytes32 mid = keccak256("msg-1");
        Client.EVMTokenAmount[] memory empty;
        router.deliver(address(agg), mid, SRC_CHAIN, abi.encode(address(0xBAD)), "", empty);
        assertTrue(dlq.isParked(mid));
    }

    function test_ccipReceive_consumes_allowed_sender() public {
        bytes memory sender = abi.encode(address(0xCAFE01));
        vm.prank(admin);
        agg.setSrcSenderAllowed(SRC_CHAIN, sender, true);
        bytes32 mid = keccak256("msg-2");
        Client.EVMTokenAmount[] memory empty;
        router.deliver(address(agg), mid, SRC_CHAIN, sender, "", empty);
        assertTrue(agg.isMessageConsumed(mid));
        assertFalse(dlq.isParked(mid));
    }

    function test_ccipReceive_parks_duplicate_messageId() public {
        bytes memory sender = abi.encode(address(0xCAFE02));
        vm.prank(admin);
        agg.setSrcSenderAllowed(SRC_CHAIN, sender, true);
        bytes32 mid = keccak256("msg-3");
        Client.EVMTokenAmount[] memory empty;
        router.deliver(address(agg), mid, SRC_CHAIN, sender, "", empty);
        router.deliver(address(agg), mid, SRC_CHAIN, sender, "", empty);
        assertTrue(dlq.isParked(mid));
    }

    function testFuzz_executeIntents_amount(uint128 amount) public {
        amount = uint128(bound(uint256(amount), 1, 100 ether));
        IntentTypes.UserIntent memory intent = _intent(amount, 0);
        bytes memory sig = _sign(intent);
        IntentTypes.UserIntent[] memory intents = new IntentTypes.UserIntent[](1);
        intents[0] = intent;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = sig;
        agg.executeIntents{value: 1 ether}(intents, sigs);
        assertEq(agg.nonces(user), 1);
        assertEq(token.balanceOf(address(router)), amount);
    }

    receive() external payable {}
}
