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

## Before deploying the build of 17 Sep 2026: two new tables

The way out records every send in `viky_sends`, and each account keeps its display currency in `viky_accounts`.
Both are created by the migration, which must run against the production database before that build serves
anybody, exactly as `viky_exits` had to (D80):

```
vercel env pull .env.ops.local --environment=production
set -a && source .env.ops.local && set +a && VIKY_ALLOW_PRODUCTION_DATABASE=1 pnpm db:migrate
```

`VIKY_ALLOW_PRODUCTION_DATABASE=1` is what lets a command run on this machine touch production: without it, every
script, and every local server, refuses the production database (`src/database-guard.ts`, 17 Sep 2026).

Never `.env.production.local`: Next loads that file itself under `next build` and `next start`, so a local
production server, the capture run included, would quietly read the production database. `.env.ops.local` is a
name Next never loads and git ignores. `src/load-env.ts` reads `.env.local` then `.env`, and a value already in
the process environment wins, which is why the production values are exported into the shell first.

`pnpm db:migrate` is idempotent and prints the six tables it made or found. Neither table is read before a send;
a missing `viky_sends` is logged and the send still answers its reference, and a missing `viky_accounts` leaves
every account on the currency its device proposes.

## Before deploying the build of S2: two columns for the names

A gift keeps the two names given when it is offered in `viky_gifts.recipient_name` and `viky_gifts.funder_name` (D85).
They are nullable, so the code already in production ignores them; the create route of S2 writes them after it has
relayed the money, so they must exist before S2 serves anybody. Same two commands as above, then read the columns
back.

## Before deploying the build of S3: the record of settled days

`viky_days` holds one row per settled day of every gift (D86). The keeper writes it on every relay once the build is
live; nothing reads it before then, and the gift route answers an empty list without it. Migrate, then write the days
already settled from the relayed receipts, after a dry run:

```
set -a && source .env.ops.local && set +a && VIKY_ALLOW_PRODUCTION_DATABASE=1 pnpm db:migrate
set -a && source .env.ops.local && set +a && VIKY_ALLOW_PRODUCTION_DATABASE=1 pnpm backfill:days --dry-run
set -a && source .env.ops.local && set +a && VIKY_ALLOW_PRODUCTION_DATABASE=1 pnpm backfill:days
```

## Before deploying the build of D87: the creations table

`viky_creations` records a gift being made before its money moves (D87). The create route of that build writes it
first, so the table must exist before the build serves anybody: `pnpm db:migrate`, then read the table back.

## Before deploying the build of C2: the milestone tables, the contract, the worker

Done on 17 Sep 2026, in this order, and each step read back before the next:

1. `viky_milestone_gifts`, `viky_milestone_readings` (with `rd`) and the `kind` and `milestone` columns of
   `viky_creations`: `set -a && source .env.ops.local && set +a && pnpm db:migrate` from the C2 branch, then the
   columns read back from `information_schema`. The creation already in production kept `kind = 'daily'`.
2. `MilestoneGift` at `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e`: `forge build && DRY_RUN=1 pnpm deploy:milestone-gift`,
   then without `DRY_RUN`. Deployment `0x12d91b784d5abcb14ed7941c6de60b3eeb73fc978209653dbdd5c6fb9f7806e1`, block
   105,654,716; four cadences registered, creation and readings opened, ownership handed to
   `0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64` in `0xe2ad67911d2cc980a82f56a4f8981e88953745b2747fe058216a61d833181e8d`;
   owner, switches, goals 1 to 4 and an empty goal 5 read back from the chain. 0.406 MON.
3. Source: `forge verify-contract <address> contracts/MilestoneGift.sol:MilestoneGift --chain 143 --verifier sourcify
   --verifier-url https://sourcify-api-monad.blockvision.org --constructor-args <AUSD, evidence signer, 1000000>`:
   `exact_match` at creation and runtime, match 1855380.
4. Vercel production: `MILESTONE_GIFT_ADDRESS` and `NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS`, added with `--value` and
   `--no-sensitive` (a new production variable is sensitive by default and pulls back empty, which hides a mistake),
   then pulled back.
5. The attested-fetch worker: `railway link -p viky -s zkfetch-worker -e production`, then `railway up --ci` from the
   branch. The service has no repository attached, so a push to main does not redeploy it. Checked after: `/health`, a
   `{ source, account }` read with its proof, a refused source, and the `{ username }` read the Duolingo path still sends.

## The operator list, and what it opens

`VIKY_OPERATOR_ACCOUNTS` is a comma separated list of accounts, read on every request. Changing it:

1. `vercel env pull` and read the current value. It is stored not sensitive on purpose, so it can be read back; a
   sensitive variable pulls back empty, which hides a mistake (met on 17 Sep with the milestone address).
2. Put the **whole list** back in one go (`vercel env rm` then `vercel env add ... --no-sensitive`), never an
   addition to what is there: the variable holds one string.
3. Redeploy, because a running deployment keeps the environment it was built with: `vercel redeploy <the production
   deployment>`, which re-aliases viky.cash when it is ready.
4. Pull again and read the value back, then check a real session.

**It opens two doors, not one.** An account on this list sees the conditions that are wired but not live yet (a
Chess.com gift, before it is offered to anybody), **and**, while `VIKY_DEV_PAGES` is on, the operator pages at `/dev`
and the dev routes behind them, one of which sends 0.05 MON from the relayer. Measured on 18 Sep 2026 with a session
of a key we hold, added to the list for the check and taken out after: `/api/conditions` answered
`preview: ["chess-rating"]`, `/dev` served its page, and `/api/dev/gas-top-up` answered
`{"toppedUp": false, "reason": "ENOUGH"}` because that account already held more than 0.05 MON. With the list back to
what it should be, the same session gets `preview: []` and a 404 on both.

So an account is put on this list only when both doors are meant for it. The dev pages exist for the first mainnet
run (KT1) and their own comment says they are removed once its crypto half is done; until they are, `VIKY_DEV_PAGES`
is what decides whether the second door exists at all.

## Before the course reading of U1: goal 5 on the daily contract, and one owner for all three

Done on 18 Sep 2026, with the key that deployed `GiftEscrow`, which was still its owner, and read back each time.

| what | value |
|---|---|
| the daily contract | `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233` |
| goal 5 registered, one course's experience | `registerGoal(5, 0x8f940d06b0eb5122941908713583a1aef4c026ab396ce91c93348d460cf89629)`, tx `0xcaadaca7d0d3d362eb1112b3e45f66a1116d4335166283bf837053cf5fee8a69`, block 105,733,380, 65,238 gas |
| the provider id it holds | `keccak256("viky:provider:duolingo-course-zkfetch:v1")`, read back equal |
| ownership handed to the founder | tx `0xa01ae787c52409157ec83aa95cc2ca2a4dca4a2caaab3caef8ea8c5650dfa009`, block 105,733,449, 38,360 gas |
| owner now | `0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64`, the same wallet as `MilestoneGift` and `ExitRouter` |

Before the build of U1 serves anybody, the gift table needs the two columns a course gift is recorded in
(`goal_course`, `goal_course_title` on `viky_gifts` and on `viky_creations`): `pnpm db:migrate`, then the columns read
back from `information_schema`. They are additive and nothing in the running build touches them.

The order matters: goal 1 (the experience total) keeps every gift already made, goal 5 carries the reading of one
course, and nothing can settle across the two because the contract checks an attestation's provider id against the
gift's goal. Registering another goal, or replacing the evidence signer, now needs the founder's own signature: there
is no second key left that can. The address was compared character by character with `MilestoneGift.owner()` read from
the chain before the transfer was sent, and all three owners were read back after it.

The same day, the earlier gift contract `0xE04CD59bB93765333200a9da01df83149D4C4d67`, which still runs the gifts made
before the day-counting corrections of D30 and holds 8.571432 AUSD of the first one, was handed over too: tx
`0xe6f5b531d9c6dd981b72f2be7dc7e2e2d0adca071e59fd78e532dae804043840`, block 105,773,867, 38,324 gas. Its owner was
still the deployment key, which could have registered a goal, replaced the evidence signer or paused it. Read back
after: all four contracts (both gift contracts, `MilestoneGift`, `ExitRouter`) answer
`owner() = 0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64`, and that contract still holds the same 8.571432 AUSD, because
handing ownership over moves no money.

`GiftEscrow` uses OpenZeppelin's `Ownable` as it comes, so its owner can also renounce, which `ExitRouter` forbids.
Renouncing would leave the goals, the evidence signer and the two pauses frozen as they are; money would keep moving,
since no owner function touches it.

## The reading service is a second deployment, and it is not automatic

`src/attested-sources.ts` and `src/chess-com.ts` run in two places: on Vercel, where the proof is judged, and in the
attested-fetch worker on Railway, where the page is actually fetched. The worker has no repository attached, so
**nothing redeploys it when main moves**.

On 18 Sep 2026 at 00:37 Paris, `d76bb8a` added `chessStatusPattern()` to those shared sources. The worker was still
running its image of 17 Sep 16:38 UTC. It fetched the page it knew, the app judged the proof against a pattern the
worker had never asked for, and the first real Chess.com reading died as `PROOF_MISMATCH` under a screen that said
"try again in a minute". A minute would have changed nothing.

**The rule: a commit that touches either of those two files is not merged until the worker runs it.** The test
`test/reading-fingerprint.test.ts` fails the moment either file changes, which is the reminder; the number it prints
goes into `READING_FINGERPRINT`, and then, from the branch, with a clean tree:

```
railway link -p viky -s zkfetch-worker -e production
railway up --ci
curl -s https://zkfetch-worker-production.up.railway.app/health
```

`/health` answers the number of the two files as that image runs them. It must be the same as `READING_FINGERPRINT` in
the branch being merged. Until it is, the app refuses every attested read with `WORKER_OUT_OF_DATE` and says so,
rather than telling somebody to try again: nothing is fetched, nothing is recorded against the gift, and the pass
holds it instead of settling.

## The Safe of three project keys, and how an owner action is signed

One key owns all four contracts today, and it is the founder's own hardware wallet. Two things are wrong with that,
and the second is the one that decided this shape: a single key lost is the goals, the evidence signer and both pauses
lost with it, and a personal wallet has no business being the thing a product depends on. **So no personal address
owns anything: three keys are made for the project, and the Safe asks for two of them.** A key lost leaves the other
two able to act; a key stolen is not enough to act at all.

**Not done yet: as of 19 Sep 2026 the Safe of three does not exist and the owner of the four contracts is still
`0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64`.** What follows is the procedure, and the table under it is filled the
day it runs.

Safe 1.4.1, the same version, factory and singleton as the Safe that already runs on Monad for Lock-In
(`0xf1be884698B9Ba4438f529699eC92320427b4dA1`, created 15 Jul 2026). Read on Monad mainnet on 19 Sep 2026, each with
code at its address: proxy factory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, L2 singleton
`0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`, fallback handler `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`.

**1. The founder makes the three keys. Nobody else ever runs these commands**, and no key, password or file is ever
sent to anybody. Each one prints an address, and the address is the only thing that leaves the machine.

Two of them are encrypted files, kept in two different places, so one disk lost is not the Safe lost:

```
cast wallet new ~/viky-keys viky-owner-a
cast wallet new /Volumes/<the other place> viky-owner-b
```

`cast wallet new <folder> <name>` writes an encrypted keystore and asks for a password without echoing it, which is
the default of the installed version (`cast wallet new --help`, read 19 Sep 2026: "Triggers a hidden password prompt
for the JSON keystore. Deprecated: prompting for a hidden password is now the default"). The password is the
founder's, typed each time, written nowhere. Read an address back at any time, without the password moving anywhere:

```
cast wallet address --keystore ~/viky-keys/viky-owner-a
```

The third is on paper, and exists nowhere else:

```
cast wallet new
```

That one prints a private key and its address in the terminal. Write both on paper, then **close that terminal**: the
key stays in its scrollback until the window is gone, and it is the one copy there is.

**2. The founder gives the three addresses. Nothing else.** Then, from a clean tree on main:

```
SAFE_OWNERS="0xa,0xb,0xc" SAFE_THRESHOLD=2 pnpm safe:create
SEND=1 SAFE_SALT_NONCE=<the salt it printed> SAFE_SENDER_PRIVATE_KEY=0x… pnpm safe:create
```

The address is worked out before anything is sent, and `test/safe.test.ts` rebuilds Lock-In's Safe address from that
Safe's real creation transaction, so the arithmetic is checked against a Safe that exists. Whoever sends the creation
has no power over the Safe afterwards: only its owners do, so the relayer's own key can pay for it. After sending, the
script reads the new Safe back and refuses to call it good unless it answers version 1.4.1, a threshold of two, and
exactly the three owners that were asked for.

**3. Before anything is handed over, prove the Safe can act.** Both signatures on a transaction that does nothing:
the Safe calling itself to read its own nonce. If a signature does not verify, that is learned here and not with the
contracts already inside.

```
SAFE_ADDRESS=0x… ACTION=raw TO=0x…<the Safe> DATA=0xaffed0e0 pnpm safe:action
SIGN=1 SIGNER_PRIVATE_KEY=0x… …                     (once per key, two of the three)
SIGNATURES="0xfirst,0xsecond" SEND=1 EXECUTOR_PRIVATE_KEY=0x… …
```

**4. The four `transferOwnership`, signed by the hardware wallet, one last time.** This is the one step that cannot
use `pnpm safe:handover`'s own sending: it asks for `OWNER_PRIVATE_KEY`, and a hardware wallet never gives its key up.
So the script prints the calls and `cast` sends them, with the device confirming each one.

```
SAFE_ADDRESS=0x… CONFIRM_OWNERS="0xa,0xb,0xc" pnpm safe:handover
```

Check the address the device will be asked about is the owner, before signing anything:

```
cast wallet address --ledger
```

Then, once per contract, four times, with the Safe's address as the argument:

```
cast send 0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233 "transferOwnership(address)" 0x…<the Safe> \
  --ledger --rpc-url https://rpc.monad.xyz --from 0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64
```

and the same for `0xE04CD59bB93765333200a9da01df83149D4C4d67`, `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e` and
`0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223`. The Ethereum app on the device needs **Blind signing** switched on: a
contract call is not a plain transfer. The last forty characters of what the device shows are the Safe's address, and
that is the check to make before pressing accept. If the account is not on the device's first derivation path, add
`--mnemonic-derivation-path "m/44'/60'/<n>'/0/0"` and read it back with `cast wallet address --ledger` first.

**5. Read the four owners back from the chain, not from the receipts.**

```
VERIFY=1 SAFE_ADDRESS=0x… CONFIRM_OWNERS="0xa,0xb,0xc" pnpm safe:handover
```

It fails unless all four answer the Safe.

**After that, no operator action goes through the founder's personal key.** Registering a goal, replacing the evidence
signer, pausing creation or readings, allowing an exchange on the router: each one is a Safe transaction signed by two
of the three project keys and carried by anybody, as in step 3, with `ACTION=raw TO=… DATA=…` for whatever the call is.
`pnpm prepare:milestone-goals` prints the `to` and the `data` of a goal registration, which go straight into that.
The hardware wallet keeps its MON and its own life, and has nothing left to sign for Viky.

| what | value |
|---|---|
| the Safe | not created yet |
| owners | three keys made for the project, by the founder, two of which sign |
| `GiftEscrow` `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233` | not handed over yet |
| earlier `GiftEscrow` `0xE04CD59bB93765333200a9da01df83149D4C4d67` | not handed over yet |
| `MilestoneGift` `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e` | not handed over yet |
| `ExitRouter` `0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223` | not handed over yet |

## Before deploying the build of N1: the subscriptions table and the push keys

1. `viky_push` (one row per browser and gift) and `viky_told` (one row per gift and subject, so a day is told about
   once): `pnpm db:migrate`, then both read back. Additive, and nothing in the running build touches them.
2. The VAPID key pair, generated with `web-push` and put in Vercel for Production, Preview and Development:
   `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_EMAIL` (`mailto:` is added by the code). The
   private key is in Vercel and in `.env.local` only: it has never been in a conversation, a commit or a log. The
   public key is public by design, it is what a browser subscribes with.
3. Without the three, nothing is sent and nothing fails: the button says so and the route answers `PUSH_NOT_CONFIGURED`.
   Changing the key pair later invalidates every subscription made with the old one, so the rows would have to go too.
4. Checked end to end against a real push service before the deploy: `pnpm build && (PORT=3100 pnpm start &)`, then
   `pnpm check:morning-push`. Ten checks on 17 Sep 2026: a browser subscribed at `updates.push.services.mozilla.com`,
   the route took it, the keeper's sending encrypted and posted it, and the service worker drew "Viky" with
   "Léa did yesterday's lesson. $3.57 is theirs."; the same day sent nothing a second time, and a subscription the
   service refused was deleted at once. **Chrome cannot be used for this**: under automation it refuses to register
   with its push service ("Registration failed - permission denied") even with the notification permission granted,
   in Chrome and in Chromium, headless or not. Firefox's service is the standard one, so the path is the same.

## The door for a condition that is not live yet

`/api/conditions` offers a condition that is wired and not live yet to an account on `VIKY_OPERATOR_ACCOUNTS`, and to
nobody else. That is how the first real gift on a new condition gets made.

Chess.com went through it and out of it: two real gifts were made that way, 1,000,000 and 1,000,002, and it is live
for everybody since 19 Sep 2026 (D109). Today the door holds one condition, the Duolingo English Test, and it opens
the day goal 5 is registered on the milestone contract.

Measured on 18 Sep 2026: the list in production holds two accounts, `0x350aF8…` and `0x91C964…`, and the founder's
own account `0xb12e0C72209Bd4BECFDaFA96a8F3e7eBc93b8376` is not one of them, which is a line of configuration and not
a defect.

To add an account to it, put the whole list back with the new one in it and redeploy production, then read it back:

```
npx vercel@latest env rm VIKY_OPERATOR_ACCOUNTS production --yes
npx vercel@latest env add VIKY_OPERATOR_ACCOUNTS production --value "0x350aF8…,0x91C964…,0xb12e0C72209Bd4BECFDaFA96a8F3e7eBc93b8376" --yes
```

Two things to know before running it. Removing a variable removes it for every environment it names, so pull the
current value first and put the whole list back in one go. And this list is the same one that opens the dev pages
(`VIKY_DEV_PAGES`), one of which moves the relayer's MON: adding an account gives it those pages too.
## The goals of the milestone contract, and the session that registers them

A goal on `MilestoneGift` is three things: a number, the provider id every proof for it must carry, and the shape it
is judged by. `src/milestone-goals.ts` is the whole list, and the founder registers what is missing in one session,
as the owner, after the handover of `GiftEscrow`.

| goal | source | shape | state |
|---|---|---|---|
| 1 to 4 | Chess.com, rapid, blitz, bullet, daily | climb | registered at deployment, 17 Sep 2026 |
| 5 | Duolingo English Test, the overall score | having it or not | to register; the screens are built (U3), and the condition goes live the day it is registered (D109) |
| 6 to 9 | Lichess, bullet, blitz, rapid, classical | climb | to register; nothing is offered on them yet, and the same rule applies the day they are |

**The session, in order.** The owner is a wallet the founder holds, so the session is signed from that wallet and no
key is ever read from a file. Each step is read back before the next.

1. `pnpm check:milestone-goals` from any machine, with no key: it prints the plan and ends non-zero while anything is
   missing. Run it first so the list on screen is the list you are about to sign.
2. `pnpm prepare:milestone-goals` with `MILESTONE_GIFT_ADDRESS` set: it writes out one call per missing goal, with its
   `to`, its `data`, its gas and the chain id, and sends nothing. Every call goes to the milestone contract and carries
   no value.
3. Sign those calls from the owner's wallet, in the order printed. Each is a `registerGoal`, about 88,500 gas.
4. `pnpm check:milestone-goals` again: it must end clean, with nothing missing. That is the read-back, from the chain
   rather than from the receipts.

There is also `pnpm register:milestone-goals`, which sends them itself from `DEPLOYER_PRIVATE_KEY`. It refuses to send
anything if that key is not the owner. It exists for a machine that holds the owner's key, and the wallet route above
is the one to use while the founder holds it.

**What it will not do.** It never overwrites. A number already registered to another provider id, or to the same
provider under another shape, stops the whole run before anything is sent, because a live gift keys on that number
and moving it under one would change what settles it. It is idempotent, so a session interrupted halfway is finished
by running it again.

## Deploying: three rules, and how to read what is live

Three lines merge into `main` in parallel, and on 18 Sep 2026 the queue filled with builds nobody was reading while
production served a commit four merges old. The founder set three rules that evening, and they hold from now on.

1. **Only `main` builds.** A branch build serves nothing, because every check is made in production. `vercel.json`
   carries it: `git.deploymentEnabled` names `main` true and both wildcards false. Two wildcards, because `*` does not
   cross a slash in minimatch and a branch called `fix/thing` would still build without `**`. The rule is safe for
   `main` by the documentation's own words, "If a branch matches multiple rules and at least one rule is true, a
   deployment will occur", and by measurement: the merge that added it produced a production build of itself.
2. **One production deployment at a time.** Before merging, read what production is serving. If it has not finished
   the previous merge, wait.
3. **Never cancel a production build**, running or queued. A queued branch build may be cancelled, and nothing else.

**How to read the commit production is serving**, without the dashboard and without an account:

```
curl -s https://viky.cash/serwist/sw.js | grep -oE '[0-9a-f]{40}' | sort -u
```

The service worker precaches the offline page under the deployment's own commit, so that one hash is what is live.
Check it against `git log` before believing a deployment list.

**Two things that surprised us, written down so they do not surprise the next line.** Vercel cancels a superseded
production build of the same branch by itself: `github.autoJobCancelation` defaults to true, which its documentation
describes as building "without cancelling a build for the most recent commit" when set to false. And a build fired
from a terminal carries the commit of the working tree it was fired from, so a `--prod` deploy made from an older
checkout lands after newer merges and takes production backwards. In what order the platform lands what it has queued is
not something we have watched it do, and the incident of that evening was precisely about builds not starting in
order or at all, so no rule here rests on it: when the queue reaches zero, read the served hash, and redeploy from
`main` only if it is not `main`'s head. One person does it, once, and says so to the others. What a person may see
meanwhile is viky.cash serving an ancestor of `main` for a few minutes, which is not a reason to act.

**When the platform itself is the problem**, read www.vercel-status.com before changing anything of ours. On the
evening of 18 Sep two incidents ran in a row, "Elevated Errors Triggering Deployments" and "Deployment stuck in
initializing state", and for twenty minutes no deployment of any kind was created. A configuration change looks
exactly like an outage from here, so a rule is never reverted on a measurement taken during one.

## Money paths to audit

Each entry is a path where money can move while the record of it fails, with what to do about it. Nothing here is
built until it is decided.

1. **Making a gift relays the money, then records the gift.** Decided and built, D87. `app/api/gift/create/route.ts` calls `relayCreateGift`
   and only then `saveGift`. If the save fails (the database refuses, times out, or the function is cut off), the gift
   is funded on chain and has no row: no claim link works, because a claim looks the key's hash up in `viky_gifts`, and
   the funder never sees the link. The money is not lost, since `refundUnearned` sends an unopened gift back after
   fourteen days, but the settling pass reads gifts from `viky_gifts`, so nothing calls it for this one either.
   **Proposed: record first, then relay, then complete.** Before relaying, insert the row as pending with everything
   known then: the authorization's nonce (the hash of the exact terms), the funder, the terms, the names, the source's
   name and the key's hash. Relay. Then write the gift id and the transaction hash onto the pending row. A pending row
   whose completion failed is completed by the settling pass, which reads the funder's authorization state for that
   nonce and, when it was used, finds the `GiftCreated` event in the recorded or searched receipt. A create request
   retried with the same nonce finds the row instead of relaying twice: a complete row answers that the gift is made;
   a pending one is completed and given a fresh key, which is safe because a failed completion ends the first request
   with an error, so its link, the only place the old key was shown, never left the function. Recovery alone, keeping
   the order, cannot give the link back: the key exists only in the function's memory once the relay has returned.

## The test database

Until 17 Sep 2026 one database served everything. `.env.local` named production, because `vercel env pull` writes the
Development environment and the three Vercel environments shared a single `DATABASE_URL`. A server started on this
machine, the capture run's four servers, and every preview deployment of every test branch read real gifts and could
have written to them. Three things now keep that from happening:

- **A Neon branch**, named `local`, in the same Neon project, made schema-only on 17 Sep 2026 and migrated: it holds
  the tables and no rows. A branch has its own endpoint, so its host is not production's.
- **Three separate values in Vercel.** `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are now declared once per
  environment: Production names production, Preview and Development name the `local` branch. Removing a variable for
  one environment removes it for all three (the CLI does not narrow), so the order is: pull production to a file, remove,
  add production back from that file, then add the other two. Check the result with `vercel env ls`: three rows per
  name, one environment each. Preview and Production are stored as secrets, which a pull cannot read back, so the
  proof that preview reads the branch is a preview deployment answering that gift 1 does not exist.
- **A guard.** Only a running production deployment may use the production database. A Next.js server stops at start
  otherwise (`instrumentation.ts`), and every script refuses on load (`src/load-env.ts`), unless the command sets
  `VIKY_ALLOW_PRODUCTION_DATABASE=1`. A running deployment is recognised by `VERCEL=1` together with `VERCEL_REGION`,
  which Vercel sets at runtime only, and `VERCEL_ENV=production`: a pulled env file carries `VERCEL=1` and no region,
  and a preview deployment carries a region and `VERCEL_ENV=preview`. Only a hash of the production host is in the
  repository.

The guard is the part that holds without anybody remembering. The Neon integration rewrites its variables when it is
reconnected, and the day it puts production back into Preview, a preview deployment refuses to start rather than write
into real gifts.

The other variables the Neon integration wrote (`POSTGRES_*`, `PG*`) still name production in all three environments.
No code reads them: the stores connect through `databaseUrl()`, which reads `DATABASE_URL` alone.

## Test accounts in production

Accounts made on viky.cash to check a deployment, each with a virtual passkey in a headless browser that is gone
when the check ends: nobody can sign in to them again. They hold no money and no gift. **They never count as users**,
in any number given to anybody, and a count of accounts must leave them out.

Each run of the signed-in check makes one account per size, so the run that verifies a deployment is listed by the
next commit rather than by its own. An account leaves no row of its own on the server. The S1 checks chose a currency on Me, which writes `viky_accounts`;
the S2, S3 and D87 checks did not, and read each account's code on Me instead, so those seven have no row anywhere, except
the throwaway key's creation row. None of them
offered a gift: each stopped on the check, with "Not now".

| account | made | why |
|---|---|---|
| `0xff098cd674abbaff26019fffc5542fbde4f09672` | 17 Sep 2026, 03:01 UTC | S1 deployment check, 390x844 day |
| `0x767d8f483f5ebb21323458ed22cfb8315cbcc6b7` | 17 Sep 2026, 03:01 UTC | S1 deployment check, 390x844 night |
| `0xd75640785adb940ffa24299304aa5fe315dc687c` | 17 Sep 2026, 03:02 UTC | S1 deployment check, 1440x900 day |
| `0x2baa0ab555b8e4e277e71ffc9ae3b09e2818e117` | 17 Sep 2026, 03:02 UTC | S1 deployment check, 1440x900 night |
| `0xc28b113c4FCac8b8968948f244a661EcD882ba41` | 17 Sep 2026, 13:23 UTC | S2 deployment check, 390x844 day |
| `0x88205f6821cb84aCe9ace80FB4d7b498Cfd67C1c` | 17 Sep 2026, 13:24 UTC | S2 deployment check, 1440x900 night |
| `0xCBFadD1E4C62c5dA345B495245c7B91918e7EE21` | 17 Sep 2026, 13:25 UTC | S2 deployment check, rerun at 390x844 day |
| `0x9ea22C6835572973CdCB3C4cC58f7c020D00494B` | 17 Sep 2026, 14:41 UTC | S3 deployment check, 390x844 day |
| `0x019112293A1e79b4a14FD984C82F4698898a361d` | 17 Sep 2026, 14:41 UTC | S3 deployment check, 1440x900 night |
| `0xD304A192B1b6389954b7079A6D5cCF783C9950eA` | 17 Sep 2026, 15:54 UTC | D87 deployment check, 390x844 day |
| `0x6e9A0A7f84824FA16604e1A18F587E22EC50FF41` | 17 Sep 2026, 15:55 UTC | D87 deployment check, 1440x900 night |
| `0x7a356970252fbf027a6196A041A5674E51E7C5E1` | 17 Sep 2026, 15:53 UTC | D87 check of the creation path: a throwaway key with no money, signed in through the challenge route; it left one row in `viky_creations`, abandoned, nonce `0x7fd26be5…`, and nothing on chain |
| `0xaF04621441F940B468ca6f9aDb21fb2205Ef01C7` | 17 Sep 2026, 17:03 UTC | database guard deployment check, 390x844 day |
| `0x011c3B117Ac05bF0a5B8A969D24B90c2c553b8F0` | 17 Sep 2026, 17:04 UTC | database guard deployment check, 1440x900 night |
| `0xb852A09f26d14ECDd70A46281e29B02aF671f3Fa` | 17 Sep 2026, 20:14 UTC | preview and development database check, 390x844 day |
| `0x50687Bd4697aD2D775f5f7f9dB0f0E81bd855642` | 17 Sep 2026, 20:14 UTC | preview and development database check, 1440x900 night |
| `0xfEAc57C6792293dc9f13c854622D8be252f86986` | 17 Sep 2026, 21:09 UTC | morning message deployment check, 390x844 day |
| `0xA4a2072Ff361fF3DFE17FbC14F60F788d65030cE` | 17 Sep 2026, 21:10 UTC | morning message deployment check, 1440x900 night |
| not read back | 17 Sep 2026, 21:12 UTC | one account made on the deployment from before the look changed, to say whether the reload defect was already there (it was). Its code was not read back before the passkey went, and an account writes no row, so nothing names it anywhere |
| `0xB7490e8d135D5d4c2e0a88B5aEB9B57C81238dC2` | 17 Sep 2026, 21:44 UTC | check of the deployment that carries this list, 390x844 day |
| `0x0Ebf35EaC562Fd42a58Bca7e13133C9163B7B7ba` | 17 Sep 2026, 21:44 UTC | check of the deployment that carries this list, 1440x900 night |
| `0x4F04D62013F938b9B1be5873AE9472180CA798A6` | 18 Sep 2026 | reproducing the session defect in production: it is the run that showed the server never lost the cookie |
| `0xAA248d38AE02bf651b6F306A6AF295157CB9dAe5` | 18 Sep 2026 | checking the session fix: signed in, full load, reload, second tab, back to the funder flow |
| `0xD186521D0a8B6f959c2Fa7327e8640788816cD5c` | 18 Sep 2026 | checking that the supervised result is offered to nobody but an operator |

The row `0xb12e0c72209bd4becfdafa96a8f3e7ebc93b8376`, euros, 02:56 UTC the same day, was not written by a check and
is not listed here.

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
