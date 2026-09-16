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

## The first real trial, and why it is not eight dollars

Nothing has passed through the router. The first time money does, it should be small and watched.

**Size.** Measured through the real quote path on 16 Sep 2026, against the euro service's own published floor of
6.51 EUR at 1 USDC = 0.8668 EUR:

| asked | floor the exchange guarantees | worth | margin over their minimum |
|---|---|---|---|
| $8 | 7.998428 USDC | 6.93 EUR | **0.42 EUR** |
| $9 | 8.997986 USDC | 7.80 EUR | 1.29 EUR |
| $10 | 9.997481 USDC | 8.67 EUR | 2.16 EUR |
| $12 | 11.996800 USDC | 10.40 EUR | 3.89 EUR |

Eight dollars clears their minimum by 42 cents. Their price moves, so a 6 % move against USDC between the quote
and the order puts the trial under the floor and `/api/exit/quote` refuses it with `BELOW_PAYOUT_MINIMUM`. That
refusal is correct and costs nothing, but it is a wasted attempt. **Ten dollars is the same experiment with
three times the headroom.**

**Decided: ten dollars**, on the funder's measurement as well as this one. The flat 1.99 EUR also weighs 29 % of
an eight dollar sale against 23 % of a ten dollar one, so the smaller trial is both likelier to be refused and
worse value for what it proves.

**The way out was opened in production on 16 Sep for this trial**, under three conditions the funder set:

1. The trial is ten dollars.
2. **If it fails, remove `EXIT_ROUTER_ADDRESS` and `EXIT_EXCHANGE_ADDRESS` from production immediately.** That
   puts every way out back to answering that Viky cannot pay out yet, which is true again the moment they are
   gone. Nothing else has to be undone: the router keeps no money between transactions.

   ```
   vercel env rm EXIT_ROUTER_ADDRESS production --yes
   vercel env rm EXIT_EXCHANGE_ADDRESS production --yes
   ```

   Removing them is not enough on its own: **an environment change only reaches a new deployment**, so the
   build that is running keeps the old values until one is made. Redeploy after removing them, and check the
   way out says Viky cannot pay out yet before walking away from it.
3. **No link is published anywhere until the way out has paid somebody once.**

**What their sell screen accepts, measured in France on 16 Sep at 03:52.** Their order summary showed **"Sell
117,67 USDC on Monad"**, paid to **"Bank transfer (FR76 … 2922)"**, **total payout 100,00 EUR**. So the coin and
a SEPA payout to a French account are accepted all the way through order creation. This is the positive half of
D79: the same screen that refuses AUSD outright takes USDC without complaint.

**What that does not prove.** Everything after order creation. Nobody has yet seen their side credit a deposit
sent from a Viky account, and nobody has seen the transfer arrive. Those are the two steps still unknown, and
they are why nothing about timing or fees is printed anywhere.

**Before starting.** The account doing it holds at least that much AUSD. The relayer holds more than 10 MON, or
it can make no contract call at all (D53): it held 14.3587 on 16 Sep.

**In order.**

1. Sign in, open the way out. Choose the euro service.
2. Type the amount, ask what it would give, and read the floor and what it is worth. Nothing has moved yet.
3. Change it. One signature, submitted by the relayer, and the account pays nothing. Wait for finality.
4. The balance now shows USDC underneath what a gift holds. **Read what actually arrived**, which is at least
   the floor and usually a little more.
5. Place the order on the service's own page **for the amount that arrived**, never for the amount quoted: they
   expect exactly the quantity ordered (D75).
6. Send exactly that to the account they give you. USDC moves on a signature, so Viky relays it and it costs
   nothing. The field takes all six decimals.

**Write down**, and these six exactly, because every sentence Viky is allowed to print about this rail depends on
them and none of it is known yet:

1. the hash of the exit;
2. the USDC actually received;
3. the amount sent on;
4. the time the order was placed with the payout service;
5. the time the bank transfer arrived;
6. the euros actually received.

No screen says anything about fees or timing until those six exist.

**The first real conversion, 16 Sep 2026 at 17:40:56.** Three of the six are known. It is a conversion and not
yet an exit: no euro has left.

1. exit hash `0x7599b203c1897f6659b2c72a3603a57fd9002c8c2a92efc463d8db6bc2e1f3ae`, block 105,357,531, success,
   666,789 gas, **first attempt** (one stored row, no `stale` row before it, with the retry live since 16:45);
2. USDC received: **9.999586**, against a bound minimum of 9.995586 from the same quote as the bytes;
3. amount to send on: 9.999586.

Still unknown: the order time, the time the transfer arrives, and the euros received.

**Refusals that are not faults.** `BELOW_PAYOUT_MINIMUM` (their floor, moved), `RATE_MOVED` (the exchange would
now give less than was shown, so nothing is taken), `TOO_SLOW` (the signed terms last fifteen minutes),
`ALREADY_UNDER_WAY` (one way out at a time per account, so two live signatures for the same money cannot exist).

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
