// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ExitRouter} from "../contracts/ExitRouter.sol";
import {MockAUSD} from "./mocks/MockAUSD.sol";
import {
    BouncingPayee,
    CostlyPayee,
    DirtyForwarder,
    ForwarderPointingNowhere,
    ForwardingExchange,
    GivingItBackPayee,
    GreedyPayee,
    MockExchange,
    ReenteringExchange,
    StickyToken,
    TalkativeForwarder
} from "./mocks/MockExchange.sol";

interface VmExit {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function deal(address who, uint256 amount) external;
    function expectRevert(bytes4 selector) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function chainId(uint256 newChainId) external;
    function getBlockTimestamp() external view returns (uint256);
    /// @dev Puts code at an address that already signed. Not a trick of the test bench: a delegation leaves an
    ///      account able to sign and able to run code, so a payer that refuses its own payout is a real shape.
    function etch(address where, bytes calldata code) external;
}

contract ExitRouterTest {
    event Exited(
        address indexed payer, uint256 amountIn, address indexed tokenOut, uint256 amountOut, address indexed exchange
    );

    VmExit private constant VM = VmExit(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant OWNER_KEY = 0x5EC;
    uint256 private constant OTHER_KEY = 0x07E;
    uint256 private constant START = 1_800_000_000;
    uint256 private constant AMOUNT = 3_000_000; // 3 AUSD, the sort of sum a gift leaves behind
    address private constant NATIVE = address(0);

    MockAUSD private token;
    /// @dev The coin one payout service takes. The other takes the chain's own, which is why `tokenOut` is in
    ///      the terms rather than fixed at deployment (D77).
    MockAUSD private usdc;
    MockExchange private exchange;
    ExitRouter private router;
    address private owner;
    address private stranger;
    address private relayer;
    uint256 private saltSeed;

    function setUp() public {
        VM.chainId(143);
        VM.warp(START);
        owner = VM.addr(OWNER_KEY);
        stranger = address(0xBEEF);
        relayer = address(0xFEE1);
        token = new MockAUSD();
        usdc = new MockAUSD();
        exchange = new MockExchange(token, usdc);
        router = new ExitRouter(token);
        router.setExchangeAllowed(address(exchange), true, address(0));
        token.mint(owner, 1_000_000_000);
        // The exchange has both coins to give back, as a real one does.
        usdc.mint(address(exchange), 1_000_000_000);
        VM.deal(address(exchange), 100 ether);
    }

    // --- the ordinary way through, in either coin --------------------------------------------------------

    function testItTakesTheMoneyExchangesItAndHandsItBackToThem() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), AMOUNT);
        uint256 before = usdc.balanceOf(owner);

        VM.prank(relayer);
        uint256 out = router.exit(t, a, call_);

        require(out == AMOUNT, "what the exchange gave");
        require(usdc.balanceOf(owner) == before + AMOUNT, "and it reached the person who signed");
        require(
            token.balanceOf(address(router)) == 0 && usdc.balanceOf(address(router)) == 0, "the router keeps nothing"
        );
    }

    /// @dev The other corridor, and the reason the coin is in the terms at all: one payout service sells the
    ///      chain's own coin and serves countries the other refuses outright, so a router that could only hand
    ///      back a token would close that corridor for good (D77).
    function testItCanHandBackTheChainsOwnCoinInstead() public {
        exchange.setPayInNative(true);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, NATIVE, AMOUNT);
        uint256 before = owner.balance;

        VM.prank(relayer);
        uint256 out = router.exit(t, a, call_);

        require(out == AMOUNT, "what the exchange gave");
        require(owner.balance == before + AMOUNT, "and it reached the person who signed");
        require(address(router).balance == 0, "the router keeps nothing");
    }

    /// @dev The two coins are not interchangeable, and the signature says which. Asking for one and being
    ///      handed the other is the failure this guards: the payout service the person chose watches for a
    ///      deposit in its own coin and would never see the other.
    function testTheCoinIsPartOfWhatWasSignedSoItCannotBeSwappedForTheOther() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), AMOUNT);
        t.tokenOut = NATIVE;
        VM.prank(relayer);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        router.exit(t, a, call_);
    }

    /// @dev The whole point: the person's own account sends nothing and needs nothing (DECISIONS.md D53).
    function testTheOwnerSendsNothingAndNeedsNothing() public {
        require(owner.balance == 0, "the owner holds no native coin at all");
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), AMOUNT);
        VM.prank(relayer);
        router.exit(t, a, call_);
        require(usdc.balanceOf(owner) == AMOUNT, "and they still received the coin");
    }

    /// @dev The heart of form C (D76). There is no order to pay exactly and no surplus to split: everything
    ///      the exchange gave belongs to the person, because what a payout service is owed is sent by them,
    ///      from their own account, in a transfer any detector can read. A router that paid a floor and handed
    ///      back the rest would pass every other test in this file.
    function testEverythingTheExchangeGaveGoesToThemNotJustTheFloorTheySignedFor() public {
        exchange.setRate(2, 1);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), AMOUNT);
        uint256 before = usdc.balanceOf(owner);

        VM.prank(relayer);
        uint256 out = router.exit(t, a, call_);

        require(out == AMOUNT * 2, "twice the floor came back");
        require(usdc.balanceOf(owner) == before + AMOUNT * 2, "and all of it reached them, not only the floor");
        require(usdc.balanceOf(address(router)) == 0, "none of it was kept back for anybody");
    }

    function testWhateverTheExchangeLeavesGoesBackToThem() public {
        exchange.setKeepBack(1_000_000);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), 1);
        uint256 before = token.balanceOf(owner);

        VM.prank(relayer);
        router.exit(t, a, call_);

        require(token.balanceOf(owner) == before - AMOUNT + 1_000_000, "the unused part came back");
        require(token.balanceOf(address(router)) == 0, "and none of it stayed here");
    }

    // --- what the signature is for ----------------------------------------------------------------------

    function testARelayerCannotChangeWhatIsSaidToTheExchange() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a,) = _exit(AMOUNT, address(usdc), 1);
        bytes memory other = abi.encodeWithSelector(MockExchange.swap.selector, AMOUNT, address(0xDEAD));
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.TermsMismatch.selector);
        router.exit(t, a, other);
    }

    function testARelayerCannotLowerWhatMustComeBack() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), AMOUNT);
        t.minOut = AMOUNT / 10;
        VM.prank(relayer);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        router.exit(t, a, call_);
    }

    /// @dev The proceeds go to the payer named in the terms, and the payer is what the token checks the
    ///      signature against. So a relayer that wants them sent elsewhere has to name somebody else as the
    ///      payer, and then it is that person's signature it does not have.
    function testARelayerCannotSendTheProceedsToItself() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), 1);
        t.payer = relayer;
        VM.prank(relayer);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        router.exit(t, a, call_);
        require(usdc.balanceOf(relayer) == 0, "and the relayer received nothing");
    }

    function testSomebodyElsesSignatureIsWorthNothing() public {
        (ExitRouter.ExitTerms memory t, bytes memory call_) = _terms(AMOUNT, address(usdc), 1);
        ExitRouter.Authorization memory a = _authorization(t, OTHER_KEY);
        VM.prank(relayer);
        VM.expectRevert(MockAUSD.InvalidSignature.selector);
        router.exit(t, a, call_);
    }

    function testTheSameSignatureCannotBeUsedTwice() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), 1);
        VM.prank(relayer);
        router.exit(t, a, call_);
        VM.prank(relayer);
        VM.expectRevert(MockAUSD.AuthorizationUsed.selector);
        router.exit(t, a, call_);
    }

    // --- what protects the person -----------------------------------------------------------------------

    function testAPoorRateIsRefusedRatherThanAccepted() public {
        exchange.setRate(1, 2);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), AMOUNT);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.TooLittleBack.selector);
        router.exit(t, a, call_);
        require(token.balanceOf(address(router)) == 0 && usdc.balanceOf(owner) == 0, "and nothing moved");
    }

    /// @dev The floor protects the chain's own coin exactly as it protects a token, and the balance it is
    ///      measured against is a different one, so this is not the same code path.
    function testAPoorRateIsRefusedWhenTheCoinIsTheChainsOwnToo() public {
        exchange.setPayInNative(true);
        exchange.setRate(1, 2);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, NATIVE, AMOUNT);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.TooLittleBack.selector);
        router.exit(t, a, call_);
        require(owner.balance == 0, "and nothing reached them");
    }

    function testAnExchangeThatRefusesLeavesEverythingWhereItWas() public {
        exchange.setRefuse(true);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), 1);
        uint256 before = token.balanceOf(owner);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeFailed.selector);
        router.exit(t, a, call_);
        require(token.balanceOf(owner) == before, "their money never left them");
    }

    function testAnExchangeNobodyAllowedIsRefused() public {
        MockExchange rogue = new MockExchange(token, usdc);
        usdc.mint(address(rogue), 10_000_000);
        (ExitRouter.ExitTerms memory t, bytes memory call_) = _termsWith(AMOUNT, address(usdc), 1, address(rogue));
        ExitRouter.Authorization memory a = _authorization(t, OWNER_KEY);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeNotAllowed.selector);
        router.exit(t, a, call_);
    }

    /// @dev The case that matters: the exchange takes only part of what it was allowed, and the transaction
    ///      succeeds. Both halves of the older test were self-fulfilling, one because the exchange spent the
    ///      whole allowance and one because it reverted before spending any, so deleting the line that resets
    ///      the allowance changed nothing anybody could see.
    function testAnAllowanceOnlyPartlySpentIsStillResetToZero() public {
        exchange.setKeepBack(1_000_000);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), AMOUNT - 1_000_000);
        VM.prank(relayer);
        router.exit(t, a, call_);
        require(token.allowance(address(router), address(exchange)) == 0, "nothing spendable is left over");
    }

    function testNoAllowanceIsLeftBehindEitherWay() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), 1);
        VM.prank(relayer);
        router.exit(t, a, call_);
        require(token.allowance(address(router), address(exchange)) == 0, "cleared after a good exchange");

        exchange.setRefuse(true);
        (ExitRouter.ExitTerms memory t2, ExitRouter.Authorization memory a2, bytes memory call2) =
            _exit(AMOUNT, address(usdc), 1);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeFailed.selector);
        router.exit(t2, a2, call2);
        require(token.allowance(address(router), address(exchange)) == 0, "and nothing is left after a bad one");
    }

    /// @dev The allowance is exactly what they signed for, so an exchange reaching past it fails rather than
    ///      helping itself to whatever is stranded here. Written so it reaches past it for real: it used to
    ///      ask for exactly the allowance, which is to say it tested nothing at all.
    function testAnExchangeCannotTakeMoreThanItWasGiven() public {
        exchange.setKeepBack(1_000_000);
        exchange.setGrab(1_500_000);
        token.mint(address(router), 500_000); // something stranded here from before
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), 1);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeFailed.selector);
        router.exit(t, a, call_);
        require(token.balanceOf(address(router)) == 500_000, "what was stranded is untouched");
        require(token.allowance(address(router), address(exchange)) == 0, "and no allowance is left behind");
    }

    /// @dev The refund of what the exchange did not take asks no questions about where it came from, so it is
    ///      capped at what was pulled. Without the cap, an exchange with any way to move somebody else's
    ///      tokens into this contract would turn that refund into a way to collect them.
    function testMoreOfTheTokenThanWasPulledIsRefusedRatherThanHandedOut() public {
        token.mint(address(exchange), 5_000_000);
        exchange.setKeepBack(1_000_000);
        exchange.setDeliverBack(3_000_000); // more arrives than this exit ever pulled
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), 1);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.UnexpectedTokens.selector);
        router.exit(t, a, call_);
        require(token.balanceOf(address(router)) == 0, "and nothing stayed here");
    }

    function testAnExpiredSignatureIsRefused() public {
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), 1);
        VM.warp(START + 2 hours);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.DeadlinePassed.selector);
        router.exit(t, a, call_);
    }

    function testTermsThatMakeNoSenseAreRefused() public {
        // Built fresh each time: a struct assigned in memory is the same struct, not a copy of it.
        (ExitRouter.ExitTerms memory noPayer, ExitRouter.Authorization memory a1, bytes memory c1) =
            _exit(AMOUNT, address(usdc), 1);
        noPayer.payer = address(0);
        VM.expectRevert(ExitRouter.InvalidAddress.selector);
        router.exit(noPayer, a1, c1);

        (ExitRouter.ExitTerms memory noExchange, ExitRouter.Authorization memory a2, bytes memory c2) =
            _exit(AMOUNT, address(usdc), 1);
        noExchange.exchange = address(0);
        VM.expectRevert(ExitRouter.InvalidAddress.selector);
        router.exit(noExchange, a2, c2);

        (ExitRouter.ExitTerms memory noAmount, ExitRouter.Authorization memory a3, bytes memory c3) =
            _exit(AMOUNT, address(usdc), 1);
        noAmount.amount = 0;
        VM.expectRevert(ExitRouter.InvalidAmount.selector);
        router.exit(noAmount, a3, c3);

        (ExitRouter.ExitTerms memory noFloor, ExitRouter.Authorization memory a4, bytes memory c4) =
            _exit(AMOUNT, address(usdc), 1);
        noFloor.minOut = 0;
        VM.expectRevert(ExitRouter.InvalidAmount.selector);
        router.exit(noFloor, a4, c4);
    }

    /// @dev One accounting rests on the two coins being different: what came in is measured on one balance and
    ///      what goes out on the other. Asking for the same coin back would let the refund and the payout read
    ///      each other, and the surplus check would pass on money that never arrived.
    function testTheCoinComingBackCanNeverBeTheOneThatWentIn() public {
        (ExitRouter.ExitTerms memory t, bytes memory call_) = _terms(AMOUNT, address(token), 1);
        ExitRouter.Authorization memory a = _authorization(t, OWNER_KEY);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.SameToken.selector);
        router.exit(t, a, call_);
    }

    // --- what the review found ---------------------------------------------------------------------------

    /// @dev A transfer that does not revert is not a payment. A token that quietly keeps what it was asked to
    ///      move would otherwise leave the person told they were paid while their coin sat in the router.
    function testMoneyThatDoesNotLeaveIsNotAPayment() public {
        StickyToken sticky = new StickyToken();
        MockExchange stickyExchange = new MockExchange(token, IERC20(address(sticky)));
        router.setExchangeAllowed(address(stickyExchange), true, address(0));
        sticky.mint(address(stickyExchange), 1_000_000_000);
        // Only the router's own transfer is swallowed, so the exchange really does deliver and the router
        // really does hold the coin. Swallowing every transfer would have proved nothing at all.
        sticky.setSwallowFrom(address(router));

        (ExitRouter.ExitTerms memory t, bytes memory call_) =
            _termsWith(AMOUNT, address(sticky), 1, address(stickyExchange));
        ExitRouter.Authorization memory a = _authorization(t, OWNER_KEY);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.PayoutNotDelivered.selector);
        router.exit(t, a, call_);
    }

    /// @dev And the same for the chain's own coin, where "it did not revert" is even weaker: a payee that
    ///      takes the money and hands it straight back leaves the call successful and the money here.
    function testTheChainsOwnCoinHandedStraightBackIsNotAPaymentEither() public {
        exchange.setPayInNative(true);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, NATIVE, 1);
        // Signed first, then given code: a delegated account can do both, which is why the check exists.
        VM.etch(owner, address(new GivingItBackPayee()).code);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.PayoutNotDelivered.selector);
        router.exit(t, a, call_);
    }

    /// @dev A payee that refuses the chain's own coin must fail loudly, not report a payment.
    function testAPayeeThatRefusesTheCoinFailsLoudly() public {
        exchange.setPayInNative(true);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, NATIVE, 1);
        VM.etch(owner, address(new BouncingPayee()).code);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.PayoutFailed.selector);
        router.exit(t, a, call_);
    }

    /// @dev A payee that burns whatever gas it is given must not take the rest of the transaction down with
    ///      it: the stipend is bounded so there is gas left on our side to check the money really left.
    function testAPayeeThatBurnsGasIsBounded() public {
        exchange.setPayInNative(true);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, NATIVE, 1);
        VM.etch(owner, address(new GreedyPayee()).code);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.PayoutFailed.selector);
        router.exit{gas: 2_000_000}(t, a, call_);
    }

    /// @dev And one that costs more than the smallest stipend can be paid once the stipend is raised, rather
    ///      than being unpayable for ever with no way back short of deploying again.
    function testAPayeeThatCostsMoreToPayCanBeMadePayable() public {
        exchange.setPayInNative(true);
        router.setPayoutGas(30_000);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, NATIVE, 1);
        VM.etch(owner, address(new CostlyPayee()).code);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.PayoutFailed.selector);
        router.exit(t, a, call_);

        router.setPayoutGas(300_000);
        (t, a, call_) = _exit(AMOUNT, NATIVE, 1);
        VM.prank(relayer);
        router.exit(t, a, call_);
        require(owner.balance == AMOUNT, "paid once there was enough to pay with");
    }

    function testTheStipendStaysWithinBounds() public {
        VM.expectRevert(ExitRouter.InvalidAmount.selector);
        router.setPayoutGas(29_999);
        VM.expectRevert(ExitRouter.InvalidAmount.selector);
        router.setPayoutGas(1_000_001);
        // And the ends of the range are usable, which is the half a bounds test usually forgets.
        router.setPayoutGas(30_000);
        require(router.payoutGas() == 30_000, "the floor is allowed");
        router.setPayoutGas(1_000_000);
        require(router.payoutGas() == 1_000_000, "the ceiling is allowed");
        VM.prank(relayer);
        (bool moved,) = address(router).call(abi.encodeWithSelector(ExitRouter.setPayoutGas.selector, 200_000));
        require(!moved, "not the relayer's to set");
    }

    /// @dev The token as the exchange would let a caller aim this contract's own pull at somebody else's
    ///      signed authorization, since the token requires the recipient to be the caller. The same applies to
    ///      whatever coin is coming back, which is now chosen per exit rather than fixed.
    function testNeitherCoinNorThisContractCanEverBeTheExchange() public {
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(address(token), true, address(0));
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(address(router), true, address(0));

        // And refused at the call as well, whatever the list happens to hold.
        (ExitRouter.ExitTerms memory t, bytes memory call_) = _termsWith(AMOUNT, address(usdc), 1, address(token));
        ExitRouter.Authorization memory a = _authorization(t, OWNER_KEY);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.exit(t, a, call_);

        // The exchange and the coin coming back being the same address is the case the fixed version could
        // not express, because the coin was not a field anybody could set.
        (ExitRouter.ExitTerms memory t2, bytes memory c2) = _termsWith(AMOUNT, address(exchange), 1, address(exchange));
        ExitRouter.Authorization memory a2 = _authorization(t2, OWNER_KEY);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.exit(t2, a2, c2);
    }

    /// @dev The receipt says what was exchanged, not what was taken and partly given back, and it names the
    ///      coin, because two corridors now run through the same contract and a reader cannot tell otherwise.
    function testTheReceiptSaysWhatWasActuallyExchangedAndInWhichCoin() public {
        exchange.setKeepBack(1_000_000);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), 1);
        uint256 before = token.balanceOf(owner);

        // 3 in, 1 back, so 2 exchanged: the receipt must not claim 3.
        VM.expectEmit(true, true, true, true);
        emit Exited(owner, AMOUNT - 1_000_000, address(usdc), AMOUNT - 1_000_000, address(exchange));
        VM.prank(relayer);
        router.exit(t, a, call_);

        require(token.balanceOf(owner) == before - AMOUNT + 1_000_000, "one came back as it was");
        require(usdc.balanceOf(owner) == AMOUNT - 1_000_000, "and two reached them in the other coin");
    }

    // --- an exchange that is only a signpost ------------------------------------------------------------

    /// @dev The exchange Viky calls is one of these: the quote names the signpost, not what it points at, so
    ///      allowing what it points at instead would break the very calldata the quote asked for.
    function testAForwardingExchangeWorksWhileItStillPointsWhereItWasAllowed() public {
        ForwardingExchange signpost = new ForwardingExchange(token, usdc, address(0xA11CE));
        router.setExchangeAllowed(address(signpost), true, address(0xA11CE));
        usdc.mint(address(signpost), 100_000_000);

        (ExitRouter.ExitTerms memory t, bytes memory call_) =
            _termsWith(AMOUNT, address(usdc), AMOUNT, address(signpost));
        ExitRouter.Authorization memory a = _authorization(t, OWNER_KEY);
        VM.prank(relayer);
        router.exit(t, a, call_);
        require(usdc.balanceOf(owner) == AMOUNT, "paid, through the signpost");
    }

    /// @dev And the moment its owner moves it, we stop instead of handing an allowance and hand-written
    ///      calldata to a contract nobody has looked at.
    function testAForwardingExchangeThatMovedIsRefused() public {
        ForwardingExchange signpost = new ForwardingExchange(token, usdc, address(0xA11CE));
        router.setExchangeAllowed(address(signpost), true, address(0xA11CE));
        usdc.mint(address(signpost), 100_000_000);
        signpost.pointAt(address(0xDEAD));

        (ExitRouter.ExitTerms memory t, bytes memory call_) = _termsWith(AMOUNT, address(usdc), 1, address(signpost));
        ExitRouter.Authorization memory a = _authorization(t, OWNER_KEY);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.ExchangeMoved.selector);
        router.exit(t, a, call_);
        require(token.allowance(address(router), address(signpost)) == 0, "and it was never given anything");
    }

    /// @dev Closing an exchange must not leave its old target behind, to be honoured if it is ever reopened.
    function testClosingAnExchangeForgetsWhereItHadToPoint() public {
        ForwardingExchange signpost = new ForwardingExchange(token, usdc, address(0xA11CE));
        router.setExchangeAllowed(address(signpost), true, address(0xA11CE));
        router.setExchangeAllowed(address(signpost), false, address(0xA11CE));
        require(router.mustPointAt(address(signpost)) == address(0), "forgotten");
    }

    /// @dev Closing an exchange forgets its pin, so opening it again with nothing would quietly drop the only
    ///      check standing between us and a target its owner replaced. It cannot be opened without one.
    function testAForwarderCannotBeOpenedWithoutSayingWhereItMustPoint() public {
        ForwardingExchange signpost = new ForwardingExchange(token, usdc, address(0xA11CE));
        VM.expectRevert(ExitRouter.PinRequired.selector);
        router.setExchangeAllowed(address(signpost), true, address(0));
    }

    /// @dev And it cannot be opened with a pin that was already stale when it was typed.
    function testAPinThatIsAlreadyWrongIsRefusedAtTheDoor() public {
        ForwardingExchange signpost = new ForwardingExchange(token, usdc, address(0xA11CE));
        VM.expectRevert(ExitRouter.ExchangeMoved.selector);
        router.setExchangeAllowed(address(signpost), true, address(0xDEAD));
    }

    /// @dev An exchange that forwards nothing takes no pin, rather than one that could never be checked.
    function testAnExchangeThatForwardsNothingTakesNoPin() public {
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(address(exchange), true, address(0xA11CE));
    }

    /// @dev Giving up ownership would freeze the allowlist and the sweep for good, with no way back.
    function testOwnershipCannotBeGivenUpButCanStillBeHandedOver() public {
        VM.expectRevert(ExitRouter.OwnershipIsNotRenounceable.selector);
        router.renounceOwnership();
        router.transferOwnership(stranger);
        require(router.owner() == stranger, "handed over");
        VM.prank(stranger);
        (bool gone,) = address(router).call(abi.encodeWithSelector(ExitRouter.renounceOwnership.selector));
        require(!gone, "and the new owner cannot give it up either");
    }

    // --- the guards nothing was exercising -------------------------------------------------------------

    /// @dev Deleting `nonReentrant` used to leave every test green, and the whole accounting rests on it: the
    ///      amount out is a balance delta, so a second entry inside the first would read it wrong.
    function testTheExchangeCannotComeBackInWhileItHoldsTheAllowance() public {
        ReenteringExchange reentering = new ReenteringExchange(token, usdc, address(router));
        router.setExchangeAllowed(address(reentering), true, address(0));
        usdc.mint(address(reentering), 10_000_000);

        // A real `exit` call, built here so nothing fails merely for being malformed: only then does the
        // reason distinguish the guard from anything else.
        (ExitRouter.ExitTerms memory t, bytes memory call_) =
            _termsWith(AMOUNT, address(usdc), AMOUNT, address(reentering));
        ExitRouter.Authorization memory a = _authorization(t, OWNER_KEY);
        reentering.setReentryCall(abi.encodeCall(ExitRouter.exit, (t, a, call_)));

        VM.prank(relayer);
        router.exit(t, a, call_);

        require(reentering.reentryTried(), "it did try to come back in");
        require(
            keccak256(reentering.reentryRevert())
                == keccak256(abi.encodeWithSignature("Error(string)", "ReentrancyGuard: reentrant call")),
            "and it was the guard that refused it, not something else"
        );
        require(token.balanceOf(address(router)) == 0, "and nothing of theirs stayed here");
    }

    /// @dev A token that credits less than it promised must stop everything. No real token does this; a badly
    ///      upgraded proxy would, and this contract is pointed at a proxy.
    function testATokenThatCreditsLessThanItPromisedStopsEverything() public {
        token.setShortfall(1);
        (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_) =
            _exit(AMOUNT, address(usdc), AMOUNT);
        VM.prank(relayer);
        VM.expectRevert(ExitRouter.TransferShortfall.selector);
        router.exit(t, a, call_);
    }

    /// @dev An exchange that answers with something unreadable is refused at the door, not at the payout, and
    ///      never with empty revert data. Decoding straight into an address used to throw on a dirty word.
    function testAnExchangeWhoseAnswerCannotBeReadIsRefusedAtTheDoor() public {
        address dirty = address(new DirtyForwarder());
        address talkative = address(new TalkativeForwarder());

        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(dirty, true, address(0xA11CE));
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(dirty, true, address(0));
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(talkative, true, address(0));
        require(!router.allowedExchanges(dirty) && !router.allowedExchanges(talkative), "neither was allowed");
    }

    /// @dev And one that answers with nowhere is refused too. Allowing it would store a zero pin, which means
    ///      the check is skipped for ever, and its owner could then point it anywhere at all.
    function testAForwarderPointingNowhereCannotBeAllowedAtAll() public {
        address nowhere = address(new ForwarderPointingNowhere());
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(nowhere, true, address(0));
        VM.expectRevert(ExitRouter.ExchangeNotEligible.selector);
        router.setExchangeAllowed(nowhere, true, address(0xA11CE));
        require(!router.allowedExchanges(nowhere), "and it was never allowed");
    }

    // --- the owner's own doors --------------------------------------------------------------------------

    function testOnlyTheOwnerOpensAnExchangeOrSweeps() public {
        VM.prank(relayer);
        (bool allowed,) = address(router)
            .call(abi.encodeWithSelector(ExitRouter.setExchangeAllowed.selector, address(exchange), false, address(0)));
        require(!allowed, "not the relayer's to decide");

        VM.prank(relayer);
        (bool swept,) = address(router).call(abi.encodeWithSelector(ExitRouter.sweep.selector, relayer, address(token)));
        require(!swept, "nor the relayer's to take");
    }

    /// @dev The coins passing through are named per exit now, so there is no fixed list to walk: the sweep is
    ///      told which one to return, the chain's own included.
    function testSweepReturnsAnythingStrandedInAnyCoin() public {
        token.mint(address(router), 1_234);
        usdc.mint(address(router), 5_678);
        VM.deal(address(router), 5 ether);

        router.sweep(stranger, address(token));
        router.sweep(stranger, address(usdc));
        router.sweep(stranger, address(0));

        require(token.balanceOf(stranger) == 1_234 && usdc.balanceOf(stranger) == 5_678, "both tokens returned");
        require(stranger.balance == 5 ether, "and the chain's own coin too");
        require(token.balanceOf(address(router)) == 0 && address(router).balance == 0, "and none kept");
    }

    // --- helpers ----------------------------------------------------------------------------------------

    function _terms(uint256 amount, address tokenOut, uint256 minOut)
        private
        returns (ExitRouter.ExitTerms memory, bytes memory)
    {
        return _termsWith(amount, tokenOut, minOut, address(exchange));
    }

    function _termsWith(uint256 amount, address tokenOut, uint256 minOut, address where)
        private
        returns (ExitRouter.ExitTerms memory t, bytes memory call_)
    {
        call_ = abi.encodeWithSelector(MockExchange.swap.selector, amount, address(router));
        t = ExitRouter.ExitTerms({
            payer: owner,
            amount: amount,
            tokenOut: tokenOut,
            minOut: minOut,
            exchange: where,
            callHash: keccak256(call_),
            deadline: uint64(VM.getBlockTimestamp() + 1 hours),
            salt: keccak256(abi.encode("salt", ++saltSeed))
        });
    }

    function _exit(uint256 amount, address tokenOut, uint256 minOut)
        private
        returns (ExitRouter.ExitTerms memory t, ExitRouter.Authorization memory a, bytes memory call_)
    {
        (t, call_) = _terms(amount, tokenOut, minOut);
        a = _authorization(t, OWNER_KEY);
    }

    function _authorization(ExitRouter.ExitTerms memory t, uint256 key)
        private
        returns (ExitRouter.Authorization memory a)
    {
        a.validAfter = 0;
        a.validBefore = VM.getBlockTimestamp() + 1 hours;
        // Spelled out here rather than asked of the contract, so a change to either formula fails loudly.
        bytes32 nonce = keccak256(
            abi.encode(
                keccak256("viky.exit.v3"),
                keccak256(
                    abi.encode(t.payer, t.amount, t.tokenOut, t.minOut, t.exchange, t.callHash, t.deadline, t.salt)
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
