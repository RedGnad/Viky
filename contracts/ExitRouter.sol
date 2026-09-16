// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @dev The shape of a forwarding exchange: one that holds no logic itself and passes calls to another
///      contract its own owner can change. The exchange Viky uses is one of these.
interface IForwardingExchange {
    function getRouter() external view returns (address);
}

/// @dev The EIP-3009 entry AUSD exposes. `to` must be the caller, so a signed authorization can only land here.
interface IERC3009Receiver {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title  ExitRouter
/// @notice Turns what a gift earned into the coin a payout service takes, and hands it to the person. One
///         transaction, submitted and paid for by Viky's relayer; the person signs once and their own account
///         calls nothing.
/// @dev    This exists because of one rule of the chain (DECISIONS.md D53): Monad reserves 10 MON per account
///         and an account below that can make **no contract call at all**. A recipient holds a gift and no
///         MON, so they can neither approve an exchange nor swap.
///
///         **What this contract does not do is as important as what it does (D76).** It never pays a payout
///         service. The exchanged coin goes to the person, and they send it on themselves with a signature of
///         their own. The reason is that a payout service credits an order by watching for a deposit, and a
///         native transfer made by a contract is an internal transfer: it is in no block's transaction list
///         and in no receipt, so anything reading the chain the ordinary way does not see it. Nobody at any
///         such service says in public whether an order paid that way is credited at all. A transfer from the
///         person's own account leaves the trace every detector reads, and asks nobody's permission. So the
///         router stops one step earlier than it used to, and the step it dropped is the one that was a bet.
///
///         **The coin that comes back is named in the terms, not fixed at deployment (D77).** Two payout
///         services cover different countries and want different coins: one sells a stablecoin and serves the
///         euro area, the other sells the chain's own coin and serves places the first refuses outright. A
///         router pinned to either coin would close the corridor the other one serves, and the people that
///         would shut out are exactly the recipients the pilot exists for. So `tokenOut` travels inside the
///         signature like everything else, and zero means the chain's own coin.
///
///         The whole safety of this contract is that **one signature says everything**. AUSD's authorization
///         binds only who, how much, and a nonce, so the nonce here *is* the hash of the terms: how much is
///         taken, which coin must come back, the least of it, which exchange, and exactly what will be said
///         to it. A relayer that changes any of those produces a nonce the token will not accept. The same
///         trick funds a gift with a single signature, so there is one idea to check, not two.
///
///         The contract holds nothing between transactions. Whatever it receives leaves in the same call, to
///         the person who signed, and nowhere else.
contract ExitRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Distinct from the gift contracts' tags, so one signature can never be spent on another contract.
    /// @dev v3 with the terms themselves: v1 named a destination and v2 fixed the output coin outside the
    ///      terms, so bytes signed for either describe something this contract would now read differently.
    bytes32 public constant EXIT_NONCE_TAG = keccak256("viky.exit.v3");

    /// @dev The chain's own coin, as `tokenOut` names it.
    address public constant NATIVE = address(0);

    /// @dev What the person signed: everything that decides what happens to their money.
    struct ExitTerms {
        /// @dev Whose money, and where the proceeds go: the same account either way. The authorization is
        ///      checked against this by the token itself. Named `payer` and not `owner`, because `owner()`
        ///      here is Viky and confusing the two would be a way to lose money.
        address payer;
        uint256 amount;
        /// @dev The coin that must come back, zero meaning the chain's own. Inside the signature because the
        ///      person chose which payout service they are heading for, and the two take different coins.
        address tokenOut;
        /// @dev The least that may come back, counted in that coin. A floor, and nothing else: no order rests
        ///      on it, because this contract no longer pays an order.
        uint256 minOut;
        /// @dev Which exchange is called, and exactly what is said to it.
        address exchange;
        bytes32 callHash;
        uint64 deadline;
        bytes32 salt;
    }

    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @dev What a gift holds, and what is taken from the person by their signature.
    IERC20 public immutable token;

    /// @dev Exchanges the owner has allowed. The terms already name one and the signature binds it, so this
    ///      is the second lock: even a signature produced by a compromised app cannot reach anywhere else.
    mapping(address => bool) public allowedExchanges;
    /// @dev What an allowed exchange must still be pointing at, when it is a forwarder whose owner can change
    ///      that at any time. The one Viky uses is exactly that: the address a quote asks us to call holds no
    ///      logic and passes everything to a second contract its owner may replace between the quote and the
    ///      moment the relayer sends. The floor already keeps the money safe if that happens, since too little
    ///      coming back reverts the whole transaction. This is the other half: we refuse before handing an
    ///      allowance and hand-written calldata to a contract nobody has looked at, and the refusal says why.
    ///      Zero means the exchange forwards nothing and there is nothing to check.
    mapping(address => address) public mustPointAt;

    /// @dev Gas allowed to the person's own account when the coin coming back is the chain's own. It saves the
    ///      relayer nothing, because Monad charges the limit a transaction declares rather than what it uses
    ///      (D52, D61). What it buys is the guarantee that gas is left on our side afterwards to check the
    ///      money really left, instead of a payee able to take the whole transaction down with it.
    uint256 public payoutGas = 100_000;
    uint256 public constant MIN_PAYOUT_GAS = 30_000;
    uint256 public constant MAX_PAYOUT_GAS = 1_000_000;

    event ExchangeAllowed(address indexed exchange, bool allowed, address mustPointAt);
    event PayoutGasSet(uint256 payoutGas);
    event Exited(
        address indexed payer, uint256 amountIn, address indexed tokenOut, uint256 amountOut, address indexed exchange
    );

    error InvalidAddress();
    error InvalidAmount();
    error ExchangeNotAllowed();
    error ExchangeNotEligible();
    error ExchangeMoved();
    error UnexpectedTokens();
    error PinRequired();
    error OwnershipIsNotRenounceable();
    error PayoutFailed();
    error PayoutNotDelivered();
    error TermsMismatch();
    error DeadlinePassed();
    error TransferShortfall();
    error ExchangeFailed();
    error TooLittleBack();
    error SameToken();

    constructor(IERC20 token_) {
        if (address(token_) == address(0)) revert InvalidAddress();
        token = token_;
    }

    /// @dev So an exchange can hand back the chain's own coin. Nothing else is expected to arrive, and
    ///      anything that does leaves with the next exit or by the sweep.
    receive() external payable {}

    // --- terms ------------------------------------------------------------------------------------------

    function hashTerms(ExitTerms calldata t) public pure returns (bytes32) {
        return
            keccak256(abi.encode(t.payer, t.amount, t.tokenOut, t.minOut, t.exchange, t.callHash, t.deadline, t.salt));
    }

    /// @notice The nonce the authorization must carry. One signature is therefore both the payment and the
    ///         consent to these exact terms, and cannot be spent on any others.
    function exitNonce(ExitTerms calldata t) public pure returns (bytes32) {
        return keccak256(abi.encode(EXIT_NONCE_TAG, hashTerms(t)));
    }

    // --- the exit ---------------------------------------------------------------------------------------

    /// @notice Takes the person's AUSD by their signed authorization, exchanges it exactly as they signed for,
    ///         and hands them everything that came back. Anyone may submit it; Viky's relayer does.
    function exit(ExitTerms calldata t, Authorization calldata a, bytes calldata exchangeCall)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (t.payer == address(0) || t.exchange == address(0)) revert InvalidAddress();
        // The exchange may never be the token or this contract. The token would let a caller aim the router's
        // own `receiveWithAuthorization` at somebody else's signed authorization, since the token requires the
        // recipient to be the caller, and take the proceeds as "left over". Nor may it be the coin coming
        // back, for the same reason applied to whatever that coin turns out to be.
        if (t.exchange == address(token) || t.exchange == address(this) || t.exchange == t.tokenOut) {
            revert ExchangeNotEligible();
        }
        // One accounting rests on the two coins being different: what came in is measured on one balance and
        // what goes out on the other. The same address for both would let the refund and the payout read each
        // other, and the surplus check would pass on money that never arrived.
        if (t.tokenOut == address(token)) revert SameToken();
        if (t.tokenOut == address(this)) revert InvalidAddress();
        if (t.amount == 0 || t.minOut == 0) revert InvalidAmount();
        if (block.timestamp > t.deadline) revert DeadlinePassed();
        if (!allowedExchanges[t.exchange]) revert ExchangeNotAllowed();
        address pinned = mustPointAt[t.exchange];
        if (pinned != address(0)) {
            // A pin exists only for an exchange that answered with a readable address when it was allowed,
            // so anything else now means it is no longer what it was: silent, unreadable, or pointing
            // elsewhere all get the same name, because to us they are the same fact.
            (bool answers, bool readable, address pointsAt) = _pointsAt(t.exchange);
            if (!answers || !readable || pointsAt != pinned) revert ExchangeMoved();
        }
        // What will be said to the exchange is part of what they signed, so the relayer cannot say anything
        // else: a different swap, a different recipient inside the call, a different anything.
        if (keccak256(exchangeCall) != t.callHash) revert TermsMismatch();

        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 outBefore = _heldOf(t.tokenOut);

        // The token checks the authorization against the owner and the nonce, and the nonce is the hash of
        // these terms, so nothing here can be swapped for anything else.
        IERC3009Receiver(address(token))
            .receiveWithAuthorization(
                t.payer, address(this), t.amount, a.validAfter, a.validBefore, exitNonce(t), a.v, a.r, a.s
            );
        if (token.balanceOf(address(this)) != tokenBefore + t.amount) revert TransferShortfall();

        token.forceApprove(t.exchange, t.amount);
        (bool ok,) = t.exchange.call(exchangeCall);
        // Left at zero whatever happened, so nothing of ours stays spendable by anyone.
        token.forceApprove(t.exchange, 0);
        if (!ok) revert ExchangeFailed();

        amountOut = _heldOf(t.tokenOut) - outBefore;
        if (amountOut < t.minOut) revert TooLittleBack();

        // Anything the exchange did not take goes straight back to them; this contract keeps nothing.
        //
        // Bounded by what was pulled, which is not the same as safe, and the difference is worth writing
        // down rather than being reassured by.
        //
        // This hands `tokenLeft` to whoever signed the terms without asking where it came from, and the
        // calldata sent to the exchange is theirs to write. `tokenLeft` is a balance delta, so an exchange
        // that both spends part of our allowance and moves a third party's tokens in nets out under this
        // cap: pull 600,000 of the 1,000,000 allowed and bring 600,000 of somebody else's, and the delta is
        // exactly 1,000,000. The cap stops the amount growing past one exit's worth; it does not stop that
        // exit. Capping at the unspent allowance instead would be exact, and would refuse the ordinary
        // exchange that pulls everything and refunds the remainder, which is a shape we need.
        //
        // What actually keeps this shut is the allowlist plus the pin: the exchange we use cannot move
        // anybody else's tokens, because its only transferFrom takes from its own caller, read from its
        // bytecode on 14 Sep. That is a fact about a contract somebody else owns, so it is defence in depth
        // that this cap bounds rather than a guarantee this cap provides.
        uint256 tokenLeft = token.balanceOf(address(this)) - tokenBefore;
        if (tokenLeft > t.amount) revert UnexpectedTokens();
        if (tokenLeft > 0) token.safeTransfer(t.payer, tokenLeft);

        // Everything that came back, to the person who signed, and to nobody else. There is no order to pay
        // exactly and no surplus to split: what a payout service is owed is sent by the person themselves,
        // from their own account, in a transfer any detector can see (D76).
        if (t.tokenOut == NATIVE) {
            (bool paid,) = t.payer.call{value: amountOut, gas: payoutGas}("");
            if (!paid) revert PayoutFailed();
        } else {
            IERC20(t.tokenOut).safeTransfer(t.payer, amountOut);
        }
        // Delivered, not merely "the call did not revert": a token that quietly keeps what it was asked to
        // move, or a payee that hands the coin straight back, would otherwise leave the person told they were
        // paid while their money sat here.
        if (_heldOf(t.tokenOut) != outBefore) revert PayoutNotDelivered();

        emit Exited(t.payer, t.amount - tokenLeft, t.tokenOut, amountOut, t.exchange);
    }

    /// @dev What this contract holds of a coin, the chain's own included.
    function _heldOf(address what) private view returns (uint256) {
        return what == NATIVE ? address(this).balance : IERC20(what).balanceOf(address(this));
    }

    // --- the owner --------------------------------------------------------------------------------------

    /// @param pointsAt what a forwarding exchange must still be pointing at, or zero when it forwards nothing.
    function setExchangeAllowed(address exchange, bool allowed, address pointsAt) external onlyOwner {
        if (exchange == address(0)) revert InvalidAddress();
        // Refused here as well as at the call, so the list itself can never hold either of them.
        if (exchange == address(token) || exchange == address(this)) revert ExchangeNotEligible();
        if (allowed) {
            // Whether it forwards is asked here, not trusted to whoever is typing. Closing an exchange
            // forgets its pin, so opening one again with nothing would otherwise quietly drop the check that
            // is the only thing standing between us and a target its own owner replaced.
            //
            // Three states, because collapsing them to two is how a hole appears. An address with no such
            // function does not forward, and takes no pin. An address that answers with something we cannot
            // read, or that answers with nowhere, is refused outright: pinning it is impossible and allowing
            // it unpinned would mean the check never runs, which is worse than refusing a valid exchange.
            (bool answers, bool readable, address pointsAtNow) = _pointsAt(exchange);
            if (!answers) {
                if (pointsAt != address(0)) revert ExchangeNotEligible();
            } else {
                if (!readable || pointsAtNow == address(0)) revert ExchangeNotEligible();
                if (pointsAt == address(0)) revert PinRequired();
                if (pointsAt != pointsAtNow) revert ExchangeMoved();
            }
        }
        allowedExchanges[exchange] = allowed;
        mustPointAt[exchange] = allowed ? pointsAt : address(0);
        emit ExchangeAllowed(exchange, allowed, pointsAt);
    }

    /// @dev Bounded at both ends so a stipend can be corrected without deploying again, and so nobody can set
    ///      it to something that makes every payout of the chain's own coin fail.
    function setPayoutGas(uint256 value) external onlyOwner {
        if (value < MIN_PAYOUT_GAS || value > MAX_PAYOUT_GAS) revert InvalidAmount();
        payoutGas = value;
        emit PayoutGasSet(value);
    }

    /// @dev Giving up ownership would freeze the allowlist and the sweep for good, with no way back.
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipIsNotRenounceable();
    }

    /// @dev Three things about an exchange, and it never reverts, which the previous version claimed while
    ///      `abi.decode(data, (address))` still threw on a word whose top bits were dirty. A forwarder with
    ///      an assembly getter, a Vyper getter or a packed slot returns exactly such a word, and the whole
    ///      point of asking rather than calling was to refuse with a name rather than with empty data.
    /// @return answers whether the address has such a function at all.
    /// @return readable whether what it gave back can be read as an address.
    /// @return pointsAt where it points, when both of the above hold.
    function _pointsAt(address exchange) private view returns (bool answers, bool readable, address pointsAt) {
        (bool ok, bytes memory data) =
            exchange.staticcall(abi.encodeWithSelector(IForwardingExchange.getRouter.selector));
        if (!ok) return (false, false, address(0));
        if (data.length != 32) return (true, false, address(0));
        uint256 word = abi.decode(data, (uint256));
        // Decoded as a word and checked, rather than decoded as an address and hoped for. Masking the top
        // bits away would be guessing at what it meant; refusing says we could not tell.
        if (word > type(uint160).max) return (true, false, address(0));
        return (true, true, address(uint160(word)));
    }

    /// @dev The contract is not meant to hold anything between transactions. If an exchange ever leaves
    ///      something behind, this returns it rather than leaving it stranded. `what` is the coin to return,
    ///      zero meaning the chain's own, because the coins that pass through here are named per exit now and
    ///      no fixed list of them exists to walk.
    function sweep(address to, address what) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        if (what == NATIVE) {
            uint256 left = address(this).balance;
            if (left > 0) {
                (bool sent,) = to.call{value: left}("");
                if (!sent) revert PayoutFailed();
            }
        } else {
            uint256 left = IERC20(what).balanceOf(address(this));
            if (left > 0) IERC20(what).safeTransfer(to, left);
        }
    }
}
