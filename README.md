# Viky

The money is already in their name. Every day they miss, a piece comes back to you.

Viky is a conditional gift on Monad. A funder puts money behind someone's goal. The money is
allocated in the recipient's name from day one, becomes theirs as verified progress accrues, and
returns to the funder for whatever is not accomplished. Nobody else ever profits from a missed day.

Live app: [viky.cash](https://viky.cash). Built for Monad Metropolis, track Consumer Products & Payments.

## For judges

[viky.cash/judges](https://viky.cash/judges) is the one page for verifying Viky: the contract addresses on Monad
mainnet, who owns them (read from the chain when the page is served), every condition a gift can wait for and the
source it is read from, the commands to re-verify a credited day yourself, and the risks and limits, written as they
are. It also says how to try the product with your own passkey.

## Stack

- PWA: Next.js 16 with Serwist (offline fallback, web push), Turbopack build.
- Accounts: Mera passkeys only. A passkey's PRF output derives an ordinary Monad account
  (BIP-44 `m/44'/60'/0'/0/0`). No seed phrase, no extension, no custody backend. The same passkey, under its own
  salt (`viky:private:v1`), gives the key of the funder's private space (nicknames and notes), sealed in the browser
  and kept on the server as an envelope it cannot open.
- Asset: AUSD on Monad mainnet.
- Contracts: Foundry 1.8 with `network = "monad"`.
- Tests: `node:test` through `tsx` for TypeScript, `forge test --network monad` for Solidity.

## Run

```bash
pnpm install
pnpm dev
```

Passkeys need HTTPS or `localhost`. The relying party id is the hostname the app is served from,
so accounts created on a preview hostname stay on that hostname.

## Environment

Create `.env.local` (never committed) with:

| variable | role |
|---|---|
| `NEXT_PUBLIC_MONAD_RPC_URL` | Monad mainnet RPC used by the browser; defaults to `https://rpc.monad.xyz` |
| `WEB_PUSH_EMAIL` | contact address sent with VAPID web push |
| `WEB_PUSH_PRIVATE_KEY` | VAPID private key, generate with `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` | VAPID public key |
| `SESSION_SIGNING_SECRET` | HMAC key (32+ characters) for the account challenge and the 12 h session cookie |
| `DATABASE_URL` | Neon Postgres connection string for the verification session rows |
| `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET` | Reclaim application credentials; the secret also verifies the TEE attestation of a proof shown from a Reclaim session (not of a zkFetch reading) |
| `RECLAIM_ZKFETCH_APP_ID`, `RECLAIM_ZKFETCH_APP_SECRET` | Reclaim "Public Data (zkFetch)" application, used by the public mode's attested reads of the Duolingo profile (D27); zkFetch must be switched on for it in the dev tool |
| `CRON_SECRET` | bearer token Vercel sends to `/api/cron/daily`; the daily pass runs only with it |
| `ZKFETCH_WORKER_URL`, `ZKFETCH_WORKER_SECRET` | the attested-fetch worker (`pnpm zkfetch:worker`), needed on Vercel because its functions start Node with `--no-experimental-require-module`, which zk-fetch's CommonJS build cannot load; the worker only fetches, Vercel verifies the attestor signature |
| `DUOLINGO_PROVIDER_ID`, `DUOLINGO_PROVIDER_VERSION` | optional cross-check against the pinned provider `cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8` |
| `RECLAIM_VERIFICATION_MODE` | `portal` (default) or `app`, the Reclaim delivery channel |
| `IDENTITY_HMAC_KEY` | base64 key of the pseudonymous identity bound to a gift |
| `EVIDENCE_SIGNER_PRIVATE_KEY` | key of the evidence signer whose EIP-712 attestations the gift contract accepts |
| `GIFT_ESCROW_ADDRESS` | the deployed gift contract; verification fails closed without it |
| `RELAY_PER_HOUR`, `RELAY_PER_DAY` | the most relayed actions Viky pays for, per account and per connection, in an hour and in a day (20 and 100 unless set, D204) |
| `RELAY_MINIMUM_CENTS` | the smallest relayed send or withdrawal, in cents (100 unless set); everything the person has may always go |
| `TOP_UPS_PER_MINUTE` | how many times a minute the cancel route may ready an account with MON (1 unless set) |
| `MONAD_RPC_URL` | RPC used by Foundry scripts and the relayer |
| `VIKY_PRIVATE_FIXTURES` | directory of real captured proofs for the real-proof tests (default `private-fixtures`) |
| `ACCOUNT_ADDRESS`, `DUOLINGO_USERNAME` | inputs of `scripts/capture-duolingo-proof.ts` |
| `RELAYER_PRIVATE_KEY` | key of the relayer that pays the gas of every relayed step; kept above 12 MON |
| `NEXT_PUBLIC_GIFT_ESCROW_ADDRESS` | the gift contract, for the funder's signature and the recipient's intent in the browser |
| `NEXT_PUBLIC_APP_URL` | origin used in claim links (defaults to the request origin) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | contact shown on `/legal`; the page says one is coming until it is set |
| `DEPLOYER_PRIVATE_KEY`, `EVIDENCE_SIGNER_ADDRESS`, `OWNER_ADDRESS`, `FIRST_GIFT_ID` | inputs of `pnpm deploy:gift-escrow` and `pnpm check:gift-escrow`. `FIRST_GIFT_ID` is required and continues the gift numbering: it must equal the `nextGiftId()` of the contract being replaced, which the script checks (D35) |
| `VIKY_DEV_PAGES`, `VIKY_OPERATOR_ACCOUNTS` | dev pages (`/dev/*`) and dev routes (`/api/dev/*`) answer only when `VIKY_DEV_PAGES=1` and the signed-in account is in the operator list; everyone else gets a 404. Removed after KT1's crypto half |

## Pages

| page | what |
|---|---|
| `/` | create or open the passkey account; the name asked for is optional and stays in the device's passkey manager |
| `/g/<id>?t=...` | the recipient's gift page from a claim link |
| `/judges` | the only page with contract addresses; shows the signed-in account when reached through the home page link |
| `/privacy`, `/legal` | what is kept, who processes it, who publishes and hosts the site |
| `/dev/fund`, `/dev/exit` | first-chain dev pages, served only with `VIKY_DEV_PAGES=1` |

The functions run in Vercel's Paris region (`vercel.json`), next to the Frankfurt database.

## Routes

| route | who | what |
|---|---|---|
| `POST /api/account/challenge`, `POST /api/account/session` | browser | the passkey account signs a challenge silently and gets a twelve-hour cookie |
| `GET`, `PUT /api/account/private` | the signed-in account | its private space as a sealed envelope, kept over the revision it read; the server cannot open it |
| `POST /api/gift/create` | funder | creates and funds a gift with the funder's single EIP-3009 signature, returns the claim link |
| `POST /api/gift/claim` | recipient | binds the signed-in account to the gift of a claim link |
| `POST /api/gift/<id>/account` | recipient | names their Duolingo; returns the code to put in the display name for a minute (D27) |
| `POST /api/gift/<id>/bind` | recipient | first attested read of the public profile: proves the code, binds the identity, opens the window |
| `POST /api/gift/<id>/count` | recipient | a count now instead of waiting for the daily pass; same read, same proof |
| `GET /api/cron/daily` | Vercel cron (00:30 UTC) | the daily pass: count every bound gift, drain, finalise |
| `POST /api/proof/session`, `POST /api/proof/verify` | recipient (a proof shown from their own account) | opens a Reclaim session for a baseline, a day, or a milestone's one proof, verifies it (TEE required), attests and relays it |
| `POST /api/gift/check-in` | recipient | relays a recorded check-in again if the first submission failed |
| `POST /api/gift/withdraw` | recipient | relays a signed withdraw intent |
| `GET /api/gift/<id>` | anyone | the gift's numbers for its screens |
| `pnpm keeper` | operator | the same daily pass from a terminal (`--refund` also sends back what is refundable) |
| `pnpm register:goal` | owner | registers the Duolingo goal's provider id on the escrow (idempotent) |
| `pnpm zkfetch:worker [port]` | operator | the attested-fetch worker for the public mode; deployed on Railway from `Dockerfile` (`railway up --service zkfetch-worker`) |
| `pnpm count:gift <id> [bind\|count]` | operator | binds or counts one gift from a terminal, same code path as the routes |

## Contract

`contracts/GiftEscrow.sol` holds every gift: creation and funding in one transaction through the funder's
EIP-3009 authorization (its nonce is derived from the gift terms), claim by the recipient's account, daily
check-ins attested by the evidence signer, draining of missed days after a one-day catch-up window,
withdrawal of what is earned, refund of what is not. Guards: attestation
freshness, clock skew, nullifiers, identity binding, pauses, typed errors. `forge test --network monad`
runs the unit suite, the accounting fuzz and the typehash parity pin; with `MONAD_RPC_URL` set it also
runs the mainnet fork test of the real AUSD funding path. `pnpm deploy:gift-escrow` deploys and
`pnpm check:gift-escrow` verifies a deployment against the expected configuration.

## Verification path

Two kinds of proof reach the evidence signer, and they are not checked the same way. What is true in production
today (`PROOF_VERIFIER` unset):

- **A proof the person shows from their own account** (a Reclaim session: `app/api/proof/session`,
  `app/api/proof/verify`) is verified server side with js-sdk `verifyProof` and the application secret: the
  attestor's signature, and the attestation of the TEE it ran in, both required; a proof without a TEE attestation
  (the AI fallback) is refused before anything else is read.
- **A reading Viky makes itself** (zkFetch: the daily Duolingo lesson, the Chess.com ratings, the certificates, and a
  connected source's reading with the person's key) is fetched through Reclaim's TEE client, and verified server side
  by the attestor's signature only: js-sdk `verifyProof` checks it against the attestor list it fetches from Reclaim at
  that moment, then Viky's own pin (`RECLAIM_ATTESTOR_ADDRESSES`). The proof carries no attestation of the attestor's TEE, so
  the TEE itself is not verified on this path.

**Behind the switch** (`PROOF_VERIFIER=local`, not set in production): a reading is verified offline, by Viky alone,
the way `pnpm verify:day` does it by hand: the claim's identifier recomputed, the signers recovered, every signer one
of Viky's pinned attestors, and the witnesses exactly those signers; with `RECLAIM_ATTESTOR_IMAGE_DIGESTS` set, every
witness must also carry the attestation of the TEE holding its key, verified offline and pinned by image digest
(`src/proof-verification.ts`, OPERATIONS "The proof verifier switch, off").

Either way, what is accepted is then attested to the contract by the evidence signer (EIP-712 `CheckIn`, or the
milestone contract's `Proof`). Session rows are held server side in Neon; the browser never chooses the account, the
phase, the day or the profile. The on-chain verifiers under `contracts/verifiers` are
ported from Lock-in with their real-proof tests and stay fail-closed (`LIVE_SCHEMA_CONFIRMED = false`)
until a proof pair captured this cycle passes their grammar.

## Check a credited day yourself

Anybody can check that a day Viky credited really had a proof behind it. It needs no key, no account and no
permission from us:

```bash
git clone https://github.com/RedGnad/Viky.git
cd Viky
pnpm install
pnpm verify:day
```

It takes the one example published with its account holder's agreement (`/api/judges/example` on viky.cash),
recomputes the claim's identifier from the signed claim, recovers the attestor that signed it, recomputes the
fingerprint, asks the gift contract whether that fingerprint is recorded against replay, and reads the transaction
back to see it credit that day. Every answer is printed beside what it was compared against.

The two people a gift is between can do the same with any day of their own: the gift's page hands over that day's
proof, then `pnpm verify:day --file day.json --gift <number> --day <day>`. A milestone gift settles on a reading, so
it takes `--reading <number>` instead.

**What it proves**: the source's own servers answered that, and the contract settled that day against that one claim,
which can never be replayed. **What it does not prove**: that the account belongs to the person the gift is for, or
that a human rather than a script did the work. The account is tied to the person once, separately, by a code in its
display name or by the funder naming it. The key that signs is ours and the owner can replace it, which is why this
check exists: a signed reading with no claim behind it cannot be re-verified by anybody.

## Test

```bash
pnpm test:policy
pnpm test:solidity
pnpm test
```

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[MIT](LICENSE)
