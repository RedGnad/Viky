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
    /// @dev Set by a test that wants the exchange to try to pull more than it was given.
    bool public grab;

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

    function setGrab(bool value) external {
        grab = value;
    }

    /// @dev The call a router makes: pull `amount` of the token, send native coin back.
    function swap(uint256 amount, address to) external {
        require(!refuse, "exchange refused");
        uint256 taken = amount - keepBack;
        token.transferFrom(msg.sender, address(this), grab ? amount : taken);
        uint256 out = (taken * rateNumerator) / rateDenominator;
        (bool ok,) = to.call{value: out}("");
        require(ok, "payout failed");
    }
}

/// @dev A destination that hands its money straight back, which used to look exactly like being paid.
contract BouncingPayee {
    receive() external payable {
        (bool ok,) = msg.sender.call{value: msg.value}("");
        ok; // the point is that this destination keeps nothing while reporting success
    }
}

/// @dev A destination that burns whatever gas it is given, so the relayer pays for nothing.
contract GreedyPayee {
    receive() external payable {
        uint256 n;
        while (true) n = uint256(keccak256(abi.encode(n)));
    }
}
