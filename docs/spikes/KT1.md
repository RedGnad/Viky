# KT1, the first chain end to end on Monad mainnet

> Kill test 1 of `docs/SPEC.md` section 12: fiat to AUSD to escrow to recipient to card or bank, once,
> mainnet, small amounts. Nothing in this repository is called working until this page holds a
> transaction hash for every on-chain leg. Amounts are small on purpose; every fee is recorded.

Status: IN PROGRESS. Preconditions met on 10 Sep 2026. On 11 Sep 2026 the test was split (D22): the
on-chain core runs first with MON sent from the funder's own wallet (legs 1b to 9, then 10b, 11, 12);
the fiat legs (1a, 10a) run on the rail Viky intends to ship, once that rail exists. This page is the
protocol and the record; the fields are filled in as the chain runs.

## Preconditions (`pnpm spike:preflight` must print only `ok` lines)

| item | value |
|---|---|
| deployed `GiftEscrow` | `0xE04CD59bB93765333200a9da01df83149D4C4d67`, deployment tx `0x338c6ebe35a2c0dc45be43494bd96b8dfa73a73f3927d2f56fb4cd7460267d85`, code hash `0x170626ea03b8d0f880ae63be5c41de8f5067c5ef4f68f2970a8564e5b1a6579f`, deployed 10 Sep 2026 by the owner key `0xe14cED34373E4dff9650232D32961654312C9834` (deploy gas estimate 3,154,382 at 102 gwei) |
| post-deploy transactions | `registerGoal(1, keccak("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8"))` `0x84ac70f066eb947e979f0c6dbcf6b2fa583c6e4f917903ee317c4292c755cae7`; `setCreationPaused(false)` `0xaabf9529e62ee6d0daaa24ef339587f503454d187e89d621597e48e2373f576a`; `setCheckInPaused(false)` `0x174fd43a1714f0a7799d5d65debc195095e269c0c9ffc4154b9c442fda34cf62`; `registerGoal(1, keccak("viky:provider:duolingo-public-zkfetch:v1"))` on 11 Sep 2026 (D27, public mode) `0x768ae8c9a9834ae647cb7207ae150bdfcefa9b488c3537be4723192fa46f6c71`, block 103,779,484 |
| source verification | Sourcify (Monad endpoint `sourcify-api-monad.blockvision.org`), runtime match `exact_match`, match id 1745123, verified 10 Sep 2026 15:16 UTC |
| `pnpm check:gift-escrow` | all `ok`: chain 143, token AUSD, evidence signer `0x85702Eaaa6B8694A61a6FbBff2634FCd7E644d9a`, Duolingo goal registered (`0x00ccb800c6854f7f4a1d3d5f2cef2ab187afdc5dd61336eabcd1c5cd9006134b`), creation and check-in open, domain `Viky Gift` v1 chain 143, owner `0xe14cED34373E4dff9650232D32961654312C9834`, 0 gifts |
| relayer | `0x150d3066F615FC012a40E7779dB748D53F7CCFE4`, 15 MON before the first leg |
| evidence signer | `0x85702Eaaa6B8694A61a6FbBff2634FCd7E644d9a` (holds no funds) |
| Reclaim app | configured (id not recorded here); `ReclaimProofRequest.init` for provider `cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8` returned a `portal.reclaimprotocol.org` request URL on 10 Sep 2026 |
| database | Neon (Frankfurt, free plan) provisioned through the Vercel marketplace on 10 Sep 2026; `pnpm db:migrate` created `viky_proof_sessions`, `viky_gifts`, `viky_relayed` |
| `pnpm spike:preflight` | 16 `ok` lines, no `FAIL`, 10 Sep 2026 |
| corrected `GiftEscrow` (D30, D35) | `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233`, deployment tx `0x3b7f0619421e2bc3e9a57774bca9018be13d44b812a700b839ba80abe0def4bd`, code hash `0xee67c892c3e571a7d070c3af863f6a165c49f4ebbd92ba459eba5b3c9b6c787a`, deployed 11 Sep 2026 18:45 UTC with `firstGiftId = 2` read from the contract it replaces. Post-deploy: `registerGoal(1, keccak("viky:provider:duolingo-public-zkfetch:v1"))` `0xc79c4f961a8951d988d63a688bd1fd5c3e599bdc23361a7ee37e70b56a676017`; `setCreationPaused(false)` `0x8bcb01fc8a0211fab040998154346c3fd7dd3ef1574481136643cd09044befc2`; `setCheckInPaused(false)` `0x73007fb9fd502197a09300843083ff4cf6552d93832d48772fe64d1f13838313`. Sourcify runtime match `exact_match`, match id 1768534. On chain: `CATCH_UP_WINDOW` 108000 s, `READING_GRACE` 21600 s, `nextGiftId` 2. **This chain (gift 1) keeps running on the contract above it**; gift 2 onwards is created here |
| preview hostname | `viky-two.vercel.app` (throwaway; every passkey created there is throwaway) |

## Legs

| # | leg | who | what to record | result |
|---|---|---|---|---|
| 1a | Fiat in, on the intended rail (Calm bank transfer paying AUSD, or a Mercuryo partner widget with the destination pre-filled). Fallback record only: Mercuryo consumer Buy, 30 EUR (25 EUR minimum, D20), destination pasted by hand | user | order id, EUR paid, MON or AUSD received, fee, time to arrival, KYC steps | pending the rail (D22) |
| 1b | Crypto-native entry: MON sent from a wallet the funder controls to the funder's Viky account (SPEC 9.1, "AUSD held on Monad" family) | user | tx hash, MON received, time to arrival | 1,500.00 MON received by `0x350aF869ABa6ff26AB33517ECd3E38ACaF107761` at 00:16:32 UTC on 11 Sep 2026 (balance polled every 30 s, previous poll 0); tx hash to add from the funder's wallet |
| 2 | Swap all MON to AUSD through Kuru Flow, from the funder's account (`/dev/fund`) | user taps, agent watches | tx hash, MON in, AUSD out, slippage, gas used vs limit | tx `0x2a60357b317a82593bcb9fcc24a6aa8fdce4bde6f9c5789878b8cb5a8c183c9b`, block 103,753,896, 11 Sep 2026 00:29 UTC; 1499.8 MON in, 34.936717 AUSD out (Kuru quote expected $34.95, minimum $34.90; 0.02329 AUSD per MON); gas used 721,452 of 721452 declared at 102 gwei (0.0736 MON, about $0.002); quote to finality in 2 s on the page log; 0.1264 MON left on the account; one passkey session, no extra prompt |
| 3 | `createGift` with the funder's single EIP-3009 signature (`/dev/fund`); $20.00 over 7 days at 10 XP per day, so that the exit leg can sell more than Mercuryo's 3 EUR flat fee (D20) | user taps | tx hash, gift id, amount, daily target, duration, gas used vs limit, seconds to "Funded" | gift id 1, tx `0x6abe9c0b2624048f0503bb231fcdfe9748d51340d211a4e1363f07717ec19c30`, block 103,756,970, 11 Sep 2026 00:44:56 UTC, relayed by `0x150d3066…CFE4`; amount 20.000000 AUSD pulled from the funder in the same transaction (funder balance 34.936717 to 14.936717), per day 2.857142; target 10 XP, 7 days; gas 344,000 declared and charged; the funder signed once (EIP-3009 authorization bound to the terms hash, D12); the server row was written 1.5 s after the block; page log: "create gift" at 00:44:55, "funded gift 1" at 00:44:57, so 2 s from tap to "Funded" (finality included) |
| 4 | Recipient: passkey on a second account, `/g/<id>?t=…` | user | seconds from link tap to "is in your name", provider used (iCloud Keychain, Google Password Manager) | recipient account `0x91C964e745ffd6265c75df33cA9137D81c3c454d` created on a Xiaomi phone in Chrome with Google Password Manager, 11 Sep 2026 about 01:30 UTC. First attempt failed silently in Mi Browser (the phone's default browser, no passkey prompt at all): recorded as a refusal, fix deployed the same night (in-app and OEM browsers refused with guidance, "Open this page in Chrome", 60 s ceremony timeout). Seconds from link tap to "is in your name" not timed on this run |
| 5 | `claim` through the link | user taps | tx hash, gas used | tx `0x3ee46d8dbfa6ccf701b45e39fafe01479349a0a9cc182a4341d0dc673feb73a6`, block 103,766,017, 01:30:35 UTC, gas 107500 declared and charged, relayed; contract now holds the recipient |
| 6 | Baseline: the recipient names their Duolingo (or the funder did) and the first attested public-profile read binds the identity and opens the window (public mode, D27; the Reclaim session path was measured first and retired for Duolingo) | user types a username, adds a code to their Duolingo name once | username source, seconds from tap to "counting", proof identifier, tx hash | public mode, 11 Sep 2026 11:48 UTC: the recipient named their own account (username source `recipient`), put the code in the Duolingo display name (read back as "Red G TPYYCX"), tapped "I added it"; attested read by the worker in 4.85 s (Reclaim attestor `0x2448…9072`, TEE client), signature verified on Vercel, baseline attested and relayed: tx `0x95770ded189648826369c3a849cc0cb4090114e32372ac9a98745b553d200c76`, block 103,888,278; on chain `startDay` 20708 (12 Sep), `endDay` 20714 (18 Sep), `baselineValue` 8391 XP, identity bound to the HMAC pseudonym of profile id 477033640. No password, no tab, no app. Recipient's own report: little time, little friction; the only snag was understanding that the code goes in the display name, not the username, which the screen now says explicitly |
| 7 | Next UTC day: a lesson, then nothing; the daily pass reads the public profile and credits the day | user does a lesson; the keeper counts | XP before and after, `CheckInAccepted` tx hash, credited days, proof identifier | |
| 8 | `withdrawEarnedWithIntent` of every credited day so far (one day is below the sell minimum, D20) | user taps | tx hash, AUSD in the recipient's account | |
| 9 | Exit: 0.05 MON top-up, approve, swap AUSD to MON (`/dev/exit`) | user taps | three tx hashes, MON out | |
| 10a | Fiat out, on the intended rail; fallback record only: Mercuryo Sell, MON to EUR, payout to the funder's own card (Mercuryo's help centre, 10 Sep 2026: the widget pays out to a card; the Mercuryo IBAN account needs a Mercuryo Wallet, whose EEA registrations are paused; selling is unavailable in the UK) | user | order id, EUR received, fee, time from crypto sent to money on the card; or the refusal (region, minimum, account) verbatim | pending the rail (D22) |
| 10b | Crypto-native exit: everything sent back to a wallet the person controls (`/dev/exit`, "Send back") | user taps | tx hashes, AUSD or MON received in the wallet | |
| 11 | One day skipped on purpose; after its catch-up window, `pnpm keeper` drains it | agent | `DaysDrained` tx hash | |
| 12 | `refundUnearned`: the missed day goes back to the funder | agent | tx hash, AUSD back in the funder's account | |

## Refusals met (each with its typed error)

| when | what was refused | typed error | shown to the person as |
|---|---|---|---|

## Measurements

| measure | value |
|---|---|
| fees on the way in (EUR) | |
| fees on the way out (EUR) | |
| total wall-clock, funder tap to "Funded" | |
| total wall-clock, link tap to "is in your name" (KT5 rehearsal) | |
| gas used per function vs `src/gift-gas.ts` ceilings | |

## Verdict

To be written when every leg above has a result. If the exit leg fails, the spec's downgrade applies
(funder crypto-native only for the window; cross-border claim downgraded) and is recorded in
`docs/DECISIONS.md`.

## Second chain, 11 Sep 2026: gift 2, the corrected contract and the funder screen

Run to prove the funder screen and the corrected contract before either meets a real user. It cost no new
money: it used the change left over from the first purchase.

| step | result |
|---|---|
| created | through `/fund`, the funder screen, not a dev page. $1.00, 1 XP a day, 7 days, $0.142857 a day. Gift id 2 on `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233`, the corrected contract, whose numbering continued from the earlier one rather than restarting |
| recorded | present both on chain and in the app's own record, which is the failure the contract review warned about and the reason `saveGift` now fails loudly on a colliding id |
| claimed | opened from the claim link with the recipient account, on the preview hostname the link carried |
| bound | immediately, with no code to place: the funder had named the Duolingo account, so D27's binding code was not needed |
| friction | reported by the recipient as very low, in their words. Not timed, so KT5 still has no measurement |
| window | 12 to 18 Sep, the same days as gift 1 |

**A checkable prediction, written before the fact.** The two gifts sit on contracts with different day
rules, so the morning pass of 12 Sep must treat them differently:

- Gift 1, on the earlier contract, credits its first day, because that contract credits the day a reading
  is taken on, using the progress made before it.
- Gift 2, on the corrected contract, credits nothing and is refused `OutsideWindow`, because a reading on
  12 Sep can only settle days that are over, and the first day of its window is 12 Sep itself. It credits
  that day at the pass of 13 Sep.

If both credit on 12 Sep, the D30 correction is not live where it should be. If neither does, the pass or
the worker is broken. The difference is the evidence.

## The prediction, settled: the morning pass of 12 Sep 2026

The pass fired on its own between 00:32 and 00:40 UTC, with nobody watching and nobody tapping anything.
It behaved exactly as written the evening before, which is the first proof that the counting runs by
itself and that the D30 correction is live where it should be and only there.

| gift | contract | what the pass did | evidence |
|---|---|---|---|
| 1 | the earlier one | credited one day, $2.857142 became the recipient's | `0x5aa6752fc8c7db2526a5e5bafe6aeb91e09bd1cbe0cf3d4a6bc5e8f65f664ffd`, block 104,040,581 |
| 2 | the corrected one | read the profile at 8,417 XP and was refused, nothing relayed, nothing credited | the pass reports `refused: NOT_STARTED (8417 XP)` |

Replaying the pass a few minutes later reports, per gift and verbatim: gift 1 `skipped: counted_today`,
gift 2 `refused: NOT_STARTED (8417 XP)`, and for both `NothingToDrain` and `FinalisationTooEarly`.

Why the difference is the proof. Both gifts have the same window, the same recipient and the same
lessons. At 00:40 UTC on 12 Sep the only day that is over is 11 Sep, and both windows open on 12 Sep. The
earlier contract credited 12 Sep anyway, before that day had begun, using the lesson of the day before:
that is exactly the behaviour D30 removed. The corrected contract judged only finished days, found none
inside the window yet, and refused. It will credit 12 Sep at the pass of 13 Sep.

Still ahead, and the one the submission video needs: the first drain, the moment a missed day goes back to
the funder by itself. The hashes and a capture are to be kept the day it happens.

