# What an operator has to know

## What is deployed

`ExitRouter` on Monad mainnet, 16 Sep 2026.

| what | value |
|---|---|
| the router | `0x8a1790dfd10cf1599bdaed5ec8bb46b2a6eb6223` |
| deployment | `0xf8d9e1fe7e45fac84aa113a50c8f7f4ff95a3c451764a3d83809bbb24b6dac5c` |
| allowing the exchange, pinned | `0x534dc955359a9647be792d59cd7f4aa9138bcff4be1b1d32464784b201c3925a` |
| handing ownership to the founder | `0x886bb648a458d44919a46a46ce3237504b2fe3a19b1cc54b7987407c6e85662e` |
| owner | `0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64` |

It takes AUSD and hands back whichever coin the signed terms name, so one router serves both corridors. It is
not upgradeable. `EXIT_ROUTER_ADDRESS` and `EXIT_EXCHANGE_ADDRESS` are what point the app at it.

Ownership is **not** on the key that deployed it, and the deploy script refuses to run if it would be.

Two standing commitments live in the way out. Neither is a bug, both are ongoing, and both were measured
rather than assumed. Dates are the day the value was read.

## 1. The pinned exchange points at a contract somebody else owns

`ExitRouter` never calls an exchange without checking, in the same transaction, that it still forwards where it
did when the owner allowed it. That check exists because the address a Kuru quote tells us to call holds no
routing logic of its own: it names a second contract, and **its owner can replace that at any moment** (D55,
D58).

Read on 16 Sep 2026, on Monad mainnet:

| what | address | note |
|---|---|---|
| the exchange a live quote targets | `0xb3e6778480b2E488385E8205eA05E20060B813cb` | 3251 bytes of code |
| what it forwards to, and what gets pinned | `0x2f84fb8982073f39ba47c7fcc29119af074abbcb` | 8783 bytes of code |
| who can move that forwarding target | `0x8b736dce2071783fd9db0a423dad17cc8ed5788b` | its `owner()`, not ours |

Both corridors, the stablecoin one and the one in the chain's own coin, route to that same exchange today. The
deploy script refuses outright if they ever stop doing so, because the app compares a quote against a single
configured exchange and would otherwise reject a corridor the router was happy to serve.

**What happens the day that target moves.** Every exit reverts with `ExchangeMoved`, before any money is taken.
Nobody loses anything, and nobody can be paid either, until it is re-pinned. That is deliberate: the
alternative is handing an allowance and hand-written calldata to a contract nobody has looked at.

**Re-pinning, in order.**

1. Read the exchange's current target: `getRouter()` on the exchange, selector `0xb0f479a1`. Beware that
   `router()` is a different selector (`0xf887ea40`) and reverts on this contract, so a hand-typed selector is
   an easy way to conclude the wrong thing.
2. Check the new target has code. A target with no code means something is wrong, not that it moved.
3. Check a live Kuru quote still targets the same exchange, for **both** coins.
4. Look at what the new target actually is before allowing it. This step is the whole point of the pin, and
   skipping it turns the check into paperwork.
5. From the owner account: `setExchangeAllowed(exchange, true, newTarget)`.

Closing an exchange forgets its pin, so re-opening one always has to state the target again. The contract
refuses to open a forwarding exchange with no pin (`PinRequired`), and refuses a pin that is already stale
(`ExchangeMoved`), so neither mistake can be made quietly.

## 2. Ownership carries the allowlist and the sweep, and cannot be given up

`renounceOwnership` reverts with `OwnershipIsNotRenounceable`. Giving it up would freeze the exchange allowlist
and the sweep for good, with no way back, so the contract refuses.

The owner can do exactly three things, and none of them touches money in flight:

- `setExchangeAllowed`: open or close an exchange, and set what it must point at.
- `setPayoutGas`: the stipend given to the person's own account when the coin coming back is the chain's own,
  bounded between 30,000 and 1,000,000 so it can be corrected without deploying again and cannot be set to a
  value that makes every such payout fail.
- `sweep(to, coin)`: return anything stranded in the contract. The contract is not meant to hold anything
  between transactions, and the coins that pass through are named per exit, so the sweep is told which one.

`transferOwnership` stays open, and the new owner cannot renounce either.

**The owner cannot** take money out of an exit, redirect one, change a floor, or touch a signature. Those are
fixed by what the person signed: the nonce of their authorization is the hash of the terms, so nothing about
them can be changed by anybody, owner included, without the token refusing the signature.
