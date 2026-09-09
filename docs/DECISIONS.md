# Decisions and corrected facts

Every entry records a fact that was checked at its source and turned out to differ from the spec
or from the planning notes, or a design decision that refines the spec. Each entry has a date, the
statement, the source, and the consequence for the code. Nothing here is a claim about the product
working: that is only said after the fiat chain has run once end to end on mainnet.

Format: `D<n>` id, date, tier of the source (`[O]` official page or direct measurement, `[P]` third
party platform or API, `[U]` not verified).

## D1, 9 Sep 2026, the Lock-in source is a private GitHub repository, not a sibling folder

- Statement: `../Lock-in` does not exist on this machine. The source of the ported code is
  `github.com/RedGnad/Lock-in`, private, branch `main`, commit
  `73714f7cbe65bd03a83b6e1c3237bfc61705812a` (28 Jul 2026), readable with the owner's `gh` session.
- Source [O]: `ls /Users/red.g/CascadeProjects`, `gh repo view RedGnad/Lock-in`.
- Consequence: the port reads files through `gh api repos/RedGnad/Lock-in/contents/<path>` at that
  pinned commit. No `../Lock-in` folder is created (workspace rule). A scratch checkout, if any,
  lives only in the session scratchpad and is never written to.

## D2, 9 Sep 2026, the template has no `no-privy` branch

- Statement: `monad-developers/next-serwist-privy-embedded-wallet` has exactly one branch, `main`
  (refs: `refs/heads/main` plus two pull request heads), no tags, and its README never mentions a
  `no-privy` branch. The Monad docs page for the template says `git checkout no-privy`.
- Source [O]: `gh api repos/monad-developers/next-serwist-privy-embedded-wallet/git/refs`;
  `docs.monad.xyz/templates/next-serwist-privy-embedded-wallet.md`.
- Consequence: the skeleton starts from `main` at commit
  `ee33535fd5c1c19db6654a7dc61a42c176113237` (13 Aug 2026) and Privy is stripped by hand
  (`app/components/privy-provider.tsx`, `app/components/UseLoginPrivy.tsx`, `@privy-io/react-auth`,
  `NEXT_PUBLIC_PRIVY_*`). Kept: Serwist service worker and config, manifest, icons, offline page,
  install prompt component, web push route and VAPID variable names.

## D3, 9 Sep 2026, framework versions

- Statement: the template is Next 14.2.33 with React 18. Lock-in's API routes are Next 16.2.10
  with React 19. `@serwist/next` 9.5.12 declares `next >= 14.0.0`.
- Source [P]: npm registry (`npm view`), the two `package.json` files.
- Consequence: Viky runs Next 16.3.4, React 19, `@serwist/next` 9.5.12. The PWA layer of the
  template is version-agnostic; the ported routes are not.

## D4, 9 Sep 2026, Foundry must be the official release, 1.8 or later

- Statement: the Monad docs require official Foundry v1.8.0 or later with `network = "monad"` in
  `foundry.toml`, and say the legacy Category Labs fork (which supports Monad only up to the
  MonadNine hardfork) "should be migrated from". The machine had `forge 1.5.0-stable-monad`, that
  fork. Official v1.8.1 was released on 28 Aug 2026.
- Source [O]: `docs.monad.xyz/tooling-and-infra/toolkits/foundry.md`, `forge --version`,
  GitHub releases of `foundry-rs/foundry`.
- Consequence: official Foundry 1.8.1 installed with `foundryup` on 10 Sep 2026. Lock-in's
  `evm_version = "shanghai"` is replaced by `network = "monad"`. CI uses
  `foundry-rs/foundry-toolchain@v1` at v1.8.1.

## D5, 9 Sep 2026, the AUSD EIP-712 domain measured on mainnet

- Statement: `eip712Domain()` on `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` returns name
  `Agora Dollar`, version `1`, chainId 143, verifyingContract the same address. The implementation
  behind the proxy (`0xc1e3c7d486d6a92fbe920232e439eec2ceb112da`) contains `receiveWithAuthorization`
  (both the `v,r,s` and the `bytes` signature variants), `transferWithAuthorization`, `permit`,
  `authorizationState` and `cancelAuthorization`. `RECEIVE_WITH_AUTHORIZATION_TYPEHASH` equals the
  EIP-3009 standard hash. Measured at block 103,373,362. The planning notes said "version 2".
- Source [O]: `cast call` against `https://rpc.monad.xyz`.
- Consequence: the funder's authorization is signed under the measured domain (name `Agora Dollar`,
  version `1`). A preflight check compares `eip712Domain()` with these values before any spike.

## D6, 9 Sep 2026, the reserve balance has an emptying exception

- Statement: an EOA that is not EIP-7702 delegated and has sent no transaction in the previous
  three blocks may spend its whole balance (value plus gas) in one "emptying transaction".
- Source [O]: `docs.monad.xyz/developer-essentials/reserve-balance.md`.
- Consequence: a funder's passkey account can swap its entire MON balance to AUSD in one Kuru
  swap. The 10 MON floor applies to the relayer, which keeps several transactions in flight.

## D7, 9 Sep 2026, fiat rails for the first chain

- Statement: Transak production API keys require a KYB approval (self-serve dashboard, approval
  delay not documented). Mercuryo's consumer widget at `exchange.mercuryo.io` opens without any
  partner id, offers Buy and Sell, card, Apple Pay and Google Pay, and lists MON on Monad
  (checked in Chrome). Mercuryo's public currencies API lists MON on network `MONAD`.
- Source [P]: `docs.transak.com/docs/setup-your-partner-account`, browser check of
  `exchange.mercuryo.io`, `api.mercuryo.io/v1.6/lib/currencies`.
- Consequence: the first end to end chain uses Mercuryo's consumer widget for both fiat legs,
  driven by the user's own card and KYC. Transak is not a path for that chain. Calm remains the
  target for a bank-like flow once a tenant exists.

## D8, 9 Sep 2026, Kuru Flow figures

- Statement: quote of 1 MON gives 0.0258 AUSD; router `0xb3e6778480b2E488385E8205eA05E20060B813cb`;
  native MON is the zero address and needs no approval; AUSD as input needs an ERC-20 approval of
  the router; the token endpoint returns a rate limit of 1 request per second with a burst of 1.
- Source [P]: `POST https://ws.kuru.io/api/generate-token`, `POST /api/quote`.
- Consequence: 25 EUR buys roughly 1,100 MON; scripts serialise Kuru calls with at least one
  second between them.

## D9, 9 Sep 2026, the Duolingo public profile resolver is alive

- Statement: `GET https://www.duolingo.com/2017-06-30/users?username=<name>` with
  `Accept: application/json`, exactly as Lock-in's `src/duolingo-profile.ts` sends it, returns
  `{"users":[{"id":..., "username":..., "totalXp":...}]}` for three tested usernames. Adding a
  `fields` query parameter makes the endpoint return `{}`. The XP endpoint used inside the proof
  (`/2023-05-23/users/<id>?fields=id,totalXp`) answers 401 without the user's own session.
- Source [O]: direct requests.
- Consequence: the resolver is ported unchanged and never "improved" with extra parameters.

## D10, 9 Sep 2026, Mera facts and the permanent binding to the hostname

- Statement: `@category-labs/mera` 0.2.0; peers `viem` and `react-native-passkey` are optional;
  API `createPasskeyWithPrfOutput`, `getPasskeyPrfOutput`, `createSecp256k1SigningSession`,
  `toViemAccount` (from `@category-labs/mera/viem`), `isMeraError` with codes `PRF_UNAVAILABLE`,
  `PASSKEY_OPERATION_FAILED`, `CRYPTO_UNAVAILABLE`, `SESSION_ENDED`. `rpId` must equal
  `location.hostname`. A passkey is bound to its `rpId`: if the app moves to another domain the
  accounts can no longer be derived.
- Source [O]: npm registry, `docs.monad.xyz/guides/mera.md`.
- Consequence: the production hostname is chosen before the first real user creates an account.
  Accounts created on Vercel preview hostnames are throwaway and are used only for spikes.

## D11, 9 Sep 2026, Lock-in has no EIP-3009 code and its verify route signs nothing

- Statement: a full-text search of every source file of `RedGnad/Lock-in` finds no
  `receiveWithAuthorization`, `transferWithAuthorization`, `3009` or `AUSD`. Lock-in's stake token
  is USDC pulled with `approve` then `safeTransferFrom`. `app/api/duolingo/verify/route.ts` verifies
  the Reclaim proofs (TEE attestation required, AI fallback refused) but signs no attestation; the
  evidence signer lives in the escrow twin (`app/api/duolingo/escrow/verify/route.ts`,
  `src/duolingo-attestation.ts`, domain `Lock In Duolingo` version 1).
- Source [O]: exploration of the repository at the pinned commit.
- Consequence: the AUSD authorization path is new code, tested against the measured domain (D5).
  The attestation signing pattern is ported from the escrow twin; the verification pattern from the
  verify route.

## D12, 10 Sep 2026, creation and funding happen in one transaction (accepted deviation)

- Statement: the spec lists `createGift` then `fundWithAuthorization`. Viky merges them:
  `createGift(GiftParams, Authorization)` pulls the AUSD with `receiveWithAuthorization` and
  requires the authorization nonce to equal `keccak256(abi.encode("viky.fund.v1", termsHash))`.
- Source: design decision, accepted by the owner on 10 Sep 2026.
- Consequence: the funder signs once, and that single signature is also the consent to the exact
  terms (a relayer cannot alter them without invalidating the signature). A gift never exists
  unfunded.

## D13, 10 Sep 2026, one-day catch-up window before any drain (accepted deviation)

- Statement: a day `d` can be drained only once `block.timestamp >= dayStart(d) + 1 day +
  CATCH_UP_WINDOW`, with `CATCH_UP_WINDOW = 1 day`. Check-ins credit the earliest open days in
  order; a binge inside the window is allowed, as the spec states.
- Source: design decision, accepted by the owner on 10 Sep 2026.
- Consequence: the recipient has until the end of the next day to cover a day; the keeper cadence
  never decides what counts as missed, the contract does.

## D14, 10 Sep 2026, the check-in attestation is provider-neutral

- Statement: the spec's `CheckIn` carries `totalXp`. Viky's carries `providerId` (bytes32) and
  `metricValue` (uint64); the gift's `goalType` fixes the reading (Duolingo total XP, Strava
  metres, GitHub contributions, on-chain units), and an owner-managed registry maps each
  `goalType` to the `providerId` its check-ins must carry. `baselineXp` becomes `baselineValue`.
- Source: owner's amendment, 10 Sep 2026.
- Consequence: a new verified service is a new registry entry and a new server-side verifier,
  never a new contract.

## D15, 10 Sep 2026, Strava is a launch candidate, not a demo

- Statement: the spec ranks Strava as "demo only" because of the Strava API's 10-athlete cap.
  With zkTLS the user proves their own session, so that cap does not apply. Fallback if zkTLS
  disappoints: the Strava Developer Program, 99 athletes.
- Source: owner's amendment, 10 Sep 2026.
- Consequence: `LockInStravaReclaimVerifier.sol` and its real-proof tests are ported at the same
  rank as Duolingo. Order after the fiat chain: on-chain conditions, GitHub contributions, Strava.

## D16, 10 Sep 2026, OpenZeppelin stays at 4.9.6

- Statement: the pinned Reclaim Solidity SDK (`reclaimprotocol/reclaim-solidity-sdk@3326a4e`)
  imports `@openzeppelin/contracts/utils/cryptography/ECDSA.sol` and the 4.x upgradeable contracts,
  and Foundry resolves one `@openzeppelin/contracts/` remapping per project.
- Source [O]: the SDK's imports and `package.json` at the pinned commit; Lock-in's `remappings.txt`.
- Consequence: `@openzeppelin/contracts` and `@openzeppelin/contracts-upgradeable` are pinned at
  4.9.6 as in Lock-in, for the verifiers and for `GiftEscrow` alike. The plan's mention of 5.6.1 is
  withdrawn.

## D17, 10 Sep 2026, Serwist through its Turbopack integration

- Statement: Next 16 builds with Turbopack by default, and Serwist's webpack plugin (the template's
  `@serwist/next` setup) has a separate Turbopack quick guide: `@serwist/turbopack`, a route
  `app/serwist/[path]/route.ts` that bundles the worker with esbuild, and a `SerwistProvider`.
- Source [O]: `serwist.pages.dev/docs/next/turbo`, npm `@serwist/turbopack@9.5.12`.
- Consequence: the service worker is served from `/serwist/sw.js`, precached entries are injected at
  build time (20 entries on the first build), and the offline fallback `/~offline` is registered under a
  revision that changes with every deployment.
