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
| post-deploy transactions | `registerGoal(1, keccak("cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8"))` `0x84ac70f066eb947e979f0c6dbcf6b2fa583c6e4f917903ee317c4292c755cae7`; `setCreationPaused(false)` `0xaabf9529e62ee6d0daaa24ef339587f503454d187e89d621597e48e2373f576a`; `setCheckInPaused(false)` `0x174fd43a1714f0a7799d5d65debc195095e269c0c9ffc4154b9c442fda34cf62` |
| source verification | Sourcify (Monad endpoint `sourcify-api-monad.blockvision.org`), runtime match `exact_match`, match id 1745123, verified 10 Sep 2026 15:16 UTC |
| `pnpm check:gift-escrow` | all `ok`: chain 143, token AUSD, evidence signer `0x85702Eaaa6B8694A61a6FbBff2634FCd7E644d9a`, Duolingo goal registered (`0x00ccb800c6854f7f4a1d3d5f2cef2ab187afdc5dd61336eabcd1c5cd9006134b`), creation and check-in open, domain `Viky Gift` v1 chain 143, owner `0xe14cED34373E4dff9650232D32961654312C9834`, 0 gifts |
| relayer | `0x150d3066F615FC012a40E7779dB748D53F7CCFE4`, 15 MON before the first leg |
| evidence signer | `0x85702Eaaa6B8694A61a6FbBff2634FCd7E644d9a` (holds no funds) |
| Reclaim app | configured (id not recorded here); `ReclaimProofRequest.init` for provider `cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8` returned a `portal.reclaimprotocol.org` request URL on 10 Sep 2026 |
| database | Neon (Frankfurt, free plan) provisioned through the Vercel marketplace on 10 Sep 2026; `pnpm db:migrate` created `viky_proof_sessions`, `viky_gifts`, `viky_relayed` |
| `pnpm spike:preflight` | 16 `ok` lines, no `FAIL`, 10 Sep 2026 |
| preview hostname | `viky-two.vercel.app` (throwaway; every passkey created there is throwaway) |

## Legs

| # | leg | who | what to record | result |
|---|---|---|---|---|
| 1a | Fiat in, on the intended rail (Calm bank transfer paying AUSD, or a Mercuryo partner widget with the destination pre-filled). Fallback record only: Mercuryo consumer Buy, 30 EUR (25 EUR minimum, D20), destination pasted by hand | user | order id, EUR paid, MON or AUSD received, fee, time to arrival, KYC steps | pending the rail (D22) |
| 1b | Crypto-native entry: MON sent from a wallet the funder controls to the funder's Viky account (SPEC 9.1, "AUSD held on Monad" family) | user | tx hash, MON received, time to arrival | 1,500.00 MON received by `0x350aF869ABa6ff26AB33517ECd3E38ACaF107761` at 00:16:32 UTC on 11 Sep 2026 (balance polled every 30 s, previous poll 0); tx hash to add from the funder's wallet |
| 2 | Swap all MON to AUSD through Kuru Flow, from the funder's account (`/dev/fund`) | user taps, agent watches | tx hash, MON in, AUSD out, slippage, gas used vs limit | |
| 3 | `createGift` with the funder's single EIP-3009 signature (`/dev/fund`); $20.00 over 7 days at 10 XP per day, so that the exit leg can sell more than Mercuryo's 3 EUR flat fee (D20) | user taps | tx hash, gift id, amount, daily target, duration, gas used vs limit, seconds to "Funded" | |
| 4 | Recipient: passkey on a second account, `/g/<id>?t=…` | user | seconds from link tap to "is in your name", provider used (iCloud Keychain, Google Password Manager) | |
| 5 | `claim` through the link | user taps | tx hash, gas used | |
| 6 | Baseline check-in through Reclaim (`portal`) | user signs in to Duolingo | session id, seconds in the verification tab, TEE attested (yes/no), tx hash | |
| 7 | Next UTC day: a lesson, a check-in | user | XP before and after, `CheckInAccepted` tx hash, credited days | |
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
