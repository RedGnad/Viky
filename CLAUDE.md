# Viky, project rules for the developer agent

Viky: the money is already in their name. Every day they miss, a piece comes back to you.
A conditional gift on Monad: a funder allocates AUSD in a recipient's name, it becomes theirs as
verified progress accrues, and the unearned part returns to the funder. Nobody profits from failure.

Read first, in this order: `docs/SPEC.md` (product and technical spec v1), then the four Master
files it cites (in the sibling `Master/data/` folder, read only).

## Workspace boundaries (hard)
- Write ONLY inside this repository. Never modify `../Lock-in` or `../Master`.
- `../Lock-in` is a read-only source of ported code. Port file by file, deliberately, with its tests.
  Never copy the product (self-staked commitment, pools): that is what we must NOT ship.
- `../Master` is strategy. Nothing from it goes into this public repository: no census, no
  competitor analysis, no decision files.

## What Viky is, and is not
- Track: Monad Metropolis, Consumer Products & Payments. Judged on: real conditional settlement
  on-chain (not simulated), invisible blockchain for a non-crypto user, a named consumer segment,
  five real users, and a path to the next hundred.
- Account layer: Mera passkeys only (no Privy, no Dynamic, no seed phrase, no custody backend).
- Production hostname and passkey `rpId`: TO BE CHOSEN (viky.io is registered by someone else).
  Passkeys are bound to it forever: no real user creates an account before the app is served from
  it; preview hostnames are throwaway.
- Asset: AUSD on Monad mainnet (`0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`, 6 decimals, EIP-3009).
- Shell: PWA (Next.js, the Foundation template's `main` branch with Privy stripped by hand; the
  `no-privy` branch mentioned in the docs does not exist).
- Non-goals: feed, messaging beyond the encrypted gift note, tips, betting, yield, employer payroll,
  native store listing.

## Honesty rules (they are product rules, not comms rules)
- Never claim "cheaper than a bank transfer": the fiat legs are not measured.
- Never claim durable behaviour change: the evidence says the effect fades when incentives stop.
- Never claim "no licence required": that is a legal opinion we do not have.
- Never say "nobody does this": Beeminder, StickK, Forfeit exist. Our difference is the third-party
  funder, money allocated in the recipient's name, verified release, automatic refund.
- Nothing is "working" or "live" until it has run once end to end on mainnet with real amounts.

## Words the user must never see
wallet, gas, chain, seed, token, transaction hash, address. Amounts are shown as $ or € with two
decimals. The judges page is the only place where contract addresses appear.

## Engineering rules
- Code, comments, commits, docs: English. No em dash or en dash anywhere; use commas, colons,
  parentheses or two sentences.
- Monad specifics: gas is charged on the declared limit (explicit limits, 7.5 % margin), keep the
  relayer above 10 MON (reserve), wait k = 3 blocks (about 1.2 s) before showing "done",
  `eth_getLogs` is capped at 100 blocks on the public RPC (index events with Envio instead).
- Verification: every Reclaim proof is verified server side with the TEE attestation required and
  the AI fallback refused, then attested to the contract by the evidence signer (EIP-712), exactly as
  `../Lock-in/app/api/duolingo/verify/route.ts` does. Session rows are held server side; the browser
  never chooses the wallet, the phase or the profile.
- Every refusal is a typed error and is demonstrable (see SPEC section 10).
- Commits: short one-line messages, no Co-Authored-By, no tool attribution.

## Pace and order
No weekly frame, no per-task dates: the only deadline is the submission, 14 Oct 2026, 05:59 GMT+2,
with a build freeze a few days before it. Work in the order of the plan, at whatever pace the work
takes, and move on only when a task meets its "done when" criterion.
The order matters because each step decides the next: the fiat chain end to end on mainnet has never
run, so it comes before any product screen; the Duolingo live schema (`LIVE_SCHEMA_CONFIRMED`)
decides the verification path; the first real gifts decide the words on the screens.
The kill tests of SPEC section 12 stay as questions to answer, not as dates: does the chain run,
does a PWA qualify, does the live schema match, do real people fund gifts, does a recipient get
through in under a minute, do funders say why they pay.
