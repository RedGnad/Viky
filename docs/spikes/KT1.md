# KT1, the first chain end to end on Monad mainnet

> Kill test 1 of `docs/SPEC.md` section 12: fiat to AUSD to escrow to recipient to card or bank, once,
> mainnet, small amounts. Nothing in this repository is called working until this page holds a
> transaction hash for every on-chain leg. Amounts are small on purpose; every fee is recorded.

Status: NOT RUN. This page is the protocol and the record; the fields are filled in as the chain runs.

## Preconditions (`pnpm spike:preflight` must print only `ok` lines)

| item | value |
|---|---|
| deployed `GiftEscrow` | (address, deployment tx) |
| `pnpm check:gift-escrow` | (output) |
| relayer | (address, MON balance before) |
| evidence signer | (address) |
| Reclaim app | configured (id not recorded here) |
| database | migrated (`pnpm db:migrate`) |
| preview hostname | (the Vercel URL the passkeys were created on; throwaway) |

## Legs

| # | leg | who | what to record | result |
|---|---|---|---|---|
| 1 | Mercuryo Buy, card to MON on Monad, destination = the funder's account | user | order id, EUR paid, MON received, fee, time to arrival, KYC steps | |
| 2 | Swap all MON to AUSD through Kuru Flow, from the funder's account (`/dev/fund`) | user taps, agent watches | tx hash, MON in, AUSD out, slippage, gas used vs limit | |
| 3 | `createGift` with the funder's single EIP-3009 signature (`/dev/fund`) | user taps | tx hash, gift id, amount, daily target, duration, gas used vs limit, seconds to "Funded" | |
| 4 | Recipient: passkey on a second account, `/g/<id>?t=…` | user | seconds from link tap to "is in your name", provider used (iCloud Keychain, Google Password Manager) | |
| 5 | `claim` through the link | user taps | tx hash, gas used | |
| 6 | Baseline check-in through Reclaim (`portal`) | user signs in to Duolingo | session id, seconds in the verification tab, TEE attested (yes/no), tx hash | |
| 7 | Next UTC day: a lesson, a check-in | user | XP before and after, `CheckInAccepted` tx hash, credited days | |
| 8 | `withdrawEarnedWithIntent` of one day | user taps | tx hash, AUSD in the recipient's account | |
| 9 | Exit: 0.05 MON top-up, approve, swap AUSD to MON (`/dev/exit`) | user taps | three tx hashes, MON out | |
| 10 | Mercuryo Sell, MON to EUR (SEPA) | user | order id, EUR received, fee, time; or the refusal (region, minimum, account) verbatim | |
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
