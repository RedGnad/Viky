// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @dev The EIP-3009 entry AUSD exposes. `to` must be the caller, so a signed authorization can only land here.
/// @dev The shape of a forwarding exchange: one that holds no logic itself and passes calls to another
///      contract its own owner can change. The exchange Viky uses is one of these.
interface IForwardingExchange {
    function getRouter() external view returns (address);
}

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
/// @notice Turns what a gift earned into money a person can be paid, in one transaction that Viky's relayer
///         submits and pays for. The person signs once and their own account does nothing.
/// @dev    This exists because of one rule of the chain (DECISIONS.md D53): Monad reserves 10 MON per account
///         and an account below that can make **no contract call at all**. A recipient holds a gift and no
///         MON, so they can neither approve an exchange nor swap. Every other part of Viky already worked
///         this way, the person signing and the relayer sending, which is why every other part worked.
///
///         The whole safety of this contract is that **one signature says everything**. AUSD's authorization
///         binds only who, how much, and a nonce, so the nonce here *is* the hash of the terms: where the
///         money goes, the least that may come back, which exchange, and exactly what will be said to it. A
///         relayer that changes any of those produces a nonce the token will not accept. The same trick
///         funds a gift with a single signature, so there is one idea to check, not two.
///
///         The contract holds nothing between transactions. Whatever it receives leaves in the same call, to
///         the person's chosen destination, and anything left over goes back to them.
contract ExitRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Distinct from the gift contracts' tags, so one signature can never be spent on another contract.
    bytes32 public constant EXIT_NONCE_TAG = keccak256("viky.exit.v1");
    /// @dev What a destination gets to spend receiving its money. Generous for any ordinary account or
    ///      contract, and bounded so one that burns gas on purpose costs the relayer a known amount once.
    uint256 public constant PAYOUT_GAS = 100_000;

    /// @dev What the person signed: everything that decides where their money ends up.
    struct ExitTerms {
        /// @dev Whose money. The authorization is checked against this by the token itself. Named `payer`
        ///      and not `owner`, because `owner()` here is Viky and confusing the two would be a way to lose money.
        address payer;
        /// @dev Where the proceeds go. Theirs to choose, and nobody else can change it.
        address payoutTo;
        uint256 amount;
        /// @dev The order. It is the least that may come back from the exchange, and it is also exactly what
        ///      the destination is sent: a payout service is owed an amount, not an approximation of one.
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

    event ExchangeAllowed(address indexed exchange, bool allowed, address mustPointAt);
    event Exited(
        address indexed payer,
        address indexed payoutTo,
        uint256 amountIn,
        /// @dev What the destination was actually sent, which is the order exactly, never more.
        uint256 paidOut,
        /// @dev What the exchange gave beyond the order, handed straight back to the person.
        uint256 returned,
        address indexed exchange
    );

    error InvalidAddress();
    error InvalidAmount();
    error ExchangeNotAllowed();
    error ExchangeNotEligible();
    error ExchangeMoved();
    error PayoutNotDelivered();
    error TermsMismatch();
    error DeadlinePassed();
    error TransferShortfall();
    error ExchangeFailed();
    error TooLittleBack();
    error PayoutFailed();

    constructor(IERC20 token_) {
        if (address(token_) == address(0)) revert InvalidAddress();
        token = token_;
    }

    // --- terms ------------------------------------------------------------------------------------------

    function hashTerms(ExitTerms calldata t) public pure returns (bytes32) {
        return
            keccak256(abi.encode(t.payer, t.payoutTo, t.amount, t.minOut, t.exchange, t.callHash, t.deadline, t.salt));
    }

    /// @notice The nonce the authorization must carry. One signature is therefore both the payment and the
    ///         consent to these exact terms, and cannot be spent on any others.
    function exitNonce(ExitTerms calldata t) public pure returns (bytes32) {
        return keccak256(abi.encode(EXIT_NONCE_TAG, hashTerms(t)));
    }

    // --- the exit ---------------------------------------------------------------------------------------

    /// @notice Takes the person's AUSD by their signed authorization, exchanges it exactly as they signed
    ///         for, and sends what comes back where they asked. Anyone may submit it; Viky's relayer does.
    function exit(ExitTerms calldata t, Authorization calldata a, bytes calldata exchangeCall)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (t.payer == address(0) || t.payoutTo == address(0) || t.exchange == address(0)) {
            revert InvalidAddress();
        }
        // Paying into this contract would look exactly like a payment and be none: the call succeeds, the
        // event says the money was delivered, and it sits here reachable only by us.
        if (t.payoutTo == address(this)) revert InvalidAddress();
        // The exchange may never be the token or this contract. Both would let a caller aim the router's own
        // `receiveWithAuthorization` at somebody else's signed authorization, since the token requires the
        // recipient to be the caller, and take the proceeds as "left over". The floor on what must come back
        // happens to stop it today, which is not a reason to leave it standing.
        if (t.exchange == address(token) || t.exchange == address(this)) revert ExchangeNotEligible();
        if (t.amount == 0 || t.minOut == 0) revert InvalidAmount();
        if (block.timestamp > t.deadline) revert DeadlinePassed();
        if (!allowedExchanges[t.exchange]) revert ExchangeNotAllowed();
        address pinned = mustPointAt[t.exchange];
        if (pinned != address(0) && IForwardingExchange(t.exchange).getRouter() != pinned) revert ExchangeMoved();
        // What will be said to the exchange is part of what they signed, so the relayer cannot say anything
        // else: a different swap, a different recipient inside the call, a different anything.
        if (keccak256(exchangeCall) != t.callHash) revert TermsMismatch();

        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 nativeBefore = address(this).balance;

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

        amountOut = address(this).balance - nativeBefore;
        if (amountOut < t.minOut) revert TooLittleBack();

        // Anything the exchange did not take goes straight back to them; this contract keeps nothing.
        uint256 tokenLeft = token.balanceOf(address(this)) - tokenBefore;
        if (tokenLeft > 0) token.safeTransfer(t.payer, tokenLeft);

        // Exactly the order, and the rest straight back to them.
        //
        // The destination is a payout service holding an order for a precise amount. Asked what it does when
        // what arrives differs from that order, its own documentation says only that a different amount "may
        // delay processing or prevent your transaction from being completed" (D59). An undefined answer is
        // not something a person's payout may rest on, so we never test it: what the exchange gave above the
        // order is theirs and goes back to them in the same transaction.
        //
        // The stipend is bounded so a destination that burns everything it is given cannot make the relayer
        // pay for a transaction that was never going to finish, over and over, with the signature unspent.
        uint256 returned = amountOut - t.minOut;
        (bool paid,) = t.payoutTo.call{value: t.minOut, gas: PAYOUT_GAS}("");
        if (!paid) revert PayoutFailed();
        // A person's account is an ordinary one that cannot refuse a transfer, so this cannot be how a payout
        // fails; it reverts rather than leaving their surplus here if one ever could.
        if (returned > 0) {
            (bool back,) = t.payer.call{value: returned, gas: PAYOUT_GAS}("");
            if (!back) revert PayoutFailed();
        }
        // Delivered, not merely "the call did not revert": a destination that hands the money straight back
        // returns success, and the person would be told they were paid while nothing left.
        if (address(this).balance != nativeBefore) revert PayoutNotDelivered();

        emit Exited(t.payer, t.payoutTo, t.amount - tokenLeft, t.minOut, returned, t.exchange);
    }

    // --- the owner --------------------------------------------------------------------------------------

    /// @param pointsAt what a forwarding exchange must still be pointing at, or zero when it forwards nothing.
    function setExchangeAllowed(address exchange, bool allowed, address pointsAt) external onlyOwner {
        if (exchange == address(0)) revert InvalidAddress();
        // Refused here as well as at the call, so the list itself can never hold either of them.
        if (exchange == address(token) || exchange == address(this)) revert ExchangeNotEligible();
        allowedExchanges[exchange] = allowed;
        mustPointAt[exchange] = allowed ? pointsAt : address(0);
        emit ExchangeAllowed(exchange, allowed, pointsAt);
    }

    /// @dev The contract is not meant to hold anything between transactions. If an exchange ever leaves
    ///      something behind, this returns it rather than leaving it stranded.
    function sweep(address to) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        uint256 left = token.balanceOf(address(this));
        if (left > 0) token.safeTransfer(to, left);
        if (address(this).balance > 0) {
            (bool ok,) = to.call{value: address(this).balance}("");
            if (!ok) revert PayoutFailed();
        }
    }

    /// @dev Exchanges send the proceeds here before they are passed on, in the same transaction.
    receive() external payable {}
}
