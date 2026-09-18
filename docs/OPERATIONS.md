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

## What the Chess.com rehearsal is waiting for

`/api/conditions` offers a condition that is wired and not live yet to an account on `VIKY_OPERATOR_ACCOUNTS`, and to
nobody else. That is how the first real gift on a new condition gets made.

Measured on 18 Sep 2026: the list in production holds two accounts, `0x350aF8…` and `0x91C964…`, and the founder's
own account `0xb12e0C72209Bd4BECFDaFA96a8F3e7eBc93b8376` is not one of them. So the route answers him correctly and
still shows no Chess.com: it is a line of configuration, not a defect, and the session fix of the same day does not
change it.

To open the rehearsal, add that account to the list and redeploy production, then read it back:

```
npx vercel@latest env rm VIKY_OPERATOR_ACCOUNTS production --yes
npx vercel@latest env add VIKY_OPERATOR_ACCOUNTS production --value "0x350aF8…,0x91C964…,0xb12e0C72209Bd4BECFDaFA96a8F3e7eBc93b8376" --yes
```

Two things to know before running it. Removing a variable removes it for every environment it names, so pull the
current value first and put the whole list back in one go. And this list is the same one that opens the dev pages
(`VIKY_DEV_PAGES`), one of which moves the relayer's MON: adding an account gives it those pages too.

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
