// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ExitRouter} from "../contracts/ExitRouter.sol";

interface VmAgora {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function skip(bool skipTest) external;
}

interface ITestAusd is IERC20 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function decimals() external view returns (uint8);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

/// @dev Agora's Instant Settlement pair, as much of it as the way out says to it (docs.agora.finance, "Pair Contract").
interface IAgoraPair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function hasRole(string calldata role, address member) external view returns (bool);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory);
}

/// @dev The contract that holds the whitelister's role on the pairs of Monad testnet. There, and there only, it gives
///      the swapper's role to whichever address is named, by anybody.
interface IAgoraWhitelister {
    function setApprovedSwapper(address swapper) external;
}

interface IAgoraFaucet {
    function requestFunds(address to) external;
}

/// @notice The way out through Agora's Instant Settlement, on a fork of Monad TESTNET (chain 10143): the same
///         `ExitRouter` as production, set at its deployment on Agora's test AUSD, turns AUSD into the pair's other
///         coin at the pair's fixed price, on one signature, for an account that holds none of the chain's coin.
///
///         What it proves: nothing in the contract has to change for Agora's pair to be the exchange. The pair
///         answers the Uniswap v2 call the terms carry, it is not a forwarder so it takes no pin, the test AUSD takes
///         the nine-argument `receiveWithAuthorization` under the same domain name and version as AUSD on mainnet,
///         and the price is one for one: no floor is ever met, so no exit is refused for a rate that moved.
///
///         What it does not prove, and nothing here says otherwise: that this runs on mainnet. There the pair swaps
///         only for an address Agora has approved after verifying the company behind it, and no address of Viky's is.
///         On testnet a contract of Agora's gives that role to any address, which is the one step this test takes that
///         mainnet does not offer. Only the way out is walked: the pair's other test coin takes no signed transfer,
///         so the converter of card payments, which is this same contract set on a coin that does, has no test twin.
///
///           MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz forge test --match-path test/AgoraPairFork.t.sol -vv
///
///         Skips when MONAD_TESTNET_RPC_URL is not set. The addresses are those of github.com/agora-finance/
///         stable-swap-examples, branch monad, read on 8 Oct 2026.
contract AgoraPairForkTest {
    VmAgora private constant VM = VmAgora(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant PAIR = 0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae;
    address private constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    address private constant CTK = 0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D;
    address private constant WHITELISTER = 0x7c10F56d6f04a51376393a1C3670e966863F6BD5;
    address private constant FAUCET = 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C;
    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 private constant PERSON_KEY = 0xA60A;
    uint256 private constant AMOUNT = 10_000_000; // ten dollars of what a gift holds
    /// @dev The pair's other coin counts eighteen decimals where AUSD counts six: one for one is this many times more.
    uint256 private constant CTK_PER_AUSD_UNIT = 1e12;
    address private constant RELAYER = address(0xBEEF);
    address private constant ANYBODY = address(0xA11CE);

    bool private forked;
    ExitRouter private router;
    address private person;

    function setUp() public {
        string memory url = VM.envOr("MONAD_TESTNET_RPC_URL", string(""));
        if (bytes(url).length == 0) return;
        VM.createSelectFork(url);
        forked = true;
        // The same contract as the way out on mainnet, set on the test AUSD. This test contract is its owner.
        router = new ExitRouter(IERC20(AUSD));
        person = VM.addr(PERSON_KEY);
        // Agora's faucet mints test AUSD to any address named.
        VM.prank(ANYBODY);
        IAgoraFaucet(FAUCET).requestFunds(person);
    }

    function testThePairIsWhatTheDocumentationSays() public {
        if (!forked) {
            VM.skip(true);
            return;
        }
        require(block.chainid == 10143, "not Monad testnet");
        require(IAgoraPair(PAIR).token0() == CTK && IAgoraPair(PAIR).token1() == AUSD, "the pair's two coins");
        require(ITestAusd(AUSD).decimals() == 6 && ITestAusd(CTK).decimals() == 18, "six decimals and eighteen");
        // The same name and version as AUSD on mainnet (src/coins.ts), on this chain and this address.
        bytes32 expected =
            keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("Agora Dollar"), keccak256("1"), uint256(10143), AUSD));
        require(ITestAusd(AUSD).DOMAIN_SEPARATOR() == expected, "the test AUSD signs under another domain");
        // A fixed price, one for one, in both directions, with nothing taken.
        require(_quote(AUSD, CTK, AMOUNT) == AMOUNT * CTK_PER_AUSD_UNIT, "ten AUSD give ten of the other coin");
        require(_quote(CTK, AUSD, AMOUNT * CTK_PER_AUSD_UNIT) == AMOUNT, "and ten of it give ten AUSD");
        // It is not a forwarder: asked where it points, it does not answer, so the router allows it with no pin.
        (bool answers,) = PAIR.staticcall(abi.encodeWithSignature("getRouter()"));
        require(!answers, "the pair answers getRouter, so it would need a pin");
    }

    function testAusdLeavesThroughAgorasPairOneForOneOnOneSignature() public {
        if (!forked) {
            VM.skip(true);
            return;
        }
        router.setExchangeAllowed(PAIR, true, address(0));
        // On testnet anybody gives the swapper's role to any address: here, to the router, which is who the pair sees.
        VM.prank(ANYBODY);
        IAgoraWhitelister(WHITELISTER).setApprovedSwapper(address(router));
        require(IAgoraPair(PAIR).hasRole("APPROVED_SWAPPER", address(router)), "the router was not approved");
        require(person.balance == 0, "the person holds none of the chain's coin, which is the whole reason");
        uint256 held = IERC20(AUSD).balanceOf(person);
        require(held >= AMOUNT, "the faucet did not give the AUSD");

        uint256 owed = AMOUNT * CTK_PER_AUSD_UNIT;
        bytes memory call = _swapCall(AMOUNT, owed);
        // The floor is the whole amount: at a fixed price nothing less can come back, and nothing less is accepted.
        ExitRouter.ExitTerms memory t = _terms(call, owed, "agora fork salt");
        ExitRouter.Authorization memory a = _sign(t);

        // Anyone may submit it. Viky's relayer does, and the person's account calls nothing.
        VM.prank(RELAYER);
        uint256 out = router.exit(t, a, call);

        require(out == owed, "one for one from Agora's pair");
        require(IERC20(CTK).balanceOf(person) == owed, "everything that came back is theirs");
        require(IERC20(AUSD).balanceOf(person) == held - AMOUNT, "and exactly what they signed for was taken");
        require(
            IERC20(AUSD).balanceOf(address(router)) == 0 && IERC20(CTK).balanceOf(address(router)) == 0,
            "the router keeps nothing"
        );
        require(person.balance == 0, "they never needed the chain's coin");
        require(ITestAusd(AUSD).authorizationState(person, router.exitNonce(t)), "the terms are spent, once");
        require(IERC20(AUSD).allowance(address(router), PAIR) == 0, "no allowance is left behind");
    }

    function testWithoutTheRoleNothingMoves() public {
        if (!forked) {
            VM.skip(true);
            return;
        }
        // Allowed by the router's owner, and not approved by Agora: what mainnet is to Viky today.
        router.setExchangeAllowed(PAIR, true, address(0));
        require(!IAgoraPair(PAIR).hasRole("APPROVED_SWAPPER", address(router)), "a new router holds no role");
        uint256 held = IERC20(AUSD).balanceOf(person);
        uint256 owed = AMOUNT * CTK_PER_AUSD_UNIT;
        bytes memory call = _swapCall(AMOUNT, owed);
        ExitRouter.ExitTerms memory t = _terms(call, owed, "agora fork salt, no role");
        ExitRouter.Authorization memory a = _sign(t);

        VM.prank(RELAYER);
        (bool ok, bytes memory reason) = address(router).call(abi.encodeCall(ExitRouter.exit, (t, a, call)));
        require(!ok, "the pair must refuse an address Agora has not approved");
        require(bytes4(reason) == ExitRouter.ExchangeFailed.selector, "and the router says the exchange refused");
        require(IERC20(AUSD).balanceOf(person) == held, "nothing was taken");
        require(!ITestAusd(AUSD).authorizationState(person, router.exitNonce(t)), "and the signature was not spent");
    }

    function _quote(address from, address to, uint256 amountIn) private view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = from;
        path[1] = to;
        return IAgoraPair(PAIR).getAmountsOut(amountIn, path)[1];
    }

    /// @dev What the way out says to the pair: AUSD in, the other coin out, to the router, which hands it on.
    function _swapCall(uint256 amountIn, uint256 amountOutMin) private view returns (bytes memory) {
        address[] memory path = new address[](2);
        path[0] = AUSD;
        path[1] = CTK;
        return abi.encodeCall(
            IAgoraPair.swapExactTokensForTokens,
            (amountIn, amountOutMin, path, address(router), block.timestamp + 15 minutes)
        );
    }

    function _terms(bytes memory call, uint256 minOut, bytes memory salt)
        private
        view
        returns (ExitRouter.ExitTerms memory)
    {
        return ExitRouter.ExitTerms({
            payer: person,
            amount: AMOUNT,
            tokenOut: CTK,
            minOut: minOut,
            exchange: PAIR,
            callHash: keccak256(call),
            deadline: uint64(block.timestamp + 15 minutes),
            salt: keccak256(salt)
        });
    }

    /// @dev The one signature: the test AUSD's own authorization, whose nonce is the hash of the terms.
    function _sign(ExitRouter.ExitTerms memory t) private returns (ExitRouter.Authorization memory a) {
        a.validAfter = 0;
        a.validBefore = t.deadline;
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIVE_TYPEHASH, person, address(router), t.amount, a.validAfter, a.validBefore, router.exitNonce(t)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ITestAusd(AUSD).DOMAIN_SEPARATOR(), structHash));
        (a.v, a.r, a.s) = VM.sign(PERSON_KEY, digest);
    }
}
