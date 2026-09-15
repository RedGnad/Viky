# Viky, project rules for the developer agent

Viky: the money is already in their name. Every day they miss, a piece comes back to you.
A conditional gift on Monad: a funder allocates AUSD in a recipient's name, it becomes theirs as
verified progress accrues, and the unearned part returns to the funder. Nobody profits from failure.

Read first: `docs/SPEC.md`, then `docs/DECISIONS.md` for what has already been settled.

## How we work

- **One task, one conversation.** Finish the thing that was asked, deliver it, stop. A second task starts
  a new conversation rather than growing this one.
- **When two instructions contradict each other, say so and ask.** Do not pick one quietly and do not
  average them. The funder's current judgement outranks anything written earlier, including these rules
  and anything in `docs/DECISIONS.md`.
- **A document is as long as the task needs and no longer.** No status report nobody asked for, no
  decision entry for a decision nobody made, no summary of work that speaks for itself.

## Workspace boundaries (hard)

- Write ONLY inside this repository. Never modify `../Lock-in` or `../Master`.
- `../Lock-in` is a read-only source of ported code. Port file by file, with its tests. Never copy the
  product (self-staked commitment, pools): that is what we must NOT ship.
- `../Master` is strategy. Nothing from it goes into this public repository: no census, no competitor
  analysis, no decision files.

## What Viky is, and is not

- Track: Monad Metropolis, Consumer Products & Payments. Judged on: real conditional settlement on-chain
  (not simulated), invisible blockchain for a non-crypto user, a named consumer segment, five real users,
  and a path to the next hundred.
- Account layer: Mera passkeys only (no Privy, no Dynamic, no seed phrase, no custody backend).
- Production hostname: **viky.cash**. Passkey `rpId` = `viky.cash` (no `www`), never hardcoded elsewhere,
  never changed: passkeys are bound to it forever. **`viky-two.vercel.app` also serves the app** until
  gift 1 is finalised; its accounts are bound to that host.
- Asset: AUSD on Monad mainnet (`0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`, 6 decimals, EIP-3009).
- Shell: PWA (Next.js, the Foundation template's `main` branch with Privy stripped by hand).
- Non-goals: feed, messaging beyond the encrypted gift note, tips, betting, yield, employer payroll,
  native store listing.

## Honesty rules (they are product rules, not comms rules)

- Never claim "cheaper than a bank transfer": the fiat legs are not measured.
- Never claim durable behaviour change: the evidence says the effect fades when incentives stop.
- Never claim "no licence required": that is a legal opinion we do not have.
- Never say "nobody does this": Beeminder, StickK, Forfeit exist. Our difference is the third-party
  funder, money allocated in the recipient's name, verified release, automatic refund.
- Nothing is "working" or "live" until it has run once end to end on mainnet with real amounts.
- **Every sentence that states an amount or a state must be true of the code that produces it**, wherever
  it is printed: a screen, a log, an operator script, a comment. Five have been found saying otherwise.
  Sentences on screens are listed in `docs/SCREEN-CLAIMS.md` with the code path that makes each true.

## Words the user must never see

wallet, gas, chain, seed, token, transaction hash, address. Amounts are shown as $ or € with two
decimals. The judges page is the only place where contract addresses appear.

## Visual work

- **Before any visual task, propose four distinct directions.** Each one names its background, its accent,
  its typeface and one sentence saying why. The funder picks one. Implement only that one.
- **A reference given as a link is opened in a browser.** Reading the page source does not render its
  JavaScript, and most design references are JavaScript.
- **No screen is finished without a report from the `ui-reviewer` agent.** It is read-only and it opens
  the real site from the home page, at 390x844 and 1440x900.

## Delivering

A delivery is: the link, one screenshot per acceptance item, and what is not verified. Nothing else.

## Engineering rules

- Code, comments, commits, docs: English. No em dash or en dash anywhere; use commas, colons,
  parentheses or two sentences.
- Monad specifics: gas is charged on the declared limit (explicit limits, 7.5 % margin), keep the
  relayer above 10 MON (reserve), wait k = 3 blocks (about 1.2 s) before showing "done",
  `eth_getLogs` is capped at 100 blocks on the public RPC (index events with Envio instead).
- Verification: every Reclaim proof is verified server side with the TEE attestation required and the AI
  fallback refused, then attested to the contract by the evidence signer (EIP-712). Session rows are held
  server side; the browser never chooses the wallet, the phase or the profile.
- Every refusal is a typed error and is demonstrable (see SPEC section 10).
- Commits: short one-line messages, no Co-Authored-By, no tool attribution.

## Pace and order

The only deadline is the submission, 14 Oct 2026, 05:59 GMT+2, with a build freeze a few days before.
The fiat chain end to end on mainnet has never run, so it comes before any product screen. The kill tests
of SPEC section 12 stay as questions to answer, not as dates.

Next.js 16: before using an API, read the documentation of the installed version in `node_modules/next/dist/docs/`.
