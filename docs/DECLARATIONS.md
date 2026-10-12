# Declarations, environment and licences

This repository carries the project's whole history since 10 Sep 2026. It was republished on 11 Oct 2026 with the names
and identifiers of other people replaced by invented ones in past commits. The original is available to the organisers
on request.

## AI tools

Viky was built with an AI coding tool, Claude Code (Anthropic). It wrote most of the code, the tests and the
documentation in this repository from the author's written briefs, and it ran the checks before each merge: types,
lint, the policy tests, the build and the browser tests. The author directed all of it: what the product is, how it
looks, what every screen says, and every decision that touches money. Nothing was deployed to mainnet and no real
payment was made without his explicit decision. People from outside the project have opened gifts, one of them on
an iPhone, from Instagram: the judges page counts them, under "Who has used Viky".

A second AI is in the product itself, and is not Viky's: Reclaim's agent. The first time a student shows a page of a
university's portal, that agent finds the page in the student's own signed-in session and writes the rule the proof
is made on. Viky holds that first proof, and its operator reads what the rule read before anything is paid
([Verification](VERIFICATION.md)).

## Pre-existing code

Two things in this repository were not written for this hackathon.

**Code ported from Lock-in.** Lock-in is an earlier project by the same author, in a private repository. It verified
a daily Duolingo lesson and a Strava run with Reclaim proofs. Viky is another product: a third party funds, and nothing
is staked. What it took from Lock-in is the verification plumbing, ported file by file on 10 Sep 2026 (commit
`9c280af`) and edited since:

- the account session and the guards every route starts with: `src/account-auth-server.ts`, `src/api-guard.ts`,
  `src/rate-limit.ts`, `src/monad-gas.ts`;
- the Reclaim proof handling: `src/reclaim-abi.ts`, `src/reclaim-types.ts`, `src/reclaim-channel.ts`,
  `src/reclaim-onchain.ts`, `src/reclaim-proof-set.ts`, `src/proof-session-store.ts`;
- the Duolingo proof: `src/duolingo-profile.ts`, `src/duolingo-proof-policy.ts`, `src/duolingo-verification.ts`,
  `src/gift-attestation.ts`, `scripts/capture-duolingo-proof.ts`, `scripts/transform-duolingo-proof.ts`;
- the two routes of a proof shown from the person's own account, `app/api/proof/session/route.ts` and
  `app/api/proof/verify/route.ts`, which were Lock-in's Duolingo session and verify routes and now serve every
  shown condition;
- the on-chain verifiers, which are not deployed (see [Contracts](CONTRACTS.md)): `contracts/verifiers/VikyProofTypes.sol`,
  `contracts/verifiers/VikyReclaimVerifier.sol`, `contracts/verifiers/VikyStravaReclaimVerifier.sol`;
- `scripts/check-contract-sizes.ts`, which came in the same commit;
- three files of the build and of the checks, which came in that commit too: `foundry.toml` and `remappings.txt`,
  unchanged since, which hold what the ported verifiers build with (the paths of Reclaim's Solidity SDK and of
  OpenZeppelin, and the folder of real proofs kept out of the repository), and `.github/workflows/ci.yml`, one job
  then and rewritten since for this repository's own checks;
- their tests: `test/VikyDuolingoRealProof.t.sol`, `test/VikyReclaimVerifier.t.sol`,
  `test/VikyStravaRealProof.t.sol`, `test/VikyStravaReclaimVerifier.t.sol`, `test/account-auth.test.ts`,
  `test/api-guard.test.ts`, `test/duolingo-profile.test.ts`, `test/duolingo-proof-policy.test.ts`,
  `test/duolingo-verification.test.ts`, `test/gift-attestation.test.ts`, `test/monad-gas.test.ts`,
  `test/proof-session-store.test.ts`, `test/rate-limit.test.ts`, `test/reclaim-channel.test.ts`,
  `test/reclaim-proof-set.test.ts`.

That is 37 files and about 7,200 of the 109,700 lines of code and tests in `app`, `src`, `contracts`, `scripts` and
`test`, as they stood on 1 Oct 2026. `contracts/GiftEscrow.sol` is new, and the guards it applies to an attestation
(freshness, clock skew, nullifiers, identity binding, pauses) follow the ones of Lock-in's escrow. `src/shown-proof.ts`
generalises the one-source flow that was ported.

**The template.** The app started from the PWA template Monad publishes for developers,
`monad-developers/next-serwist-privy-embedded-wallet` (Next.js with Serwist: the service worker, the offline page,
the install prompt, web push), taken from its `main` branch. Privy was removed by hand and replaced with Mera
passkeys, and the template was moved from Next 14 to Next 16 and from Serwist's webpack plugin to its Turbopack
integration.

Everything else was written between 10 Sep 2026 and the submission.

## Environment

[`.env.example`](../.env.example) lists every variable, with no value, in the order they are needed. Copy it to
`.env.local`, which is never committed.

- **With no variable at all**: `pnpm verify:day`, `pnpm relayer:fees` and `pnpm test:policy`.
- **To start**: a session secret and a database. Accounts and the screens work; nothing moves money.
- **For the money**: the relayer, the evidence signer and the contracts' addresses. Gifts are made, opened and settled
  on mainnet.
- **For the readings**: the Reclaim applications and the attested-fetch worker. A gift's condition is read and proved.

The functions run in Vercel's Paris region (`vercel.json`), next to the Frankfurt database, and two crons run the
passes: `/api/cron/daily` at 00:30 UTC and `/api/cron/settle` at 07:00 UTC. A third, `/api/cron/watch` at 02:00 UTC,
emails the operator when the morning pass is not in the journal. A fourth, `/api/cron/recount` at 03:30 UTC, reads
again the gifts whose reading failed on our side, before the day's catch-up window closes at 06:00 UTC, and runs the
whole reading pass when the morning one left nothing in the journal. A fifth address, `/api/cron/milestones`, is not
on Vercel's schedule: a scheduler outside Vercel, cron-job.org, calls it every hour. It reads the milestones still
climbing and the daily gifts of the third daily contract, which is how a day there is paid the day it is done
(`src/frequent-pass.ts`). `/api/health` answers 200 when the database, the
network, the reading worker, the relayer, the exchange's pin, the evidence key and the passes all hold, and 503 when
one does not; it needs no secret and answers nothing of any gift.

## Third-party licences

This repository is MIT. It depends on packages under other licences, used unmodified and not copied here:

- `@reclaimprotocol/zk-fetch` and `@reclaimprotocol/attestor-core` are under AGPL-3.0. The attested-fetch worker
  (`pnpm zkfetch:worker`) and a local reading call them.
- `snarkjs` and the packages it brings (`ffjavascript`, `r1csfile`, `fastfile`, `wasmcurves`, `wasmbuilder`,
  `@iden3/bigarray`, `@iden3/binfileutils`) are under GPL-3.0. They come with the Reclaim packages above.
- `@reclaimprotocol/js-sdk` and `@reclaimprotocol/zk-symmetric-crypto` name their licence in Reclaim's own repository.
- The fonts under `app/fonts` are under the SIL Open Font License 1.1 (`app/fonts/README.md`).
- `gsap` and its `ScrollTrigger` are not under a free licence. They are under Webflow's "Standard 'No Charge' GSAP
  License" (gsap.com/community/standard-license, effective 30 April 2025, read on 5 Oct 2026): use on a website is
  permitted at no charge, commercial use included, and it stays Webflow's property. It forbids using GSAP in a tool
  that lets its users build visual animations without code in competition with Webflow's own, reverse engineering it
  to make such a tool, and removing its notices; Webflow may end the licence for whoever breaks those terms. Viky
  uses it for one thing, the movement of the posters under the landing's card, and only that page loads it
  (`app/kit/LandingStory.tsx`). Anybody who reuses this repository takes that licence with that file.

`pnpm licenses list --prod` prints the whole list.

## Security

See [SECURITY.md](../SECURITY.md) to report a vulnerability.

## License

[MIT](../LICENSE)
