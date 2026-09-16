// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface VmFork {
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory);
    function envOr(string calldata name, bytes calldata defaultValue) external returns (bytes memory);
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function createSelectFork(string calldata urlOrAlias, uint256 blockNumber) external returns (uint256);
    function prank(address sender) external;
    function prank(address sender, address txOrigin) external;
    function skip(bool skipTest) external;
    function addr(uint256 privateKey) external returns (address);
}

/// @dev The two lines the router runs, and nothing else, with the refusal kept instead of discarded.
///      `ExitRouter.exit` does `(bool ok,) = t.exchange.call(exchangeCall)` and throws the reason away, so on
///      mainnet it can only ever say `ExchangeFailed`. That is the whole reason the first real attempt could
///      not be diagnosed from the chain (D81).
contract CallsLikeTheRouter {
    using SafeERC20 for IERC20;

    function tryIt(IERC20 token, address exchange, uint256 amount, bytes calldata data)
        external
        returns (bool ok, bytes memory reason)
    {
        token.forceApprove(exchange, amount);
        (ok, reason) = exchange.call(data);
        token.forceApprove(exchange, 0);
    }
}

/// @notice Runs the REAL exchange calldata against the REAL exchange on a Monad mainnet fork, and prints why it
///         refuses. The router had only ever been run against `MockExchange`, which does whatever I assumed the
///         real one does, so every test it passed proved only that it matched my assumptions.
///
///         Two runs of the identical call separate the two live hypotheses: once from a contract, as the router
///         does, and once with `msg.sender == tx.origin`, as a person's own account would. If the first refuses
///         and the second does not, the exchange refuses contract callers and no amount of care with the
///         calldata would have helped. If both refuse the same way, the calldata itself is stale, which the
///         route changing between quotes would explain.
///
///         Needs a live quote, because the route moves: capture one and pass it in.
///
///           MONAD_RPC_URL=... KURU_CALLDATA=0x... forge test --match-path test/ExitRouterFork.t.sol -vv
contract ExitRouterForkTest {
    VmFork private constant VM = VmFork(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    address private constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    /// @dev The exchange a live quote targets, and the one the deployed router allows and pins.
    address private constant EXCHANGE = 0xb3e6778480b2E488385E8205eA05E20060B813cb;
    /// @dev The Curve AUSD pool, which holds AUSD and lends the test a little.
    address private constant CURVE_POOL = 0x942644106B073E30D72c2C5D7529D5C296ea91ab;
    uint256 private constant AMOUNT = 10_000_000; // the ten dollars of the real attempt
    uint256 private constant PERSON_KEY = 0xDECAF;

    bool private ready;
    bytes private callData;

    function setUp() public {
        string memory url = VM.envOr("MONAD_RPC_URL", string(""));
        bytes memory data = VM.envOr("KURU_CALLDATA", bytes(""));
        if (bytes(url).length == 0 || data.length == 0) return;
        // Pinning the block is what separates "these bytes were never executable" from "the state moved under
        // them". Replaying at the block of the real attempt answers that, and nothing else does.
        uint256 pinned = VM.envOr("FORK_BLOCK", uint256(0));
        if (pinned == 0) VM.createSelectFork(url);
        else VM.createSelectFork(url, pinned);
        callData = data;
        ready = true;
    }

    function testWhyTheRealExchangeRefusesTheRouter() public {
        if (!ready) {
            VM.skip(true);
            return;
        }
        require(block.chainid == 143, "not Monad mainnet");

        // 1. As the router does it: a contract holding the money, approving the exchange, calling it.
        CallsLikeTheRouter asContract = new CallsLikeTheRouter();
        VM.prank(CURVE_POOL);
        IERC20(AUSD).transfer(address(asContract), AMOUNT);
        require(IERC20(AUSD).balanceOf(address(asContract)) >= AMOUNT, "the pool did not lend");

        uint256 beforeOut = IERC20(USDC).balanceOf(address(asContract));
        (bool okContract, bytes memory reason) = asContract.tryIt(IERC20(AUSD), EXCHANGE, AMOUNT, callData);
        uint256 gained = IERC20(USDC).balanceOf(address(asContract)) - beforeOut;

        // 2. The identical bytes, from an account that is its own origin, as a person's would be.
        address person = VM.addr(PERSON_KEY);
        VM.prank(CURVE_POOL);
        IERC20(AUSD).transfer(person, AMOUNT);
        VM.prank(person);
        IERC20(AUSD).approve(EXCHANGE, AMOUNT);
        VM.prank(person, person);
        (bool okPerson, bytes memory personReason) = EXCHANGE.call(callData);

        // What this asserts, now that it has done its diagnosing: a payload quoted a moment ago executes from a
        // contract, exactly as the router calls it. That is the standing claim. When it fails, the message
        // names which of the two shapes broke, which is what took this from `ExchangeFailed` to a cause.
        //
        // It is not a red test kept for its output. Passing means the router's way of calling is still good;
        // failing means something real changed at the exchange, and the reason is printed rather than thrown
        // away as `ExchangeFailed` does on chain (D81).
        require(okContract, _say2(reason, okPerson, personReason));
        require(gained > 0, "the call succeeded and gave nothing back, which is its own defect");
        require(okPerson, "the same bytes must work from an ordinary account too");
    }

    /// @dev Foundry prints a revert string, so the finding is carried out in one.
    function _say2(bytes memory reason, bool okPerson, bytes memory personReason) private pure returns (string memory) {
        // Not "stale", which the control disproved: fresh bytes succeed at the very block where these same
        // bytes fail, so time and state were never the variable. Both refusing means the payload itself is
        // the thing that cannot execute, whatever block it meets.
        string memory head = okPerson
            ? "CONTRACT CALLER REFUSED, the same bytes work when sender is origin. reason="
            : "BOTH REFUSED, so these bytes cannot execute at all, whatever the block. reason=";
        string memory tail = okPerson ? "" : string(abi.encodePacked(" personReason=", _readable(personReason)));
        return string(abi.encodePacked(head, _readable(reason), tail));
    }

    /// @dev `Error(string)` reads as its sentence; a custom error reads as its selector and body.
    function _readable(bytes memory data) private pure returns (string memory) {
        if (data.length == 0) return "(empty: the exchange reverted with no data at all)";
        if (data.length >= 4 && data[0] == 0x08 && data[1] == 0xc3 && data[2] == 0x79 && data[3] == 0xa0) {
            bytes memory body = new bytes(data.length - 4);
            for (uint256 i = 0; i < body.length; i++) body[i] = data[i + 4];
            return string(abi.encodePacked('Error("', abi.decode(body, (string)), '")'));
        }
        return _hex(data);
    }

    function _hex(bytes memory data) private pure returns (string memory) {
        bytes memory digits = "0123456789abcdef";
        bytes memory out = new bytes(2 + data.length * 2);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < data.length; i++) {
            out[2 + i * 2] = digits[uint8(data[i]) >> 4];
            out[3 + i * 2] = digits[uint8(data[i]) & 0x0f];
        }
        return string(out);
    }

    function _number(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 length;
        for (uint256 v = value; v != 0; v /= 10) length++;
        bytes memory out = new bytes(length);
        for (uint256 v = value; v != 0; v /= 10) out[--length] = bytes1(uint8(48 + (v % 10)));
        return string(out);
    }
}
