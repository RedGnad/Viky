// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

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

    /// @dev What the person signed: everything that decides where their money ends up.
    struct ExitTerms {
        /// @dev Whose money. The authorization is checked against this by the token itself.
        address owner;
        /// @dev Where the proceeds go. Theirs to choose, and nobody else can change it.
        address payoutTo;
        uint256 amount;
        /// @dev The least that may come back, so a bad exchange rate cannot be forced on them.
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

    event ExchangeAllowed(address indexed exchange, bool allowed);
    event Exited(
        address indexed owner, address indexed payoutTo, uint256 amountIn, uint256 amountOut, address indexed exchange
    );

    error InvalidAddress();
    error InvalidAmount();
    error ExchangeNotAllowed();
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
            keccak256(abi.encode(t.owner, t.payoutTo, t.amount, t.minOut, t.exchange, t.callHash, t.deadline, t.salt));
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
        if (t.owner == address(0) || t.payoutTo == address(0) || t.exchange == address(0)) {
            revert InvalidAddress();
        }
        if (t.amount == 0 || t.minOut == 0) revert InvalidAmount();
        if (block.timestamp > t.deadline) revert DeadlinePassed();
        if (!allowedExchanges[t.exchange]) revert ExchangeNotAllowed();
        // What will be said to the exchange is part of what they signed, so the relayer cannot say anything
        // else: a different swap, a different recipient inside the call, a different anything.
        if (keccak256(exchangeCall) != t.callHash) revert TermsMismatch();

        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 nativeBefore = address(this).balance;

        // The token checks the authorization against the owner and the nonce, and the nonce is the hash of
        // these terms, so nothing here can be swapped for anything else.
        IERC3009Receiver(address(token))
            .receiveWithAuthorization(
                t.owner, address(this), t.amount, a.validAfter, a.validBefore, exitNonce(t), a.v, a.r, a.s
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
        if (tokenLeft > 0) token.safeTransfer(t.owner, tokenLeft);

        (bool paid,) = t.payoutTo.call{value: amountOut}("");
        if (!paid) revert PayoutFailed();

        emit Exited(t.owner, t.payoutTo, t.amount, amountOut, t.exchange);
    }

    // --- the owner --------------------------------------------------------------------------------------

    function setExchangeAllowed(address exchange, bool allowed) external onlyOwner {
        if (exchange == address(0)) revert InvalidAddress();
        allowedExchanges[exchange] = allowed;
        emit ExchangeAllowed(exchange, allowed);
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
