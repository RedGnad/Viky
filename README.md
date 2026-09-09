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

More variables arrive with the verification routes and the contract; each is documented here when
the code that reads it lands.

## Test

```bash
pnpm test:policy
pnpm test:solidity
pnpm test
```
