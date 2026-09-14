// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ExitRouter} from "../contracts/ExitRouter.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {BouncingPayee, GreedyPayee, MockExchange} from "./mocks/MockExchange.sol";

interface VmExit {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function deal(address who, uint256 amount) external;
    function expectRevert(bytes4 selector) external;
    function chainId(uint256 newChainId) external;
    function getBlockTimestamp() external view returns (uint256);
}

contract ExitRouterTest {
    VmExit private constant VM = VmExit(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant OWNER_KEY = 0x5EC;
    uint256 private constant OTHER_KEY = 0x07E;
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 3_000_000; // 3 AUSD, the sort of sum a gift leaves behind

    MockAUSD private token;
    MockExchange private exchange;
    ExitRouter private router;
    address private owner;
    address private payoutTo;
    address private relayer;
    uint256 private saltSeed;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        owner = VM.addr(OWNER_KEY);
        payoutTo = address(0xBEEF);
        relayer = address(0xFEE1);
        token = new MockAUSD();
        exchange = new MockExchange(token);
        router = new ExitRouter(token);
        router.setExchangeAllowed(address(exchange), true);
        token.mint(owner, 1_000_000_000);
        // The exchange has native coin to give back, as a real one does.
        VM.deal(address(exchange), 100 ether);
    }

    // --- the ordinary way through -----------------------------------------------------------------------

    function testItTakesTheMoneyExchangesItAndPaysWhereTheySigned() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        uint256 before = payoutTo.balance;

        VM.prank(relayer);
        uint256 out = router.exit(t, a, call_);

        require(out == AMOUNT, "what the exchange gave");
        require(payoutTo.balance == before + AMOUNT, "and it reached where they signed for");
        require(token.balanceOf(address(router)) == 0 && address(router).balance == 0, "the router keeps nothing");
    }

    /// @dev The whole point: the person's own account sends nothing and needs nothing (DECISIONS.md D53).
    function testTheOwnerSendsNothingAndNeedsNothing() public {
        require(owner.balance == 0, "the owner holds no native coin at all");
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        VM.prank(relayer);
        router.exit(t, a, call_);
        require(payoutTo.balance == AMOUNT, "and they were still paid");
    }

    function testWhateverTheExchangeLeavesGoesBackToThem() public {
        exchange.setKeepBack(1_000_000);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        uint256 before = token.balanceOf(owner);

        VM.prank(relayer);
        router.exit(t, a, call_);

        require(token.balanceOf(owner) == before - AMOUNT + 1_000_000, "the unused part came back");
        require(token.balanceOf(address(router)) == 0, "and none of it stayed here");
    }

    // --- what the signature is for ----------------------------------------------------------------------

    /// @dev The relayer submits this, so the signature has to be what decides where the money goes. It does:
    ///      the nonce is the hash of the terms, so a changed destination is a nonce the token refuses.
    function testARelayerCannotSendItSomewhereElse() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        t.payoutTo = address(0xDEAD);
        VM.prank(relayer);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        router.exit(t, a, call_);
    }

    function testARelayerCannotChangeWhatIsSaidToTheExchange() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a,) = _exit(AMOUNT, 1, payoutTo);
        bytes memory other = abi.encodeWithSelector(MockExchange.swap.selector, AMOUNT, address(0xDEAD));
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.TermsMismatch.selector);
        router.exit(t, a, other);
    }

    function testARelayerCannotLowerWhatMustComeBack() public {
        // Signed for the whole amount back, then the relayer tries to accept a tenth of it.
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, AMOUNT, payoutTo);
        t.minOut = AMOUNT / 10;
        VM.prank(relayer);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        router.exit(t, a, call_);
    }

    function testSomebodyElsesSignatureIsWorthNothing() public {
        (ExitRouter.ExitTerms memory t, bytes memory call_) = _terms(AMOUNT, 1, payoutTo);
        ExitRouter.Authorization memory a = _authorization(t, OTHER_KEY);
        VM.prank(relayer);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        router.exit(t, a, call_);
    }

    function testTheSameSignatureCannotBeUsedTwice() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        VM.prank(relayer);
        router.exit(t, a, call_);
        VM.prank(relayer);
        VM.expectRevert(MockAUSD.AuthorizationUsed.selector);
        router.exit(t, a, call_);
    }

    // --- what protects the person -----------------------------------------------------------------------

    function testAPoorRateIsRefusedRatherThanAccepted() public {
        // Half of what they signed for: the exchange moved against them, so nothing happens at all.
        exchange.setRate(1, 2);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, AMOUNT, payoutTo);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.TooLittleBack.selector);
        router.exit(t, a, call_);
        require(token.balanceOf(address(router)) == 0 && payoutTo.balance == 0, "and nothing moved");
    }

    function testAnExchangeThatRefusesLeavesEverythingWhereItWas() public {
        exchange.setRefuse(true);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        uint256 before = token.balanceOf(owner);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeFailed.selector);
        router.exit(t, a, call_);
        require(token.balanceOf(owner) == before, "their money never left them");
    }

    function testAnExchangeNobodyAllowedIsRefused() public {
        MockExchange rogue = new MockExchange(token);
        VM.deal(address(rogue), 10 ether);
        (ExitRouter.ExitTerms memory t, bytes memory call_) = _termsWith(AMOUNT, 1, payoutTo, address(rogue));
        ExitRouter.Authorization memory a = _authorization(t, OWNER_KEY);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeNotAllowed.selector);
        router.exit(t, a, call_);
    }

    /// @dev An allowance left behind would be somebody else's to spend later.
    function testNoAllowanceIsLeftBehindEitherWay() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        VM.prank(relayer);
        router.exit(t, a, call_);
        require(token.allowance(address(router), address(exchange)) == 0, "cleared after a good exchange");

        exchange.setRefuse(true);
        (ExitRouter.ExitTerms memory t2, ExitRouter.Authorization memory a2, bytes memory call2) =
            _exit(AMOUNT, 1, payoutTo);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeFailed.selector);
        router.exit(t2, a2, call2);
        require(token.allowance(address(router), address(exchange)) == 0, "and nothing is left after a bad one");
    }

    function testAnExchangeCannotTakeMoreThanItWasGiven() public {
        exchange.setKeepBack(1_000_000);
        exchange.setGrab(true);
        token.mint(address(router), 500_000); // something stranded here from before
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        VM.prank(relayer);
        // The allowance is exactly what they signed for, so taking more simply fails.
        router.exit(t, a, call_);
        require(token.balanceOf(address(router)) == 500_000, "what was stranded is untouched");
    }

    function testAnExpiredSignatureIsRefused() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        VM.warp(START + 2 hours);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.DeadlinePassed.selector);
        router.exit(t, a, call_);
    }

    function testTermsThatMakeNoSenseAreRefused() public {
        // Built fresh each time: a struct assigned in memory is the same struct, not a copy of it.
        (ExitRouter.ExitTerms memory noPayout, ExitRouter.Authorization memory a1, bytes memory c1) =
            _exit(AMOUNT, 1, payoutTo);
        noPayout.payoutTo = address(0);
        VM.expectRevert(ExitRouter.InvalidAddress.selector);
        router.exit(noPayout, a1, c1);

        (ExitRouter.ExitTerms memory noAmount, ExitRouter.Authorization memory a2, bytes memory c2) =
            _exit(AMOUNT, 1, payoutTo);
        noAmount.amount = 0;
        VM.expectRevert(ExitRouter.InvalidAmount.selector);
        router.exit(noAmount, a2, c2);

        (ExitRouter.ExitTerms memory noFloor, ExitRouter.Authorization memory a3, bytes memory c3) =
            _exit(AMOUNT, 1, payoutTo);
        noFloor.minOut = 0;
        VM.expectRevert(ExitRouter.InvalidAmount.selector);
        router.exit(noFloor, a3, c3);
    }

    // --- what the review found ---------------------------------------------------------------------------

    /// @dev A payout call that does not revert is not a payment. Paying into this contract, or into one that
    ///      hands the money back, used to return success and emit a full receipt while nothing left.
    function testMoneyThatDoesNotLeaveIsNotAPayment() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, address(router));
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.InvalidAddress.selector);
        router.exit(t, a, call_);

        BouncingPayee bounce = new BouncingPayee();
        (ExitRouter.ExitTerms memory t2, ExitRouter.Authorization memory a2, bytes memory c2) =
            _exit(AMOUNT, 1, address(bounce));
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.PayoutNotDelivered.selector);
        router.exit(t2, a2, c2);
        require(address(router).balance == 0, "and nothing was left here");
    }

    /// @dev The token as the exchange would let a caller aim this contract's own pull at somebody else's
    ///      signed authorization, since the token requires the recipient to be the caller.
    function testTheTokenAndThisContractCanNeverBeTheExchange() public {
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(address(token), true);
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(address(router), true);

        // And refused at the call as well, whatever the list happens to hold.
        (ExitRouter.ExitTerms memory t, bytes memory call_) = _termsWith(AMOUNT, 1, payoutTo, address(token));
        ExitRouter.Authorization memory a = _authorization(t, OWNER_KEY);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.exit(t, a, call_);
    }

    /// @dev A destination that burns everything it is given must cost a known amount once, not make the
    ///      relayer pay again and again for a signature that is never spent.
    function testADestinationThatBurnsGasIsBounded() public {
        GreedyPayee greedy = new GreedyPayee();
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, address(greedy));
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.PayoutFailed.selector);
        router.exit{gas: 2_000_000}(t, a, call_);
    }

    /// @dev The receipt says what was exchanged, not what was taken and partly given back.
    function testTheReceiptSaysWhatWasActuallyExchanged() public {
        exchange.setKeepBack(1_000_000);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, 1, payoutTo);
        uint256 before = token.balanceOf(owner);
        VM.prank(relayer);
        router.exit(t, a, call_);
        // 3 in, 1 back, so 2 exchanged: the event must not claim 3.
        require(token.balanceOf(owner) == before - AMOUNT + 1_000_000, "one came back");
        require(payoutTo.balance == AMOUNT - 1_000_000, "and two were exchanged");
    }

    // --- the owner's own doors --------------------------------------------------------------------------

    function testOnlyTheOwnerOpensAnExchangeOrSweeps() public {
        VM.prank(relayer);
        (bool allowed,) = address(router)
            .call(abi.encodeWithSelector(ExitRouter.setExchangeAllowed.selector, address(exchange), false));
        require(!allowed, "not the relayer's to decide");

        VM.prank(relayer);
        (bool swept,) = address(router).call(abi.encodeWithSelector(ExitRouter.sweep.selector, relayer));
        require(!swept, "nor the relayer's to take");
    }

    function testSweepReturnsAnythingStranded() public {
        token.mint(address(router), 1_234);
        VM.deal(address(router), 5 ether);
        router.sweep(payoutTo);
        require(token.balanceOf(payoutTo) == 1_234 && payoutTo.balance == 5 ether, "returned");
        require(token.balanceOf(address(router)) == 0 && address(router).balance == 0, "and none kept");
    }

    // --- helpers ----------------------------------------------------------------------------------------

    function _terms(uint256 amount, uint256 minOut, address to)
        private
        returns (ExitRouter.ExitTerms memory, bytes memory)
    {
        return _termsWith(amount, minOut, to, address(exchange));
    }

    function _termsWith(uint256 amount, uint256 minOut, address to, address where)
        private
        returns (ExitRouter.ExitTerms memory t, bytes memory call_)
    {
        call_ = abi.encodeWithSelector(MockExchange.swap.selector, amount, address(router));
        t = ExitRouter.ExitTerms({
            payer: owner,
            payoutTo: to,
            amount: amount,
            minOut: minOut,
            exchange: where,
            callHash: keccak256(call_),
            deadline: uint64(VM.getBlockTimestamp() + 1 hours),
            salt: keccak256(abi.encode("salt", ++saltSeed))
        });
    }

    function _exit(uint256 amount, uint256 minOut, address to)
        private
        returns (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_)
    {
        (t, call_) = _terms(amount, minOut, to);
        a = _authorization(t, OWNER_KEY);
    }

    function _authorization(ExitRouter.ExitTerms memory t, uint256 key)
        private
        returns (ExitRouter.Authorization memory a)
    {
        a.validAfter = 0;
        a.validBefore = VM.getBlockTimestamp() + 1 hours;
        bytes32 nonce = keccak256(
            abi.encode(
                keccak256("viky.exit.v1"),
                keccak256(
                    abi.encode(t.payer, t.payoutTo, t.amount, t.minOut, t.exchange, t.callHash, t.deadline, t.salt)
                )
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                t.payer,
                address(router),
                t.amount,
                a.validAfter,
                a.validBefore,
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (a.v, a.r, a.s) = VM.sign(key, digest);
    }
}
