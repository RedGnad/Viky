// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ExitRouter} from "../contracts/ExitRouter.sol";
import {MockExchange} from "./mocks/MockExchange.sol";

interface VmUsdc {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory);
    function envOr(string calldata name, bytes calldata defaultValue) external returns (bytes memory);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function skip(bool skipTest) external;
}

interface IUsdc is IERC20 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function decimals() external view returns (uint8);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

interface IForwards {
    function getRouter() external view returns (address);
}

/// @notice The converter's USDC half, on a fork of Monad mainnet: a second copy of `ExitRouter`, set at its
///         deployment on the REAL USDC, turns USDC a card payment delivered into the REAL AUSD a gift holds, on
///         one signature, for an account that holds none of the chain's coin (D53).
///
///         What it proves that a mock token could not: USDC on Monad takes the nine-argument
///         `receiveWithAuthorization` the router calls, under the domain src/coins.ts signs with, and accepts
///         the hash of the terms as its nonce, exactly as AUSD does. The contract itself is unchanged.
///
///         The exchange is a stand-in in the two tests that always run, because a real route needs a quote made
///         for this very router a moment before. The third runs the real exchange when one is passed in:
///
///           MONAD_RPC_URL=... KURU_USDC_CALLDATA=0x... forge test --match-path test/UsdcRouterFork.t.sol -vv
///
///         The quote must be asked for the router's own address, which the test prints when no bytes are given.
///         Skips when MONAD_RPC_URL is not set.
contract UsdcRouterForkTest {
    VmUsdc private constant VM = VmUsdc(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address private constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    /// @dev The exchange a live quote targets, and the one the deployed way out allows and pins.
    address private constant EXCHANGE = 0xb3e6778480b2E488385E8205eA05E20060B813cb;
    /// @dev The Curve AUSD/USDC/USDT0 pool, which holds both coins and lends the test a little of each.
    address private constant CURVE_POOL = 0x942644106B073E30D72c2C5D7529D5C296ea91ab;
    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 private constant PERSON_KEY = 0xC0FFEE;
    uint256 private constant AMOUNT = 30_000_000; // thirty dollars, what a card payment for a gift looks like
    address private constant RELAYER = address(0xBEEF);

    bool private forked;
    ExitRouter private router;
    address private person;

    function setUp() public {
        string memory url = VM.envOr("MONAD_RPC_URL", string(""));
        if (bytes(url).length == 0) return;
        VM.createSelectFork(url);
        forked = true;
        // The same contract, set on the other coin. Nothing else differs from the way out.
        router = new ExitRouter(IERC20(USDC));
        person = VM.addr(PERSON_KEY);
        VM.prank(CURVE_POOL);
        IERC20(USDC).transfer(person, AMOUNT);
    }

    function testUsdcSignsUnderTheDomainTheAppUses() public {
        if (!forked) {
            VM.skip(true);
            return;
        }
        require(block.chainid == 143, "not Monad mainnet");
        require(IUsdc(USDC).decimals() == 6 && IUsdc(AUSD).decimals() == 6, "both coins count six decimals");
        // src/coins.ts: name USDC, version 2. A wrong name or version and every signature is refused.
        bytes32 expected = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("USDC"), keccak256("2"), uint256(143), USDC));
        require(IUsdc(USDC).DOMAIN_SEPARATOR() == expected, "USDC's domain is not the one the app signs under");
        require(address(router.token()) == USDC, "the copy takes USDC");
    }

    function testUsdcBecomesWhatAGiftHoldsOnOneSignature() public {
        if (!forked) {
            VM.skip(true);
            return;
        }
        MockExchange exchange = _standIn(1, 1);
        require(person.balance == 0, "the person holds none of the chain's coin, which is the whole reason");
        require(IERC20(USDC).balanceOf(person) == AMOUNT, "the pool did not lend the USDC");

        bytes memory call = abi.encodeCall(MockExchange.swap, (AMOUNT, address(router)));
        ExitRouter.ExitTerms memory t = _terms(address(exchange), call, (AMOUNT * 99) / 100);
        ExitRouter.Authorization memory a = _sign(t);

        // Anyone may submit it. Viky's relayer does, and the person's account calls nothing.
        VM.prank(RELAYER);
        uint256 out = router.exit(t, a, call);

        require(out == AMOUNT, "one for one from the stand-in");
        require(IERC20(AUSD).balanceOf(person) == AMOUNT, "the person holds what a gift holds");
        require(IERC20(USDC).balanceOf(person) == 0, "and none of the USDC is left with them");
        require(
            IERC20(USDC).balanceOf(address(router)) == 0 && IERC20(AUSD).balanceOf(address(router)) == 0,
            "the router keeps nothing"
        );
        require(person.balance == 0, "they never needed the chain's coin");
        require(
            IUsdc(USDC).authorizationState(person, router.exitNonce(t)),
            "USDC marks the terms spent, so they cannot land twice"
        );
        require(IERC20(USDC).allowance(address(router), address(exchange)) == 0, "no allowance is left behind");
    }

    function testAPoorRateMovesNothing() public {
        if (!forked) {
            VM.skip(true);
            return;
        }
        // Ninety-eight for a hundred, under the floor the terms carry: everything reverts, the USDC stays theirs.
        MockExchange exchange = _standIn(98, 100);
        bytes memory call = abi.encodeCall(MockExchange.swap, (AMOUNT, address(router)));
        ExitRouter.ExitTerms memory t = _terms(address(exchange), call, (AMOUNT * 99) / 100);
        ExitRouter.Authorization memory a = _sign(t);

        VM.prank(RELAYER);
        (bool ok, bytes memory reason) = address(router).call(abi.encodeCall(ExitRouter.exit, (t, a, call)));
        require(!ok, "too little back must revert");
        require(bytes4(reason) == ExitRouter.TooLittleBack.selector, "and it says why");
        require(IERC20(USDC).balanceOf(person) == AMOUNT, "nothing was taken");
        require(!IUsdc(USDC).authorizationState(person, router.exitNonce(t)), "and the signature was not spent");
    }

    function testTheRealExchangeChangesUsdcForThisRouter() public {
        bytes memory call = VM.envOr("KURU_USDC_CALLDATA", bytes(""));
        if (!forked || call.length == 0) {
            // Printed so a quote can be asked for this very address: forge shows it with -vv in the skip's trace.
            emit QuoteFor(address(router));
            VM.skip(true);
            return;
        }
        // Allowed and pinned exactly as the deployment script does it: where the exchange points today, asked of it.
        router.setExchangeAllowed(EXCHANGE, true, IForwards(EXCHANGE).getRouter());
        ExitRouter.ExitTerms memory t = _terms(EXCHANGE, call, (AMOUNT * 99) / 100);
        ExitRouter.Authorization memory a = _sign(t);

        VM.prank(RELAYER);
        uint256 out = router.exit(t, a, call);

        require(out >= (AMOUNT * 99) / 100, "at least ninety-nine for a hundred, or it would have reverted");
        require(IERC20(AUSD).balanceOf(person) == out, "everything that came back is theirs");
        require(
            IERC20(USDC).balanceOf(address(router)) == 0 && IERC20(AUSD).balanceOf(address(router)) == 0,
            "the router keeps nothing"
        );
        emit CameBack(out);
    }

    event QuoteFor(address router);
    event CameBack(uint256 ausd);

    /// @dev A stand-in exchange holding real AUSD, allowed on the router with nothing to pin: it forwards nothing.
    function _standIn(uint256 numerator, uint256 denominator) private returns (MockExchange exchange) {
        exchange = new MockExchange(IERC20(USDC), IERC20(AUSD));
        exchange.setRate(numerator, denominator);
        VM.prank(CURVE_POOL);
        IERC20(AUSD).transfer(address(exchange), AMOUNT);
        router.setExchangeAllowed(address(exchange), true, address(0));
    }

    function _terms(address exchange, bytes memory call, uint256 minOut)
        private
        view
        returns (ExitRouter.ExitTerms memory)
    {
        return ExitRouter.ExitTerms({
            payer: person,
            amount: AMOUNT,
            tokenOut: AUSD,
            minOut: minOut,
            exchange: exchange,
            callHash: keccak256(call),
            deadline: uint64(block.timestamp + 15 minutes),
            salt: keccak256("usdc fork salt")
        });
    }

    /// @dev The one signature: USDC's own authorization, whose nonce is the hash of the terms.
    function _sign(ExitRouter.ExitTerms memory t) private returns (ExitRouter.Authorization memory a) {
        a.validAfter = 0;
        a.validBefore = t.deadline;
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIVE_TYPEHASH, person, address(router), t.amount, a.validAfter, a.validBefore, router.exitNonce(t)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IUsdc(USDC).DOMAIN_SEPARATOR(), structHash));
        (a.v, a.r, a.s) = VM.sign(PERSON_KEY, digest);
    }
}
