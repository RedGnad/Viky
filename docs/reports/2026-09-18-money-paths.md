# The money paths, audited on the running product, 18 Sep 2026

What this is: every path money takes in Viky, checked against what is actually deployed and actually recorded, on
Monad mainnet and in the production database. Nothing here was fixed while auditing, on purpose: the gaps are listed
with what would close each one, and the founder decides what is worth doing. The one exception is the ownership gap in
section 3, which was closed the same day because a key we hold could have changed a contract holding somebody's money.

Every figure below was read on 18 Sep 2026. The commands are ordinary reads anybody can repeat: `cast call` against
`https://rpc.monad.xyz`, and `SELECT` against the production database.

## 1. The production schema against the migrations

The schema the code creates was built from scratch in an empty database (`ensureProofSessionSchema`, `ensureGiftSchema`,
`ensureMilestoneSchema`, `ensureExitSchema`, `ensureSendsSchema`, `ensurePreferencesSchema`, `ensurePushSchema`,
`ensurePassSchema`) and compared, table by table and column by column, with `information_schema` in production.

**No drift.** Thirteen tables, and not one column in production that the migrations do not create, nor one the
migrations create that production lacks: `viky_accounts`, `viky_creations`, `viky_days`, `viky_exits`, `viky_gifts`,
`viky_milestone_gifts`, `viky_milestone_readings`, `viky_passes`, `viky_proof_sessions`, `viky_push`, `viky_relayed`,
`viky_sends`, `viky_told`.

Rows at the time of reading: 3 gifts, 9 days, 25 relayed transactions, 27 proof sessions, 2 exits, 1 creation,
5 accounts, 1 pass, 1 push subscription, and nothing yet in the milestone tables.

## 2. Each contract against its real target

| contract | address | token | evidence signer | owner | next id | paused |
|---|---|---|---|---|---|---|
| `GiftEscrow`, current | `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233` | AUSD | `0x85702Eaaa6B8694A61a6FbBff2634FCd7E644d9a` | the founder | 4 | no, no |
| `GiftEscrow`, earlier (D30) | `0xE04CD59bB93765333200a9da01df83149D4C4d67` | AUSD | the same | the founder (section 3) | 2 | no, no |
| `MilestoneGift` | `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e` | AUSD | the same | the founder | 1,000,000 | no, no |
| `ExitRouter` | `0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223` | AUSD | not applicable | the founder | not applicable | not applicable |

The token is `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` on all four, with `decimals() = 6`, which is the AUSD every
screen counts in. `MilestoneGift.nextGiftId` is still 1,000,000: **no milestone gift exists yet**, so the Chess.com
rehearsal has not happened.

The router's pinned exchange still forwards where it was pinned, which is the one thing that stops an exit from calling
a contract nobody looked at (D55): `allowedExchanges(0xb3e6778480b2E488385E8205eA05E20060B813cb) = true`,
`mustPointAt(...) = 0x2f84FB8982073f39Ba47c7fcC29119aF074AbbcB`, and that exchange's own `getRouter()` answers exactly
that address today. `payoutGas` is 100,000, inside the contract's own 30,000 to 1,000,000 bounds.

## 3. Who owns what, and the gap that was closed

Three of the four contracts were already owned by the founder's wallet
(`0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64`). The earlier gift contract was not: its owner was still the deployment
key `0xe14cED34373E4dff9650232D32961654312C9834`, which could have registered a goal, replaced the evidence signer or
paused it, on a contract holding 8.571432 AUSD of the first gift.

Closed the same day: `transferOwnership` in `0xe6f5b531d9c6dd981b72f2be7dc7e2e2d0adca071e59fd78e532dae804043840`,
block 105,773,867. Read back after, all four answer `owner() = 0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64`, and the
contract still holds the same 8.571432 AUSD, because handing ownership over moves no money.

## 4. What each contract owes against what it holds

Each gift was read from the chain with the app's own reader and compared with its record.

| gift | contract | amount, record and chain | days | credited | earned | refundable | withdrawn | refunded |
|---|---|---|---|---|---|---|---|---|
| 1 | earlier | 20.000000 = 20.000000 | 7 = 7 | 1 | 0 | 2.857142 | 2.857142 | 8.571426 |
| 2 | current | 1.000000 = 1.000000 | 7 = 7 | 1 | 0.142857 | 0 | 0 | 0.428571 |
| 3 | current | 5.000000 = 5.000000 | 7 = 7 | 0 | 0 | 0 | 0 | 0 |

Every record agrees with the chain on the amount, the length and the goal type. Both contracts hold more than they
owe: the earlier one owes 2.857142 and holds 8.571432; the current one owes 0.142857 and holds 5.571429. The surplus
is the part of each gift that is neither earned nor refundable yet, which is exactly what an unfinished gift should
look like.

## 5. The seam: a gift is recorded, then its money moves, then the gift is recorded again (D87)

The order is deliberate: `viky_creations` gets a row keyed by the authorization's nonce **before** anything is
relayed, the relay submits, its transaction hash is written the moment it is submitted, and only then is the gift
recorded in `viky_gifts`. What can be true at any moment, and what happens next:

| state | what it means | who resolves it |
|---|---|---|
| pending, no transaction, under 2 minutes | an attempt is under way | the attempt itself |
| pending with a transaction | the money moved, the gift is not recorded | a retry of the same terms, or the keeper's pass, which reads the transaction back and records the gift |
| pending, no transaction, past an hour, nonce unspent | the money never moved | the keeper abandons the row |
| pending, no transaction, nonce **spent** | the money moved and no transaction was recorded | nobody: the pass writes "needs an operator" and stops there |
| complete | the gift exists and is recorded | nothing left |

Measured in production: one row, `0x7fd26be5…`, `abandoned`, no transaction, from the 17 Sep check of this very path.
**No pending creation exists**, and none has ever needed an operator.

The same shape exists for milestone gifts (`completePendingMilestoneCreations`), and it has never run on a real gift,
because no milestone gift exists yet.

## 6. The gaps, listed and not fixed

**a. A refusal that is not ours leaves no trace in the pass log.** The keeper counts a reading as attempted, as
succeeded when a day is credited or an account bound, and as held when the refusal is one of ours to fix. A refusal
that is neither, the contract answering `NothingToCredit` for instance, increments nothing and is written nowhere but
the run's own log lines. Measured: the counting pass of 18 Sep 00:40 UTC recorded 3 attempted, 0 succeeded, 0 errors,
0 held, which reads as a silent morning and was in fact three readings the contract refused for a good reason. What
would close it: a fourth counter, or a row per reading, in the table U2 created.

**b. The account and the course are ours to keep, not the terms'.** What a gift counts is a goal type and a target,
both signed by the funder and both on the chain. Which Duolingo account, and since U1 which course, live in our
database. From the first reading the contract pins an identity (the person, and since U1 the person and the course
together) and refuses anything else, so the window where our record alone decides is between the signature and that
first reading. What would close it: carrying a hash of the account and the course in the terms the funder signs.

**c. The evidence signer can do two things nobody else can.** Whoever holds that key can attest a reading and can
open a gift nobody has opened. It cannot move money anywhere else: money leaves a gift only to the recipient's own
signed request, or to the refund address the funder signed. This is written on the judges page. What would close it:
an enclave, which is U4.

**d. The relayer is the only sender.** Every contract call is submitted by one key, which pays the gas. If it is
empty or lost, nothing settles, nothing expires, nothing is refunded, and no money is at risk; the reserve rule (stay
above 10 MON) is what keeps that from happening quietly.

**e. A signed exit that was never sent stays listed as signed.** One exists, from 16 Sep 02:53 UTC, whose deadline
passed 47 hours before this audit. It is harmless, and the code says why: the contract refuses terms whose deadline
has passed, and the token's own authorization window closed with it. The row is simply never moved to a state that
says so. What would close it: marking a row stale when its deadline passes, which is cosmetic.

**f. Gift 3 is bound and has counted nothing.** 5 AUSD, connected on 15 Sep, no day credited. If it stays that way,
the whole amount goes back to the funder at the end, which is the product working. It is listed here because 5 AUSD
of somebody's money is sitting in a contract on a gift nobody is earning.

**g. One Duolingo account carries all three gifts.** All three are bound to `RedGnad`, the founder's own. Nothing is
wrong with it in a pilot; it means no gift has yet been earned by somebody who is not us.
