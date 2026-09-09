# Viky

The money is already in their name. Every day they miss, a piece comes back to you.

Viky is a conditional gift on Monad. A funder puts money behind someone's goal. The money is
allocated in the recipient's name from day one, becomes theirs as verified progress accrues, and
returns to the funder for whatever is not accomplished. Nobody else ever profits from a missed day.

Status: skeleton. Nothing here is claimed as working until the first gift has run end to end on
mainnet with real amounts. See `docs/SPEC.md` for the product and technical specification and
`docs/DECISIONS.md` for every fact that was checked at its source and every design decision.

## Stack

- PWA: Next.js 16 with Serwist (offline fallback, web push), Turbopack build.
- Accounts: Mera passkeys only. A passkey's PRF output derives an ordinary Monad account
  (BIP-44 `m/44'/60'/0'/0/0`). No seed phrase, no extension, no custody backend.
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
| `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET` | Reclaim application credentials; the secret also verifies the TEE attestation |
| `DUOLINGO_PROVIDER_ID`, `DUOLINGO_PROVIDER_VERSION` | optional cross-check against the pinned provider `cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8` |
| `RECLAIM_VERIFICATION_MODE` | `portal` (default) or `app`, the Reclaim delivery channel |
| `IDENTITY_HMAC_KEY` | base64 key of the pseudonymous identity bound to a gift |
| `EVIDENCE_SIGNER_PRIVATE_KEY` | key of the evidence signer whose EIP-712 attestations the gift contract accepts |
| `GIFT_ESCROW_ADDRESS` | the deployed gift contract; verification fails closed without it |
| `MONAD_RPC_URL` | RPC used by Foundry scripts and the relayer |
| `VIKY_PRIVATE_FIXTURES` | directory of real captured proofs for the real-proof tests (default `private-fixtures`) |
| `ACCOUNT_ADDRESS`, `DUOLINGO_USERNAME` | inputs of `scripts/capture-duolingo-proof.ts` |

More variables arrive with the contract deployment and the relayer; each is documented here when the
code that reads it lands.

## Verification path

Every Reclaim proof is verified server side (`app/api/duolingo/verify`) with the TEE attestation
required and the AI fallback refused, then attested to the gift contract by the evidence signer
(EIP-712 `CheckIn`). Session rows are held server side in Neon; the browser never chooses the
account, the phase, the day or the profile. The on-chain verifiers under `contracts/verifiers` are
ported from Lock-in with their real-proof tests and stay fail-closed (`LIVE_SCHEMA_CONFIRMED = false`)
until a proof pair captured this cycle passes their grammar.

## Test

```bash
pnpm test:policy
pnpm test:solidity
pnpm test
```
