# What an operator has to know

## What is deployed

`ExitRouter` on Monad mainnet, 16 Sep 2026.

| what | value |
|---|---|
| the router | `0x8a1790dfd10cf1599bdaed5ec8bb46b2a6eb6223` |
| deployment | `0xf8d9e1fe7e45fac84aa113a50c8f7f4ff95a3c451764a3d83809bbb24b6dac5c` |
| allowing the exchange, pinned | `0x534dc955359a9647be792d59cd7f4aa9138bcff4be1b1d32464784b201c3925a` |
| handing ownership to the founder | `0x886bb648a458d44919a46a46ce3237504b2fe3a19b1cc54b7987407c6e85662e` |
| owner | the Safe `0xE08D926c148A5065F4Df2892702785a183de86F9`, two signatures of three, since 20 Sep 2026 (tx `0xcd2b1ac3ef8c334596d49d7154fb8288efb14ad268bf272a86c79367bfe67b78`, the Safe's table below); the founder's key `0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64` held it from the hand-over above until then |

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

`pnpm db:migrate` is idempotent and prints the tables it made or found, `viky_connections` included since D197 (no route
creates that one, so a production without it refuses every connection until the migration runs). `DATABASE_URL` is
sensitive on Vercel, so `vercel env pull` writes it empty: the command above needs the production URL put in the
shell by the founder, from the Neon console, and nothing else reaches production from a laptop. Neither table is read before a send;
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

## The first owner actions through the Safe: goals 10, 11 and 12

Done on 20 Sep 2026, in one signing session, by two of the three project keys (the encrypted file and one paper
phrase), carried by the relayer. No personal key of the founder's touched any of it. Each goal was read back from
the contract with its provider id and its shape before the next was sent.

| goal | source | shape | provider id | transaction |
|---|---|---|---|---|
| 10 | Coursera, a course certificate | 1, having it or not | `0xcd1e3323e174f3cfd7359500d0e2e0befdb34f9998a874e5cf2e2f1d1aa2a75d` | `0x61bce6c1bb92557a87f3a2b3056b9dae1f2b830a2786bfd780ce87314ecbc6e7`, block 106,321,654 |
| 11 | Credly, a certification badge | 1, having it or not | `0xb51fb65622628e49e636bc88791f4d118dcc3ef91063975223e529556628ad62` | `0x27ca75bfbfcad66ee9b03286f5829622f92eeaa1d159d06b1871c98c5c698f6c`, block 106,321,662 |
| 12 | Chess.com, the puzzle rating | 0, a climb | `0x5d3b3df90a426ae46f38985fb35c2c55511d811a8f6a091278f3b6964c5c36fe` | `0x5d2923dbe4ae4646d14b93377956be674d0bd2c1bd11f12a9454b084d8681ba6`, block 106,321,671 |
| 13 | ETS, a TOEFL score shown (D164) | 1, having it or not | `0xa07cae8e7502221e9a33445deb8f4f5e12d9ccdfd35b5e53d9eb38f32d75db7d` | `0x4ff8000117a57faaef15773d06059934241ea926ddc7a8acc6259ba8563d21c4`, block 107,176,764, 192,885 gas, Safe nonce 4, signed 23 Sep 2026 by two of the three keys and carried by the relayer |
| 14 | a university's student portal, enrolled and shown (D165) | 1, having it or not | `0xa95adf80ba13395dcc23c8048874f1ddfba5321a9eb5e1f90711c6a81c3d64df` | `0x9a46587c863f8b4ea6c806cab097d4a654da9995c7e3f5e08a5a51ab3ec636c7`, block 107,214,268, 192,897 gas, Safe nonce 5, signed 23 Sep 2026 by two of the three keys and carried by the relayer |
| 2, on the daily contract `GiftEscrow` | GitHub, the contributions GitHub counts (D166; withdrawn, D170) | no shape: `registerGoal(goalType, providerId)` | `0xda1048bc067600c20909ee6e262729bc5087ae37f5478c3beb4d6f21d9922050` | `0x4982aeceb7da84ecc67018db9ae3f433236da0345b536df1b64b05af7008f77c`, block 107,214,315, 161,559 gas, Safe nonce 6, the same session, sent after 14 was final; `goalProviders(2)` read back equal |

How a session of several goals is signed at once, since the Safe's nonce moves by one per transaction: build each
call with `NONCE=1`, `NONCE=2`, `NONCE=3` (from the Safe's nonce at the time) so the three hashes exist before anybody
signs, have each key sign the three hashes in one sitting, then send them in nonce order, each one only after the
one before it has landed. Six signatures, one sitting, no batching contract and no delegate call.

## The Reclaim account, read on the dashboard on 22 Sep 2026, and what production actually holds

What the founder read, signed in to `dev.reclaimprotocol.org`: the **Hacker** tier, no payment method on file,
**0 / 25 proofs** on the cycle from 1 Sep to 1 Oct. The zkFetch reads production makes every day do not appear
anywhere on it, not even under the application named "Public Data zkFetch" (0 sessions, 0 proofs, no log over 30
days). Three applications exist: Public Data zkFetch (`0x5c8E14…`), Viky, and Lock in.

What the machines hold, read the same day:

| where | variable | value |
|---|---|---|
| Railway, the reading service | `RECLAIM_ZKFETCH_APP_ID` | `0x5c8E149B…bA9359`, the "Public Data zkFetch" application, so every attested read is made under it whatever the dashboard shows |
| Vercel, Production | `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET` | present and **empty** (`vercel env pull --environment=production`, 22 Sep 2026) |
| Vercel, Production | `RECLAIM_ZKFETCH_APP_ID`, `RECLAIM_ZKFETCH_APP_SECRET` | present and **empty**; harmless, the app reads through the worker (`ZKFETCH_WORKER_URL`) |
| Vercel, Production | `RECLAIM_VERIFICATION_MODE` | `app` |

So the connected flow (a proof the person shows from their own account, D162) is not configured in production at
all: neither the Viky application nor the Lock in one is in place, and `/api/proof/session` answers "The Reclaim
application is not configured". Before the first shown proof runs there, the founder puts the **Viky** application's
id and secret into `RECLAIM_APP_ID` and `RECLAIM_APP_SECRET` for Production on Vercel (the secret is shown once, on
the dashboard, and goes nowhere else), which is also what makes the consent screen read "Viky" and not "Lock In"
(D25). Nobody else handles that secret.

Why the dashboard shows nothing for the reads is not known. It was not explained by anything read that day, and it
is written here as seen rather than guessed at.

### Before the build of D162 serves anybody: the session table

`viky_proof_sessions` gains `condition_id` (which condition a proof is shown for, `duolingo-daily` for every row
from before) and lets `duolingo_username` and `duolingo_profile_id` be absent, because a milestone shown from an
account binds no named profile. Additive, and the running build does not touch the two constraints it relaxes:
`pnpm db:migrate` with the operator command of "The test database", then the columns read back.

## The nullifier of an attested read, and why an unchanged page does not repeat it (22 Sep 2026)

A second developer measured, on a local attestor, five claims on an unchanged page carrying the same identifier,
and asked whether a second reading of an unchanged rating would look like a replay to our contracts.

How it is built, in both paths, from the claim's identifier alone: `src/attested-read.ts:105`
(`keccak256("viky:zkfetch:" + identifier)`) for every milestone and certificate reading, and the same formula in
`claimFingerprint`, `src/duolingo-public.ts:9`, for the daily check-in. Neither adds the day nor `observedAt`. The
identifier is the SDK's `keccak256(provider + parameters + canonical context)` and carries no timestamp.

Measured the same day, with our own attested fetch (`scripts/read-twice.ts`, the function the reading service
runs) and the production zkFetch application, in TEE mode as production reads (`useTee: true`,
`src/attested-read.ts:222`): two reads of the unchanged Chess.com player page, seven seconds apart, same extracted
fields, **two different identifiers**. The signed context carries `tee_session_id`, fresh on every read
(`3458f620…` then `3b06171c…`), and the identifier hashes the context. A local attestor without TEE has no such
field, which is why that measurement repeats and this one does not.

What production did: over the last two weeks the milestone path relayed exactly two attested proofs, the two
`start` readings, and took fifteen plain readings without a proof in between (`viky_milestone_readings`); the daily
path relayed five check-ins and never met `NullifierAlreadyUsed`. So today's uniqueness rests on a field Reclaim
puts in the context in TEE mode, not on anything of ours: true of production, and to be kept in mind by anybody who
runs a reading without TEE.

## Goal 13, the TOEFL score shown, to be signed by the owner (D164)

The first condition of the second nature needs one goal on `MilestoneGift` (`0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e`),
number 13, shape "having it or not", provider id `viky:provider:toefl-mybest-shown:v1` =
`0xa07cae8e7502221e9a33445deb8f4f5e12d9ccdfd35b5e53d9eb38f32d75db7d`. `pnpm check:milestone-goals` read it as
`missing` on 22 Sep 2026 and as `registered` on 23 Sep 2026, once the call below went through the Safe (the table
of owner actions above, row 13). What was signed, and how it was prepared:

| | |
|---|---|
| to | `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e` |
| data | `0x5ba19152000000000000000000000000000000000000000000000000000000000000000da07cae8e7502221e9a33445deb8f4f5e12d9ccdfd35b5e53d9eb38f32d75db7d0000000000000000000000000000000000000000000000000000000000000001` |
| gas | 102,125 (above the Foundry report for `registerGoal`, before the Monad margin) |
| what it is | `registerGoal(13, 0xa07cae8e…db7d, 1)`: the "show" sense. The "reach" sense, once a provider of ours reads the test's date, takes its own number; `registerGoal` never overwrites |

Registered on 23 Sep 2026: the create route no longer meets `UnknownGoal` for goal 13. The condition still stays out
of the register (D109) and off the public page except on the frontier's line, "Being built", until a proof has been
shown end to end from a real ETS account; that is the founder's word, not the contract's.

### Whether the Reclaim application is configured, at execution

The two variables are sensitive on Vercel and cannot be read back by `vercel env pull` (they come back empty).
`GET /api/conditions`, signed in as an operator, answers `shown.configured: true` when both are set where the route
runs, and `false` otherwise. A boolean, never a length or a prefix.

## Goal 14, staying enrolled at a university, shown, to be signed by the owner (D165)

One goal for the whole family of student portals, number 14, shape "having it or not", provider id
`viky:provider:university-enrollment-shown:v1` = `0xa95adf80ba13395dcc23c8048874f1ddfba5321a9eb5e1f90711c6a81c3d64df`.
`pnpm check:milestone-goals` reads it as `missing` on 23 Sep 2026. Prepared the same day with
`pnpm prepare:milestone-goals`, to go through the Safe exactly as goal 13 did (the table of owner actions above):

| | |
|---|---|
| to | `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e` |
| data | `0x5ba19152000000000000000000000000000000000000000000000000000000000000000ea95adf80ba13395dcc23c8048874f1ddfba5321a9eb5e1f90711c6a81c3d64df0000000000000000000000000000000000000000000000000000000000000001` |
| gas | 102,125 (above the Foundry report for `registerGoal`, before the Monad margin) |
| what it is | `registerGoal(14, 0xa95adf80…64df, 1)`: enrolled, shown, one goal for every portal |
| Safe nonce | 5, as it was |

Registered on 23 Sep 2026 in one session with goal 2 below: hash `0x0bb49c1d…3f35` signed by two of the three keys,
carried by the relayer, tx `0x9a46587c…36c7`, block 107,214,268, 192,897 gas. `pnpm check:milestone-goals` reads 14 as
`registered` with the provider id above. The condition still stays behind the door until a portal has been proved
with a student present and one gift has run end to end: that is the founder's word, not the contract's.

The session, when the founder sits down: `ACTION=raw TO=<to> DATA=<data> NONCE=<the Safe's nonce> pnpm safe:action`
prints `signThis`; two owners sign that hash with `cast wallet sign --no-hash` where their keys live; the same command
with `SIGNATURES="0xfirst,0xsecond" SEND=1 EXECUTOR_PRIVATE_KEY=<the relayer's key>` sends it; then
`pnpm check:milestone-goals` must read 14 as `registered`, and the row goes into the table of owner actions.

**Why one goal for the family and not one per portal.** The portal is bound into the subject the funder signs,
`hash("viky:subject:university-enrollment-shown:v1:<portal id>")`, so a proof shown from another portal fails the
contract's own `identityHash == subject` check, exactly as a certificate in another name does; and the proof's
provider (the Reclaim id, its version, its one request by hash) is pinned by the portal's row at verification, never
by the goal. A goal per portal would add nothing the subject does not already give, and would cost an owner
signature through the Safe every time a university is added. The subject costs nothing and is signed by the funder,
who is the one choosing the university. Said in the PR before building, as asked.

## Goals 15 and 16, the year passed and a grade reached at a university, shown, to be signed by the owner (D174)

Two more goals on `MilestoneGift` (`0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e`), one each for the whole family of
student portals as goal 14 is, shape "having it or not", the portal pinned in each gift's subject under the
condition's own name. `pnpm check:milestone-goals` reads both as `missing` on 23 Sep 2026. Prepared the same day
(the calldata is `registerGoal(goal, providerId, 1)`, the same as goals 13 and 14; the gas is theirs), to go through
the Safe in **one session**, nonce order, the second after the first is final, exactly as goals 14 and 2 did:

| | goal 15, the year passed | goal 16, a grade reached |
|---|---|---|
| provider id | `viky:provider:university-year-passed-shown:v1` = `0x6af90272bdbe3555ea1b6b91294da5d557c27b72a1cca333864412784dab1551` | `viky:provider:university-grade-shown:v1` = `0xf05dcc4db7fc72177e9c9c0ebcc05438600e18b4fb66496bc10a2bdd29291ff2` |
| to | `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e` | the same |
| data | `0x5ba19152000000000000000000000000000000000000000000000000000000000000000f6af90272bdbe3555ea1b6b91294da5d557c27b72a1cca333864412784dab15510000000000000000000000000000000000000000000000000000000000000001` | `0x5ba191520000000000000000000000000000000000000000000000000000000000000010f05dcc4db7fc72177e9c9c0ebcc05438600e18b4fb66496bc10a2bdd29291ff20000000000000000000000000000000000000000000000000000000000000001` |
| gas | 102,125 (above the Foundry report for `registerGoal`, before the Monad margin) | the same |
| what it is | `registerGoal(15, 0x6af90272…1551, 1)`: passed or not, one goal for every portal | `registerGoal(16, 0xf05dcc4d…1ff2, 1)`: the grade in hundredths against the target in hundredths, one goal for every portal |
| Safe nonce | 7, as it stands after goal 2 | 8, once 15 is final |

The session is the one of goal 14 above: `ACTION=raw TO=<to> DATA=<data> NONCE=7 pnpm safe:action` prints `signThis`
for goal 15, two owners sign it, `SIGNATURES=… SEND=1 EXECUTOR_PRIVATE_KEY=<the relayer's key>` sends it; once it is
final, the same with goal 16's `DATA` and `NONCE=8`; then `pnpm check:milestone-goals` must read 15 and 16 as
`registered`, and the two rows go into the table of owner actions. Both conditions stay behind the door until a
portal's results page has been proved with a student present and one gift has run end to end on each: that is the
founder's word, not the contract's.

**Why two goals and not one.** The year passed and a grade are two promises the funder signs: passed is had or not
with a fixed target of one, a grade is compared with a target in hundredths. One goal would let a proof of the one
settle a gift on the other with the same number; the subject already tells the two apart, and the goal's provider
id is what the contract checks first, so each has its own.

**What a grade is on the chain.** Hundredths, whatever the scale: 14.00 out of 20 is 1400, a GPA of 3.50 is 350, and
the funder's target is signed the same way, so `NotThereYet` compares like with like. The scale itself lives on the
portal's row (`results.grade.scale`) and never on the chain: a page is read on it, a target is refused off it.

## The night's goals, 17 to 21: the examination results shown, one Safe session at the end (D176)

Seven goals on `MilestoneGift` (`0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e`): one per examination result shown from
the person's own account (D176), shape "having it or not", the subject constant per condition as the TOEFL's is, one
for a Udemy course finished, shown (D178), whose subject is the course, and one for an average at school shown from
EcoleDirecte (D179), compared in hundredths. None is signed tonight: the founder asked
for one Safe session at the end of the night, and this table is that session. `pnpm check:milestone-goals` reads 17 to 23 as `missing` on
23 Sep 2026. The calldata is `registerGoal(goal, providerId, 1)`, the gas is that of goals 13 and 14 (102,125), and the
nonces follow goals 15 and 16 (7 and 8), each after the one before is final:

| goal | line | provider id | data | Safe nonce |
|---|---|---|---|---|
| 17 | a Cambridge English result, shown | `viky:provider:cambridge-english-shown:v1` = `0xecfbafb73034a36285f283dce008adf4d74bffedcc340080300e237167e117c5` | `0x5ba191520000000000000000000000000000000000000000000000000000000000000011ecfbafb73034a36285f283dce008adf4d74bffedcc340080300e237167e117c50000000000000000000000000000000000000000000000000000000000000001` | 9 |
| 18 | an IELTS band, shown | `viky:provider:ielts-shown:v1` = `0xc223d2ffcb46f2e2b235aa5a2629019ec53e5388200e9d2b2631e37f43327988` | `0x5ba191520000000000000000000000000000000000000000000000000000000000000012c223d2ffcb46f2e2b235aa5a2629019ec53e5388200e9d2b2631e37f433279880000000000000000000000000000000000000000000000000000000000000001` | 10 |
| 19 | the baccalauréat passed, Morocco | `viky:provider:bac-morocco-shown:v1` = `0x0180f9bedf395e0a0b0174999ce1268c0c3c9705e2cc2110a9abfb9249d74d44` | `0x5ba1915200000000000000000000000000000000000000000000000000000000000000130180f9bedf395e0a0b0174999ce1268c0c3c9705e2cc2110a9abfb9249d74d440000000000000000000000000000000000000000000000000000000000000001` | 11 |
| 20 | the baccalauréat passed, Cameroon | `viky:provider:bac-cameroon-shown:v1` = `0xfbe2ded9e4a8f17b37264a214589a09e1d75873fc65a9d56f5fd5683773901f3` | `0x5ba191520000000000000000000000000000000000000000000000000000000000000014fbe2ded9e4a8f17b37264a214589a09e1d75873fc65a9d56f5fd5683773901f30000000000000000000000000000000000000000000000000000000000000001` | 12 |
| 21 | the baccalauréat passed, France | `viky:provider:bac-france-shown:v1` = `0xa7afea17b0c985d7e53416eacc72d8b95347b97b97875df6f44025badcb59cca` | `0x5ba191520000000000000000000000000000000000000000000000000000000000000015a7afea17b0c985d7e53416eacc72d8b95347b97b97875df6f44025badcb59cca0000000000000000000000000000000000000000000000000000000000000001` | 13 |
| 22 | a Udemy course finished, shown (D178) | `viky:provider:udemy-course-shown:v1` = `0xf0da5b726f28cf4bc8bef5c1a8d7976a7d5a208e258b3ee9897e7ddd534e5fdd` | `0x5ba191520000000000000000000000000000000000000000000000000000000000000016f0da5b726f28cf4bc8bef5c1a8d7976a7d5a208e258b3ee9897e7ddd534e5fdd0000000000000000000000000000000000000000000000000000000000000001` | 14 |
| 23 | an average at school, shown from EcoleDirecte (D179) | `viky:provider:ecoledirecte-grade-shown:v1` = `0x1ec1d1c1bce9830ac7610d6c9f0ff214b5f350dd51b111b14cbadc2dda89c4ed` | `0x5ba1915200000000000000000000000000000000000000000000000000000000000000171ec1d1c1bce9830ac7610d6c9f0ff214b5f350dd51b111b14cbadc2dda89c4ed0000000000000000000000000000000000000000000000000000000000000001` | 15 |

The session is the one of goals 14, 15 and 16: `ACTION=raw TO=0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e DATA=<data>
NONCE=<nonce> pnpm safe:action` prints `signThis`, two owners sign it, `SIGNATURES=… SEND=1
EXECUTOR_PRIVATE_KEY=<the relayer's key>` sends it, the next once the previous is final; then `pnpm check:milestone-goals`
must read every goal of the table as `registered`, and the rows go into the table of owner actions. A goal registered
before its provider exists costs nothing and changes nothing: a `registerGoal` only adds, and a line with no provider
still refuses every gift by name (`NOT_CONFIGURED`).

**What each line waits for, in order.** (1) A real candidate's session on the Reclaim dashboard, to register the
provider written in `docs/reclaim/<id>-provider.md` (the page, the sign-in the candidate types in their own browser,
the fields to extract, all "to confirm" until captured); (2) its id, version and request hash pinned in
`EXAM_PROVIDERS` (`src/exam-shown.ts`), one commit; (3) the goal above; (4) one gift made by an operator and one proof
shown end to end by a candidate, with real money; (5) the founder's word, then `live: true` and the register. The
terms read for each service are in its definition, and where a service's pages show none, that is said rather than
guessed.

**Côte d'Ivoire, the DECO: a window to come back to, nothing built.** The results of the baccalauréat are consulted on
the DECO's service in July only; outside that window nothing can be captured from a candidate's session, so no
provider can be registered and no line was written. When July comes, the same steps as the three bac lines apply, with
a candidate present.

## Fitbit, connected by the person, through the Google Health API: what the founder sets, and what redeploys (D188, D197)

The legacy Fitbit Web API closes in September 2026 (its developer site's banner, read 23 Sep 2026; registrations are
closed), so the line reads its successor, the Google Health API (`https://health.googleapis.com`, v4), which reads
Fitbit trackers and Pixel Watches. The person authorises Viky once on Google's own page (OAuth 2.0 for a web server
application, the authorization code with PKCE and the client secret, `access_type=offline`), and each morning the
keeper asks `users.dataTypes.dataPoints.dailyRollUp` on `active-minutes` for yesterday through the attested fetch with
their key as a secret, judges it, and keeps the verdict alone. Nothing runs until these exist.

**1. The OAuth client in Google Cloud Console**, created by the founder (type "Web application"):

- the Google Health API enabled on the project (APIs and services, Library);
- the consent screen: user type "External", publishing status "In production" (set so by the founder on 23 Sep 2026), the scope
  `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` and no other, and the test users'
  Google accounts listed, since only they can connect while the client is in testing;
- **Authorized redirect URIs**, exactly, the callback path and not the site's root:

```
https://viky.cash/api/connect/fitbit/callback
```

  and, while that host still serves the app, `https://viky-two.vercel.app/api/connect/fitbit/callback`. The route
  builds its redirect from `NEXT_PUBLIC_APP_URL`, so the URI Google compares is that host's; a mismatch is Google's
  `redirect_uri_mismatch`, before anything reaches Viky. The path keeps the word fitbit: it is the line's, and the
  connect screen asks `/api/connect/<the source>`.

What testing mode would have meant, and no longer applies since the client is published (Google's setup guide, read 23 Sep 2026): a hundred users at most, and refresh keys that
expire after seven days, so a person's connection lapses each week (`KEY_REFUSED`, the row erased, the screen asks
them to connect again) until the client is published; publishing it and going past a hundred users needs Google's
app verification and its third party security review (CASA). The founder's step with Google, written on the judges'
page.

**2. Three variables on Vercel, production, sensitive** (the `FITBIT_*` names are gone with the legacy API and configure
nothing). The reading service receives the key per request over its
own guarded channel and holds none of it; what it needs on Railway is step 3, a redeploy, and no variable.

| variable | what it is | where it comes from |
|---|---|---|
| `GOOGLE_HEALTH_CLIENT_ID` | the OAuth client's id, `….apps.googleusercontent.com` | Google Cloud Console, APIs and services, Credentials, the client |
| `GOOGLE_HEALTH_CLIENT_SECRET` | its client secret | the same page |
| `CONNECT_TOKEN_KEY` | 32 bytes in base64, the key every connected source's keys are sealed under at rest | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` on the founder's machine, then `vercel env add CONNECT_TOKEN_KEY production --sensitive`; never written down elsewhere, and never changed once a connection exists, since a sealed key does not open under another |

`GET /api/connect/fitbit/status?giftId=…`, signed in as the gift's recipient, answers `configured: true` when the
three are set where the route runs, and `false` otherwise: a boolean, never a value.

**3. The reading service redeployed, by the founder, from the second branch.** The branch `catalogue/fitbit-source`
(PR #166, rebuilt on D197) moves the Google Health source and the Strava source into `src/attested-sources.ts`, the
shared list the service runs, with the method and the body a POST page needs; that changes `READING_FINGERPRINT`, and
until the service runs that commit every attested read of the app refuses (`WORKER_OUT_OF_DATE`), the Chess.com
ratings and the certificate readings included. So the founder does the two things back to back, since the app on main
and the service must carry the same number:

```
git fetch origin && git checkout catalogue/fitbit-source
railway link -p viky -s zkfetch-worker -e production
railway up --ci
curl -s https://zkfetch-worker-production.up.railway.app/health
```

`/health` must answer that branch's `READING_FINGERPRINT` (the test of that branch says the number); then merge the
PR, and the Vercel deploy that follows brings the app to the same number. Between the two, every attested read
refuses for the minutes the deploy takes, as it does for any change of the shared sources. The worker takes the
person's key in the body of `/read` for a source whose `auth` is `bearer`, hands it to zkFetch as a secret header, and
logs the source and the day, never the key; that half is already on main and runs the moment the service is
redeployed. Until step 3 is done the morning reading refuses `NOT_CONFIGURED` before asking the service anything
(`configured` in `src/connected-checkin.ts` asks the shared list for the source).

**4. Goal 6 on the daily contract**, `GiftEscrow`, provider id `viky:provider:fitbit-connected:v1` =
`0x1945fcd86cc0f0a5a3ffcea6145dbbb882c4c0ac989624a4476da8885c16a701`: registered on 23 Sep 2026 in the batched Safe
session (below). The provider id stays: it names the line, not the API behind it.

**What a morning does, and what it keeps.** The counting pass reads every bound daily gift; for a gift on goal 6 the
dispatcher (`src/daily-count.ts`) opens the sealed keys, refreshes them through Google when the access key has run
out (an hour), asks the reading service for yesterday's roll-up with the key as a secret, by `POST` with a body that
names the civil day and the next, one window, and `google-wearables` (minutes logged by hand are not asked for), and
adds the `MODERATE` and `VIGOROUS` minutes against the gift's target. The method and the body are part of what the
attestor signs, and the app checks both. The attestation signed for the contract carries the contract's own
baseline plus the target when the day was won, and the baseline alone when it was not: a yes on the chain, or a
refusal in the journal, and never a number. The proof is not stored; the session row keeps the day and the verdict.

**Disconnect and erase.** From the gift's page, by the recipient: the key is revoked at Google
(`POST https://oauth2.googleapis.com/revoke`, `token` in the body), then the row is deleted whether or not Google
answered. The gift goes on; each day is counted as not done until the person connects again, with the same account,
since the pseudonym of its `healthUserId` is bound.

**Google's terms, read 23 Sep 2026.** The Google Health API Developer Terms (effective 24 Mar 2026) bind the Google APIs
Terms of Service, the Google API Services User Data Policy, the OAuth 2.0 Policies and the Google Health API Developer
and User Data Policy (last updated 24 Mar 2026). That policy asks: use limited to the feature the person asked for; a
transfer to a third party only to provide it, with the person's consent; a disclosure that accompanies and immediately
precedes the consent, which only an affirmative action gives; deletion honoured on request, with help that explains
it; no human reading the data; no use for credit or lending, advertising or data brokers. The consent screen in
Viky's words before the one button, the yes or no the funder learns, the erase button and the privacy page are those;
the judges' page says so. The developer terms also ask that data be stored at the granularity it is collected: Viky
stores none of it.

## Strava, connected by the person: what the founder sets, and what redeploys (D191)

The second source of the third nature, on the model of Fitbit above: the person authorises Viky once on Strava's own
page (OAuth 2.0, the authorization code; Strava takes the application's secret on the exchange and no PKCE), and each
morning the keeper reads yesterday's activities through the attested fetch with their key as a secret, adds the
distances, judges the day against the kilometres the funder set, and keeps the verdict alone. Nothing runs until three
things exist.

**1. The application on strava.com/settings/api**, registered by the founder: "Authorization Callback Domain"
`viky.cash` (and `viky-two.vercel.app` while that host serves the app; Strava takes one domain per application, so a
second application is needed for the second host). The route builds the redirect from `NEXT_PUBLIC_APP_URL`, so the
callback registered must be that host's: `https://viky.cash/api/connect/strava/callback`. A new application is in
single-player mode (Strava's API Agreement, read 23 Sep 2026): only the account that owns the application can
authorise it until Strava raises the athlete limit on request, which is the founder's step with Strava.

**2. Two variables on Vercel, production, sensitive**, beside `CONNECT_TOKEN_KEY`, which Fitbit's section sets once
for every connected source.

| variable | what it is | where it comes from |
|---|---|---|
| `STRAVA_CLIENT_ID` | the application's Client ID, a number | strava.com/settings/api, the application's page; the "Your Access Token" and "Your Refresh Token" shown on the same page are the owner's own personal keys and are not used |
| `STRAVA_CLIENT_SECRET` | its client secret | the same page |

`GET /api/connect/strava/status?giftId=…`, signed in as the gift's recipient, answers `configured: true` when the
two are set where the route runs beside `CONNECT_TOKEN_KEY`, and `false` otherwise: a boolean, never a value.

**3. The reading service redeployed, by the founder, from the second branch.** The Strava source is in
`src/strava-source.ts`, beside Fitbit's, a file the reading fingerprint does not cover; the branch
`catalogue/fitbit-source` moves both into the shared list at once, and the sequence of Fitbit's step 3 above is the
whole of it: one redeploy for the two sources, then the merge. Until then the morning reading refuses
`NOT_CONFIGURED` before asking the service anything.

**4. Goal 4 on the daily contract**, `GiftEscrow` (`0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233`). Provider id
`viky:provider:strava-connected:v1` = `0x891688d7bb10712c938397c2502da41b764a18322340c895613ac00b0fcab790`. To go
through the Safe in the same session, after goal 6:

| | |
|---|---|
| to | `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233` |
| data | `0x68fa3be20000000000000000000000000000000000000000000000000000000000000004891688d7bb10712c938397c2502da41b764a18322340c895613ac00b0fcab790` |
| gas | 75,000 (as for goal 6) |
| what it is | `registerGoal(4, 0x891688d7…b790)`: Strava, connected, the day's verdict |
| Safe nonce | 17, after goal 6 |

`goalProviders(4)` read back equal to the id above is the check. Goal type 4 has been `GOAL_TYPE_STRAVA_DISTANCE` in
`src/gift-terms.ts` since the daily contract was written, and has never been registered.

**What a morning does, and what it keeps.** As for Fitbit, with one difference: Strava's page is the list of the
day's activities (`GET /api/v3/athlete/activities?after&before&per_page=30`, the day being the calendar day in UTC),
and the day's distance is the sum of their `distance` fields in metres, judged against the kilometres times a
thousand. The list is captured whole by the attested fetch, since a day is a sum and a pattern captures one value;
it is read once here and dropped, with its routes, its times and its names. The rest is Fitbit's: the verdict
signed as the contract's baseline plus the target, no proof stored, the session row keeping the day and the verdict.
Strava's access key lives six hours; the refresh key is used on the morning it has run out and both are sealed again.

**Disconnect and erase.** From the gift's page, by the recipient: the key is revoked at Strava
(`POST https://www.strava.com/oauth/revoke`, the endpoint Strava recommends since 1 Jun 2026, the application's Basic
credentials, `token` in the body), then the row is deleted whether or not Strava answered. What remains is on the
chain (the days' verdicts and the pseudonym of the athlete id, a hash) and in the journal.

**Strava's API Agreement, read 23 Sep 2026.** Strava Data serves the person who authorised it and nobody else, is
neither aggregated across people nor shown to others, and is deleted when they ask; applications start in
single-player mode; the brand guidelines ask for "Powered by Strava" where Strava data is shown, and Viky shows none.
The judges' page says so.

**When the line opens.** "Being built" while a piece is missing (D184): the two variables, the service running the
Strava source (step 3), goal 4 signed, and Strava's athlete limit raised for anybody but the founder to connect. The
day they exist, a PR moves `STRAVA_DAILY` from `BUILDING` into the register with `live: true`. Defaults applied, to
confirm: three kilometres suggested; the day being the UTC calendar day; the list captured whole.

## A university's portal, in thirty minutes, with a student present (D165)

A row of `viky_portals` is what makes a university choosable, and a row is written only after a proof has come back
from that portal with a student of it sitting there, signed in to their own account. Nothing is guessed from a page
nobody signed in to, and the table is empty until the first one. Most of the thirty minutes is the recording.

1. **Register the provider on the Reclaim dashboard, from the student's own session.** An HTTP provider whose login
   URL is the portal's sign-in address; the student signs in in the recording tab, and the page that says they are
   enrolled is the one to select. Extract the least that means enrolled: a status field (`Inscrit`, `Enrolled`) or
   the current academic year, and nothing else, no mark and no personal number. Name the field as the row will name
   it (`status`, or `academicYear`). Publish, then note three things: the provider id (36 characters), its version
   (`1.0.0`), and the hash of its one request, read from the provider's configs as it was for TOEFL
   (`docs/reclaim/toefl-mybest-shown-provider.md` says where).
1 bis. **The results page's provider, from the same session (D174).** While the student is signed in, a second HTTP
   provider on the same portal, whose page is the results page: the year's or the semester's decision and the average.
   Extract three things and name them as the row will: the field that says passed (`decision`, matching
   `^(Admis|Passed)`), the field that carries the grade (`average`, as the page prints it, "14,50" or "14.5"), and,
   when the page names its year, the field that does (`academicYear`) with the pattern this year's page matches
   (`2026-2027`); a page of another year then pays nothing, and that pattern is updated each year the way the row was
   written. Without a year field, the day of the proof is what dates it. Note the scale the university grades on:
   out of 20, a GPA out of 4, out of N in a step, or letters (declared as such; a gift on a letter grade is refused at
   creation until a later PR). Publish, and note the provider id, its version and the hash of its one request, as in
   step 1. A results page that is not out yet is a step to come back to: the row is written without it, and the two
   conditions on it stay closed for that portal until it is.
2. **Write the row.** `pnpm portal:add` with the whole row in the environment of the command (the script's header
   lists every name: the id, the name and the university, the country in two letters, the provider by id and
   version, the request hash, the sign-in address, the field, its pattern and, in words, what is kept); `DRY_RUN=1`
   first, which prints the row and writes nothing. Against production, the operator command of "The test database"
   applies. It reads the row back and prints how many portals the table now holds. The results page goes in the
   same command with the `RESULTS_*` names (`scripts/portal-env.ts` lists them, the scale as `20`, `4`, `20/0.5` or
   `letters:A,B,C`), or later with `pnpm portal:results` and the portal's id alone; proving enrolment again never
   removes a results page already written.
3. **Prove one gift end to end.** As an operator (the door above), make a gift on "Enrolled at university, shown"
   and choose that portal; open the gift page as the student, "Show it", the student signs in in the verification
   tab, and the proof comes back or a typed refusal does (`NOT_ENROLLED` when the field does not match the pattern,
   `ANOTHER_NAME` when the proof came from another portal than the gift's, `NO_PORTAL` when the gift names none).
   `pnpm verify:day` then names the portal on the claim's line: `portal: ucad-sn, Université Cheikh Anta Diop (SN),
   page enrolment, provider …, proved …`. The same for the two conditions on the results page (D174), one gift each,
   "Pass the year at their university" and "Reach a grade at their university" with a grade typed on the portal's
   scale: the proof comes back with the words the person reads ("Passed", "14.50 / 20") or a typed refusal
   (`NOT_PASSED` when the decision field does not match, `NO_GRADE` when the grade field carries nothing on the scale,
   `WRONG_TERM` when the page is another year's, `NO_RESULTS_PAGE` when the portal's row holds no results page, which
   the create route also refuses before any money moves, with `LETTER_SCALE` and `INVALID_TARGET` for a grade the
   scale cannot take). `pnpm verify:day` says `page results` on those claims.
4. **When the condition opens.** Open since 23 Sep 2026 (D200), the day the first portal row existed, the American
   University of Rome from the Reclaim directory (D199), under the founder's rule of D184: a line opens when its path
   is complete. A row marked unverified says so on the chooser and before payment (D193, D195) until a student's
   session confirms it.

## The corridor's two portals, defined from their public pages, unverified (D193)

UCAD (Dakar) and UFHB (Abidjan) are defined from what each university and ministry publishes, without a student:
`docs/reclaim/ucad-sn-portal.md` and `docs/reclaim/ufhb-ci-portal.md` say every page read, every label a pattern sits
on, and the `pnpm portal:add` command with `UNVERIFIED=1`. The founder's steps, in order, once per portal: register the
provider (or the two, for UCAD) on the Reclaim dashboard from the JSON in the file, put its id, version and request
hash in the command, run it against production. The row opens the Study lines on that university (D184) with
"(unverified)" beside its name on the chooser. The first real session shows whether the patterns hold: a miss fails by
its name (`NOT_ENROLLED`, `NOT_PASSED`, `NO_GRADE`, `WRONG_TERM`), the person is told nothing is lost, the gift's
journal carries `refused:<the name>`, and `pnpm verify:day` on the session's proof prints the fields the page really
carried. Corrected, the row is written again without `UNVERIFIED`, and the mark goes.

UFHB's student space (`ufhb.mysonec.com`) did not answer from outside Côte d'Ivoire and gives no secure address, so
its row carries enrolment alone (the ministry's registration platform) until the results page is reached from a
student's session.

## Goal 2 on the daily contract, a GitHub contribution each day, registered and without effect (D166, D170)

Registered on 23 Sep 2026 and withdrawn the same day (D170): no condition names goal 2, no reading carries its
provider id, and a `registerGoal` is never undone (the contract only adds). The record of the action stays below as
it happened; nothing else in this section is to be run.

The GitHub condition is a daily one, on `GiftEscrow` (`0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233`), whose goals take
two arguments and no shape. Number 2 has been reserved for it in the code since the port (`GOAL_TYPE_GITHUB_CONTRIBUTIONS`)
and read back empty from the chain on 23 Sep 2026 (`goalProviders(2) = 0x00…00`; the contract's owner is the Safe, its
evidence signer `0x85702Eaa…`). Provider id `viky:provider:github-contributions:v1` =
`0xda1048bc067600c20909ee6e262729bc5087ae37f5478c3beb4d6f21d9922050`. The call, to go through the Safe like the others:

| | |
|---|---|
| to | `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233` |
| data | `0x68fa3be20000000000000000000000000000000000000000000000000000000000000002da1048bc067600c20909ee6e262729bc5087ae37f5478c3beb4d6f21d9922050` |
| gas | 75,000 (goal 5 took 65,238 on the same function, before the Monad margin) |
| what it is | `registerGoal(2, 0xda1048bc…2050)` |
| Safe nonce | 6, after goal 14 |

Registered on 23 Sep 2026, in the session of goal 14 and after it was final: hash `0xb1c6f1c0…4886` signed by two of
the three keys, carried by the relayer, tx `0x4982aece…f77c`, block 107,214,315, 161,559 gas, and `goalProviders(2)`
read back equal to the provider id above. The condition was withdrawn the same day (D170).

The session was the one of goal 14 above, with this `TO` and this `DATA`. Read back afterwards with the script that read
it empty: `npx tsx review-captures/read-daily-goals.ts` prints `goal2` (that file is local and not committed; any
`goalProviders(2)` read does the same).

No token is set anywhere for it: `GITHUB_API_TOKEN` was planned for Vercel and Railway and never created (D170).

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

## The proof verifier switch, off

Every attested read verifies the attestor's signature before anything else. Today that check is js-sdk
`verifyProof`, which fetches the list of attestors from api.reclaimprotocol.org at verification time and refuses any
other signer, before Viky's own pin (`RECLAIM_ATTESTOR_ADDRESSES`, `DEFAULT_ATTESTORS`) is even consulted. Measured on
22 Sep 2026 with a proof from an attestor of our own: refused with "Identifier mismatch" whatever the pin said. So no
variable of Viky can make the app accept another attestor on that path.

`src/proof-verification.ts` holds the other path, behind `PROOF_VERIFIER`:

| `PROOF_VERIFIER` | what checks the signature | network |
|---|---|---|
| unset, or `reclaim` | js-sdk `verifyProof`, as before this switch existed | Reclaim's attestor list, at every verification |
| `local` | the identifier recomputed, the signers recovered, every one of them pinned, the witnesses equal to the signers; and, when `RECLAIM_ATTESTOR_IMAGE_DIGESTS` is set, each witness's enclave attestation verified offline and its image digest pinned | none |

It is off. Turning it on is the founder's decision, taken only once an attestor of ours has run beside Reclaim's for
a week. When it is turned on in production, `RECLAIM_ATTESTOR_IMAGE_DIGESTS` is set with it: without a pinned digest,
`local` accepts an attestor that runs outside a TEE, which is a local test setting and nothing else. A refused proof
says why in the logs (`proofVerifier: "local"`, `refused`), where the screen only says "The proof did not verify".

## The Safe of three project keys, and how an owner action is signed

One key owns all four contracts today, and it is the founder's own hardware wallet. Two things are wrong with that,
and the second is the one that decided this shape: a single key lost is the goals, the evidence signer and both pauses
lost with it, and a personal wallet has no business being the thing a product depends on. **So no personal address
owns anything: three keys are made for the project, and the Safe asks for two of them.** A key lost leaves the other
two able to act; a key stolen is not enough to act at all.

**Done on 20 Sep 2026.** The four contracts answer the Safe, read back from the chain rather than from the receipts,
and the founder's hardware wallet has nothing left to sign for Viky. The table at the end of this section carries the
addresses and the four transactions. What follows is the procedure as it was run, kept because it is the one to
follow again the day a key has to be replaced.

**One thing it cost, and it is worth reading before the next time.** Three keys were made, three were thrown away,
and a second Safe had to be built. The first paper phrase was pasted whole into a conversation; the two encrypted
files shared one password and one of them was pasted too. None of it cost money, because none of them owned anything
yet, and that is the only reason it was cheap: **a key is proved by its address alone, and a file, a phrase or a
password that reaches a conversation is spent.** The Safe that was abandoned, `0xfc73A319D25Da982201E7E250e5E6348a62FD8D8`,
is left where it is, owning nothing.

Safe 1.4.1, the same version, factory and singleton as the Safe that already runs on Monad for Lock-In
(`0xf1be884698B9Ba4438f529699eC92320427b4dA1`, created 15 Jul 2026). Read on Monad mainnet on 19 Sep 2026, each with
code at its address: proxy factory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, L2 singleton
`0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`, fallback handler `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`.

**1. The founder makes the three keys. Nobody else ever runs these commands**, and no key, password or file is ever
sent to anybody. Each one prints an address, and the address is the only thing that leaves the machine.

Two of them are encrypted files, kept in two different places, so one disk lost is not the Safe lost:

```
cast wallet new ~/viky-keys viky-owner-a --touch-id
cast wallet new /Volumes/<the other place> viky-owner-b --touch-id
```

`cast wallet new <folder> <name>` writes an encrypted keystore and asks for a password without echoing it, which is
the default of the installed version (`cast wallet new --help`, read 19 Sep 2026: "Triggers a hidden password prompt
for the JSON keystore. Deprecated: prompting for a hidden password is now the default"). The password is the
founder's, typed each time, written nowhere.

`--touch-id` enrols the keystore for the fingerprint reader, which is the comfortable way to use it every day. Read
the flag's own words before relying on it: "Enroll the keystore for Touch ID-assisted authentication on macOS. The
macOS login password and explicit keystore passwords remain available." So the password does not go away and is not
replaced: it stays as the way in when the reader is not there, on another machine or after a restore, which is
exactly why it still has to be a password worth having. Read an address back at any time, with nothing else moving:

```
cast wallet address --keystore ~/viky-keys/viky-owner-a
```

The third is on paper, as twelve words rather than as a key:

```
cast wallet new-mnemonic
```

Twelve words by default (`--words`, default 12, read 19 Sep 2026), with the address they give printed under them. A
raw key is sixty-four hexadecimal characters copied by hand, and one character wrong makes it worthless for ever;
twelve words from a fixed list are read back, checked and corrected by anybody, and they give the key again when it
is needed. Write the words on paper, then **close that terminal**: they stay in its scrollback until the window is
gone, and that paper is the one copy there is.

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
```

That prints `signThis`, one hash. **No key is ever typed or decrypted to sign it**: each owner signs that hash where
their key already lives, with `cast`, two of the three being enough.

```
cast wallet sign --no-hash <the hash> --keystore ~/viky-keys/viky-owner-a   (the fingerprint asks, or the password)
cast wallet sign --no-hash <the hash> --mnemonic "<the twelve words>"       (the one on paper)
cast wallet sign --no-hash <the hash> --ledger                              (a hardware wallet, if one is an owner)
```

`--no-hash` signs the digest as it is rather than hashing it again, which is what a Safe transaction hash needs.
Measured on 19 Sep 2026: what comes back is 65 bytes ending in `1c`, and the recovery of the signer from it agrees,
which is the form `pnpm safe:action` checks and the contract accepts. Then the two signatures go back in, and anybody
can carry the transaction:

```
SIGNATURES="0xfirst,0xsecond" SEND=1 EXECUTOR_PRIVATE_KEY=0x… …
```

The executor's key pays the gas and signs nothing about the gift: the relayer's own key does it.

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
| the Safe | `0xE08D926c148A5065F4Df2892702785a183de86F9`, Safe 1.4.1, two signatures of three |
| created | tx `0xb736505639c90b8e1775b2f3419aa1790d1a2cbda99a83f8905ded11ba4c9139`, block 106,297,928, paid by the relayer |
| owner, an encrypted file on the founder's machine | `0x19d48126D78df48ac011f4145FA2226365e5b794` |
| owner, a phrase on paper | `0x2307E9DE7b47cdc10E604794123D2Ac1b002bA4e` |
| owner, a second phrase on paper | `0xED4c39120Ef1d67780B9Bd63d648bd3Df6ab67B3` |
| proved before anything was handed over | the Safe calling itself, signed by two owners, tx `0xc15ef6c95894e426e20c2a1838345150f5bdf22eb4eb55828e3e06597f3fbeb3`, block 106,299,392 |
| `GiftEscrow` `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233` | tx `0x1aa2887ef13988fd86efffe992651e6b9b2294161e2bbdc75c5e1466051f47d3`, block 106,300,697, 35,684 gas |
| earlier `GiftEscrow` `0xE04CD59bB93765333200a9da01df83149D4C4d67` | tx `0x534555010acde11dd8791ad58d3ea02d485967ecf9f3045e7fb70e89bcfb6635`, block 106,300,728, 35,651 gas |
| `MilestoneGift` `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e` | tx `0x960a5ad8edd9f5f0909bbc1f5bc85da86d081339364699248876375981fa072b`, block 106,300,749, 35,717 gas |
| `ExitRouter` `0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223` | tx `0xcd2b1ac3ef8c334596d49d7154fb8288efb14ad268bf272a86c79367bfe67b78`, block 106,300,766, 35,067 gas |
| read back | all four answer the Safe (`VERIFY=1 pnpm safe:handover`, and `owner()` on each, 20 Sep 2026) |
| what it cost the hardware wallet | about 0.0147 MON for the four, of the 90.5 it holds; the Safe itself holds nothing and needs nothing |

## The appearance column, run on production 21 Sep 2026

`appearance` on `viky_accounts` (D159), the column the account keeps day or night in beside the display currency.
Run with the operator command of "The test database" below, and read back: the table now answers
`account, display_currency, updated_at, appearance`, and the five rows already there kept their currency. It had to
be run the moment the build went out, not later: the build reads the column on every account page, so until it
existed that read threw, and the display currency it also reads came back as nothing. Additive, and nothing else in
the running build touches it.

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

## There is no door any more: a condition built is open (the founder's rule of 23 Sep 2026)

Until 23 Sep 2026, `/api/conditions` offered a condition that was wired and not live to an account on
`VIKY_OPERATOR_ACCOUNTS`, and to nobody else, so the first real gift on a new condition could be made behind a door
(D109). Chess.com went through it and out of it. The founder's rule of 23 Sep 2026 replaces D109 and the door: a
condition built is open to everybody as soon as its path is complete, the register, the goal on the chain, the
provider defined, the flow built to the end; a condition with a piece really missing is offered to nobody, operator or
not. `preview` in the answer of `/api/conditions` is empty for everybody and stays in the answer only so a screen
built against it keeps its shape. `VIKY_OPERATOR_ACCOUNTS` still opens the dev pages (`VIKY_DEV_PAGES`) and the
operator's boolean answers (`shown.configured`), and nothing else.

The public page tells the truth line by line: "Open. Nobody has shown one yet." (or "read on it", or "connected one",
by the line's nature) until a real proof has passed, then "Open." alone; the judges' page prints the count of real
proofs per condition (`src/proof-counts.ts`: attested milestone readings that started or reached a gift, check-ins
relayed for a daily one). "Being built" is printed only where a piece is really missing, and the line says which.
Nothing is ever printed as "tested" or "used by N": the state "Being tested" is gone.

## Goal 24 on the milestone contract: PRONOTE, an average shown (D203)

Provider id `viky:provider:pronote-grade-shown:v1` = `0x168e16e58443ee012319e416a53f7bf5ecbcf660707e35917bad5a5abf7835f8`,
shape 1, having it or not. One Safe transaction, built by `pnpm safe:session`, which finds it missing and batches it
alone (the calls of D194, carried by the relayer):

| | |
|---|---|
| to | `MilestoneGift` `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e` |
| data | `0x5ba191520000000000000000000000000000000000000000000000000000000000000018168e16e58443ee012319e416a53f7bf5ecbcf660707e35917bad5a5abf7835f80000000000000000000000000000000000000000000000000000000000000001` |
| what it is | `registerGoal(24, 0x168e16e5…35f8, 1)` |

Prepared for the next Safe session (nonce 8, `signThis` `0x8820691e801d4367b7fcf357333f06be195576b88c2e1824624971a59e654a94`,
read from the chain on 23 Sep 2026, the goal alone in the batch; rebuilt by `pnpm safe:session` if the nonce moves).
Signing it opens nothing: PRONOTE is parked, its answers and its bulletins being encrypted
(docs/reclaim/pronote-grade-shown-provider.md).

## Goal 25 on the milestone contract: an edX verified certificate (D212)

Provider id `viky:provider:edx-certificate-zkfetch:v1` = `0x1b7dcd631d332fd55c35e820ce05cc6817023b8eda487a830d1370222d6fa08f`,
shape 1. `registerGoal(25, 0x1b7dcd63…a08f, 1)`, data
`0x5ba1915200000000000000000000000000000000000000000000000000000000000000191b7dcd631d332fd55c35e820ce05cc6817023b8eda487a830d1370222d6fa08f0000000000000000000000000000000000000000000000000000000000000001`.
`pnpm safe:session` finds it missing and batches it with goal 24 in the next session, carried by the relayer. The source
`edx-certificate` is in the shared list, so this PR moves the reading fingerprint: the service is redeployed from the
branch before the merge (the rule of "The reading service is a second deployment").

## Goal 26 on the milestone contract: a credential on Accredible (D213)

Provider id `viky:provider:accredible-credential-zkfetch:v1` = `0xf16cfb8a8ef6a10146f6b2dd98da114d61509c04646cd3ccf93cf4cb0caaa9d8`, shape 1. `registerGoal(26, …, 1)`, data
`0x5ba19152000000000000000000000000000000000000000000000000000000000000001af16cfb8a8ef6a10146f6b2dd98da114d61509c04646cd3ccf93cf4cb0caaa9d80000000000000000000000000000000000000000000000000000000000000001`.
`pnpm safe:session` batches it with the other missing goals, carried by the relayer. The source
`accredible-credential` is in the shared list: the service is redeployed from the branch before the merge.

## Goal 27 on the milestone contract: enrolment in China, shown from CHSI (D215)

Provider id `viky:provider:chsi-enrolment-shown:v1` = `0xe6bb6add0b9555f1d7cc0b063d21b12d2777bb4eaaa94c93bb19251d860b13b4`, shape 1, data
`0x5ba19152000000000000000000000000000000000000000000000000000000000000001be6bb6add0b9555f1d7cc0b063d21b12d2777bb4eaaa94c93bb19251d860b13b40000000000000000000000000000000000000000000000000000000000000001`.
`pnpm safe:session` batches it with the other missing goals. The line opens when our provider is registered from a
real CHSI report (docs/reclaim/chsi-enrolment-shown-provider.md) and pinned in `CHSI_PROVIDER`.

## Goal 30 on the milestone contract: a marathon finished, read from Breizh Chrono (D273)

Provider id `viky:provider:breizh-chrono-zkfetch:v1` = `0x59a029732fded0190d8c59b695d62b1410e08d6ca82dd5284b7a9e7cf9f80b55`, shape 1, data
`0x5ba19152000000000000000000000000000000000000000000000000000000000000001e59a029732fded0190d8c59b695d62b1410e08d6ca82dd5284b7a9e7cf9f80b550000000000000000000000000000000000000000000000000000000000000001`.
Registered on 26 Sep 2026 in the Safe session of goals 29 and 30 (the section below), read back with the provider id
and shape 1; the line is open (D275), before the test gift, by the founder's decision. The source
`breizh-chrono-runner` is in the shared list: the service is redeployed from the branch before the merge, on the
fingerprint `0x97df1bdf…1aa0`.

## The Safe session of goals 29 and 30 (D275)

**Sent on 26 Sep 2026**, signatures given by the founder (the encrypted file `0x19d4…b794` and a phrase on paper),
carried by the relayer `0x150d…CFE4`, which only paid the gas:

| | |
|---|---|
| transaction | `0x74594169ab42b6ffd37588497759658203fcc60d8d9ea76e08ed513baa994319`, block 108,029,165, success, 278,045 gas |
| the hash signed | `0x8ac76065065bf94fdaf85fb2322e701772031e157db7f1968ea1736d776f010e`, equal to the Safe's own `getTransactionHash` at nonce 9 |
| the Safe | nonce 9 to 10 |
| read back after | goals 29 and 30 on `MilestoneGift`, each with the provider id of `MILESTONE_GOALS` and shape 1; `pnpm check:milestone-goals` finds nothing left to send |
| relayer | 53.19 MON after |

**The register** (`MARATHON_RACES`, src/marathon.ts) holds the coming races with a marathon, a half or a 10 km, the
distance chosen at creation (the founder, 27 Sep 2026). A race already run is offered to nobody; the Marathon de
Dakar 2023 stays as `operatorOnly`, listed to the operator's accounts alone, for the test gift.

**A race is added** from two public pages, read before the row is written. Breizh Chrono's calendar,
`https://calendrier.breizhchrono.com/?page=<n>` (fifteen events a page, the whole coming calendar in eleven pages on
26 Sep 2026), names each event and links its Klikego page, `https://www.klikego.com/event/<ref>`; that page's
schema.org data (`application/ld+json`) gives `startDate` (midnight of the day, which is when the bib field closes),
the town and country, and the `subEvent` names, "Marathon Vert Rennes Groupe Interaction - Le 10km Lamotte". The
reference is the same on both sites (`1488071608761-442` is the Marathon de Dakar 2023 on Klikego and on the results
site). The heat's key on the results site follows from the sub-event's name with the event's name and " - " taken
off, by `heatSlugOf` (no accents, no case, apostrophes dropped, spaces to dashes): measured on the forty heats of
eight past events on 26 Sep 2026, forty for forty. A row is `raceId`, `ref`, the name with the year, town, country,
`startsAt` as Klikego prints it, and one `event(distance, label)` per heat offered, the label copied from Klikego.
If an organiser renames a heat before the results are published, its key changes: fix the label in the register
before the person reads (the account is built from the register at read time, nothing is stored in the gift).

The Marathon de Dakar 2026 is added the day its organiser announces it (nothing on Klikego nor in the calendar on
26 Sep 2026). The Marathon de Paris is timed by another company and needs its own source.

## The Safe session of goals 31 to 33 (D281)

**Sent on 26 Sep 2026**, signatures given by the founder (the encrypted file `0x19d4…b794` and a phrase on paper),
carried by the relayer `0x150d…CFE4`, which only paid the gas:

| | |
|---|---|
| transaction | `0xf46e2daff9dce964f67f2656fa5720432e80ebeab8f4a992b663c2e7b4efd311`, block 108,058,098, success, 324,210 gas |
| the hash signed | `0x14333c89386bb2c651b921b0569a0afdf0a31f0f9607f9c662f1d43344fcaad7`, equal to the Safe's own `getTransactionHash` at nonce 10 |
| the Safe | nonce 10 to 11 |
| read back after | goals 31 and 32 on `MilestoneGift` with their provider ids and shape 1, goal 33 with its provider id and shape 0 (a climb); `pnpm check:milestone-goals` finds nothing left to send |
| relayer | 53.16 MON after |

## Goal 33 on the milestone contract: a Codeforces rating reached (D280)

Provider id `viky:provider:codeforces-rating-zkfetch:v1` = `0x8c198ec8f6c22bb4aa6709c9849ccc0369b08d3346b6017f3f64b6a7e93f7a45`, shape 0 (a climb), data
`0x5ba191520000000000000000000000000000000000000000000000000000000000000021` + the provider id + a zero word (`pnpm safe:session` prints it). Registered in the Safe session of goals 31 to 33 (the section "The Safe session of goals 31 to 33" below), read
back; the line is open (D281).

**The reading** (src/codeforces-reading.ts): `https://codeforces.com/api/user.info?handles=<handle>`, anonymous,
one request every two seconds (the API help, read 26 Sep 2026), any user agent. Two sources: `codeforces-user`
(the handle, the rating, the best ever) for the daily reading, `codeforces-user-named` (the last name too) for the
binding reading, where Viky's code has to be in the last name (D27). The keeper, the create route and the rename
flow read every climb through `src/climb-reading.ts`, which picks Chess.com's or Codeforces' reading by the climb
(`src/climbs.ts`: the goal, the provider id, the identity label). A handle nobody has answers 400 with the site's
words ("not found"); an account with no rated round carries no `rating`.

Terms read 26 Sep 2026: the API help (anonymous public data, the rate limit), the terms and conditions (no
commercial use of the website's material, nothing that harms it or impacts access), the privacy policy. Codeforces
punishes plagiarism with a rating rollback and makes a round unrated when it fails. Written on the judges' page.

The sources are in the shared list: the service is redeployed from the branch before the merge, on the fingerprint
`0x3e9a147c…f0fc`.

## Goal 32 on the milestone contract: a time set at a WCA competition (D279)

Provider id `viky:provider:wca-zkfetch:v1` = `0xe8fe5b823e9946efa5da357e01825f12d71f46b4cac1bd0e27afbc182c3a88fb`, shape 1, data
`0x5ba191520000000000000000000000000000000000000000000000000000000000000020e8fe5b823e9946efa5da357e01825f12d71f46b4cac1bd0e27afbc182c3a88fb0000000000000000000000000000000000000000000000000000000000000001`.
Registered in the Safe session of goals 31 to 33 (the section "The Safe session of goals 31 to 33" below), read
back; the line is open (D281).

**The reading, in two steps** (src/wca-reading.ts): the competition's results, `api/v0/competitions/<id>/results`,
read plainly, give the person's rows in the event (by their WCA id, or by their name as they gave it when they
checked the competitors list) and the round of their best single; that row is then read attested on the person's
own list, `api/v0/persons/<wcaId>/results`, by the source `wca-person-results`, whose one pattern is built for the
account (`matchesFor`, new with this line: a source may build its patterns from an account `accepts` let through;
`matchesOf` is what the fetch and the verification both use). The pattern takes the row of that competition, event
and round in the API's own key order and captures the best single, the average and the name. Before the first day,
the competitors list (`api/v0/competitions/<id>/wcif/public`, `persons[]` with `registration.status` and
`eventIds`) stands in for the bib: checked plainly, never attested.

**The list** (`/api/wca/competitions`): `api/v0/competitions?start=<today>&sort=start_date&per_page=100&page=n`,
six pages of a hundred on 26 Sep 2026 (521 competitions, 71 countries), read at most once an hour, the ones not yet
started. The API answers 403 to a bare user agent (the founder's reading) and 200 to the named one every source of
ours sends; its `robots.txt` keeps robots out of `/search` and `/api/v0/search` only. Terms read 26 Sep 2026: the
privacy statement says competition results are not personal data; the results export's README allows re-publishing
with a notice that the results are the WCA's; the disclaimer says nothing about data. Written on the judges' page.

The source is in the shared list: the service is redeployed from the branch before the merge, on the fingerprint
`0xb54eef6d…0225`.

## Goal 31 on the milestone contract: a marathon finished, read from MikaTiming (D277)

Provider id `viky:provider:mika-timing-zkfetch:v1` = `0x5f162f6734f7ec9371fc0cfc3eff666a1c01397748a818073a2cec9b4a2708b7`, shape 1, data
`0x5ba19152000000000000000000000000000000000000000000000000000000000000001f5f162f6734f7ec9371fc0cfc3eff666a1c01397748a818073a2cec9b4a2708b70000000000000000000000000000000000000000000000000000000000000001`.
Registered in the Safe session of goals 31 to 33 (the section below), read back; `MIKA_TIMING_OPEN` (src/marathon.ts)
is true since (D281). The line is the same, "Finish a marathon": the race chosen decides the goal (`goalTypeOf`),
and a reading from one timing company never settles the other's goal.

**The reading, in two steps** (src/mika-timing.ts, src/marathon-reading.ts): the search by bib on the race's
results site, `https://<host>/<year>/?pid=search&search[start_no]=<bib>`, read plainly, whose rows carry the event's
code (`event-MAR_…`), the bib as printed and the runner's id (`idp=…`); the row taken is the exact bib in the race's
event (the search answers the lettered twin too, "3166" and "F3166"). Then the runner's own page,
`?content=detail&idp=<id>`, read attested by the source `mika-timing-runner`: the name, the bib, the net finish time
(the one every site prints; Chicago prints no gun time), and the page's `og:url`, which carries the year, so a site
still answering last year's pages (Frankfurt 2026 answered 2025's on 26 Sep 2026) is refused. The source reads four
hosts and no other (`MIKA_TIMING_HOSTS`). The name is printed "Aarak, Kim Andre (NOR)", sometimes with a title:
`mikaRunnerName` drops the nation and the title before the terms are compared.

**A MikaTiming race is added** by one row: `ref` is `<host>/<year>` as the site's own URLs print it, `startsAt` is
midnight of the day the race's own site dates it, and its one heat is the start of the event's code in the results
rows (`MAR_` at Chicago, `L_` at Frankfurt, `R` at Boston, read on their pages). Registered on 26 Sep 2026: Chicago
(11 Oct 2026), Frankfurt (25 Oct 2026), Boston (19 Apr 2027). Berlin ran on 27 Sep 2026; Tokyo's results site
answered 403. The sites' `robots.txt` say `Disallow: /` to every robot, and they answer 403 to a bare user agent:
the source names Viky and its site in its user agent (`Mozilla/5.0 (compatible; Viky/1.0; +https://viky.cash)`),
which they answer 200 to. Both written on the judges' page, the risk assumed.

**Proof (a), 26 Sep 2026, 00:56 UTC**, through the service: `ZKFETCH_WORKER_URL=<the service> pnpm exec tsx -e` with
`attestedRead("mika-timing-runner", "frankfurt.r.mikatiming.de/2025|HCH3BKLB662C9A|3166", reclaimAttestedReadDeps())`
answered "Dr. Aarak, Kim Andre (NOR)", 03:21:04, nullifier `0x58a63000…a705`.

The source is in the shared list: the service is redeployed from the branch before the merge, on the fingerprint
`0x5b5f62ae…1ea2`.

**The bib after the start.** `/api/marathon/bib` refuses a bib once the race has started, for everybody but an
operator account (`VIKY_OPERATOR_ACCOUNTS`): that door is how a test gift is run on a race already run, and it is
written on the judges' page. A bib is entered once; there is no route to change it.

**Rehearsal, proof (b)**: `NAME="Mor Fall" BIB=347 RACE=dakar-2023 pnpm exec tsx scripts/marathon-rehearse.ts`
reads the runner's page through the attested fetch exactly as production does (the service on Railway, the
attestor's signature), then runs `proveCertificate` against a fake gift, a fake state and a fake relay that print
what they would have received. Nothing moves. It needs the reading service's variables in `.env.local`.

**Proof (c), a test payment**, after goal 30 is signed and the line moved from `BUILDING` to `CONDITIONS`: an
operator account makes a gift on the Marathon de Dakar 2023 for "Mor Fall", opens it on a second operator account,
enters bib 347 (the operator door above), presses "Read my result". The gift settles on the contract with metric
77,395, and the line "FALL Mor, bib 347, 2:30:05" is what the page shows.

## Goal 29 on the milestone contract: an MIT course certificate from MITx Online (D222)

Provider id `viky:provider:mitx-online-certificate-zkfetch:v1` = `0xf5fc73bf26b45520382592188d8fd1f5fcb1c82bb6a37a53f87388790b0931c1`, shape 1, data
`0x5ba19152000000000000000000000000000000000000000000000000000000000000001df5fc73bf26b45520382592188d8fd1f5fcb1c82bb6a37a53f87388790b0931c10000000000000000000000000000000000000000000000000000000000000001`.
Registered on 26 Sep 2026 in the Safe session of goals 29 and 30 (the section below), read back with the provider id
and shape 1; the line is open (D275). The source `mitx-online-certificate` is in the shared list: the service is
redeployed from the branch before the merge, on the fingerprint `0xe62a901d…fa33`.

## Goal 28 on the milestone contract: WASSCE credits, shown from WAEC (D217)

Provider id `viky:provider:waec-result-shown:v1` = `0x43cef3dde01a0c9f2eac685a8643e99da2b676e001339e1c81ef9ea23fe6c0ee`, shape 1, data
`0x5ba19152000000000000000000000000000000000000000000000000000000000000001c43cef3dde01a0c9f2eac685a8643e99da2b676e001339e1c81ef9ea23fe6c0ee0000000000000000000000000000000000000000000000000000000000000001`.
`pnpm safe:session` batches it with the other missing goals. The line opens when our provider is registered from a
real WAEC result (docs/reclaim/waec-result-shown-provider.md) and pinned in `WAEC_PROVIDER`.

## The Safe session of every remaining goal, in one transaction (D194)

The eleven goals not yet on the chain go in **one Safe transaction**: one hash, one signature per key, two in all,
instead of eleven transactions and twenty-two signatures. It is a delegate call from the Safe to Safe's canonical
MultiSendCallOnly 1.4.1, which makes the eleven `registerGoal` calls from the Safe, in order, and reverts all of them if
one reverts. Built, read and rehearsed on 23 Sep 2026, Safe nonce 7:

| | |
|---|---|
| the library | `0x9641d764fc13c8B624c04430C7356C1C7C8102e2`, MultiSendCallOnly 1.4.1: the canonical address in safe-global/safe-deployments (`src/assets/v1.4.1/multi_send_call_only.json`, chain 143 listed as `canonical`); its code on Monad, 410 bytes, hashes to the repository's `codeHash` `0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939` |
| the calls | goals 15 to 23 on `MilestoneGift` (`registerGoal(goal, providerId, 1)`), then 6 and 4 on `GiftEscrow` (`registerGoal(goal, providerId)`), the provider ids of the sections above |
| signThis | `0x8b90a99b778fe7b46119e2eaa5443d2300879f614fe22d83edf754d5fa222d99`, equal to the Safe's own `getTransactionHash` read on Monad |
| rehearsal | the library's code run at the Safe's address (`eth_call` with a state override), so every inner call comes from the Safe: no revert, 672,256 gas for the calls alone |
| the Safe's guard slot | empty, read the same day |

The sitting, three passes as for `pnpm safe:action`, each possible on another machine:

```
SAFE_ADDRESS=0xE08D926c148A5065F4Df2892702785a183de86F9 pnpm safe:session
cast wallet sign --no-hash 0x8b90a99b778fe7b46119e2eaa5443d2300879f614fe22d83edf754d5fa222d99 --keystore <file>
cast wallet sign --no-hash 0x8b90a99b778fe7b46119e2eaa5443d2300879f614fe22d83edf754d5fa222d99 --mnemonic "<words>"
SAFE_ADDRESS=… SIGNATURES="0xfirst,0xsecond" EXECUTOR_PRIVATE_KEY=<the relayer's key> SEND=1 pnpm safe:session
```

The signed transaction is carried by the relayer's key, as every Safe transaction since 20 Sep 2026: it pays the gas
and signs nothing of the Safe's. Never by a wallet of the founder's (the hardware wallet signs nothing for Viky any
more) and never by one of the Safe's owners, whose keys sign hashes and hold no MON; the script refuses an owner as the
carrier. `EXECUTOR=<the relayer's address>` without the key rehearses the whole transaction without sending it.

**Sent on 23 Sep 2026**, signatures given by the founder, executed by the relayer `0x150d…CFE4`, which only paid the
gas:

| | |
|---|---|
| transaction | `0xe567f1783a67c98b458bd6e9533ce6ee5d457bd2fa816165cdb26cfef9e0acbc`, block 107,355,289, success, 854,232 gas |
| the hash signed | `0x8b90a99b…2d99`, read again from the chain at nonce 7 just before, unchanged |
| the Safe | nonce 7 to 8; its two events, `SafeMultiSigTransaction` and `ExecutionSuccess` |
| read back after | goals 15 to 23 on `MilestoneGift` all `registered` (`CHECK_ONLY=1 pnpm register:milestone-goals`), each with the provider id of the calldata; `goalProviders(6)` = `0x1945fcd8…a701` and `goalProviders(4)` = `0x891688d7…b790` on `GiftEscrow` |
| relayer | 13.3275 MON after, above its reserve of 12 |

The relayer's key is not in `.env.ops.local` (the variable came back empty from Vercel); it was read from `.env.local`,
whose key derives to the same relayer address.

The first pass prints the calls and the hash again from the chain as it is then: if the Safe's nonce has moved, or a
goal was registered elsewhere, the hash changes and the one above is not the one to sign. The script refuses a
library whose code is not the canonical code, a guard on the Safe, and a goal registered to something else; the last
pass recovers both signers from their signatures and rehearses the whole transaction against the chain before it is
sent. Read back afterwards: `CHECK_ONLY=1 pnpm register:milestone-goals`, and `goalProviders(6)`, `goalProviders(4)` on
`GiftEscrow`.

**Why a delegate call is accepted here, when the session of 20 Sep 2026 avoided one for three calls.** A delegate call
runs another contract's code with the Safe's own storage and authority: whoever controls that code controls the Safe
for the length of the call. On 20 Sep the cost of avoiding it was six signatures for three calls, which is little, so
the Safe ran no code but its own. Today the cost is twenty-two signatures in eleven sittings of the same two keys, each
one a chance to sign the wrong hash, against one. What makes the risk small enough to take:

- the code is Safe's own library, at the address its deployments repository publishes for this chain, and the code
  there is checked byte for byte (its hash) before anything is built, by the script, every time;
- MultiSendCallOnly is the variant that refuses a delegate call inside the batch: each of the eleven is a plain call
  from the Safe, and the library itself holds no storage and no owner, so there is nothing in it anybody can change;
- the library's address is a constant in `src/safe.ts`, and `safeMultiSendCallOnly` is the one function in the code
  that builds a delegate call, with no target to pass; `test/safe-session.test.ts` pins the target, the operation,
  the eleven calls and the hash;
- the batch is atomic, so a failure leaves the Safe exactly where it was, and it was rehearsed from the Safe's address
  before being written here.

What is not accepted: a delegate call to anything else, a batch holding anything but these registrations, or one built
by a tool that does not check the library's code. The eleven hashes one by one remain the fallback: `pnpm safe:action`
with `ACTION=raw`, `NONCE=7` to `17`, in the order of the table below, each sent once the previous is final.

| nonce | contract | goal | line |
|---|---|---|---|
| 7 | `MilestoneGift` | 15 | the year passed at a university, shown (D174) |
| 8 | `MilestoneGift` | 16 | a grade reached at a university, shown (D174) |
| 9 | `MilestoneGift` | 17 | a Cambridge English result, shown (D176) |
| 10 | `MilestoneGift` | 18 | an IELTS band, shown (D176) |
| 11 | `MilestoneGift` | 19 | the baccalauréat passed, Morocco (D176) |
| 12 | `MilestoneGift` | 20 | the baccalauréat passed, Cameroon (D176) |
| 13 | `MilestoneGift` | 21 | the baccalauréat passed, France (D176) |
| 14 | `MilestoneGift` | 22 | a Udemy course finished, shown (D178) |
| 15 | `MilestoneGift` | 23 | an average at school, shown from EcoleDirecte (D179) |
| 16 | `GiftEscrow` | 6 | Fitbit, connected by the person (D188) |
| 17 | `GiftEscrow` | 4 | Strava, connected by the person (D191) |

A goal signed opens nothing by itself: a line opens when its path is complete, which for the lines above still waits
for a provider registered on the Reclaim dashboard from its definition in `docs/reclaim/`, the founder's own step
there (a dashboard session is needed, which no key of the project holds).

## The goals of the milestone contract, and the session that registers them

A goal on `MilestoneGift` is three things: a number, the provider id every proof for it must carry, and the shape it
is judged by. `src/milestone-goals.ts` is the whole list, and the founder registers what is missing in one session,
as the owner, after the handover of `GiftEscrow`.

| goal | source | shape | state |
|---|---|---|---|
| 1 to 4 | Chess.com, rapid, blitz, bullet, daily | climb | registered at deployment, 17 Sep 2026 |
| 5 | Duolingo English Test, the overall score | having it or not | to register; the screens are built (U3), and the condition goes live the day it is registered (D109) |
| 6 to 9 | Lichess, bullet, blitz, rapid, classical | climb | registered (read back on 23 Sep 2026), without effect: no condition reads them, Lichess was withdrawn as a twin of Chess.com (D170) |
| 10 to 13 | Coursera, Credly, Chess.com puzzles, ETS | see their rows | registered through the Safe, 20 and 23 Sep 2026 (the two sections above) |
| 14 | a university's student portal, enrolled and shown (D165) | having it or not | registered 23 Sep 2026 through the Safe (the row above); the condition stays "Being built" until a portal has been proved with a student present |
| 15 | a university's student portal, the year passed and shown (D174) | having it or not | registered 23 Sep 2026 in the one Safe session (tx `0xe567f178…acbc`, the section "The Safe session of every remaining goal" above); "Being built" until a results page has been proved with a student present |
| 16 | a university's student portal, a grade reached and shown, in hundredths (D174) | having it or not | registered 23 Sep 2026 in the one Safe session (tx `0xe567f178…acbc`, the section "The Safe session of every remaining goal" above); "Being built" likewise |
| 17 to 21 | the examination results shown from the person's own account: Cambridge English, IELTS, the baccalauréat in Morocco, Cameroon and France (D176) | having it or not | registered 23 Sep 2026 in the one Safe session (tx `0xe567f178…acbc`, the section "The Safe session of every remaining goal" above); each line waits for a provider of ours registered from a real candidate's session |
| 22 | a Udemy course finished, shown from the person's own account (D178) | having it or not | registered 23 Sep 2026 in the one Safe session (tx `0xe567f178…acbc`, the section "The Safe session of every remaining goal" above); waits for a provider of ours registered from a real Udemy account |
| 23 | an average at school, shown from the pupil's own EcoleDirecte account, in hundredths (D179) | having it or not | registered 23 Sep 2026 in the one Safe session (tx `0xe567f178…acbc`, the section "The Safe session of every remaining goal" above); waits for a provider of ours registered from a real EcoleDirecte account |

The daily contract has its own goals, under `GiftEscrow`'s two-argument `registerGoal(goalType, providerId)`:

| goal | source | state |
|---|---|---|
| 1 | Duolingo, the experience total | registered at deployment |
| 5 | Duolingo, one course's experience | registered 18 Sep 2026 (the section "Before the course reading of U1") |
| 2 | GitHub, the contributions GitHub counts (D166) | registered 23 Sep 2026 through the Safe (the section "Goal 2 on the daily contract" below), without effect: the condition was withdrawn (D170) and nothing reads the goal |
| 6 | Fitbit, connected by the person, the day's verdict (D188) | registered 23 Sep 2026 in the one Safe session (tx `0xe567f178…acbc`, the section "The Safe session of every remaining goal" above) |
| 4 | Strava, connected by the person, the day's verdict (D191) | registered 23 Sep 2026 in the one Safe session (tx `0xe567f178…acbc`, the section "The Safe session of every remaining goal" above) |

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
| not read back | 23 Sep 2026, about 08:40 UTC | checking the signed-in page changes after the RPC fallback (D192): Home, Gifts, You |
| `0x3209e0492873b0b599DB1f9d8b7b226628b42154` | 23 Sep 2026, about 14:40 UTC | cold signed-in loads of Home, Gifts and You, looking for the double load (D196) |

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

## The last refund of a closed gift, and gift 1's 2.857148 AUSD (D186)

The settling pass skipped every gift already finalised or taken back (`src/daily-pass.ts`), so a refund made owed by
the finalisation itself was never sent. Gift 1, on the earlier contract `0xE04CD59bB93765333200a9da01df83149D4C4d67`,
read on 23 Sep 2026: finalised, `refundable` 17.142858, `refundedToFunder` 14.28571, 2.857148 AUSD owed to its funder
`0x350aF869ABa6ff26AB33517ECd3E38ACaF107761`, and the contract holding exactly 2.857148 AUSD.

The pass now sends what a closed gift still owes (`stillOwedToFunder`), on the settling pass only. The one owed today
was sent by hand the same day, through the relayer, with `refundUnearned(1)`: anybody may call it, and the money can
only go to the gift's `refundTo`.

| | before | after |
|---|---|---|
| block | 107,259,958 | 107,260,043 |
| gift 1 `refundedToFunder` | 14.28571 | 17.142858 |
| owed to the funder | 2.857148 | 0 |
| AUSD held by `0xE04CD59…4C4d67` | 2.857148 | 0 |
| relayer MON | 13.4332984 | 13.4146579 |

Transaction `0xf6303ef4ff27d7c06bc15bbeb0e139f4f7ec4bd874d448382ce3411236aaf9c1`, block 107,260,037, 182,750 gas,
status success, recorded in `viky_relayed`. Gifts 2 and 3, on `GiftEscrow`, owe nothing to their funder on the same
reading; the 1.571432 AUSD that contract holds is not owed to a funder.

## The Safe session of goals 24 to 28 (D218)

**Sent on 24 Sep 2026**, signatures given by the founder (the encrypted file `0x19d4…b794` and the second phrase on
paper `0xED4c…67B3`), carried by the relayer `0x150d…CFE4`, which only paid the gas:

| | |
|---|---|
| transaction | `0x291b3274fc7a2aa946a85d70fae3666c2d7f13b2561d4620f41a5cbb0f09e25b`, block 107,477,350, success, 486,112 gas |
| the hash signed | `0xf0ac66bf5d34cd1f8b0ff859c63b3c937434d3998e87223f008f1fe99638bbc6`, equal to the Safe's own `getTransactionHash` at nonce 8 |
| the Safe | nonce 8 to 9 |
| read back after | goals 24 to 28 on `MilestoneGift`, each with the provider id of `MILESTONE_GOALS` and shape 1 |
| relayer | 53.27 MON after |

`SAFE_ADDRESS` is not in `.env.local`; the command takes it from the Safe's table above.

## The phone way out: what the founder sets (D238)

Viky buys a phone top-up, credit or data, or a gift card for the person, on Bitrefill, with the AUSD the person sends
it. The three cards are offered to everybody since their code was complete (the founder, 26 Sep 2026): until the three
items below exist, a price refuses "not open yet" and nothing is taken; a treasury that cannot pay refuses the same
way; a failure after the money arrived refunds it. The judges' page counts how many times each was used.

**1. A Bitrefill account and its Personal API key.** Sign up on bitrefill.com, verify the email (a basic account:
five phone items a day, 200 USD a refill, 500 USD a day, 2,000 USD a month, terms section 8, which are the pilot's
ceilings for everybody together), then Account > Developers > generate a key. From this repository's folder:

```
vercel env add BITREFILL_API_KEY production
```

It asks for the value without echoing it, and a production variable is sensitive by default (Vercel CLI 54). The
Business API, if Bitrefill grants it, is `BITREFILL_API_ID` and `BITREFILL_API_SECRET` instead; nothing else changes.

**2. The treasury key**, one key for one address that receives the person's AUSD on Monad and pays Bitrefill in USDC
on Base; distinct from the relayer. Generated in the founder's own terminal, kept in an encrypted file, posted to
Vercel without ever being printed:

```
cast wallet new ~/viky-keys viky-treasury --password
cast wallet private-key --keystore ~/viky-keys/viky-treasury | grep -o '0x[0-9a-fA-F]\{64\}' | tr -d '\n' | vercel env add TREASURY_PRIVATE_KEY production
```

The first line asks for a password and prints the address, the only thing shared. The second asks for the same
password and passes the key straight to Vercel: the `grep` keeps the 64 hexadecimal figures of the key whatever words
`cast` prints around them, so nothing else reaches the variable. Not tried on this machine (generating even a throwaway
key was declined here): check after that `vercel env ls` lists `TREASURY_PRIVATE_KEY`. The address also goes to Vercel, as `TREASURY_ADDRESS` (not secret).
The file `~/viky-keys/viky-treasury` and its password are the only copy outside Vercel, whose sensitive values cannot
be read back: keep both.

**2 bis. The Bitrefill account delivers codes unsealed (D271, gift cards).** Bitrefill's terms (section 2) deliver a
product sealed by default, "a right to claim a Product at a later stage", and let the customer change it on the account.
A gift card's code reaches the person only once Bitrefill returns it, so the account's delivery setting is set to
unsealed on bitrefill.com. Unverified: whether the API returns a sealed product's code at all.

**3. The first funding of the treasury**, from the founder's own funds: USDC on Base for the invoices, and a little ETH on
Base for their fees. No MON: on Monad the treasury only signs, and the relayer carries its refunds (src/phone-treasury.ts).

**Reconciliation.** `viky_phone_orders` (created by `pnpm db:migrate`) holds one row per order: the AUSD received on
Monad, the invoice paid on Base, or the refund. Money the treasury holds for somebody is every row still `received`,
`paid` or `failed` (`unsettledOrders`).

## The directory's portals, written to production (D267)

Five rows from `src/directory-portals.ts`: Rome, and four that prove a student account. Two commands, with the
operator command of "The test database" (`VIKY_ALLOW_PRODUCTION_DATABASE=1` and the production `DATABASE_URL`):

```
pnpm db:migrate
PROVEN_BY=0x…<the operator account> DRY_RUN=1 pnpm portal:directory
PROVEN_BY=0x…<the operator account> pnpm portal:directory
```

The migration adds `proves` to `viky_portals` (a row written before it reads as enrolment). The second line prints the
five rows and writes nothing; the third writes them, each read back as the chooser would list it.

**Run on 26 Sep 2026** from this clone, with `DATABASE_URL` taken from `../Viky/.env.ops.local` into the command's own
environment and never printed, and `PROVEN_BY=0x350aF869ABa6ff26AB33517ECd3E38ACaF107761`: the migration added `proves`
and `viky_phone_orders`; the five rows read back; `https://viky.cash/api/portals` lists the five, names alone, and
`portalsListedAndRead` answers 5 listed, 0 read.
