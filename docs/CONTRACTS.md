# Contracts

The contracts Viky runs on Monad mainnet, what each does, what its owner can and cannot do, and what the reviews
found. The short table of the ones in service is in the [README](../README.md).

Three kinds of contract hold or move money, and none can be upgraded. On the two kinds that hold gifts, no function of
the owner moves a gift's money: the owner registers a goal, replaces the evidence signer, or pauses.

`contracts/GiftEscrow.sol` holds a gift for a habit, a day at a time: creation and funding in one transaction through
the funder's EIP-3009 authorization, the claim by the recipient's account, daily check-ins attested by the evidence
signer, the draining of a missed day once its catch-up window of 30 hours has passed, the withdrawal of what is earned
and the refund of what is not. A gift nobody opens within 14 days goes back whole.

`contracts/MilestoneGift.sol` holds a gift for one thing, with a deadline: all of it becomes the recipient's the first
time an attested reading shows it reached, or all of it goes back. It has two shapes. A climb, for something measured
that moves (a rating): the first reading is recorded as the start, and the gift pays only if that start was at or below
the highest the funder accepted. Something had or not, for something granted once with a date (a certificate, an
enrolment, a race): it pays when the day it was granted falls between the funding and the deadline, and what was
granted in time may still be shown for 14 days after.

`contracts/ExitRouter.sol` is the way out: it turns what a gift earned into the coin a payout service takes, through
an exchange its owner has allowed, in one transaction the relayer submits. One signature says everything, because its
nonce is the hash of the terms. The exchanged coin goes to the person, never to a payout service. The contract holds
nothing between two transactions; its owner allows or removes an exchange, and can return what an exchange might leave
behind (`sweep`). A second copy of it, deployed on 3 Oct 2026 and set on USDC, is the converter of card payments: the
card service delivers USDC to the funder's own account, and the converter changes it into AUSD on one signature. It ran
with real amounts that day, in `0x533ec0746493e0670029b917887b8e15376380a4a9c7bb82706b2de910ed1616`: 7.914524 AUSD
reached the funder's account.

| Contract | On Monad mainnet (chain 143) |
|---|---|
| `GiftEscrowV3`, where a daily gift is made since 3 Oct 2026 | `0x591d76863177E70FfcA2C793212d4715A367Ec70` |
| `GiftEscrowV2`, where a daily gift was made on 2 and 3 Oct 2026, which runs the gifts it holds | `0xC83d8028347967Fc84D0e36Ae5876d9b29EAEc51` |
| `MilestoneGiftV2`, where a milestone gift is made since 2 Oct 2026 | `0x493c87A27E637bBc7179C17bE2B215fC18523CC0` |
| `ConsentAnchor` | `0x2a15DF23fF62120700f14D1E5d5d56CA0dAd027e` |
| `GiftEscrow`, closed to new gifts, which runs the gifts it holds | `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233` |
| `GiftEscrow`, the earlier deployment, closed to new gifts, which runs the gifts it holds | `0xE04CD59bB93765333200a9da01df83149D4C4d67` |
| `MilestoneGift`, closed to new gifts, which runs the gifts it holds | `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e` |
| `ExitRouter` | `0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223` |
| `ExitRouter`, a second copy set on USDC: the converter of card payments | `0xf05449c8b868Ce1e6a0D7223e2ceCbbfD1498F9c` |
| Owner of the nine, a Safe 1.4.1 that signs with 2 of its 3 keys | `0xE08D926c148A5065F4Df2892702785a183de86F9` |
| AUSD | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` |

`cast call <contract> "owner()(address)" --rpc-url https://rpc.monad.xyz` answers the Safe for each of the nine.

The source of each of the nine is verified on MonadVision, the explorer, through its Sourcify instance:
`https://sourcify-api-monad.blockvision.org/v2/contract/143/<address>` answers `"match":"exact_match"` for each of the nine contracts
(read on 5 Oct 2026). That instance is the one Monad's documentation names for verification; sourcify.dev's own
server does not hold them. Each address opens on the explorer at `https://monadvision.com/address/<address>`.

`contracts/verifiers` is not deployed. It holds the direct verifiers ported from Lock-in with their real-proof tests,
kept fail-closed (`LIVE_SCHEMA_CONFIRMED = false`). The path in production is the evidence signer ([Verification path](VERIFICATION.md)).

`contracts/GiftEscrowV2.sol`, `contracts/MilestoneGiftV2.sol` and `contracts/ConsentAnchor.sol` were deployed on
2 Oct 2026 at the addresses above, their sources verified on MonadVision through its Sourcify instance, and handed to
the Safe the same day. A gift
made since then is made on them; the three contracts of the first version were closed to new gifts that day and run
the gifts they hold to the end. Whether a gift has run on the second version yet is counted on the judges page, from
the index: nothing here says it works before one has, end to end. What has run on the second milestone contract, with
real amounts: gift 1000006, 8.98 AUSD between two people who are not the author, created on 5 Oct 2026, opened on
7 Oct, and paid in full the same day on a proof shown from a university's portal
(`0x9c5508e83b0dd20668bb6a8c683faa047820734d6938387f8b6f516c3467c4fd`); on 7 Oct 2026 its money had not been taken
out. They are the second version of the two gift
contracts, from the audit of 1 Oct 2026. Opening a gift takes the signature of a key made from the secret its link carries, whose address
is in the terms the funder signed, so the evidence signer opens nothing (on the contracts above, that one key could
open an unopened gift and prove it). The person a gift is for can end it: what was counted stays theirs and the rest
goes back in the same transaction. The owner is bounded: ownership moves in two steps and cannot be given up, a new
evidence signer stands a day after it is announced, a goal is added and never changed, and a pause ends by itself
after seven days and holds the open days rather than taking them. `ConsentAnchor` holds no money: it records which
consent key an account agrees with, bound by the account's own signature, and every yes and stop in order.

`contracts/GiftEscrowV3.sol` is the third version of the daily contract. It was deployed on 3 Oct 2026 at the address
above, its source verified the same way, and handed to the Safe the same evening. It is the second version with
one rule changed: a day is paid the day it is read. On the second version a reading judged only days that were over,
so a lesson was paid the morning after. Here the first day is the day the account is connected, and a reading credits
the open days up to its own day, the oldest first, and never a day that has not begun. A cumulative figure cannot say
when the progress was made: a lesson taken after its day was paid is counted by the first reading of the next day. So
one lesson never pays two days, no more days are paid than lessons were taken, and a day can be paid on which no
lesson was taken. The change was read by an independent reviewer on 3 Oct 2026 before the deployment, and the
correction that reading asked for (which day is the first when an account is connected across midnight) is in the
deployed code. A daily gift made since is made there, numbered from 1000; a gift made on the second version stays
there, under its rule.

What has run on it, with real amounts: gift 1000, made by the author between two of his own accounts on 3 Oct 2026.
Its first day was paid on 4 Oct at 03:23 UTC, the day its lesson was read (the reading is dated 03:22), and it was
ended from the recipient's account at 03:44 UTC: 0.187 AUSD went to that account, the 29 days neither counted nor
missed went back to the funder (5.423 AUSD), and the contract holds nothing. Its six transactions are listed in the
[README](../README.md#what-has-run-with-real-money).
`cast call 0x591d76863177E70FfcA2C793212d4715A367Ec70 "nextGiftId()(uint256)" --rpc-url https://rpc.monad.xyz` answers
1001 while that gift is the only one. What has not run on it yet: a missed day going back, and a gift reaching its
last day.

An independent review of 2 Oct 2026 was read before any deployment, and the contracts were corrected from it. A
pause cannot be sent again while it runs, nor for seven days after it ended, so it cannot hold a funder's unearned
money or stop the clock of missed days. On the milestone contract a pause sent after a window closed reopens
nothing, a window that was open has after the pause the time it had left, and a climb whose deadline fell inside a
pause is judged on a reading taken until the pause ended. The first reading of a gift, which binds an identity for
good, is signed by the recipient's own account beside the evidence signer. And a signer announced before ownership
changes hands never stands after it. The reviewer's own tests are in `test/review`: those that proved a defect are
kept, each with a test that requires it to fail now. What the review left as declared, not corrected: once a gift is
under way, the evidence signer alone can still attest a reading that never happened, in the recipient's favour or
against them.

The same review found that the link's secret was in `?t=`, so the server was sent it at every visit, and the key that
opens a gift is made from that secret alone. The secret is now after the `#` of the link, which a browser sends to no
server; `?t=` carries a preview token made from it by a hash, enough to print the two names and no use to open the
gift, and a secret that reaches the server all the same is refused. The limit that stays: the page that reads the `#`
is served by Viky, and a server that served other code could read it there.

The server side of the anchor is written too, and off until the anchor's address is set: the browser signs the short
anchored message with the consent key it already holds, in the same gesture as the agreement, and the relayer writes
it (`src/consent-anchoring.ts`). `pnpm verify:consent` then holds every reading that moved money on the second
version against a yes anchored before it, checking each Ed25519 signature itself; it needs a Monad RPC and nothing
else. Both have run on a local fork of mainnet (`pnpm rehearse:v2`) and never on mainnet.

`forge test --network monad` runs the unit suites, the accounting fuzz, the invariant campaigns of the second version
and the typehash parity pins; with `MONAD_RPC_URL` set it also runs the mainnet fork tests against the real AUSD. `pnpm deploy:gift-escrow` deploys
and `pnpm check:gift-escrow` verifies a deployment against the expected configuration.
