// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Stands in for a real exchange in the router's tests: it takes the token by allowance and sends back
///      native coin at a rate the test chooses, so a poor rate, a refusal and an exchange that keeps some of
///      the token can all be exercised without the network.
contract MockExchange {
    IERC20 public immutable token;
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

    constructor(IERC20 token_) {
        token = token_;
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

    /// @dev The call a router makes: pull `amount` of the token, send native coin back.
    function swap(uint256 amount, address to) external {
        require(!refuse, "exchange refused");
        uint256 taken = amount - keepBack;
        token.transferFrom(msg.sender, address(this), taken + grab);
        // Stands in for anything that puts somebody else's token into the router during the call: a rebate,
        // a refund, or an exchange reaching into an allowance that was never ours.
        if (deliverBack > 0) token.transfer(msg.sender, deliverBack);
        uint256 out = (taken * rateNumerator) / rateDenominator;
        (bool ok,) = to.call{value: out}("");
        require(ok, "payout failed");
    }
}

/// @dev Stands in for the exchange Viky actually calls: an address that holds no logic of its own and names
///      a second contract, which its owner may replace at any moment. What the router must notice.
contract ForwardingExchange is MockExchange {
    address public getRouter;

    constructor(IERC20 token_, address target) MockExchange(token_) {
        getRouter = target;
    }

    /// @dev What the exchange's owner can do at any moment, and the reason the router checks before calling.
    function pointAt(address target) external {
        getRouter = target;
    }
}

/// @dev A destination that hands its money straight back, which used to look exactly like being paid.
contract BouncingPayee {
    receive() external payable {
        (bool ok,) = msg.sender.call{value: msg.value}("");
        ok; // the point is that this destination keeps nothing while reporting success
    }
}

/// @dev A destination that costs real gas to pay, the way a custodial deposit contract might. Nobody has
///      inspected the payout service's deposit address, which is why what it is given must be settable.
contract CostlyPayee {
    uint256[8] private slots;

    receive() external payable {
        for (uint256 i = 0; i < 8; i++) {
            slots[i] = block.timestamp + i + 1;
        }
    }
}

/// @dev A destination that burns whatever gas it is given, so the relayer pays for nothing.
contract GreedyPayee {
    receive() external payable {
        uint256 n;
        while (true) n = uint256(keccak256(abi.encode(n)));
    }
}
