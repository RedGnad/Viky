// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Stands in for a real exchange in the router's tests: it takes one coin by allowance and hands back
///      another at a rate the test chooses, so a poor rate, a refusal and an exchange that keeps some of what
///      it was given can all be exercised without the network.
///
///      It can hand back either a token or the chain's own coin, because the router serves two payout
///      services that want different ones and the coin is named per exit (D77).
contract MockExchange {
    IERC20 public immutable token;
    IERC20 public immutable outputToken;
    uint256 public rateNumerator = 1;
    uint256 public rateDenominator = 1;
    bool public refuse;
    uint256 public keepBack;
    /// @dev How much more than it was given the exchange tries to pull. The allowance is exactly the amount,
    ///      so anything above zero must fail, which is the point of the test that sets it.
    uint256 public grab;
    /// @dev Token this exchange hands over rather than takes, so a router can be shown holding more of it
    ///      afterwards than it ever pulled.
    uint256 public deliverBack;
    /// @dev Whether it pays in the chain's own coin instead of the output token.
    bool public payInNative;

    constructor(IERC20 token_, IERC20 outputToken_) {
        token = token_;
        outputToken = outputToken_;
    }

    receive() external payable {}

    function setRate(uint256 numerator, uint256 denominator) external {
        rateNumerator = numerator;
        rateDenominator = denominator;
    }

    function setRefuse(bool value) external {
        refuse = value;
    }

    function setKeepBack(uint256 value) external {
        keepBack = value;
    }

    function setGrab(uint256 value) external {
        grab = value;
    }

    function setDeliverBack(uint256 value) external {
        deliverBack = value;
    }

    function setPayInNative(bool value) external {
        payInNative = value;
    }

    /// @dev The call a router makes: pull `amount` of the token, send the output coin back to `to`.
    function swap(uint256 amount, address to) external {
        require(!refuse, "exchange refused");
        uint256 taken = amount - keepBack;
        token.transferFrom(msg.sender, address(this), taken + grab);
        // Stands in for anything that puts somebody else's token into the router during the call: a rebate,
        // a refund, or an exchange reaching into an allowance that was never ours.
        if (deliverBack > 0) token.transfer(msg.sender, deliverBack);
        uint256 out = (taken * rateNumerator) / rateDenominator;
        if (payInNative) {
            (bool ok,) = to.call{value: out}("");
            require(ok, "payout failed");
        } else {
            require(outputToken.transfer(to, out), "payout failed");
        }
    }
}

/// @dev Stands in for the exchange Viky actually calls: an address that holds no logic of its own and names
///      a second contract, which its owner may replace at any moment. What the router must notice.
contract ForwardingExchange is MockExchange {
    address public getRouter;

    constructor(IERC20 token_, IERC20 outputToken_, address target) MockExchange(token_, outputToken_) {
        getRouter = target;
    }

    /// @dev What the exchange's owner can do at any moment, and the reason the router checks before calling.
    function pointAt(address target) external {
        getRouter = target;
    }
}

/// @dev Answers `getRouter` with a word whose top bits are dirty, which is what an assembly getter, a Vyper
///      getter or a packed storage slot returns. `abi.decode(data, (address))` used to revert on this with no
///      data at all, which is exactly the failure asking instead of calling was supposed to remove.
contract DirtyForwarder {
    fallback() external {
        assembly {
            mstore(0, not(0))
            return(0, 32)
        }
    }
}

/// @dev Answers with two words rather than one.
contract TalkativeForwarder {
    function getRouter() external pure returns (address, address) {
        return (address(0xA11CE), address(0xB0B));
    }
}

/// @dev Answers, and points nowhere. Allowing it would mean the pin can never be checked.
contract ForwarderPointingNowhere {
    address public getRouter;
}

/// @dev Comes back through the front door while it holds the router's allowance, and remembers exactly how it
///      was refused instead of swallowing it.
///
///      The reason has to be recorded rather than propagated, because a test that only checks the exit failed
///      proves nothing: an undersized or wrong call fails on its own, guard or no guard. The calldata is
///      handed in by the test so it is a real, well-formed `exit` call, and then only the reason tells the two
///      apart: the reentrancy guard with it, the token refusing a spent nonce without it.
contract ReenteringExchange {
    IERC20 public immutable token;
    IERC20 public immutable outputToken;
    address private immutable router;
    bytes public reentryRevert;
    bool public reentryTried;
    bytes private reentryCall;

    constructor(IERC20 token_, IERC20 outputToken_, address router_) {
        token = token_;
        outputToken = outputToken_;
        router = router_;
    }

    function setReentryCall(bytes calldata call_) external {
        reentryCall = call_;
    }

    function swap(uint256 amount, address to) external {
        (bool ok, bytes memory reason) = router.call(reentryCall);
        reentryTried = true;
        reentryRevert = ok ? bytes("it was not refused at all") : reason;
        token.transferFrom(msg.sender, address(this), amount);
        require(outputToken.transfer(to, amount), "payout failed");
    }
}

/// @dev An output token that keeps what it was asked to move: the router must notice that the coin never
///      reached the person rather than reporting a payment that did not happen.
contract StickyToken {
    mapping(address => uint256) public balanceOf;
    /// @dev Whose transfers this token swallows. Named rather than a flag on purpose: the exchange has to be
    ///      able to deliver into the router for the test to mean anything, and a token that swallowed every
    ///      transfer would fail at the delivery instead, proving nothing about the check being tested.
    address public swallowFrom;

    function setSwallowFrom(address who) external {
        swallowFrom = who;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        if (msg.sender == swallowFrom) return true;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    function allowance(address, address) external pure returns (uint256) {
        return 0;
    }

    function totalSupply() external pure returns (uint256) {
        return 0;
    }
}

/// @dev Refuses the chain's own coin outright. Paying one of these must fail loudly rather than report a
///      payment that never happened.
contract BouncingPayee {
    receive() external payable {
        revert("no thank you");
    }
}

/// @dev Takes the coin and hands it straight back, so the call succeeds and the money never leaves. The
///      balance check is the only thing that catches this.
contract GivingItBackPayee {
    receive() external payable {
        (bool sent,) = msg.sender.call{value: msg.value}("");
        sent;
    }
}

/// @dev Burns whatever gas it is given. Without a bounded stipend it takes the whole transaction down, and
///      there is then no gas left to check the money really left.
contract GreedyPayee {
    uint256 private sink;

    receive() external payable {
        while (true) sink += 1;
    }
}

/// @dev Costs more to pay than the smallest stipend, so a fixed one would mean nobody could ever be paid and
///      no way back short of deploying again.
contract CostlyPayee {
    uint256[8] private slots;

    receive() external payable {
        for (uint256 i = 0; i < 8; i++) slots[i] = block.timestamp + i;
    }
}
