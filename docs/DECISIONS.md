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

## D18, 10 Sep 2026, how progress turns into days (GiftEscrow accrual rule)

- Statement: the spec gives `creditedDays = min(elapsed, floor(deltaXp / dailyTarget))` without saying
  what happens to the leftover metric. `GiftEscrow.checkIn` anchors the metric on the last CREDITED
  point: when the metric limits the credit, the anchor moves by exactly `credit * dailyTarget` and the
  remainder (always below one day) carries to the next check-in; when the open days limit the credit
  (a binge), the anchor jumps to the observed metric and the excess is discarded, never banked for
  future days. A check-in that credits nothing is refused (`InsufficientProgress`), so it costs no
  nullifier and no gas. The window opens the UTC day after the baseline; `startsAt` is therefore set
  at the baseline, not at creation.
- Source: design decision while writing the contract, 10 Sep 2026; both branches are unit-tested and
  the fuzz test checks that every unit of a gift ends with the recipient or the refund destination.
- Consequence: partial lessons add up across days, a marathon day cannot buy a week off, and the
  keeper cadence never decides what counts as missed.

## D19, 10 Sep 2026, a salt in the gift terms

- Statement: the funding nonce is derived from the terms (D12). Without a per-gift salt, a funder
  repeating an identical gift (same contact, amount, target, duration) would sign an EIP-3009
  authorization AUSD refuses as already used.
- Source: unit test `testTwoGiftsWithIdenticalTermsNeedDistinctSalts`, 10 Sep 2026.
- Consequence: `GiftParams.salt` (random, chosen by the funder's app) is part of the hashed terms and of
  the funding nonce.

## D17, 10 Sep 2026, Serwist through its Turbopack integration

- Statement: Next 16 builds with Turbopack by default, and Serwist's webpack plugin (the template's
  `@serwist/next` setup) has a separate Turbopack quick guide: `@serwist/turbopack`, a route
  `app/serwist/[path]/route.ts` that bundles the worker with esbuild, and a `SerwistProvider`.
- Source [O]: `serwist.pages.dev/docs/next/turbo`, npm `@serwist/turbopack@9.5.12`.
- Consequence: the service worker is served from `/serwist/sw.js`, precached entries are injected at
  build time (20 entries on the first build), and the offline fallback `/~offline` is registered under a
  revision that changes with every deployment.

## D20, 10 Sep 2026, Mercuryo minimums decide the amounts of the first chain

- Statement: Mercuryo's public API gives, for EUR, a buy minimum of 25 EUR and a maximum of 15,000 EUR
  (card, Google Pay, Apple Pay), with a fee of 0.95 EUR on 25 EUR (about 3.8 %). On the sell side
  (MON to EUR) the quote endpoint refuses amounts below about 150 MON (about 3 EUR gross at 0.0202
  EUR per MON) and charges a flat 3.00 EUR up to about 100 EUR (3.84 EUR on 100.87 EUR). The gift
  contract itself accepts 1.00 AUSD.
- **Both sell figures here are wrong and were corrected on 14 Sep.** The smallest sell order is
  879.889249290954315600 MON, not about 150 (D60, read from `/v1.6/lib/limits/sell`), and the fee is up to
  3.95 % with a floor of **4 EUR**, not a flat 3.00 EUR (Mercuryo's own help pages, read 14 Sep; a live MON
  quote that day returned a 3.00 EUR minimum fee, so the two disagree and the screens carry the higher one,
  which is the one that can disappoint nobody). The buy figures stand and were re-measured on 14 Sep: 25 EUR
  still buys 1230.845 MON with a 0.95 EUR fee, 3.8 %.
- The consequence written below is therefore also wrong where it says a few credited days clear the sell
  fee: no gift of $20 can be cashed out at all through this rail. See D60 and D62.
- Source [P]: `api.mercuryo.io/v1.6/lib/currencies` (`fiat_payment_methods.EUR.limits`), and
  `api.mercuryo.io/v1.6/public/convert` probes for buy (0.1 to 1,000 EUR) and sell (100 to 5,000
  MON), 10 Sep 2026.
- Consequence: the first chain cannot be tested with 1 EUR. Leg 1 buys the 25 EUR minimum; the gift
  is $20.00 over 7 days (about $2.86 per day) so that several credited days sold together exceed the
  3 EUR flat fee and land a visible amount on the bank account; the remaining AUSD stays in the
  funder's account for a second gift. A single day of a small gift is below the sell minimum: the
  exit leg is run on every credited day so far, not on one day. The spec's "small amounts" are
  bounded from below by the on-ramp, not by the contract.

## D21, 11 Sep 2026, personal data stays in the EU and the passkey label stays on the device

- Statement: the passkey creation asked for a first name; that name is only the WebAuthn `user.name`
  label held by the device's passkey manager, the Mera SDK makes no network call, and Viky's server
  receives only the account's public identifier and a challenge signature. Vercel functions ran in
  `iad1` (Washington) while the Neon database is in Frankfurt. French law lets a non-professional
  publisher keep their identity with the host instead of publishing it (LCEN, article 6-III-2).
- Source: `src/account/mera.ts`, `node_modules/@category-labs/mera/dist/passkey.js` (no `fetch`),
  `app/api/account/*`, the production deploy log of 10 Sep 2026 (`iad1`), Vercel terms section 22.3.4
  (Vercel Inc., Covina, CA), LCEN article 6-III-2.
- Consequence: the name field is optional with the neutral label "Viky account" and an explanation
  under it; `vercel.json` pins the functions to `cdg1` (Paris), verified with the `x-vercel-id`
  header; `/privacy` and `/legal` describe the actual stores, processors and retention, name Vercel
  as host and the publisher as a non-professional individual; `NEXT_PUBLIC_CONTACT_EMAIL` fills the
  contact when the user chooses one. Both pages are to be re-read before the first person outside the
  team uses Viky (KT4).

## D22, 11 Sep 2026, the first chain is split: on-chain core now, fiat legs on the intended rail

- Statement: the only self-serve fiat rail (Mercuryo's consumer widget) is the one the product is meant
  to replace: the funder leaves Viky, chooses a currency, pastes an account identifier and sees "MON".
  The two rails that remove that screen both depend on a third party and neither has been requested:
  Calm (bank transfer paying AUSD directly; tenant by call) and a Mercuryo partner widget with the
  destination pre-filled (application, KYB and a sales manager, not self-serve; URL parameters are
  ignored without a `widget_id`, checked 11 Sep 2026). Spending 30 EUR on the consumer widget would
  measure the worst case and lock the money for about a week (D20).
- Source: `help.mercuryo.io/hc/en-gb/articles/14495549557277-Becoming-a-partner`,
  `widget.docs.mercuryo.io`, a browser run of `exchange.mercuryo.io` on 11 Sep 2026 up to the "Entrez
  l'adresse du portefeuille" screen (EUR leg "Alimenté par CRIPTAN TRADE S.L."), the plan's user-owned
  item "Calm: book the Calendly call" (not done), the funder's own objection on 11 Sep 2026.
- Consequence: KT1 runs in two parts. Part one, now and at no fiat cost: MON sent from the funder's own
  wallet, then every Viky-owned leg on mainnet (single-signature funding by the passkey account, claim,
  Reclaim check-ins, withdraw, drain, refund) and a crypto-native exit ("Send back" on `/dev/exit`).
  Part two, the fiat legs, only on the rail Viky will ship, once Calm or a Mercuryo partner account
  exists; the consumer-widget run stays available as a ten-minute fallback record. Until part two runs,
  KT1 as written in the spec is unanswered and the record says so. The rail requests (Calm call,
  Mercuryo partner application) are the funder's, because they engage an identity.

## D23, 11 Sep 2026, what the Agora bounty actually points at

- Statement: the bounty page (hackathon.monad.xyz/tracks, Agora Payments Bounty, read 11 Sep 2026)
  says "Teams should build against Agora's public API documentation and staging environment", judges
  "implementation quality, real-world usability, business viability of the payments flow", and wants "a
  working demo showing passkey onboarding, an AUSD balance, and a completed send/receive transaction
  settled instantly". Agora's documentation has two products neither the spec nor the plan mentions:
  (1) the Agora Public API (`api.agora.finance`, organisation API keys from the Agora dashboard, routes
  fiat to AUSD and back; bank accounts are USD only with US routing numbers, wallets on EVM or Solana,
  no staging base URL documented); (2) the Instant Settlement protocol, a fixed-price AUSD/USDC pair.
  On Monad mainnet the pair `0xf33286E3222D1c829dACeac48c0Ec651F6452470` (factory
  `0x8468587Af422ad440F58a57E955eCA6A970b5375`) holds 5,352,685 AUSD and 2,552,173 USDC, quotes
  10 AUSD for 10 USDC, and both purchase fees read 0. The docs state that swaps need the
  `APPROVED_SWAPPER` role (KYC whitelist); the contract's source is not verified on Sourcify, so the
  role check could not be read on chain.
- Source: the bounty detail page, `docs.agora.finance/llms.txt` index, `api.md`, `api/authentication.md`,
  `api/endpoints/{accounts,routes,transactions}/overview.md`, `instant-settlement.md`,
  `instant-settlement/core-concepts.md`, `instant-settlement/smart-contracts/pair-contract.md`,
  `instant-settlement/protocol-deployments.md`, `cast call` on the pair, 11 Sep 2026.
- Nuance (strategy review, 11 Sep 2026): the bounty page links a single official Agora resource,
  `docs.agora.finance/contract-overview`, neither the Public API nor Instant Settlement, and none of
  the eight idea accordions of the Consumer track cites them. The reading "instant settlement means
  their product" is therefore a hypothesis drawn from the bounty's wording and the docs index, not
  from a link. The docs describe no public whitelisting procedure on mainnet, only Sepolia faucets and
  a testnet whitelister.
- Consequence: "instant settlement" in the bounty is ambiguous: Agora's whitelisted pair, or AUSD
  settling in about a second on Monad. The AUSD to USDC leg before a card (Immersve needs USDC, SPEC 9.2) should go through
  Agora's pair rather than Kuru, if a hackathon team can be whitelisted. The Public API is a USD
  business treasury tool, not a rail for a French funder paying in euros. Three questions for the Agora
  workshop of 11 Sep 2026, 17:30 GMT+2 (the only documented place to ask): does a PWA count as a
  "mobile app" (KT2); how does a team get whitelisted on the Monad pair and what "staging environment"
  means; is any non-USD fiat route planned. Nothing is built on these until the answers exist.

## D24, 11 Sep 2026, the Duolingo login inside Reclaim's portal is the wall for a non-crypto person (decision pending)

- Statement: at the baseline check-in of gift 1, the recipient (the funder testing on a Xiaomi in
  Chrome) hit the same wall Lock-in had: Reclaim's `portal` channel runs the Duolingo sign-in in a
  remote browser, so the "Continue with Google" button demands the Google id and password again, then
  a two-step verification (new device for Google), and the remote screen is blurry. Duolingo's public
  profile endpoint, `GET /2017-06-30/users?username=<name>` (already used to resolve usernames, D9),
  returns `totalXp` and `streak` for any username with no session at all (checked 11 Sep 2026 on two
  public accounts). The zkTLS check-in attests the same number, `totalXp`, from Duolingo's private XP
  request. What the zkTLS proof adds is the ownership of the account (the person proved their own
  session) and a TLS-attested data origin; in v1 the contract trusts the evidence signer either way
  (SPEC 7.1).
- Source: the recipient's report on 11 Sep 2026; `src/duolingo-proof-policy.ts` (evidence field
  `totalXp`); `curl` of the public endpoint for `duolingo` (1370 XP) and `luis` (156,020 XP);
  `duolingo.com/settings/profile` lets a person change their display name.
- Options on the table, none chosen yet:
  1. Public profile for every daily check-in (no login, ever, after setup) with ownership proved
     once by a code the recipient puts in their Duolingo display name for a minute (server reads the
     public `name`, binds, the person reverts). No password, no remote browser, thirty seconds.
     Costs: the data origin is our server reading a public endpoint (no TLS proof); a new provider
     id registered for the Duolingo goal (D14 makes that a registry entry, not a contract change);
     the unofficial endpoint can change (same risk class as KT3).
  2. Keep zkTLS and switch to Reclaim's `app` channel (S1, a config switch): the sign-in happens in
     the Reclaim Verifier app on the person's own phone. Costs: installing a third-party app; Google
     sign-in inside an app web view is often refused by Google; untested.
  3. Hybrid: zkTLS once at the baseline for ownership, public profile for the daily check-ins.
     Halves the pain, keeps the first-day wall.
- Consequence: the wall is a design fact, not a bug; the choice is between verification purity and
  the "my grandmother uses the app" bar the track scores. To be decided by the funder with the
  strategy side; gift 1 continues on the current path meanwhile so the rest of the chain is measured.

## D25, 11 Sep 2026, spike S1: on Android the zkTLS verifier must be installed once; the Reclaim app carries Lock-in's name

- Statement: with `RECLAIM_VERIFICATION_MODE=app` the baseline check-in on the Xiaomi (Chrome) opened
  the Play Store asking to install "Reclaim Verifier" instead of an Instant App. Reclaim's own post
  explains why: Google discontinued Play Instant ("Starting December 2025, Instant Apps cannot be
  published through Google Play"), and since the week of 4 Nov 2025 Reclaim's Android flow is
  "redirected once to the Play Store to install the app. After installation, it opens automatically
  and verification continues right away" (deferred deep link). The post says nothing about iOS App
  Clips. The consent screen also read "Lock In wants to connect", because the Reclaim application
  credentials are borrowed from Lock-in (D22 sources); the name shown is the application's name on
  the Reclaim dashboard.
- Source: the recipient's run on 11 Sep 2026; `blog.reclaimprotocol.org/posts/moving-beyond-google-play-instant`;
  `docs.reclaimprotocol.org/api-key` (an application is created on `dev.reclaimprotocol.org`, "New
  Application", the secret is shown once).
- Consequence: on Android, a zkTLS check-in through Reclaim costs one app install per device, then
  the deferred link brings the person back; the daily check-in afterwards is what S1 still has to
  measure (does the login persist in the verifier). The verifiable path is therefore not install-free
  on Android; on iPhone the App Clip is to be tested. The app name is fixed by creating a "Viky"
  application on the Reclaim dashboard with the same Duolingo provider (the funder's account), then
  switching `RECLAIM_APP_ID` and `RECLAIM_APP_SECRET`. The verification primitive (zkTLS, TEE
  attestation required) stays; the choice left to the funder and the strategy side is the
  onboarding cost per platform, see D24 for the alternatives.

## D26, 11 Sep 2026, zkFetch: attested public data with no gesture from the person (candidate, decision pending)

- Statement: Reclaim ships `@reclaimprotocol/zk-fetch` (1.1.0, 28 Jul 2026): a server (or a browser
  holding a session signature) makes an HTTPS request and receives a Reclaim proof of the response,
  `responseMatches` extracting fields, `useTee: true` per request, verified with `verifyProof` from
  the js-sdk and transformed with `transformForOnchain` for the same on-chain verifier family as user
  proofs. It needs the application id and secret, nothing from the end user. Duolingo's public profile
  endpoint returns `totalXp`, `name` and `id` for a username (D24).
- Source: `registry.npmjs.org/@reclaimprotocol/zk-fetch` readme (install, `ReclaimClient`, `zkFetch`,
  `useTee`, `verifyProof`, `transformForOnchain`, session signatures with `allowedUrls`); D24 for the
  endpoint.
- What it would give: a daily check-in with no button, no login, no install: the keeper fetches a
  TEE-attested proof of the person's public profile once a day and the evidence signer attests
  `totalXp` from it, so the money accrues "as you go" exactly as the tagline says, and every
  check-in stays verifiable by a third party (the attestor signed Duolingo's response, not Viky).
  Account ownership proved once, without a password: the person puts a short code shown on their gift
  page into their Duolingo display name for a minute; a zkFetch proof of the profile carrying that
  code binds the profile id to the gift. The same pattern covers GitHub (public contributions, a code
  in the bio). Private data (Strava) keeps the user proof through the verifier app.
- What it costs or leaves open: the unofficial endpoint can change (same risk class as KT3, the
  schema to confirm becomes the public one); a person with a private Duolingo profile must make it
  public; zkFetch pricing and rate limits are not stated in the readme; the goal registry needs a
  new provider id for Duolingo (owner call, no contract change, D14); about a day of work (fetch
  module, ownership step on the gift page, keeper job, tests, DECISIONS update).
- Consequence: nothing built until the funder and the strategy side choose between (a) the verifier
  app path (install once on Android, App Clip on iPhone, D25) and (b) zkFetch on public data with
  the display-name binding. Both keep the verification attested by Reclaim; they differ in what the
  person has to do every day: an app, or nothing.

## D27, 11 Sep 2026, decision: zkFetch on public data, zero daily gesture; the verifier app stays the exception

- Statement: the strategy side chose D26 option (b) after checking its three load-bearing facts
  itself (the public Duolingo profile returns XP without a session; Google removed Play Instant;
  attested zkFetch exists, with secret headers). Reasoning recorded with the decision: the loss
  effect measured by Patel and Volpp holds because the withholding is automatic; a recipient who
  must sign in again every day in a blurry remote browser is not in that experience, and ours gave
  up at the first check-in. Mode 3 does not degrade the demo, it breaks the mechanism the product
  sells. On account ownership: in a bet, impersonation robs the other players; in a gift, a wrong
  account only harms the funder who chose it, never a third party. So the funder enters the
  Duolingo username if they know it; otherwise the recipient enters it and proves control with a
  code placed in their display name for a minute, a practice common to verification bots for
  gamers (Roblox, osu!, Chess.com), the very population of Duolingo learners. Both options on the
  same screen.
- Build order: (1) Duolingo in public mode, unblocks gift 1; (2) Strava in connected mode ("Connect
  with Strava", the ported verifier, ten athletes cover KT4; two daily sources on one contract prove
  Viky is not a Duolingo product); (3) diplomas and badges by Coursera or Credly link, the
  organisers' literal example, third because a one-off milestone needs a "milestone" goal type in
  the contract; (4) mode 3 measured once on gift 1, outside the demo, so its cost is a number.
- Two accepted risks, to be written on the judges page: the endpoint is unofficial (same risk class
  as the live schema); zkFetch is priced "from $0.10 per verification" per Reclaim's site, one fetch
  per recipient per day, never per gift, exact figure to obtain.
- Source: the strategy review of 11 Sep 2026, relayed by the funder; D24 to D26 for the facts.
- Consequence: build now. The verifier-app path (Reclaim session and verify routes, `app` channel)
  stays in the code as the mode for private sources.
- Built and measured, 11 Sep 2026: zkFetch needs a "Public Data (zkFetch)" application with zkFetch
  switched on in the dev tool (a plain application answers "Application not found"). A read of a
  public profile in TEE mode takes about 5 s and returns a proof signed by Reclaim's production
  attestor `0x244897572368Eadf65bfBc5aec98D8e5443a9072` (the address the on-chain Duolingo verifier
  pins); `verifyProof` accepts it in 0.4 s with content validation disabled (Viky validates URL,
  method and username itself). The proof object of zk-fetch 1.1.0 carries no attestor TEE
  attestation, so Viky verifies the signature and pins the attestor, and says so on the judges page.
  Goal 1 re-registered to the public provider id on mainnet (`0x768ae8…6c71`). Daily pass wired to
  a Vercel cron at 00:30 UTC and to `pnpm keeper`. Vercel functions start Node 24 with
  `--no-experimental-require-module` (read from `process.execArgv` on 11 Sep 2026), and zk-fetch is a
  CommonJS build that requires ESM-only packages, so the fetch cannot run inside a Vercel function:
  it runs in a small worker (`pnpm zkfetch:worker`) and Vercel verifies the returned proof (attestor
  signature, pinned address, URL and username). Measured through the worker from Vercel: 5.4 s. The
  worker ran on the operator's machine behind an ngrok tunnel for the baseline of gift 1, then moved
  to Railway the same day (project `viky`, service `zkfetch-worker`,
  `zkfetch-worker-production.up.railway.app`, built from `Dockerfile`: Node 24 on Debian plus the
  system CA store, which the Go TEE client needs; without it: "x509: certificate signed by unknown
  authority"). Railway's default builder ignored the start command and served the Next app; the
  explicit Dockerfile removes that ambiguity. Unauthenticated calls get 401.

## D28, 11 Sep 2026, KT3 is superseded for Duolingo by the public mode

- Statement: KT3 asked whether the live Duolingo schema of the zkTLS session provider
  (`cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8`) still matches the on-chain verifier's grammar, which
  decided whether `LIVE_SCHEMA_CONFIRMED` could be set. Since D27 the Duolingo goal no longer uses the
  session proof: the registry holds the public provider id, and the number comes from an attested read
  of the public profile. The fields read there (`id`, `totalXp`, `username`, `name`, `streak`) are
  checked against real responses by `test/duolingo-public.test.ts`, and every daily read re-attests
  them; a drift makes the read fail with a typed refusal rather than credit a wrong number.
- Source: D27; `src/duolingo-public.ts`; the baseline of gift 1 (tx `0x95770ded…0c76`) and the read of
  11 Sep 2026 12:06 UTC from Railway (8401 XP).
- Consequence: `LIVE_SCHEMA_CONFIRMED` stays `false`; the on-chain Reclaim verifier is not on the v1
  path (SPEC 7.1: the evidence signer is), and the session-proof capture is only needed if the
  verifier-app path is ever used for a private source. The live-schema risk now lives in the public
  endpoint and is written on the judges page as an accepted risk.

## D29, 11 Sep 2026, Calm now carries card and bank transfer straight to AUSD on Monad, with any signer

- Statement: Calm's release v0.13.0 (9 Sep 2026) changes three facts the spec relied on. Card is
  Live (two providers, `card` and `card[stripe]`, with Card, Apple Pay and Google Pay rows, 53
  markets), next to bank transfer Live (ACH/wire USD, SEPA EUR, Faster Payments GBP, KYC the first
  time). Monad (`143`) takes `destinationToken="AUSD"`, "never shown to the end user". Wallet
  authentication is removed: no SIWE, no Privy or Dynamic token; every request carries a publishable
  key pinned to an origin allowlist, and `<CalmProvider>` takes the app's own `address`,
  `sendTransaction`, `signTypedData` and `waitForReceipt`: "any stack that can produce an address and
  sign will work", so Mera passkey accounts fit as they are. A sandbox API exists
  (`api.sandbox.calmtreasury.xyz`). The card quote API prices either a fiat spend or an exact crypto
  output and has an `amount_below_minimum` refusal. Account access is still by call (no self-serve
  dashboard sign-up), and the docs describe no off-ramp back to a bank.
- Source: `docs.calmtreasury.xyz` `changelog.md` (v0.13.0), `onramps.md`, `chains.md`,
  `sdk/react/CalmProvider.md`, `sdk/react/CalmDialog.md`, `api/authentication.md`, `api/card/quote.md`,
  read 11 Sep 2026.
- Consequence: SPEC 9.1 is out of date on two points (card "coming soon", SDK tied to wagmi, Privy or
  Dynamic). With a Calm account, the funder's entry becomes card, Apple Pay, Google Pay or SEPA, and
  AUSD lands in the funder's Viky account directly: no "buy MON", no pasted identifier, no swap. The
  exit still needs another path (keep the balance, send back, a card program, or Mercuryo Sell).
  The call with Calm (11 Sep 2026) decides whether an individual publisher can hold the account.

## D30, 11 Sep 2026, a day is judged by the reading of the morning after it

- Statement: with the daily pass reading every recipient at 00:30 UTC, the deployed contract credited a
  reading to the day it was taken on, using progress made the day before. Four consequences, each now
  reproduced by a Foundry test that fails on the deployed code: a lesson taken on a gift's last day is
  refused as "nothing to credit" when read the next morning (the strategy review's finding); a reading
  credits the very day it is taken on; and anyone calling `drain` between midnight and the morning reading
  can drain a day the recipient had covered on its catch-up day.
- Source: `test/GiftEscrow.t.sol` (`testTheLastDayCountsWhenReadTheNextMorning`,
  `testAMissedDayInTheWindowGoesBackToTheFunder`, `testAReadingNeverCreditsItsOwnDay`,
  `testADayIsNeverDrainedBeforeTheMorningReadingThatCouldCoverIt`), run against the deployed source on
  11 Sep 2026: four failures; the strategy review of 11 Sep 2026.
- Correction, same day, from the contract review recorded in D35: an earlier draft of this entry claimed
  the change stops progress made before the window from paying for a missed window day. That is not true
  and was never true. Progress made after the baseline reading, the rest of the baseline day included, is
  inside the delta at the first crediting reading, and there is no way to re-anchor at the start of the
  window. It is bounded by the open days, it requires real verified progress, and the deployed contract
  behaves the same way, so it is not a regression; the claim is withdrawn rather than the behaviour
  changed. The contract docstring is corrected to match.
- Consequence: `checkIn` now credits only completed days: a reading observed on day `d` settles the
  earliest open days up to `d - 1`. A day becomes drainable only once the morning reading after its
  catch-up day has had time to run: `CATCH_UP_WINDOW` = 1 day + `READING_GRACE` (6 hours). All 62
  Solidity tests pass, the accounting fuzz test included. The result of a day appears the next morning,
  which the gift page now says. Deployment: gift 1 stays on the deployed contract until it is finalised
  (about 21 Sep); the corrected contract is deployed before gift 2, and the app then serves each gift
  from the contract that holds it (the escrow of each gift stored with its record), which lands with the
  funder screen. Gift 1's expected outcome under the old rule (lessons through 16 Sep, none on 17 and 18)
  is unchanged: six days credited, one returned.
- Follow-up, same day: serving each gift from the contract that holds it is implemented, not deferred.
  Every gift record carries the contract it was created on; a record without one is refused rather than
  served by the configured contract, so a redeployment can never silently point gift 1 at the new
  contract. The migration stamps gift 1 before any change of the configured contract, and a test pins
  the rule: after the configured contract changes, gift 1 still resolves to the old one.

## D31, 11 Sep 2026, KT2 passed: a progressive web app counts as a mobile app

- Statement: a progressive web app qualifies as the "mobile app" the Agora payments bounty asks for.
- Source: answered directly by Drake Evans, Agora's co-founder and chief technical officer, on the
  bounty's own wording, through the Metropolis mentor channel, relayed by the funder on 12 Sep 2026:
  a progressive web app qualifies as a submission. This replaces the earlier and weaker source, a portal
  support answer: the question is now answered by the person who set the bounty.
- Consequence: KT2 is answered, yes. No native wrapper is built and the Expo shell leaves the plan. The
  install prompt stays the only mobile-app surface, offered after the first successful count.

## D32, 11 Sep 2026, Calm has no account for us: Mercuryo is the entry rail

- Statement: Calm does not open partner accounts to us. They serve trading platforms that are already
  live. There is no sandbox key and no path to a live key for Viky today.
- Source: the Calm call, 11 Sep 2026.
- Consequence: D29 stays as a record of what their product does and is no longer a plan. The entry rail
  is the Mercuryo consumer widget, driven by the funder's own hands and card, with the minimums measured
  in D20: 25 EUR minimum purchase, about 3.8 % in fees. The funder screen is built around that widget
  rather than around an embedded provider, and KT1's fiat legs run on Mercuryo.

## D33, 11 Sep 2026, the production hostname is viky.cash

- Statement: viky.cash is bought. The Mera relying party id is the hostname the app is served from
  (`src/account/mera.ts` reads `window.location.hostname`), so it becomes viky.cash with no code change
  and is never hardcoded. A passkey is bound to its hostname forever (D10).
- Source: the funder, 11 Sep 2026; the Mera guide read on 9 Sep 2026.
- Consequence: viky.cash is added to the Vercel project, with www redirecting to the apex. The preview
  hostname keeps being served until gift 1 is finalised, because both accounts of gift 1 are bound to
  it and nothing about gift 1 moves. Every gift created from now on is created on viky.cash. The Reclaim
  application origins, the legal page and the gift links follow. The stateless test is then run again on
  viky.cash itself: an account created there signs back in from a second browser with the passkey alone.
- Refinement, same day: a claim link follows the hostname the funder created the gift on, rather than being
  pinned to viky.cash. While both hostnames serve, an account exists on one of them and not the other, so a
  gift made from the preview hostname must hand out a preview link or its recipient could not open it with
  the account they already have. `NEXT_PUBLIC_APP_URL` is therefore left unset and the create route uses the
  request's own origin. It is pinned again once the preview hostname stops serving, after gift 1 finalises.
- Note on Reclaim: the origins registered in the Reclaim portal matter only for the session path, where a
  person proves a private source in their own browser. Duolingo runs in public mode (D27), where the fetch
  is attested server side and no browser origin is involved, so gift 1's daily counting does not depend on
  which hostname is registered there.

## D34, 11 Sep 2026, Agora Instant Settlement has no place in the current flow

- Statement: money enters and leaves Viky in MON, and the Instant Settlement pair converts only AUSD and
  USDC, so there is nothing in the current flow for it to settle. The pair on Monad is
  `0xf33286E3222D1c829dACeac48c0Ec651F6452470`; its whitelist holds 72 addresses today, of which 10 carry
  code, and a single whitelister can add to it.
- Source: the strategy review of 11 Sep 2026, measured on chain; Agora's examples repository
  github.com/agora-finance/stable-swap-examples (read on 11 Sep 2026: quotes, maximum swap amounts,
  swaps and pair reserves for AUSD and USDC; the review reports it targets Fuji with the same factory as
  Monad).
- Consequence: nothing is built for it, and the payments bounty is not pursued through this pair. It
  becomes relevant only when both hold: Agora whitelists one of our contracts, and a step of the flow
  actually runs in USDC (an Immersve card, or funding in USDC). Even then it goes in a separate router
  contract, never inside GiftEscrow, which keeps holding one asset.

## D35, 11 Sep 2026, the contract review before the redeployment

- Statement: the D30 and gift-id changes to `GiftEscrow` were reviewed in a separate session, against the
  diff `d1c8e6c..da7a2bc`, before any mainnet deployment. Verdict: safe to deploy, on one condition. The
  day arithmetic is correct, including a reading at the first second of a day and a baseline just before
  midnight; credited and drained days cannot overlap, double count, or leave a day unsettled, and the
  accounting invariants hold under the fuzz test; the longer catch-up window moves `finalise` later
  without breaking anything that depends on it.
- Source: contract review of 11 Sep 2026, every claim reproduced by execution in a scratch copy outside
  the repository.
- Findings and what was done with each:
  1. The deploy script defaulted `FIRST_GIFT_ID` to 1. A new contract starting at 1 would mint an id that
     an existing gift already uses; `saveGift` would drop the row on conflict, and a gift whose money is
     already in escrow would become invisible to the app. Fixed outside the contract: the script now
     refuses to run without an explicit value and checks it against the `nextGiftId()` of the contract
     being replaced, and `saveGift` now fails loudly on a colliding id instead of silently doing nothing.
  2. The only drainer was the 00:30 pass, which under the new grace can settle only up to day X-3, so a
     missed day stayed open a further day and the next morning's reading could pay for a day whose
     catch-up had expired. Fixed outside the contract: a second pass at 07:00 UTC drains and finalises
     only, after the six-hour grace. The counting pass keeps running at 00:30 and stays as forgiving as
     it was.
  3. `_dayOf(observedAt) - 1` underflows to a panic rather than a typed refusal, but only for an
     observation dated before 2 January 1970, which takes a compromised evidence signer. Accepted, not
     fixed: the redeployment carries the D30 corrections only, and the state is unchanged either way.
  4. A `firstGiftId_` of `type(uint256).max` is accepted by the constructor and would brick gift creation
     on the first call, atomically and without moving money. Accepted, not fixed, for the same reason:
     the value now comes from a script that checks it against the contract being replaced.
  5. The claim that progress before the window can never pay for a missed window day is false. Recorded
     as a correction inside D30; the docstring is corrected and the misnamed test renamed.
- Consequence: the redeployment carries the D30 corrections and the gift-id constructor argument, nothing
  else. `FIRST_GIFT_ID` is set to the `nextGiftId()` read from the contract being replaced.
- Deployed, 11 Sep 2026 18:45 UTC: `0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233`, transaction
  `0x3b7f0619421e2bc3e9a57774bca9018be13d44b812a700b839ba80abe0def4bd`, first gift id 2 (read from the
  contract it replaces, which stopped at 2), Duolingo goal registered, creation and check-in unpaused,
  owner unchanged. Source verified through Sourcify on the Monad endpoint, runtime `exact_match`, match id
  1768534. On chain the new constants read back as `CATCH_UP_WINDOW` 108000 seconds (30 hours) and
  `READING_GRACE` 21600 seconds. Gift 1 stays on `0xE04CD59bB93765333200a9da01df83149D4C4d67` until it is
  finalised, because its record names that contract; both are listed on the judges page.

## D36, 11 Sep 2026, Viky does one shape of goal, and it is not the one-shot one

- Statement: every gift today accrues day by day. The amount is split into `amount / durationDays`, each
  day is earned by a daily metric and each missed day drains back, and the duration is bounded to 7 to 90
  days by `MIN_DURATION_DAYS` and `MAX_DURATION_DAYS`. The funder asked what happens to "100 euros if you
  get that diploma", or to a mission delivered tomorrow. The answer is that Viky cannot express it. The
  question was raised by the funder on 11 Sep 2026 while testing the funder screen.
- Source: `contracts/GiftEscrow.sol` (`MIN_DURATION_DAYS = 7`, `checkIn` day arithmetic); `docs/SPEC.md`
  line 84 states "duration (7 to 90 days)" and gives no reason for the floor, so the floor has no recorded
  justification. Recording that absence is the point of this entry.
- Why lowering the floor to one day would not answer it: with a duration of one day the whole amount rides
  on a single day, but that day is still judged by a daily metric, the window still opens only the day
  after the first reading, and the release is still a delta over a target rather than an event that either
  happened or did not. A diploma, a certification and a delivered mission are none of those things.
- Consequence: a one-shot goal is a second shape, not a parameter. It needs a milestone goal type where a
  single verified event releases the whole amount, with a deadline after which everything returns to the
  funder. The goal registry already carries a goal type per provider, so the registry does not change; the
  release path in the contract does. Nothing is claimed about it until it exists: the product today is for
  daily goals, and the education, sport and freelance segments are only partly served by that. Put to the
  advisor, since the segments named for Viky are largely one-shot and this decides what we may claim.
- The lesson, stated plainly: the contract was made extensible along one axis and rigid along the other.
  The goal registry maps a goal type to a provider, so a new *source* of truth (Strava, GitHub) costs no
  contract change. The *shape* of the release, a day at a time over a fixed window, is written into
  `checkIn` itself, so a new shape costs a new contract. We generalised where the pressure was easy to see
  and hardcoded where it was not. That is the thing to carry into the milestone work, not the number 7.
- What it does not cost: waiting. Each gift is served by the contract that holds it (D30), which is already
  running with two contracts at once, so a milestone contract can be deployed while gifts 1 and 2 finish
  where they are. No money in flight blocks a contract change any more.

## D37, 11 Sep 2026, the order of the remaining work

- Statement: the strategy review set the order of the blocks that remain before the freeze. No dates per
  block: each one is finished when its own criterion is met, and only then does the next begin.
  1. **A pass over the words and the look of both journeys.** The funder, from the home page to the link
     they hand over. The recipient, from the link to "the money is in your name", then the mornings, then
     taking it. Every state gets its own words (waiting for the card payment, funded, a day credited, a day
     missed, taking the money), and every failure gets a way out (no passkey support, a refused browser, a
     name that does not resolve, a profile that is private). No forbidden word, and readable one handed on a
     phone. One simple visual system: one typeface, one palette, one set of components. No graphic identity
     yet. The browser test belongs to this block, not a later one.
  2. **The way out through Mercuryo Sell, inside the app**, so the recipient sees a payout and nothing else.
  3. **The first real gifts, with people close to the funder.** KT5 is timed here, on a phone that has never
     seen Viky, including placing the code in the display name.
  4. **The milestone shape**: a `MilestoneGift` contract, verified through a certificate and through
     Chess.com, reviewed in a separate session before it is deployed.
  5. **The encrypted note from the passkey's second key, the Envio index, and a judges page that shows a
     refusal happening in under thirty seconds.**
  6. **Strava in connected mode if the rest holds**, then hardening, then the freeze.
- Source: the strategy review of 11 Sep 2026, evening.
- On the milestone block, recorded because it reverses a recommendation: D36 recommended not building the
  one-shot shape before the freeze, on the ground that the bottleneck is verification rather than release
  logic, and that a milestone with no credible source would be a demo. The review decided to build it and
  answered that objection directly by naming the sources: a certificate, and Chess.com. Chess.com is a
  public profile of the same family as the Duolingo one already running, so the attested public read of D27
  carries over. The objection is met, and the block is in the order.
- Two standing obligations that belong to no block: record the result of the written prediction on the
  00:30 pass of 12 Sep, whichever way it falls; and on the day gift 1 produces its first drain, keep the
  transaction hashes and a capture of the screen, because a day coming back to the funder by itself is the
  central scene of the submission video.

## D38, 12 Sep 2026, a missed day is sent back, not parked

- Statement: the product promise is that every missed day comes back to the funder. Until tonight it did
  not. `drain` only moves a missed day out of the gift and into a refundable bucket inside the contract;
  `refundUnearned` is what actually sends it, and neither scheduled pass ever called it. The money would
  have sat in the contract until somebody ran the keeper by hand with a flag. Found while reading the
  funder's own list of gifts with the funder, who could see what had come back and nothing else.
- Source: `app/api/cron/daily/route.ts` and `app/api/cron/settle/route.ts` both called `dailyPass()`
  without `refund`, read on 12 Sep 2026; `scripts/keeper.ts` exposes it only behind `--refund`.
- Consequence: the settling pass now drains, finalises and sends back, in that order, once a day after the
  reading grace. Sending costs about 170,000 gas, a fraction of a cent at the current base fee, so there is
  no reason to make anyone ask for their own money. The funder's list also stopped telling half the story:
  it showed what had come back and never what had been earned, which is the half that says the gift is
  working. It now says both.
- What this does not change: the contract was always correct, the money was never at risk and never
  anywhere but the gift. What was wrong was that a promise made on the screen depended on somebody running
  a command.

## D39, 12 Sep 2026, the screen's promises are checked against the code

- Statement: three real defects in two days lived in the same gap. Our tests check that the code does what
  the code says; nothing checked that the code does what the screen says. The defects: a screen promising
  that a missed day comes back while nothing ever sent it (D38); an account announced to the app before
  the server had accepted the browser, so the gift list asked with no session and kept the refusal on
  screen; and a message telling someone to take a code out of their display name when the sender had named
  the account and no code had ever been issued. None was found by a test, a review or an audit. All three
  were found by reading the words on the screen against what the code does, twice from a screenshot.
- Source: the strategy review of 12 Sep 2026, which adopted the discipline; the three defects are recorded
  in D38, and in the commits of 11 and 12 Sep 2026.
- Consequence: every sentence a screen shows about money or the state of a gift is written in
  `docs/SCREEN-CLAIMS.md` beside what must be true for it and the code path that makes it true, and each
  one carries a test that exercises that path. A test that would not fail if the promise stopped being
  kept does not count. The rule is in `CLAUDE.md` and a new sentence is added in the same commit that adds
  the sentence. The first such test is `test/daily-pass.test.ts`, which fails in three places if the
  settling pass stops sending a missed day back; that was checked by reintroducing the defect.
- Three answers from the same review, recorded so they stop consuming attention:
  1. **The entity question is closed for the hackathon.** Calm is out and Mercuryo's consumer widget needs
     no partner account, so nothing in the current path requires a company.
  2. **The visual system**: structure now, and the skin before the second wave of real gifts, never after
     the freeze. The submission video is shot on the real interface, not on the test harness. "The real
     interface comes later" does not mean after the freeze.
  3. **The first automatic return has still never run on mainnet.** It happens at gift 1's first missed
     day, inside its 12 to 18 Sep window. That day: keep the transaction hashes and a capture. It is the
     first time the money will travel back on its own, and it is the scene the submission video needs.

## D40, 12 Sep 2026, the mentor questions that are out

- Statement: four questions were sent through the Metropolis mentor channel on 11 Sep 2026, closing a
  point I had left open in two reports by recording, wrongly, that none had been sent. I had drafted them
  and never had the means to send them; the funder sent four.
- Source: the funder's own mentor page, read on 12 Sep 2026.
- State: **Drake Evans** (Agora), answered, a progressive web app qualifies, see D31. **Antons K.**
  (EU and UK payment licences), pending, on whether our non-custodial setup needs CASP authorisation after
  MiCA's transitional period and which component would trigger it. **Arthur** (Mercuryo), pending, on a
  partner widget for a small team during Metropolis and on whether AUSD is listed on Monad or a swap to
  MON is required first. **Stephen Edvi** (Blink), pending, on what winning consumer payment products
  understood about their users.
- Consequence: Arthur's answer is on the critical path of the way out, block 2 of D37. It does not block
  the build: the measured path of D20, swapping to MON and selling through Mercuryo's consumer widget, is
  what gets built, and a partner widget would only replace the last step.

## D41, 12 Sep 2026, the way out is built on the consumer widget, and is unproven

- Statement: block 2 of D37, the way out, is built. What a gift earned sits in the recipient's own account;
  the screen turns it into something the payout service takes, hands the person to Mercuryo's page, and
  sends it where that page tells them. Viky pays for the two steps it costs them, guarded so it is not a
  tap anyone can turn: the account must already hold something to convert, which only a gift gives it.
- Source: Mercuryo's own minimums measured in D20 on 10 Sep 2026, a sell quote refused below roughly 150
  MON and a flat 3.00 EUR fee up to about 100 EUR; D32, their consumer page takes no parameters from us.
- Consequence and its honesty: the fee is stated on the screen before anything is done, because on a small
  amount it takes most of it, and a floor sits above their refusal so nobody is sent to a page that will
  turn them away. **No payout has ever been made.** The screen is recorded in `docs/SCREEN-CLAIMS.md` with
  every line marked as not run, and nothing may claim the way out works until one has gone through.
- What would replace it: a Mercuryo partner widget, where the amount and the destination are filled in for
  the person and they see only a payout. That is the question sent to Arthur at Mercuryo (D40), still
  unanswered. Until then the person does three things on someone else's page, which is the honest state.

## D42, 12 Sep 2026, the rail is one object, and Calm comes back later with something to show

- Statement: adding money and taking it out are steps of the journey, not steps of a provider. Which
  company stands behind them is a single object, `src/rails.ts`, holding the name shown on screen, the page
  opened beside ours, the smallest amount it accepts and the fee it keeps. No screen names a company
  anywhere else. Replacing the rail is replacing that object, with no change to a single step the person
  takes; a partner rail would keep the same shape and only drop the handing over, because the amount and
  the destination would already be filled in.
- Source: the strategy review of 12 Sep 2026; the measurements the object carries are D20 and D32.
- Consequence for Calm: D32 recorded that they open no account to us today, and the reason they gave is
  that they serve platforms that are already live. That is a reason with a remedy. They are approached
  again after the design pass and the second wave of real gifts, with a product that is dressed and with
  the numbers those gifts produced, rather than with a description. Until then Mercuryo's consumer page is
  the rail, and it is the one the run sheet exercises.
- What this does not mean: the journey is not neutral about what the rail costs. The fees are stated on
  screen before anyone is sent anywhere, and they come from the object, so a better rail improves what the
  person reads at the same moment it improves what they pay.

## D43, 12 Sep 2026, the milestone contract, and the one rule it rests on

- Statement: `contracts/MilestoneGift.sol` exists, the second shape D36 said was missing. A funder sets an
  amount aside for one verified milestone with a deadline: reach it in time and the whole amount is the
  recipient's at once, let the deadline pass and the whole amount goes back. Nothing accrues and nothing is
  credited in parts. It allows a duration of one day, which the daily contract cannot express and which was
  the funder's own example, a mission delivered tomorrow.
- Source: built 12 Sep 2026 against D36 and D37; 22 Foundry tests, all passing, including a fuzz test over
  random amounts and durations asserting that every unit ends with the recipient or the funder and none
  stays in the contract. Runtime size 11,435 bytes, well inside Monad's limit.
- **The rule the contract rests on**, as first written and since corrected: a milestone is earned only if it
  was not already reached. The first draft enforced it by refusing a first proof at or past the target. That
  was not enough, and the review of D44 showed why; read D44 for the rule that replaced it. It remains the
  first thing to check in any review of this contract.
- What is deliberately identical to the daily contract, so a reviewer compares rather than relearns: one
  EIP-3009 signature that is both the payment and the consent to these exact terms, the goal registry
  mapping a goal type to the provider its proofs must carry, the evidence signer, and the same guards on
  freshness, clock skew, replay, identity and pausing. The funding tag differs
  (`viky.milestone.fund.v1`), so a signature meant for one contract can never fund a gift in the other,
  and a test pins that.
- What it does not have yet: no verification source is registered. The two the review named are a
  certificate and Chess.com, and Chess.com is of the same family as the Duolingo profile already running,
  so the attested public read of D27 carries over. Nothing is deployed, and nothing will be until a review
  in a separate session has looked at it, as D37 requires.

## D44, 12 Sep 2026, the milestone review stopped the deployment, and it was right to

- Statement: the review of `MilestoneGift` in a separate session returned **do not deploy**, on the very rule
  D43 said the contract rested on. The rule was written as "the first proof is refused if the person is
  already at or past the target". A refusal reverts, and a revert undoes everything, including the record
  that the reading was ever seen. The rule was therefore not "they had not reached it" but "the first
  reading they chose to submit was below the target". On a metric that can fall, and the first source named
  for this contract is a Chess.com rating, someone already at 1520 could lose two games, take their first
  reading at 1499, win one game, and take the whole amount for a one point climb. My own test pinned that
  path as intended behaviour, which is worse than the flaw.
- Source: contract review of 12 Sep 2026, every finding reproduced by execution in a scratch copy outside
  the repository, including a fuzz over 2000 random interleavings of all eight entry points.
- Consequence, the rule rewritten. A milestone is now about the climb, not the arrival, and the funder signs
  two numbers rather than one: the target, and `maximumStart`, the highest starting point they will pay a
  climb from. The first reading is always recorded as the start, whatever it says, so there is nothing to
  retry. A start above what the funder accepted can never settle, and the gift returns at its deadline. Both
  halves are needed: recording the first reading closes the retry, and the funder's second number closes the
  same trick played before the first reading is ever taken. `startingValue` is now read, where before it was
  written and never used again, which should have told me something.
- The other findings, all fixed in the same pass:
  1. The first reading had no lower bound on when it was observed, so a year-old reading could be the start
     while the clock still ran from now. Bounded by the same ten minutes as everything else.
  2. The deadline judged the transaction, not the reading. A reading taken two minutes before the end that
     landed a moment after it lost the whole gift to the keeper. The deadline now judges `observedAt`, and a
     six hour grace lets a reading taken in time still arrive, with `expire` held back by the same grace.
     This is the protection the daily contract already had for its catch-up (D30) and that I had dropped
     here, where a miss costs the whole gift rather than one day.
  3. The wait for a first reading ran from the funding, so opening the link on the thirteenth day left one
     day to act and on the fourteenth left none. It runs from the claim, as the daily contract does.
  4. A gift already returned could still be opened, `cancel` did not report its refund the way the daily
     contract does, an error was declared and never used, and a zero provider raised a different error than
     the sibling for the same mistake.
  5. Gift records elsewhere key on the id alone, so an id could have meant two different gifts across the
     two contracts. Milestone ids now start at 1,000,000 and the constructor refuses anything lower, so the
     ranges cannot meet.
- State: 29 tests on this contract, 92 across the suite, all passing. The test for the main finding was
  checked by putting the flaw back and watching it fail. Still not deployed: the corrected contract goes
  back for review before it is.

## D45, 13 Sep 2026, what the milestone contract promises, in sentences

- Statement: the rules of `MilestoneGift` written as sentences, so the second review checks the contract
  against what the product promises rather than against the tests. The lesson of D44 is that a test encodes
  what its author believed, and mine pinned the flaw as intended behaviour; sentences written before the
  review cannot do that, because they say what the promise is, not what the code does.
- Source: the strategy review of 12 Sep 2026, adopting at the contract level the discipline D39 set for
  screens.

**The promises. A reviewer should be able to break any of these, or say plainly that they hold.**
There are two shapes of milestone, because there are two shapes of thing to prove. Promises 1 to 13 say
which shape they speak of; those that say neither hold for both.

*A climb, for something measured that moves: a rating, a count.*

1. **The first reading is always the start.** Whatever it says, it is recorded, and there is never a second
   chance to start from a reading that suits the recipient better.
2. **A start above what the funder accepted never pays.** The funder signs a highest accepted starting
   point along with the target; a gift started above it can never settle, and comes back at its deadline.
3. **Nobody is paid for what was already true when the gift was started.** Promises 1 and 2 exist for that,
   including on a measure that can fall.
4. **An old reading is never a start.** A reading must be recent to begin a climb. It does not have to be
   recent to end one, and holding a later proof to the same bound is what silently cancelled the grace of
   promise 6 once already.
5. **The clock starts at the first reading**, so a climb has a duration and not a date, and the wait for
   that first reading runs from the day the gift was opened, never from the day it was funded.

*Having it or not, for something granted once, with a date: a certificate.*

6. **There is no starting point, because no public page says "not yet obtained".** The page exists only
   once the thing is granted, so the proof carries the day it was granted, as the page itself states it.
7. **It pays only for something granted inside the gift**: on or after the day the funder paid, and on or
   before the deadline. Something obtained the week before was not earned by this gift.
8. **The deadline is a date the funder can see**, fixed when they paid, not counted from anything the
   recipient does later.
9. **It pays only for what the funder named, and only into the hands of the person they sent the link to.**
   The person and the thing are bound into the terms the funder signed, and a proof for another course pays
   nothing. **What this does not do**, and the third review was right to call the wider sentence false:
   Coursera has no field its holder can edit, so there is no way to prove that a given certificate belongs
   to the recipient rather than to a namesake who took the same course in the same window. Duolingo and
   Chess.com both have an editable display name, which is how a short code proves ownership there. The gift
   still goes only to the account that opened the funder's link, so the exposure is a recipient presenting
   somebody else's certificate, not a stranger taking the gift. It is recorded rather than hidden, and D49
   carries what would close it.

*Both shapes.*

10. **The deadline judges the reading, not the transaction.** A reading taken before the deadline still pays
    if it arrives a little after, and the keeper cannot return the money while such a reading could still
    arrive. Our relayer's lateness is ours, never the recipient's to pay for.
11. **All or nothing, once.** The milestone is reached and the whole amount becomes the recipient's, or the
    deadline passes and the whole amount goes back. Never both, never in parts, never twice.
12. **Every unit ends with somebody.** For every gift: what the recipient took, plus what the funder got
    back, plus what the contract still holds for it, equals the amount that went in.
13. **A gift that is over cannot be reopened or closed again**, a gift nobody claimed can be taken back by
    the funder until somebody does, and a gift nobody ever opens comes back without waiting for its
    deadline. An identifier means one gift: milestone gifts are numbered from a range the daily contract
    can never reach, because records elsewhere key on the identifier alone.

- The funder answers one question, not two (this review). "What should they reach" is about the gift; "what
  is the highest starting point you will pay a climb from" is about the contract. So the screen reads where
  the person stands today, adds a small margin for an ordinary day's movement, signs that as the ceiling
  with the rest of the terms, and says it in words: "Today they are at 1420. The gift is theirs when they
  reach 1500, and only if they start from 1430 or under." A target too close to today is refused on the screen,
  with a minimum climb. For a certificate the ceiling is zero and the question never appears.
- That reading at creation is a plain one, not attested, and deliberately so: it decides what the funder is
  shown and agrees to, with their own eyes and their own money. Every reading that moves money is attested.

## D46, 13 Sep 2026, the second milestone review, and the two rules it sent back to the product

- Statement: the second review checked the contract against the ten sentences of D45 rather than against the
  tests, as instructed, and returned **do not deploy** on one of them. Nine held. The one that broke, promise
  4, was broken by my own fix from the first review, which is the same pattern the discipline exists to stop.
- Source: contract review of 13 Sep 2026, sixteen reproductions run outside the repository, including 512
  random interleavings of every entry point.
- **What broke, and how.** The first review asked for a lower bound on when a reading was observed, so that
  an old reading could not start a gift. I applied it to every proof instead of only to the first. The same
  review had just added a six hour grace so that a reading taken before the deadline could still arrive
  after it. The two fixes cancelled each other: no reading could arrive more than ten minutes after it was
  taken, so the grace did nothing, and `prove` was shut from the deadline plus ten minutes while `expire`
  only opened at the deadline plus six hours. For five hours and fifty minutes neither worked, and a relayer
  outage across a deadline cost the recipient the whole gift, which is the exact thing promise 4 forbids.
  My test could not see it because it allowed one minute of lateness, inside the ten the bound permitted.
  The bound now applies to the first reading only; later proofs are held by the previous reading, by the
  deadline, and by their own nullifier. The test now uses five hours, a delay only the grace survives, and
  it was checked by putting the defect back.
- Also fixed in the same pass: a gift already returned at its deadline could be closed a second time by the
  funder, paying nothing but ending the same gift twice for anything reading the events; the keeper could
  land in the same block as a first reading on the dormant path, which now carries the same grace as the
  deadline; the screen said "start from under 1430" where the contract pays at exactly 1430, so the words
  now say "1430 or under"; and the deploy script refuses to start the daily contract inside the milestone
  numbering range, which only the script can prevent since the live contract has no ceiling.
- **One thing the review sent back to the product, and it turned out to be worse than that.** I wrote that a
  certificate must be opened before it is earned, and that the alternative was not fixable on chain without
  trusting an unattested number. Both halves were wrong, and D47 records the correction: no Coursera page
  says "not yet obtained" at all, so the trap was not a timing accident but every certificate gift, even one
  opened the same day; and the verification page carries the granting date itself, attested like anything
  else. The contract now has a second shape for it and the sentence is withdrawn.
- **A climb has a duration, not a date.** Its clock starts at the first reading, so "a mission delivered
  tomorrow" is a day from the moment they start, not a day from Tuesday. The funder screen must say what it
  signs. This does not apply to the certificate shape, whose deadline is fixed when the funder pays.
- State: 33 tests on this contract, 96 across the suite. Still not deployed. Nine of ten promises held on
  the second pass; the tenth is fixed, and the fix goes back for a third look before any money touches it.

## D47, 13 Sep 2026, no page says "not yet obtained", so a certificate needs its own shape

- Statement: I recorded in D46 that a certificate gift fails when the link is opened after the thing is
  earned, and called it a timing problem the screens should warn about. That understated it, and my reason
  for not fixing it on chain was wrong. The strategy review checked and found that **no public Coursera page
  shows "not yet obtained" at all**: `coursera.org/user/<id>` and `/learner/<id>` show nothing of the kind,
  and `api/memberships.v1` and `api/profiles.v1` answer 405 and 403. The only page that exists appears the
  day the thing is granted. So a first reading of a certificate is always the certificate, always above a
  ceiling of zero, and a certificate gift could never pay, whenever the link was opened.
- The reason I gave for not fixing it, that it would need trusting an unattested number, was also wrong:
  `coursera.org/verify/<code>` carries, without any account and in one answer, the first name, the last
  name, the course, the code, and the day it was granted.
- Source: the strategy review of 13 Sep 2026 for the pages that show nothing; verified here the same day on
  six real certificates granted between May 2014 and July 2023, all carrying `firstName`, `lastName`,
  `courseId`, `certificateCode` and `grantedAt` in the same response, with `/verify/<code>` redirecting to
  `/account/accomplishments/verify/<code>`, which is the page that is read. The most recent one reachable
  was 2023: publicly shared codes are the ones people put in a profile years ago, so nine years of a stable
  shape is the evidence, not a fresh page. A change of shape breaks a test here rather than a gift.
- Consequence: `MilestoneGift` now carries two shapes. **A climb** for something measured that moves, which
  is unchanged. **Having it or not** for something granted once: no first reading, no ceiling, and the proof
  carries the granting day the page itself states. It pays when that day falls on or after the day the
  funder paid and on or before the deadline, and the deadline is fixed at funding, so the funder signs a
  date they can see. The attestation must also match the person and the course the funder named, both bound
  into the terms they signed, so somebody else's certificate pays nothing. The promises of D45 are rewritten
  for both shapes, and the two sentences D46 sent back to the product are withdrawn.
- Credly stays off the menu until a real badge page has been read the same way.
- State: 42 tests on this contract, 105 across the suite. 12,979 bytes. Still not deployed.

## D48, 13 Sep 2026, a climb should be judged by the day the source itself gives (proposal)

- The question, from the strategy review: Chess.com refreshes its public statistics at most every twelve
  hours while the proof grace is six, so should a climb be judged by the date the source gives rather than
  by the time the reading was taken? This entry records what was measured and what it recommends. **Not
  decided, and nothing is built on it**: it changes the contract, and the contract's third review has not
  run.
- **Measured on 13 Sep 2026**, five public accounts, every mode: the date the ratings page gives is not a
  refresh time at all. It is the day of the last rated game in that mode, and it ranged from three hours old
  to fourteen months old across the accounts read. So the twelve hours are not a delay before we can see a
  change; they are a delay before a change exists to see.
- **What that means.** A rating became what it is at the moment of that last game. That moment, and not the
  moment we managed to fetch the page, is when the milestone was reached. Judging by it is not a way around
  a refresh delay, it is the correct reading of what the source says.
- **And it can only help the recipient.** The last game always happened before we read the page, so the
  source's date is always at or before the reading. Anything that passes today under "we read it in time"
  also passes under "the source says it happened in time", and some things that fail today would pass.
  The dependence on when our own keeper managed to read disappears, which is the same principle as promise
  10: our lateness is ours.
- **Recommendation: yes.** Carry the source's own date in `eventAt`, the field the certificate shape already
  has, and judge a climb's deadline against it for both shapes. The goal type must also fix which mode is
  read, since the page gives a rating and a date per mode, and a gift for a rapid rating must not be settled
  by a bullet one.
- **The residual risk, stated rather than hidden**: if the recipient crosses the target and keeps playing
  until after the deadline, and we never read in between, the source's date moves past the deadline and the
  proof fails. With a daily reading that needs every reading to fail for the whole window. It is bounded and
  it is ours to keep small, not theirs to pay for.

## D49, 13 Sep 2026, the third review: three promises broken, and one that no code can keep

- Statement: the third review returned **do not deploy**. Ten promises of D45 held, three broke. All three
  are fixed; the third is fixed by narrowing the sentence, because no code could have kept it.
- Source: contract review of 13 Sep 2026, sixty-three reproductions run outside the repository, including
  512 random interleavings of every entry point across four gifts of both shapes.
- **This review did not run on the model the project rule names.** The Fable allowance was exhausted, so it
  ran on Opus, in a fresh session with no knowledge of the author's reasoning, which is where the value of a
  review lies. It found three real defects, so it was not a wasted pass. A Fable pass before deployment is
  still open if the strategy side wants one.
- **Promise 7 broken, and it is the one that mattered.** The certificate window compared an attested granting
  *day* against two *instants*: the moment the funder paid, and the moment of the deadline. A certificate
  granted earlier on the very day the funder paid could never pay, and the last day was cut short at the
  funding hour. Worse, the six hour grace was applied to the submission of a historical date. A recipient who
  earned the certificate on day 29 of a 30 day gift and opened the app on day 32 lost the whole gift, and the
  funder was paid for a milestone that was genuinely reached. The arithmetic is now in UTC days, as the daily
  contract has always done it, and the submission window is fourteen days rather than six hours: a granting
  day is historical and permanent, so waiting gains the recipient nothing, while a short window only punishes
  being slow to open the app. It is bounded all the same, because the funder's money must not wait for ever
  on a proof that may never come. `expire` follows the same window.
- **Promise 10 broken by a pause.** `prove` was pausable and `expire` was not, so an owner pause spanning a
  deadline handed the whole gift back while the only call that could have saved it was shut. `expire` now
  refuses while proofs are paused. The daily contract has the same asymmetry, where it costs one day; here it
  cost everything.
- **Promise 9 broken, and no code can keep it.** The sentence said a proof of somebody else's certificate
  pays nothing. The contract's half is sound, one equality against a value the funder signed, but no value
  satisfies both halves: the certificate code cannot exist when the funder signs, so what is signed is a name
  and a course, which is not unique. Coursera has no field its holder can edit, so there is no ownership step
  of the kind the binding code gives us on Duolingo and Chess.com. The promise is narrowed to what is true
  and the gap is written down rather than dressed up. What would close it, for the strategy side to weigh:
  restrict the certificate shape to sources that do have an editable field; or have the recipient name the
  code at the start and prove ownership by a second reading; or accept it, since the gift still reaches only
  the account that opened the funder's link, so the exposure is a recipient using a namesake's certificate
  and never a stranger taking the gift.
- **Also fixed:** the shape was not tied to the goal, so a rating declared as "having it or not" would have
  settled the whole amount on a single reading with no climb at all, which is exactly what D48 proposes doing
  next and this contract is immutable; a shape is now fixed when a goal is registered, and a climb refuses to
  carry a granting day. A granting day in the future settled today. Two guards could never fire and hid the
  ones that could. The pattern reading the granting date accepted seconds as well as milliseconds, which
  would have refused every proof rather than paid a wrong one, but nothing said so anywhere.
- **Left open, and recorded rather than decided:** one certificate can pay two gifts, which may be right or
  wrong depending on what a funder means; and if the attestor ever scopes a nullifier to the certificate
  rather than to the gift, the second gift would be permanently dead. Both must be settled before the
  attestor for this shape is written.
- State: 49 tests on this contract, 112 across the suite, 13,240 bytes. The three fixes were each checked by
  putting the defect back and watching the test fail. Still not deployed.

## D50, 14 Sep 2026, the catch-up window is arbitrary and invisible, and a day is not the person's day

- Statement: the funder, using the product as a recipient, asked why a missed day was "still catchable",
  said he did not remember choosing it, and asked what "tomorrow morning" meant. All three parts of that are
  fair, and two of them are defects.
- **Correction to my own explanation, made the same day.** I first told the funder the window existed because
  otherwise the moment our daily pass happens to read would decide what counts as missed. That is misleading,
  and he pushed back correctly. The contract's deadline is fixed and computable: a day `d` stops being
  catchable at `dayStart(d + 1) + CATCH_UP_WINDOW`, an instant that owes nothing to when anything runs.
- **What the window actually is.** Two separate things were bundled into one number.
  1. **A technical minimum, which is small.** Judging a day cannot happen at the exact instant it ends: the
     reading takes seconds, and a cron on this plan can fire up to an hour late. Some gap is needed so the
     daily reading is never racing the drain for the same day. An hour or two would do.
  2. **A product grace, which is the other twenty-three hours.** Miss a day, and you can still earn it by
     doing double the next day. That is a choice about how forgiving the product is, not a constraint, and
     it is the part nobody ever argued for. It was recorded in D13 as a design decision and approved inside
     a long plan, which is not the same as being chosen.
- The honest question for the strategy side is therefore not "how long should the window be" but "do we want
  the grace at all". Without it a missed day is lost at the end of that day, which is simpler to say and
  harsher to live. With it the product forgives one day at a time, which is kinder and needs a sentence on
  screen that did not exist until today.
- **What does not hold.**
  1. **The length is a round number with no reasoning behind it.** D13 says one day and gives no why. Six
     hours, or three days, would have been recorded the same way.
  2. **A day is a UTC day, which is nobody's day.** Midnight UTC is two in the morning in Paris, so a person
     doing their lesson at 23:30 sees it counted against the next day, and a deadline lands in the middle of
     their night. The contract cannot know a person's time zone, but the screens can, and say nothing.
  3. **The two live contracts no longer agree.** Gift 1 catches up for 24 hours, gift 2 for 30, because D30
     added the reading grace to `CATCH_UP_WINDOW` rather than beside it. One promise, two behaviours, by
     accident rather than by choice.
  4. **Nothing on any screen says a day is still catchable, or until when.** The funder had to ask. A real
     recipient has nobody to ask, and will read "1 of 7 done, 0 missed" on the third day and conclude the
     product is broken or lenient, neither of which is true.
- Consequence, and what is not decided here: (4) is a screen fix and is being done now, saying the deadline
  in the reader's own time. (1), (2) and (3) change the contract and are not mine to settle alone. The
  question for the strategy side: should a day be the recipient's local day rather than a UTC day, should
  the window have a stated length and reason, and should the two contracts be reconciled, given that gift 1
  finishes around 20 Sep and could simply be allowed to end under the old rule.

## D51, 14 Sep 2026, no withdrawal had ever worked, and the reason was invisible by construction

- Statement: the funder tried to take what a gift had earned, the first withdrawal ever attempted in the
  project, and read "This could not be recorded" three times. That sentence is what our code says when a
  contract refusal cannot be decoded, and it names nothing.
- **What the refusal actually was.** Simulating on chain settled it: `withdrawEarned` called directly by the
  recipient succeeds, so the account, the amount, the contract state and the token transfer are all sound.
  Only the signed path fails, and it fails inside OpenZeppelin's ECDSA, which refuses two shapes with a plain
  string rather than a typed error: a recovery byte outside 27 and 28, and an `s` in the upper half of the
  curve (EIP-2, against malleability). A plain string carries no name, so nothing could map it to a sentence.
  Both shapes were reproduced on the live contract to confirm they are undecodable.
- Source: `cast call` against `0xE04CD59bB93765333200a9da01df83149D4C4d67` on 14 Sep 2026: the direct
  withdrawal returns success, a well shaped signature from the wrong signer returns the typed
  `InvalidRecipientSignature`, a low recovery byte returns `ECDSA: invalid signature`, and an upper half `s`
  returns `ECDSA: invalid signature 's' value`.
- Consequence: every signature is put in canonical form before it is relayed, in `src/signature.ts`. Neither
  reshaping changes who signed, which is why EIP-2 could require the low form in the first place, so this can
  only turn a signature the contract would refuse into the same signature it accepts. A test proves both
  refused shapes recover to the same address after reshaping.
- **Three failures of ours, not of the person's.**
  1. Sixteen of the contract's forty-two refusals had no sentence at all, so they all arrived as "this could
     not be recorded". They have one now, and an unnamed refusal is written to the log.
  2. A refusal that is not a typed error had nowhere to go, so the reason vanished between the contract and
     us. The raw reason is kept now.
  3. The withdrawal path had never run, and nothing said so. `docs/SCREEN-CLAIMS.md` marked "Take $X" as
     exercised by a Foundry test, which tests the contract and cannot see a signature produced by a browser.
     A contract test passing is not a path working.
- **The real cause, found the next morning by tracing rather than guessing.** Everything above is true and
  worth keeping, but none of it was the reason the message said nothing. Our own error decoder
  (`decodeContractError`) looked for the refusal's name in two places: on the error itself, and in a `data`
  field holding raw hex. Viem puts it in neither: it arrives already decoded, as an object inside `data`,
  one layer down. So **every typed refusal from the contract was invisible to us** and fell through to the
  generic sentence. The decoder had no test at all.
  Found by replaying the browser's exact path with our own functions against the live contract, which showed
  the digest matching, the signature well formed, and `InvalidRecipientSignature` sitting plainly in the
  error one level below where we were looking.
- Also fixed with it: a refusal Solidity writes as a sentence rather than a named error arrives as the name
  "Error" with the sentence as its only argument. Returning the name alone lost the only part that says
  anything, and that is exactly how a library inside the contract refuses a signature it does not like.
- **The lesson, and it is mine.** I changed four things on hypotheses before measuring: the recovery byte,
  the signature shape, sixteen missing messages, an operator-visible detail. The last two were worth doing
  and the first two are harmless, but none of them was the cause, and the funder was right to say so. The
  thing that found it took twenty minutes: run our own code against the real contract and print what comes
  back at every layer. A refusal nobody can read is not a hint to guess from, it is the first bug to fix.

## D52, 14 Sep 2026, the gas limits came from a mock token, and one of them was too low to work

- Statement: no withdrawal had ever succeeded, and the reason was not the signature. The transaction was
  submitted and mined, and it failed there. A transaction that fails after being mined returns no error data
  at all, which is the one path that produces "This could not be recorded" with no reason even for an
  operator, and it matches exactly what the funder saw.
- **The evidence, measured rather than reasoned.** The withdrawal counter on gift 1 is still zero and the
  recipient holds nothing, so nothing ever landed. Yet the relayer's balance fell from 14.8377 to 14.6447
  MON over the attempts, and nothing else it does explains that: it paid for transactions that were mined
  and failed. Since the simulation passes before anything is sent, **the signature was always valid**, and
  three of my earlier guesses were wrong for that reason alone.
- **The cause.** A direct withdrawal costs 143,446 units against the real AUSD, measured on chain. The
  signed path adds a signature recovery, a fresh storage slot for the withdrawal counter, and 65 bytes of
  signature in the call, so roughly 170,000. We declared 172,000. That is not a margin.
- **Where the number came from, and this is the part that matters.** Every figure in `src/gift-gas.ts` was
  the highest usage seen in the Foundry suite, which runs against a **mock** token. A test double in tests
  is normal and right; taking its gas figures as production limits is not, and the file said so in its own
  comment ("with the mock token") without anyone reading it as a warning. The paths that had run, creating
  and claiming and counting, happened to have enough room. The one that had never run did not.
- Consequence: what is declared is now what the chain says the call costs, plus the 7.5 % Monad margin, with
  the recorded figures kept only as a floor so a low estimate cannot under-declare either, and a runaway
  estimate refused rather than paid for. Monad charges the declared limit and its own documentation asks for
  an accurate one for exactly that reason, so this is the documented approach rather than a precaution.
- **How I should have found it, and did not.** I changed four things on hypotheses before measuring
  anything: the recovery byte, the signature shape, sixteen missing sentences, an operator-visible detail.
  The funder stopped me and asked whether there was a rigorous procedure for analysing our own code. There
  was one available the whole time and I did not use it: read the platform's own documentation on how gas is
  charged, and measure the real cost against the real contract. Both took minutes once attempted. The
  hackathon also grants a Tenderly licence whose whole purpose is to show why a mined transaction failed,
  and it would have answered this in seconds.

## D53, 14 Sep 2026, an account below the reserve can make no contract call, so no user account ever should

- Statement: Monad reserves 10 MON per account, and an account holding less can make **no contract call at
  all**. Not a costlier one, none. Its only possible transaction is a direct transfer of MON that empties it.
  Measured, not deduced: a fresh account funded with 0.05 MON and then 0.50 MON was refused a contract call
  both times with "Signer had insufficient balance", the same words the funder had been reading, and a
  transfer of MON that did not empty the account was refused too.
- Source: `docs.monad.xyz/developer-essentials/reserve-balance`, which states the reserve, and that the
  emptying exception "applies exclusively to direct value transfers from undelegated accounts"; and the
  measurements above on mainnet, 14 Sep 2026.
- **What it broke.** The way out asked the recipient's own account to approve an exchange and then to swap,
  two contract calls. No recipient could ever have done either: we top their account up with 0.05 MON, which
  is not merely too little, it is the wrong shape of answer. The same rule stopped the funder moving $2.86
  from one of their own accounts to another, which is what surfaced it.
- **The principle it forces, and it is a good one.** A person's account must never need to make a contract
  call. Ever. Viky's relayer is the sender for everything and pays for everything; the person signs an
  intention and the contract checks that signature. That was already true of every gift, which is why every
  gift worked. It was not true of the way out, and that is the only reason the way out did not.
- Consequence, built the same day: AUSD's own `transferWithAuthorization` (confirmed on chain, standard
  EIP-3009 typehash) lets a person sign a transfer that anyone may submit. Moving your own money now takes
  one signature and no MON, through `/api/send`, and the way out offers it beside the payout. The relayer
  chooses nothing: the signature names the destination, the amount and the deadline, and a test proves that
  changing any of them breaks it. The 0.05 MON top-up is left only for the operator pages and is on the list
  to delete with them.
- The payout was the other half, and `contracts/ExitRouter.sol` is it, written the same day. The relayer
  calls it; it takes the AUSD by the person's signed authorization, exchanges it, and sends the proceeds
  where they asked. Their account does nothing and needs nothing.
  **The signature is what decides everything.** AUSD's authorization binds only who, how much, and a nonce,
  so the nonce is the hash of the terms: the destination, the least that may come back, which exchange, and
  the exact bytes that will be said to it. Change any of them and the token refuses the nonce. It is the same
  trick that funds a gift with one signature, so there is one idea to check rather than two, and the tests
  prove a relayer cannot redirect the money, lower the floor, or alter the call. An exchange must also be one
  the owner allowed, which is a second lock in case a signature is ever produced by something compromised.
  The contract keeps nothing: what an exchange does not take goes back to the person in the same call, no
  allowance survives whether the exchange succeeded or failed, and the owner can sweep anything stranded.
  17 tests, 4,310 bytes. **Not deployed**: D37 requires a review in a separate session first.
- **How this was found.** Not by reading the documentation, which said it plainly and which I had open
  earlier the same night for a different question. By the funder trying to move his own money five times and
  refusing to accept "this could not be recorded" as an answer.

## D54, 14 Sep 2026, the model a review runs on is the funder's call, not mine

- Statement: which model a session or a review runs on is decided by the funder, at the moment, with whatever
  is available. I am not to weigh it, flag it as a deviation, or ask before using what is there.
- Source: the funder, 14 Sep 2026, after I had twice recorded an Opus review as a departure from an earlier
  instruction that reserved certain work for another model.
- Consequence: the earlier instruction is superseded. Reviews are recorded by what they found, not by what
  ran them. D49 and any other entry noting the model as a caveat should be read as history, not as a debt.
- What does not change: a contract is still reviewed in a separate session, against the promises written in
  plain sentences rather than against its tests, before it is deployed. That discipline is the point, and it
  has found a real defect every time, on every model it has run on.

## D55, 14 Sep 2026, the exit router review: a payment that was not one, and a door left open

- Statement: the review of `ExitRouter` returned **do not deploy**. Six of seven promises held; one broke,
  and a second was found to hold only by accident. Both are fixed and pinned by tests that were checked by
  putting each defect back.
- Source: contract review of 14 Sep 2026, 42 tests in a scratch copy outside the repository, including two
  against the real AUSD on a mainnet fork and a 5,000 run fuzz.
- **Promise 5 broken: a payment that was not one.** The payout checked only that the call did not revert,
  never that the money left. A destination that hands it straight back, and the router's own address,
  both returned success: the person's AUSD was gone, a full receipt was emitted saying they had been paid,
  and the proceeds sat in the contract reachable only by us. Fixed twice over: the router's own address is
  refused as a destination, and the balance is checked after the payout, so delivery is the test rather
  than politeness.
- **Promise 7 held only by accident.** Nothing stopped the token itself being allowlisted as an exchange.
  Since AUSD requires the recipient of an authorization to be the caller, that would let anyone aim this
  contract's own pull at a third party's signed exit and take the proceeds as "left over". The review
  reproduced it by deleting one unrelated guard: 100 AUSD moved from one person to another. What stopped it
  on the shipped code was the floor on what must come back, which is not what the docstring said was
  protecting anything. The token and the contract itself are now refused as exchanges, both when the list is
  set and when the call is made.
- Also fixed: the receipt claimed the whole amount was exchanged when part had been given back, so a screen
  reading events would have told someone $3.00 when it was $2.00; and a destination is now given a bounded
  amount of gas, so one that burns everything costs the relayer a known amount once instead of repeatedly
  while the signature stays unspent. `ExitTerms.owner` is renamed `payer`, because `owner()` in the same
  contract is Viky and confusing the two is exactly how an earlier contract broke.
- Recorded rather than fixed, for the wiring that comes next:
  1. **Kuru Flow is a forwarder with a changeable target.** The review read on chain that the address in D8
     exposes `setRouter(address)` and points at another contract today. Allowlisting it grants a live
     allowance plus arbitrary calldata to whatever its owner points at next. Either allowlist what it points
     at, or accept it knowingly and write it on the judges page.
  2. **Gas must be estimated per call**, as D52 concluded. The review measured 313,520 against the real AUSD
     with a trivial exchange, more than against the mock, and the real exchange is on top of that.
  3. **A signature signed twice is spendable twice.** The salt makes each independent, so an app that lets
     someone retry must reuse the same terms rather than sign new ones.
  4. The floor on what comes back is only as good as the number the screen puts in front of the person. No
     contract can fix that; it belongs in the screen claims when the payout is wired.
- State: 21 tests on this contract, 133 across the Solidity suite. **Still not deployed**, and still not
  wired to anything.

## D56, 14 Sep 2026, no entity during Metropolis, so one rail and one shape of exit

- Statement: the funder has no active company for the duration of Metropolis. Ramp in production, a Mercuryo
  partner account, Calm and Immersve all require one, so all four are out of reach. The only rail usable for
  both directions is Mercuryo's consumer widget, driven by the person's own hands and card.
- Source: the strategy review of 14 Sep 2026, evening.
- Consequence for the plan: the entity question recorded as closed in D49 is closed for a second reason, and
  the partner paths recorded in D29 and D32 stay shut for the whole event. `ExitRouter` stops being an
  improvement and becomes the only exit we can have: without an entity there is no custodial payout to fall
  back on, so it is unfrozen and goes to a second review, then deployment, then the Mercuryo sell step.
  `MilestoneGift` stays frozen.

**Measured before the funder spends anything.** The conversion after a card purchase used to leave 0.2 MON
behind. Monad reserves 10 MON per account and refuses a contract call that would end below it (D53), so that
figure risked a conversion the chain will not take, with the euros stuck as MON and nothing to show for them.
Measured on 14 Sep: a call leaving 0.2 MON from a 14.27 MON balance was accepted by the node, while an
account starting at 0.50 MON was refused outright, so the rule depends on where the balance starts and I
could not test execution without risking the owner key. Rather than let the funder pay on an uncertainty,
both funding paths now keep **11 MON**. At 0.0232 AUSD per MON that is about $0.26 of a 25 EUR purchase, and
it leaves the account able to act again afterwards instead of stranded.

**The payout is out of the tester's journey.** `CashOut` asked the person's own account to approve an
exchange and then swap, two contract calls, which no recipient can make. It could never have worked for
anybody, so leaving it in place would have been a promise the product cannot keep. What remains is moving
your own money with one signature, which works and has now run for real. In its place, a sentence and no
button: paying out to a card is coming, and the money stays theirs meanwhile. `docs/SCREEN-CLAIMS.md` says
so, and `docs/spikes/KT1-part-2.md` is narrowed to the entry alone, legs 1 to 6.

## D57, 14 Sep 2026, our own failure must not take someone's day

- Statement: the design research found that Viky took a day away on the clock alone, whether or not the
  reading had succeeded. Confirmed in the code and fixed the same hour: the daily pass counted, then drained
  unconditionally, so a worker outage, a source outage or an attestor outage cost the person a day they had
  earned. Duolingo repairs streaks broken by its own downtime and Beeminder checks a failure is real before
  charging; we did neither.
- Source: the design research of 14 Sep 2026; `src/daily-pass.ts` as it stood, where the drain ran after the
  count with nothing between them.
- Consequence: a gift whose reading was refused for a reason of ours is left alone for the rest of that pass,
  and the report says so. Because only a drain closes a day, and `checkIn` has no deadline of its own, the
  day stays open and the next working reading can still credit it. This is the principle D46 already forced
  on the milestone contract, applied where it was missing: our lateness is ours, never theirs to pay for.
- **What is deliberately not covered**, and the distinction is the whole point: a profile that turned
  private, a name that no longer resolves, a code absent from a display name. Those are true answers about
  the person's own account, and holding the gift open for them would let anyone stop the clock by hiding
  their profile. Only `FETCH_FAILED`, `PROOF_INVALID`, `PROOF_MISMATCH` and `NOT_CONFIGURED` hold it.
- Known limit, written rather than hidden: `drain` is permissionless, so a funder could still settle a day
  themselves during an outage. Closing that needs the contract to know whether a reading was attempted, which
  it cannot. Worth stating on the judges page rather than solving.

## D58, 14 Sep 2026, the design decisions, and two things I had described wrongly

- Statement: the strategy review settled the design questions and corrected two claims of mine. Recorded
  together because the corrections matter more than the decisions.
- **Settled.** One home, and every action is a run of screens with a back and no menu; a tab bar only if
  three real destinations ever appear. The recipient's passkey is asked at "take the gift", not when the link
  opens. Terms are frozen once accepted, which the contract already enforces. A link nobody opens is refunded
  fourteen days after funding, and the funder may cancel only before it is opened; a gift opened but never
  connected to a goal is refunded fourteen days after the opening, which is the case I had not mentioned.
  Only our own reading failures protect a recipient; a profile turned private or a name changed does not.
- **Correction 1: the outage protection is ours, not the contract's.** D57 holds the drain when our reading
  failed, but `drain` is callable by anyone, so a funder who can call a contract could still close the day
  during an outage. For a pilot among people who know each other that is acceptable. What is not acceptable
  is a screen that promises it. The wording everywhere, including the judges page, is "Viky waits before
  closing a day when the reading failed on its side", and never a guarantee. For a later contract: reserve
  the drain to the keeper for a period, then open it to anyone after a longer one.
- **Correction 2: the claim link is a bearer link, and I said otherwise.** I told the funder the opening
  attestation "checks the contact matches the one the funder named". It does not. The route checks the link's
  secret and then copies the stored contact hash into the attestation, so the contract's comparison is our
  own value against itself: a consistency check, never an identity check. Anyone holding the link takes the
  gift. The funder screen now says so at the moment it matters: whoever opens this link takes the gift, send
  it only to them.
  **The real lock exists and needed no new code**: the Duolingo name, when the funder fills it in. The
  recipient cannot then change it, so only that profile can ever earn the gift, whoever opened the link, and
  the rest returns to the funder. The field is now presented as what it is rather than as a convenience.
- **The four states of a day**: earned; returned to [name]; still catchable until [local time]; and one for a
  day not yet judged, whose wording is the reviewer's to choose because "not yet read" speaks to nobody. The
  display marks today.
- **Notifications**: the recipient gets at most one reminder a day. The funder gets three moments, not every
  credited day, since every day is a movement of money and daily notice would be noise.
- **Order of work, and it binds me**: no design pass now. Mockups come first, directed by the funder, and I
  implement once, afterwards. Until then I work only on what is not seen: the open points of the exit router,
  the logic of the rail step, and the data behind the day states and the notifications.


## D59, 14 Sep 2026: the payout service does not say what it does with the wrong amount, so we never send it

**Statement.** The way out sends the payout service exactly the amount of the order it is holding, and hands
whatever the exchange gave beyond that straight back to the person, in the same transaction.

**Source.** Mercuryo's own material, read in full on 14 Sep 2026: the help centre article on selling
("How do I sell cryptocurrency using Mercuryo"), the widget documentation off-ramp guide, the OOR API guide,
and both Terms of Service. The single sentence they devote to the subject says that sending more or less than
the requested amount "may delay processing or prevent your transaction from being completed". There is no
published re-quote, no refund threshold, no hold-pending rule, and no policy for an excess. The words
overpay, underpay, partial and excess appear nowhere in 107 help articles or 61 documentation pages.

**Consequence.** `ExitRouter.exit` pays `minOut` exactly, not `amountOut`, and returns the difference to the
payer. The terms' `minOut` is therefore the order, not merely a floor, and the screen's figure, the order and
the signature are one number. This costs the person a little native coin left in their account, which is
theirs and which nothing in Viky spends; the alternative was resting a payout on behaviour nobody documents.

**Also measured, and it binds the screens.** The order must be sent within **6 hours** of being created
(widget documentation); our own window is fifteen minutes. Two Mercuryo sources disagree about where late
coins land, which is another reason not to be late. Payout is **card only, EUR and USD**, not SEPA: the
consumer widget's bank payout is behind a waitlist. Selling is **not available in the United Kingdom**.
Valid KYC is required before a sell can proceed. Their fee is up to 3.95 % with a minimum near 3 to 4 euros.
If the price moves more than 5 % between quote and deposit they will not create the transaction and return
the deposit.

## D60, 14 Sep 2026: nobody can be paid out less than about twenty one dollars

**Statement.** The smallest sell order the payout service accepts for MON to EUR is 879.889249290954315600
MON, and the largest is 513,493.669141047227556. Viky refuses to quote outside that, with a sentence, before
the person leaves to place the order.

**Source.** `GET https://api.mercuryo.io/v1.6/lib/limits/sell`, read 14 Sep 2026. Their help centre article
states a 25 EUR minimum while this endpoint returns 15.00 EUR; the coin figure above is the one that decides,
and it is the one we enforce. Verified-user caps are 10,000 EUR per transaction, 30,000 daily, 50,000 monthly.

**Consequence, and it is a product fact and not a detail.** At the rate measured the same day (3 AUSD bought
126.5 MON) the minimum is close to **twenty one dollars**. Gift 1 is twenty dollars: finished and fully
earned, it still could not be cashed out on its own. So the way out is not available to every gift, and
saying so early is part of the product. It also sets a floor under what a first gift should be worth if the
funder intends the recipient to be able to take it as money, which belongs on the funder's screen.

## D61, 14 Sep 2026: the fifth review, and two tests that were not tests

**Statement.** `ExitRouter` was reviewed a second time, against the promises in plain sentences, with the
tests read last. The verdict was **do not deploy**, the fifth in a row, and it was right again. Everything it
found is fixed and every fix is held by a test that was verified by putting the defect back.

**What it found in the contract.**

1. **The token refund was uncapped.** `exit` handed the payer everything of the token that arrived during the
   exchange call, without asking where it came from, while the calldata sent to that exchange is the signer's
   to write. An exchange with any way to move a third party's tokens into this contract would have turned
   that refund into a way to collect them: everyone who ever approved that exchange would have been reachable.
   The exchange we use cannot, and the reviewer read its bytecode to say so: its only `transferFrom` takes
   from its caller, and it holds no `delegatecall` and sits behind no proxy. That is a fact about a contract
   somebody else owns, which is not a thing to rest on. Now capped at what was pulled, `UnexpectedTokens`.
2. **Two refusals had no name.** An allowed exchange that turned out not to forward made every payout revert
   with empty data, and an exchange handing back more than it took underflowed into a panic. Both now refuse
   with a typed error. The second was the same bug as the first finding, seen from the other end.
3. **The payout stipend was a constant aimed at an address nobody has read.** A payout service's deposit
   address is usually an ordinary account, but if one ever cost more than 100,000 to pay, nobody could ever
   be paid and there would be no repair short of deploying again. Now settable by the owner between 30,000
   and 1,000,000.
4. **A comment claimed a protection Monad does not give.** It said the bounded stipend stops a destination
   that burns gas from making the relayer pay again and again. Monad charges the limit a transaction
   declares, not what it uses (D52), so it does nothing of the sort. What the bound actually does is keep
   enough gas on our side of the call to hand the person their surplus and check the money really left. The
   comment says that now. This is the same class of defect as D38 and D58: a sentence about money that no
   code path makes true.
5. **Opening an exchange again after closing it silently dropped the pin**, since closing forgets it. Now the
   contract asks the exchange itself whether it forwards: a forwarder cannot be allowed without a pin
   (`PinRequired`) or with one that is already stale (`ExchangeMoved`), and one that forwards nothing cannot
   be given a pin at all.
6. **Ownership could be renounced**, which would have frozen the allowlist and the sweep for good. Refused.

**What it found in the tests, and this is the part worth keeping.** Two tests passed while proving nothing,
and the reviewer proved it by mutation rather than by reading:

- `testAnExchangeCannotTakeMoreThanItWasGiven` had the exchange ask for exactly its allowance, so nothing
  ever failed. Widening the allowance to expose stranded tokens left all 25 tests green.
- `testTheReceiptSaysWhatWasActuallyExchanged` asserted balances and never read the event it is named after.
  Putting back the exact receipt defect that D55 records as found and fixed left all 25 tests green. A screen
  reading that event would have told someone three dollars when it was two.

Both are rewritten and both were checked the same way: the defect goes back, the test must fail. It does.
By this repository's own rule (D39), a test that would not fail if the promise stopped being kept is not a
test, and these two were exactly that.

**A false fact in the plan, corrected here.** The build plan and two reports say OpenZeppelin 5.6.1. The
repository resolves `@openzeppelin/contracts` to **4.9.6** (`package.json`, `remappings.txt`). That is why
`security/ReentrancyGuard.sol` is the right import path and why `Ownable` needs no constructor argument. The
contract would not compile against 5.x. Also recorded so nobody rediscovers it at verification time:
`ExitRouter` needs `via_ir` with the optimizer at 200, or the deployed bytecode will not match the source.

**Two things left open, on purpose, for the screens rather than the contract.**

- Because the destination is sent exactly the order and the surplus goes back to the person, somebody who
  moves the market between the quote and the transaction can take the whole margin between them. Tightening
  the slippage we ask the exchange for shrinks that margin at the cost of more refusals; that is a knob to
  turn with real measurements, not a guess.
- That surplus reaches the person as native coin, which by this contract's own reason for existing (D53) they
  cannot spend without another payout. It is a few cents and it is theirs, but it belongs in
  `docs/SCREEN-CLAIMS.md` when the payout screen is wired, not hidden.

## D62, 14 Sep 2026: what a gift is worth, who can cash one, and where the money for the two tests comes from

Three answers from the advisor, with what I measured against each.

**1. No separate top-up. One card payment covers both tests.** The funder's card purchase of tonight pays for
the entry test and leaves the rest to test the way out. At 35 EUR: a test gift of $3 to $5, the remainder
stays in their account for the payout. At 25 EUR, if it is already paid: a test gift of $3.

*Measured, and it is better than the instruction assumed.* End to end on 14 Sep, the rail's 3.8 % and the
unspendable 11 coins both removed, 25 EUR becomes **$28.51** inside Viky and 35 EUR becomes **$40.01**. So
after a $3 test gift, a 25 EUR purchase leaves **$25.51** against a payout floor near $20.56: comfortable,
not "just above". The way out is tested as soon as `ExitRouter` is reviewed again after the fixes of D61,
then deployed and wired.

**2. The gift amount has two levels: a hard floor of 25 EUR and a suggested 50 EUR.** The floor is not ours,
it is the smallest card payment the way in accepts (D20). The suggestion exists so an ordinary gift is one
the recipient can actually cash.

*Measured.* 50 EUR becomes **$57.28** inside Viky, so five days out of seven leaves the recipient **$40.91**,
which clears the payout floor with room. The same five days out of seven on a 25 EUR gift leaves **$20.36**,
which does not clear it. That single comparison is the whole reason the suggestion is 50 and not 25, and it
is pinned by a test rather than remembered (`test/gift-amount.test.ts`).

*What the funder's screen must say, when the mockups reach it:* the recipient can be paid out on their card
from about **$21 earned**, and earnings stay in their account **across gifts**, so a gift too small to cash
today is waiting rather than lost. The 879.889 figure comes from my own reading of their limits endpoint and
the advisor could not re-read it without a partner identifier, so the source stays written here: `GET
https://api.mercuryo.io/v1.6/lib/limits/sell`, 14 Sep 2026, MON on MONAD to EUR.

**3. The named segment does not change. What changes is what we say, and where the pilot can send gifts.**

- To be paid out, the recipient needs a **bank card** and a **one-off identity check** at the partner. That
  is the Wise shape: identity is asked when money is taken out, not when an account is opened. It goes on the
  payout screen and in the pitch. Note for accuracy: the partner requires identity verification to buy as
  well as to sell, so the funder meets it at their card payment; the recipient meets it only at the payout.
- **Selling is closed in the United Kingdom**, and the partner serves nobody at all in 59 countries and
  territories, read from their own availability page on 14 Sep (updated there 2 Sep): Algeria, Hungary,
  Iceland, Mali, Morocco and Tunisia among them. The full list is held in `src/rails.ts` as data, because it
  decides who a gift can be sent to: a recipient in one of those countries can be given a gift, can earn it,
  and can never turn it into money.
- Senegal and Ivory Coast are **not** on that list, checked for by name. The pilot's cross-border gifts
  therefore aim at France, the union outside Hungary and Iceland, Senegal or Ivory Coast.

**And one rule extended.** The discipline of D39, that every sentence about money names the code path that
makes it true, now covers **code comments and reports**, not only screens. Four sentences in a row have been
found claiming a protection no code path gave (D38, D58 twice, D61). A comment is read by whoever changes the
code next, which makes a false one more dangerous than a false screen, not less.

## D63, 15 Sep 2026: the design pass, and what reading the sources changed

The research is in `docs/design/research.md`, every claim marked **[O]** read at the official page, **[W]**
secondary, **[NV]** unverified, with the routes that failed recorded so nobody repeats them. Both Apple and
Material answer a plain fetch with an empty JavaScript shell; Apple serves each page as a data file at
`developer.apple.com/tutorials/data/design/human-interface-guidelines/<slug>.json`, and Material loads its
content from `_dsm` endpoints named in its own bundle. Without those two routes this research returns nothing,
which is presumably why so much of what circulates about both is second hand.

**What the research changed, each with the source that changed it.**

| what it was | what it is | who said so |
|---|---|---|
| four CSS variables, no scales | a spacing scale, a type scale, a shape scale, a grid and a breakpoint, all from published systems | Material 3 |
| a tap floor of 44, cited as "platform guidance" with nobody named | **48**, the only figure every source accepts, and it clears WCAG 2.5.5 at AAA rather than 2.5.8 at AA | web.dev 48, Material 48, Apple 44, WCAG 44 and 24 |
| nothing between stacked controls | **12**, which satisfies web.dev's 8 and Apple's bezelled 12 | Apple, web.dev |
| a control outline at **1.48:1** | **3.42:1** light, **4.32:1** dark, and a test that fails below 3:1 | WCAG 1.4.11 |
| no contrast ever measured | every text colour held to **4.5:1** at every size, measured in the browser on every page | WCAG 1.4.3 |
| no `viewport-fit`, so the device insets were padding nothing | declared, insets applied on the document with fallbacks, never as padding on a pinned bar | web.dev, Chrome |
| three paragraphs of explanation above the money | ordered by who is reading: money first for somebody who has gifts, what Viky is first for a first visit | NN/g 57 % above the fold, GOV.UK start pages |
| amount, daily target and length in a three-column grid | one question per screen, one field per row, and a check screen before anything is paid | NN/g 78 % against 42 % first-try, GOV.UK, Baymard |
| four links in a footer on every screen | one link, to an Account page that holds them | GOV.UK: no navigation links when the path is end to end |
| prose free to run the full width | capped at **60ch**, the widest value inside all three published ranges | Material 40 to 60, web.dev 45 to 75, NN/g 50 to 75 |
| no maximum width on a desktop | a single column capped at 480, which is narrower than the prose limit | derived, and marked as derived: nobody publishes this |

**Two rules that shape the art direction, and they came from the sources rather than from taste.** Apple
states no rule against saturation anywhere: "saturated colours hurt legibility" is not their claim, and the
measurable rule is the contrast ratio. What Apple does state is that colour goes "to the background rather
than to symbols or text", and that colour may never be the only carrier of meaning. Material says the same
thing structurally: its palette works because every surface is paired with a foreground chosen against it.
So a joyful, colourful direction is not in tension with any published guidance, provided the colour lives in
shapes and surfaces and every piece of text still clears its ratio. The palette shipped today is neutral and
the art direction replaces it without touching a single measurement.

**What the pass could not do, and why it is not hidden.** D58 asks for four states of a day and three of them
exist: catchable with its deadline in local time, about to come back, today, still to come. The fourth,
whether a settled day was earned or returned, **cannot be derived**: the contract publishes those as counts
and settles days in order, so earning days one and three then missing two reads exactly like earning one and
two then missing three. The totals are shown beside the row and the per-day split waits for the event index.
D58 also asks for "returned to [name]"; no first name is collected from either side, so the screen says "the
person who sent it" until one is.

**Five tests that passed while proving nothing** have now been found in this repository, four of them in
`test/ExitRouter.t.sol`. The fifth was written during this pass, by me, as the fix for the fourth: a
reentrancy test that passed with the guard deleted, because the call it made would have failed anyway. It was
caught by mutation and not by reading. The rule stands and is worth restating in the strongest form: a test
is not a test until the defect has been put back and the test has been watched to fail.

## D64, 15 Sep 2026: the art direction, and a switch between day and night

**The funder chose a bright, round, daylit world.** It is in, and it went in the way the foundation was built
for: **not one measurement moved**. No spacing, no text size, no tap target, no breakpoint, no margin. Only
the colours and three radii changed, and a test now asserts exactly that, so a future theme cannot quietly
take the layout with it.

**How a saturated palette stays legible, which is not by toning it down.** Apple: apply colour "to the
background rather than to symbols or text", and never let colour carry meaning alone. Material: every surface
is paired with a foreground chosen against it. So the ground is a colour, the words sit on a calm surface,
and every pair is measured. The palette: a sunny ground `#FFD84D` with near-white warm cards by day, a deep
plum `#221A38` with lighter cards by night.

**Four colours were chosen by eye and failed the measurement**, which is the whole argument for measuring:

- the obvious bright red gave white text **3.96:1**;
- the first outline gave **2.74:1** against the yellow ground, though it passed on a card;
- the first night green gave **4.36:1**;
- and the accent turned out to be two colours doing two jobs. As a **fill** it can be bright, because what
  sits on it is dark text at 6.62:1; as **words** it has to be dark itself, 5.67:1 on the ground and 7.70:1
  on a card. One colour cannot do both without being either unreadable as text or drab as a button.

One consequence worth stating: the primary button's bright fill is only 1.87:1 against the page, so what
identifies it as a control is no longer its fill. It carries an outline, and WCAG 1.4.11 is satisfied by that
rather than by the colour.

**Day, night, or follow the phone.** Three answers, not two. Apple asks apps to avoid an appearance setting
of their own, because two settings that disagree read as a fault; keeping "follow my phone" as the default
means they only ever disagree when somebody has deliberately made them. A person who picks day on a phone set
to dark wins, which only works because the media query excludes an explicit light choice, and a test pins
that. The choice is applied by an inline script before the first paint, or a chosen appearance flashes the
other one first.

**Every hardcoded colour left over from before the tokens is gone** from the screens a person meets: the
greys, the blue buttons, the amber notices. The operator's own pages under `app/components/dev/` still carry
theirs, which is deliberate for now and written here so it is not mistaken for an oversight.

## D65, 15 Sep 2026: the design pass was foundations, not a product, and the correction

**The finding first, because it is the useful part.** The funder looked at the pass and said he could not see
what had changed. He was right, and the reason is worth keeping: thirty six captures of six signed-out pages
are not a design pass on a product. The screens that matter all live behind a passkey, a passkey cannot be
replayed by a script, and I had treated that as a fact of life rather than as the thing to solve. Four more
findings from the same look, all correct:

1. **The account came first.** The home and the funder journey both asked for a passkey before anything, which
   is the opposite of what the research says and of what D58 settled.
2. **The hierarchy was upside down.** The first thing on the main card was an optional field for naming a
   device. The title was barely larger than the text around it.
3. **The primary action wrapped to two lines** at 375 pixels: "Create my account with Face ID or fingerprint".
4. **The space was wasted.** Half the screen empty on a phone, and a narrow strip floating in the middle of a
   desktop.
5. **There was no art direction, only colours.** No round shapes, no character, no illustration, no movement.

**What was done about each.**

- A **gallery of example screens** at `/dev/screens`, twelve of them, rendered from example data with the real
  blocks. It opens on a switch of its own rather than behind the operator lock, because the operator lock
  exists to protect pages that move money and has the side effect that nothing can photograph a screen. This
  page moves nothing and has no working control on it. `test/gallery.test.ts` keeps it honest: every sentence
  it claims as built must exist word for word in the component it names, and a screen that does not exist yet
  says so on its own face.
- **The decided order is back.** Signed out, the home says what Viky is and offers the gift, with the account
  second. Composing a gift needs nobody's identity, so the funder journey runs three screens before an account
  is mentioned and the passkey arrives on its own screen, just before money does.
- **The optional field is behind a disclosure**, the action is first, and the label is one line: "Create my
  account", with the face and the fingerprint on the line underneath.
- **An art direction, not a palette.** A drop with five expressions, organic shapes behind the four moments
  that deserve them, and one slow movement that the reduced-motion setting switches off. What is taken from
  the game the funder pointed at is its principles, round shapes and plain joy; never its characters, which
  belong to Sony.
- **Joy moved off the ground.** The sunny colour was the background of every screen, so a form, an amount and
  a card payment all happened on a party. There are three surfaces now: calm for the ordinary screen, a card
  for words, and the joyful one worn only when a gift is ready, a day is earned, a gift is opened or a gift is
  over. Every text colour is measured against all three.

**And one more false sentence caught, by looking at a picture.** The first day row drew four green cells for a
week with three days earned and one missed, because `settled` was green. A settled day is earned **or**
returned and the counts cannot say which, so green was a claim nothing supported. Finished is now a colour of
its own and the two totals sit beside the row, where they are known. The screenshot found it; no test would
have.

## D66, 15 Sep 2026: mobile only was not mobile first, and the breakpoints that fix it

**Statement.** `APP_COLUMN_MAX = 480` was applied to the whole product, justified by line length. That is a
rule about text and about forms, and it was never a rule about a container: the result was a narrow strip
floating in the middle of a desktop with two thirds of the screen empty.

**What changes.** A screen is one of two things.

- A **journey** is one thing at a time with a way back: give, take a gift, connect Duolingo, take money out.
  It stays a narrow column at every size, 480 pixels, about 53 characters at a 16 pixel body.
- A **destination** is read rather than walked through: the home and a gift. It grows to 680 between 600 and
  840, and becomes two panes above that.

**The two breakpoints are chosen from the content**, which is what web.dev asks for ("choose your breakpoints
based on your content rather than popular device sizes"), and both land on a boundary Material publishes,
which is a good sign rather than the reason:

- **600**, where the margin grows from 16 to 24. Below it, 16 more pixels of margin on a 375 pixel screen is a
  tenth of the line.
- **840**, the first width where two panes actually fit: Material's own default fixed pane is 360 and its
  spacer 24, so two of them plus two 24 margins is 792. Anything narrower is two cramped columns pretending to
  be a layout. A test asserts that arithmetic rather than the number.

**The line length went from 60 to 66 characters**, and the trade-off is stated rather than smoothed: 60 was
the value inside all three published ranges, 66 is web.dev's own stated ideal and NN/g's range, and it is six
characters past the ceiling Material publishes. The guard test that asserts the art direction moved no
measurement caught this change, which is what it is for.

**The signed-out home on a desktop is a landing page**: the promise and the drop on one side, the one action
on the other, then how it works in three steps. Not a phone screen stretched.

**Account creation on a desktop.** A passkey needs a platform authenticator, and a desktop without one cannot
make an account at all. The screen now checks with
`PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`, disables the button and says what to do
instead: open viky.cash on a phone, the same account works on both. What this cannot detect is whether the PRF
extension works, which is what the account is derived from, and that only becomes knowable by trying; the
typed `PRF_UNAVAILABLE` failure still carries that case.

**Captures and tests now run at four widths**, 375, 430, 768 and 1280, each a decision rather than a device:
the narrow phone, the wide phone, the width where a destination has grown but not split, and the width where
it is two panes. 320 is checked separately, because WCAG 1.4.10 asks for it and no real device is that narrow.

**The layout stays loose on purpose**: mockups are coming and they take precedence over every visual choice
above. What must survive them is the measurement underneath, not the arrangement.

## D67, 15 Sep 2026: the pass had reached two pages out of eight

**Statement.** The funder looked again and said some pages were still mobile only and still had no art
direction. He was right, and the number is the useful part: **two pages of eight** had been converted. The
home and the account page used the shared layout; the funder journey, taking money out, privacy, legal, the
judges page, the offline page and a gift itself all still set their own width in place, `max-w-md` or
`max-w-2xl` with their own margins, and still carried the Tailwind scale rather than the tokens.

**Why it happened, because the pattern is worth naming.** I built the foundation, converted the two screens I
was actively working on, measured those two, and reported the foundation as the pass. A design system that
one screen uses is not a design system; it is one styled screen and a lot of unused variables. Nothing in the
tests caught it, because every test I had written measured the pages it was pointed at.

**What was done.** All eight now go through one `Screen`, which is also what makes the journey and
destination distinction real rather than a description: a journey is a narrow column at every size, a
destination grows and splits into two panes at 840. A gift is a destination now, with the days and what they
are worth on one side and everything a person can do about it on the other. Seventy six hardcoded values
across twelve files, the text sizes, the spacing steps, the radii and the last white, green, amber and blue
surfaces, are gone; only the operator's own pages under `app/components/dev/` still carry theirs.

**And a defect the conversion surfaced**: the back link was 36 pixels wide, because a short label makes a
small target however tall it is. It is pulled left by its own padding now, so the word stays flush with the
page margin while the target around it is a full 48.

**What to take from it.** The check that would have caught this is not a test, it is a list: every page, and
which layout it uses. The browser tests now run over every public page at four widths, which is that list
made executable, and it is the reason the back link was found rather than shipped.

## D68, 15 Sep 2026: the missed day came back on its own, and the record of it

**It ran.** The one leg of the product that had never happened, and the central scene of the video, happened
this morning with nobody touching anything.

| gift | day closed as missed | sent back to the funder |
|---|---|---|
| 1 | `0x1599c019d58e460a8490b8da5bd053cb326ea5692e1b3e52fb4495552596c23a`, block 104,892,532 | `0x1adb2c5fde7470cfb863014cf2ebbfffaf03214648f69f9493b5372a7504f238`, block 104,976,670, **$2.857142** |
| 2 | `0x11ab4f276ad9c4c2b02b9a9ae5861235ad114a9bd39626d9d05d89ff3c666201`, block 104,976,674 | `0xbd72fd16604372cf7d8511d72117309aab880f3f7b847d3a3cc4c9c470f073d8`, block 104,976,678, **$0.142857** |

The funder's account went from $0.00 to **$2.999999**, which is the two refunds to the unit.

**It happened in two halves, and the halves are a day apart on purpose.** Gift 1's day was closed as missed
by the counting pass at 00:30 UTC, because that pass drains even though it never refunds, and the money then
sat in the refundable bucket for six and a half hours until the settling pass at 07:00 sent it. Gift 2 was
drained and refunded in the same 07:00 pass, because its catch-up window ran to 06:00 and the earlier pass
could not touch it. Both behaviours are what D35 designed and neither had ever been seen.

**And a false money sentence in the capture script itself**, found by reading its own output rather than by a
test. It printed `refundable` under "waiting to go", but `refundable` is a running total of everything that
has ever become refundable, not what is left to send: the contract sends `refundable - refundedToFunder`.
So the moment a refund landed, the script said the same amount was still waiting to go. Corrected to
`refundableBalance`, which is the outstanding figure the contract exposes for exactly this.

That is the fifth sentence about money found saying something no code path made true, and the first one found
in a tool rather than on a screen. The rule holds wherever a number is printed, not only where a person reads
it.

## D69, 15 Sep 2026: the poster look, on the signed-out home first

**What the funder chose**, out of four previews: by day the first one (cream #FFF3D9, tomato #FF5A36, plum ink,
Anton titles, DM Sans text, outlined stickers, a pill button in relief), and by night the same type and stickers in
the colours of the third one (indigo #1C1035, acid green #C6FF4D), with the stickers' outlines turning light.
Amounts and button labels are DM Sans. Both faces are loaded with next/font.

**Why it is a look rather than new values for the tokens.** Everything had to go through the tokens so the screens
that follow inherit it, and the signed-in home and the journeys had to stay as they are for now. Both hold because
the poster look is a second set of values for the same variables, worn by a screen that renders
`data-look="poster"` (Screen's `look`), and `:root:has()` hands it to the whole document. Every shared class reads
variables that the calm look sets to exactly what they were: the families, a title's weight, a control's outline
width (1 pixel) and its relief (none). A screen joins by asking, and `test/design-tokens.test.ts` lists who has
asked: today, the signed-out home alone.

**Measured rather than assumed.**

- Contrast, by day and by night, in POSTER_COLOURS and tested: the lowest word on the home is the tomato button's
  label at 5.36:1; outlines are 15.10:1 by day and 16.69:1 by night; the words on a sticker clear 4.5:1 on every
  fill a sticker can wear. The tomato fill is only 2.82:1 against the cream, so a button is identified by its
  outline, as it already was in the calm look.
- In a browser, at 390x844 and 1440x900, by day and by night: every glyph on the home was drawn by Anton or DM Sans,
  from Chrome's own record of the fonts it rendered, and the title, the promise and both buttons sit inside the
  first screen. The browser tests pass on the final build.
- The screens that must not change: 80 whole-page captures (fund, account, cash-out, privacy, legal, judges,
  offline, the gallery and its twelve example screens, at both sizes, by day and by night) taken before the change
  and after it. Depending on the run, 75 to 78 are identical to the pixel, and every one that is not differs in one
  of two places only: 23 to 25 pixels on one line near the top of the account page, and 9 to 18 pixels on
  cash-out. Both places differ by the same amounts between two captures of one unchanged build.

**And the defect that comparison caught.** The first build changed the account page: the chosen option of How it
looks lost its 2 pixel outline, because its own `border-2` lost to the width variable the shared button now reads.
Every test passed with it. The option now sets that variable to 2 pixels instead.

**And the one the reviewer caught.** At night, a motif drawn on a sticker kept the light outline of the sticker's
own edge, cream on the yellow sun and on the lime ticket, where it all but vanished. The measurement had compared
every outline with the page and none with the sticker underneath. A motif is now outlined in the colour measured for
words on a sticker, which is the same plum by day, and the tokens test already holds that colour to 4.5:1 on every
fill a sticker can wear.

**What cannot be photographed** is the signed-in home, because a passkey cannot be replayed by a script. Its branch
of HomeScreen is unchanged, and every class it uses resolves to the calm values, since nothing on it asks for the
poster look.

## D70, 15 Sep 2026: the funder journey joins the poster look, all of it

**What the funder chose.** The screen after the home was the first step of giving. A look changes by page, and every
step of giving (who, how much, the check, the account, the wait for the payment, the gift ready) is the one page
/fund, so the funder chose the whole journey rather than its first screen: a look that changed between two steps of
the same gift would read as a fault.

**What it took, and nothing more.** `look="poster"` on that page; the same look on the funder's example screens in
the gallery, so a capture of one is what a funder meets; and one pair of tokens the home had not needed, a card's
edge, which is a divider hairline in the calm look and the sticker outline at 2 pixels in the poster look. The two
sections of the journey that drew their own edge, the gift ready and what the open session can do, read those tokens
too. And the two section headings inside the check step's cards, which had been set as bold text, take the title
style, because the direction puts every title in Anton; the reviewer found them. No screen's words, order or
behaviour changed.

**Measured.**

- Walking the journey as a signed-out person at 390x844 and 1440x900, by day and by night, from the home through
  "Offer a gift" to the first step, how much, the check and the account step, with nothing created and nothing paid:
  every glyph was drawn by Anton or DM Sans; the lowest words are 5.36:1 by day (the label of Continue on the tomato)
  and 8.20:1 by night; field and button outlines are 14.17:1 or more; card edges are 15.10:1 by day and 16.69:1 by
  night. On the first step, the way back, the title, both fields and Continue sit inside the first screen at both
  sizes.
- The 80 whole-page captures, against the build before this change: 54 are identical to the pixel, the 24 of the
  funder journey and of the funder's example screens changed as intended, and the last two differ only in the two
  places that differ between two captures of one unchanged build.
- The browser tests pass on that build.

## D71, 15 Sep 2026: every screen wears the poster look

**What the funder asked.** Not to be handed the pages one at a time: the direction was chosen for the product, so it
goes on every screen a person can open, found by walking the real site rather than by waiting for a list.

**What it took.** `Screen` renders `data-look="poster"` itself instead of waiting to be asked, so every page drawn
through it wears the look, and `test/design-tokens.test.ts` holds every page outside app/dev to being drawn through
it. The calm values remain only for the operator's own pages under app/dev, which do not use `Screen`. Then the
titles, because the direction puts every title in Anton:

- a destination and a document open with the display title (the account, a gift, privacy, the legal notice, the
  judges page); a journey's title is one step's, so it keeps the title size (taking money out, each step of giving);
- every section heading that was set as bold text takes the title style: how it looks, lost your phone, what I
  receive and what I give, what this device can do for you, sending to another account, proving a Duolingo name is
  yours, and the gift being ready;
- the one title that states an amount, a gift's, hands the amount back to DM Sans, as every amount is.

An alert's edge and a moment's edge read the card tokens, and the browser's own bar takes the look's two grounds. The
card offering to install Viky is rendered nowhere, so it was left as it was.

**What measuring found, beyond the look.**

- The marks in a day's cell were characters that neither face has, so the phone's fonts drew them: Arial, Hiragino
  Sans and Lucida Grande on one row of seven days. They are drawn shapes now.
- The number in a day's cell was in the muted colour: 4.04:1 on a day that can still be caught, by day, and 3.06:1
  at night. The calm look had the same fault. It is in the text colour now, and a test keeps the muted one off the
  cells.
- Addresses and codes were set in a monospace face, which is always the system's. They are in DM Sans: hex has no
  letter a text face confuses.
- A moment's soft shapes stopped short of its bottom with a hard edge showing, because the document's rule that stops
  an svg pushing the page sideways gives it an automatic height, and the wave itself ended at 250 of 300.
- On a phone, the judges page's two columns left a value 198 pixels and broke every sentence mid-word to fit an
  address beside it. The label sits above its value there now, and only an unbreakable string breaks.
- The focus ring of "Account, help and legal" was the accent fill, 2.82:1 on the cream. It is the accent colour for
  words now, like every other control's.

**And what the reviewer caught.** At night the drop's face was drawn in the text colour, cream on the acid green at
1.10:1, and all but vanished on every moment; it takes the colour measured against the accent now, the same plum by
day. And a day still to come was edged with the divider, the one box on its row without the look's outline, pale by
day and a dim violet at night; it takes a card's edge. A test holds each. The same hairline had stayed on the two boxes
inside giving, around the identifier to check before paying and around the gift's link, and they take a card's edge
too.

**Measured**, on the built app with the example screens switched on, at 390x844 and 1440x900, by day and by night:
the ten pages a signed-out person can open (the home, giving, the account, privacy, the legal notice, the judges page,
taking money out, offline, and two gifts) and the twelve example screens, 88 measurements in all.

- Every glyph was drawn by Anton or DM Sans, from Chrome's own record of the fonts it rendered.
- The lowest words are 5.36:1 by day (the label of Offer a gift on the tomato) and 5.29:1 by night (a day's number on
  a day that can still be caught); control outlines are 14.17:1 or more, and card edges 15.10:1 or more.
- On every one of the ten pages, the title sits entirely inside the first screen, and nothing scrolls sideways.

**What cannot be photographed** is anything behind a passkey: the signed-in home, a gift opened by its recipient,
taking money out with money to take, what the open session can do. Those states draw the same components the example
screens draw, through the same variables, but they were not seen in a browser.

## D72, 15 Sep 2026: what the funder met buying a gift for real, and no promise of a card or a bank

The funder made the whole purchase on viky.cash tonight, and the advisor wrote up eight defects from it.

1. **The account step had no way forward.** Once the account existed it showed only the account panel and the
   session, and the funder had to guess that Back led to the payment. An account step with an account now shows
   the check again, with its button to pay (`fundingStageShown`, tested).
2. **Nothing said how much to buy.** The screen suggested $50, the rail's smallest payment of 25 EUR brings about
   $28.50, and the page then waited for a gift that could not be made. The check and the waiting screen now say to
   pay at least N EUR, from `eurosToBuy`: what the account is short of, in whole euros at the rates measured on
   14 Sep with a tenth added for the rate, never below 25 EUR, recomputed from the balance on every refresh. The
   margin costs the funder nothing, because whatever is left over stays in their account. The suggested gift is
   now $25, what one smallest payment covers; the $50 rested on the payout floor of D62, which point 7 removes.
3. **The rail asks whose destination it is**, the person's own or a platform's, custodial or not, and the steps did
   not say. The true answer is their own, non-custodial: the key is derived from the passkey on the device and held
   by nobody else. The steps now say so, without the forbidden word the rail itself uses.
4. **"Any amount" sent the whole balance**, and **5. the balance showed two decimals where the signature moved
   six.** The sentence now says all of it goes and writes the amount to its last decimal (`formatAusdExact`,
   tested against the value the screen sends). This is the one screen that shows more than the two decimals
   CLAUDE.md asks for, because the funder's instruction for it is the later one.
6. **The email or phone protected nothing.** The claim route copies the stored hash into the attestation, so the
   contract compares our own value with itself, and Viky writes to nobody. It was mandatory and first, and all it
   left was a fingerprint on a public ledger, which a phone number does not survive. It is gone: a new gift carries
   `NO_CONTACT_HASH`, a fixed non-zero value, because the contract refuses zero. A page loaded before the change
   still sends a contact and signed its hash into the terms, so the route still accepts one. The Duolingo name is
   the only field, with why it protects the gift, and the step says Viky never writes to them. The privacy page
   says only gifts made before today hold a fingerprint.
7. **The card rail pays out to no card in France or the rest of the EEA.** Mercuryo's help centre article "In which
   countries can I make an off-ramp (sell) transaction?", created 15 Sep 2026 at 10:45 UTC
   (help.mercuryo.io/hc/en-gb/articles/39157544835613, read tonight through the help centre's own API because the
   page answers a script with 403), marks neither Visa nor Mastercard for every EU country, Iceland, Liechtenstein,
   Norway and the United States. Senegal keeps Visa and not Mastercard; a country the article does not list keeps
   both. Their currencies endpoint (`https://api.mercuryo.io/v1.6/lib/currencies`, read tonight) restricts MON on
   MONAD only in `gb`, and for buying as well as selling, which `src/rails.ts` had wrong: the way in is marked
   closed there too now.

   So no screen promises a card or a bank: not the gift page after taking money, not the check step, not the way
   out ("card or bank is coming", "somewhere you can spend it"), not the privacy and legal pages' sales, and not the
   example screens. The payout floor helpers and their tests went with the promise. `ExitRouter` is not deployed and
   is not wired to Mercuryo.

   **A risk for any rail after this one.** `ExitRouter` pays the MON out through an internal call, and nothing
   guarantees that a deposit service credits a deposit arriving that way rather than as a plain transfer. Whatever
   it is ever pointed at must first be shown to credit one, with a small amount.
8. **Nothing on screen names another way out.** The funder is testing one tonight, and that decision comes after.

## D73, 15 Sep 2026: giving looks like the poster, not like a form in its colours

**What the funder saw.** Every step of /fund wore the poster's colours and faces and still read as a white form in
an empty column, beside a home of stickers and big type. It had the look's tokens and none of its composition.

**What changed.**

- Each card of giving is a sticker: one of the four sticker fills, the look's outline and a hard shadow. Who it is
  for is pink; how much is yellow, with what a day is worth in mint; the check is lilac, mint and pink; the payment
  and the gift ready are yellow; the account step is lilac. A sticker redefines the roles inside it (words, help,
  links, field and button outlines, reliefs) to the ink measured on its fills, and puts fields on paper, so nothing
  inside has to know it sits on a colour. Mint never holds a primary button, because at night the two are the same
  lime.
- On a wide screen the look's picture stands on each side of the column, where there was only cream. It takes no
  pointer and is not drawn below 1100 pixels, where the column needs the room.
- The example screens of giving draw the same stickers.

**Measured, and not put through a review pass**, which the funder asked to do themselves: the paper holds the
stickers' ink at 16.35:1 by day and 16.69:1 at night, and the lowest pair inside any sticker is that ink on lilac at
night, 4.84:1. Both are tested, and so is the rule that mint holds no primary button.

**And then every other card, the same evening.** The account panel is yellow wherever it appears; what the open
session can do is lilac; how it looks is pink, its chosen option filled with paper because every outline inside a
sticker is the same ink; lost your phone is mint, and the three pages beside it pink, lilac and yellow. Money in the
account is yellow, a gift received mint and a gift given pink. On a gift, the recipient's steps are yellow, pink and
lilac, then mint while it counts and once it is finished; on the way out, yellow then pink. The rule on mint is
tested across every screen.

## D74, 16 Sep 2026: a card payment longer than the session no longer loses the gift

**Measured on 15 Sep.** The funder ordered on Mercuryo at 22:13 and the coins arrived at 22:25:24 (block
105,127,933, 1,231.69 MON, transaction 0x429f517a...7e14, read on chain). The passkey session closes after ten
minutes without a signature: the account left the page, and the effect watching for the payment stopped with it. The
coins stayed in the account, converted into nothing and given to nobody. The waiting screen also read the closed
account's identifier with a non-null assertion, so a render without one ended the page. Mercuryo's own help centre
("How can I check the status of my transaction?", edited 16 Jul) says most payments take 30 to 60 minutes and
several hours when the network is busy, so a ten minute session closes during most of them.

**What changed.**

- The gift's terms are written to the device when the rail opens: the Duolingo name when given, how much, how long,
  the target, and whose account set it up. When that same account is signed in on /fund again, within 72 hours, the
  page goes back to waiting, says "Welcome back", and converts and gives as before. Making the gift forgets them, and
  the waiting screen offers to set up a different gift instead.
- When the session closes during the wait, the page says so, says nothing is lost, and asks to sign in; signing in
  on the same page picks up where it stopped. If the device refused to keep the terms, it says they last while the
  page stays open, and nothing more.
- A payment already in the account is used before the funder is sent to pay again: the check offers "Use the
  payment that arrived", decided by the same test the waiting page converts on. A payment left behind, like the one
  of 15 Sep, can still become a gift that way.
- The signed-in home says "Finish the gift you set up" while there is one, and the first step says a gift is waiting
  when nobody is signed in at all, which after a reload is the only screen there is.
- On the screen after a closed session, signing in leads and making an account follows: the other way round, somebody
  coming back makes a second account, and the gift and the payment stay on the first. Found by replaying the evening
  with a virtual passkey rather than by reading the code.
- What just happened is said above the instructions rather than under the buttons, where "Welcome back" first landed.
- On the waiting screen the accent goes to reopening the rail's page, which is the only thing there is to press once
  the tab is closed. The reviewer found that screen had no accent at all.
- "Keep this page open" is gone, because it was never true protection: the session closed whether the page stayed
  open or not, and an hour of watching a page is not something to ask for. The screen says the page can be left, and
  says the opposite only when the device refused to keep the gift. Beside the way out of a gift picked up again, it
  says what happens to a payment already made: it stays in the account, for this gift or the next.
- The waiting page does not keep the session open. It still closes itself after ten quiet minutes, as the session
  panel promises, and the next conversion still asks for a signature.

**Not solved.** The terms live on one device. Coming back on another phone finds the payment in the account and no
gift set up: the funder sets it up again, and the check offers the payment that arrived.

## D75, 16 Sep 2026: money leaves in the amount that was typed, to the last decimal

**Why.** A payout service is ordered for a quantity and expects exactly that quantity to arrive. Ramp's own terms,
read at the source (rampnetwork.com/terms-of-service, UK terms last updated 20 July 2026): "You must at all times
accurately enter the quantity of the Digital Asset you are seeking to trade via the Off-Ramp Service prior to
submitting your Order", and over or under declaring "may result in an Order Failure causing Ramp Network to refund
you, minus any applicable network fees". The advisor dated the terms 13 July; what the page says today is 20 July,
and that is the date recorded here. Viky sent the whole balance, six decimals and all, so no order could match it.

**What changed.** The way out has an amount field, opened on the whole balance written in full, editable, read to the
last of the coin's six decimals (`amountToSend`). Exactly what is typed is what the signature moves, and the button
says it: "Send $28.564213". More than the account holds is refused above the field, with the figure it does hold, and
so is anything the coin cannot carry; the button stays shut until the amount can leave. The screen no longer says all
of it goes, because it no longer does.

**What is not on the screen.** No payout service is named, and nothing says where the money goes next: that decision
is the funder's and it has not been taken (D72, point 8).

## D76, 16 Sep 2026: the router pays the person, never the payout service

**The question, asked before any code.** `ExitRouter` paid a destination directly with `payoutTo.call{value}`. Does a
deposit service credit an order paid that way, by a contract?

**The answer, and why it is a refusal rather than a finding.** A native transfer made by a contract is an internal
transfer. It is in no block's transaction list and in no receipt, so anything reading the chain the ordinary way does
not see it. No payout service states in public whether an order paid that way is credited at all. Building on that
would have been a bet with somebody else's money, and the way to stop betting is to stop one step earlier.

**Form C, chosen by the funder.** The router takes the AUSD on one signature, exchanges it, and hands the whole
proceeds back to **the person who signed**. They then send the payout service its coin themselves, from their own
account, in a transfer every detector reads. Nobody's permission is needed for that.

**What that removed.** `payoutTo`, the order-and-surplus split, `payoutGas` for a stranger's address, and with them a
class of question. There is no order to pay exactly, so the floor is only a floor: protection against the rate moving
while the transaction is in flight. The screens follow the facts rather than the reverse, as the funder put it: change
the money first, read what actually arrived, create the order for that figure, then send exactly that with the amount
field of D75.

**The tag moved with the terms**, so no signature made for the old shape can be replayed against a contract that reads
those bytes differently. `test/ExitTermsParity.t.sol` pins both halves.

## D77, 16 Sep 2026: two ways out, and the coin travels inside the signature

**What was measured, and what it overturned.** Wiring the way out to a single euro payout service would have closed
the pilot's own corridor. Read at the source on 16 Sep 2026:

- Their payout-methods list (`api.ramp.network/api/host-api/v3/payout-methods`) holds 5 methods over 120 countries.
  **Senegal and Ivory Coast are in none of them**, their currencies endpoint returns nothing sellable for either, and
  a live quote for both answers 403. Those two countries are exactly where the pilot's cross-border gifts are aimed.
- The other service's currencies endpoint (`api.mercuryo.io/v1.6/lib/currencies`) restricts selling MON on Monad in
  `["gb"]` and nowhere else, so both countries are open there. What it cannot do is pay in France or the rest of the
  EEA, which is a payout fact and not a currency one (D72, their help centre, 15 Sep).
- Their own asset page states that under **MiCA** several stablecoins, **AUSD among them**, cannot be bought or sold
  in the EU or the EEA, and names USDC as one that can. So for somebody in France, selling what a gift holds is not
  available at all: the exchange step is not a convenience, it is the only lawful route out.

**The decision.** Both ways out exist, and between them the corridors are covered. The screen names what exists, each
with where it pays, its source and the date that source was read, and the person chooses. **No country list is copied
into our code**: one of these lists changed on 15 Sep and the other dates from June, so a frozen copy would be false
within weeks, and a false sentence about somebody's money is what D39 forbids. Nobody is asked where they live.

**The consequence on the contract, integrated before deploying it.** The two services take different coins, so the
coin coming back is a field of the signed terms (`tokenOut`, zero meaning the chain's own) rather than a constant set
at deployment. A router pinned to either coin would have closed the other corridor for good. The tag moved again. The
native path returns for that corridor, but only ever to pay **the person**, so D76 stands unchanged.

**What is built and proven.** The contract and its 43 tests, both coins and both delivery paths, including a payer
that refuses its payout, one that hands it straight back, and one that burns gas (made real with `etch`, since a
delegated account can both sign and run code). The terms and their parity pins, the store, the planner, the three
routes, and the first client helper that signs an exit.

**What is not built, and must not be implied anywhere.** The router was deployed on 16 Sep at
`0x8a1790dfd10cf1599bdaed5ec8bb46b2a6eb6223`, owned by the founder's own wallet and not by the key that deployed it
(see `docs/OPERATIONS.md`). Deployed is not the same as working: nothing has passed through it. The smallest sale is read live from the euro service only; the card service publishes its own
and Viky does not read it yet, so no figure of theirs is printed. Neither corridor has run once end to end with real
money.

## D78, 16 Sep 2026: money moves in three coins, and one of them Viky cannot move for you

**Why, measured rather than felt.** The funder refused the deployment in the order I proposed it, and was right:
`app/api/send/route.ts` was pinned to AUSD in four separate places, so the moment the way out changed money into
something else, none of it could be sent on. A router deployed before that would have been an immutable contract with
no journey behind it.

**The order, theirs:** the send first, then one deployment, then the real trial at about eight dollars, then the full
withdrawal.

**What changed.** One place now describes the coins (`src/coins.ts`): what each is called, its address, its decimals,
and the EIP-3009 domain measured on chain. The send route takes a coin instead of assuming one. The amount field
reads to the last decimal **that coin** has. The screen reads all three balances and shows what a gift holds as the
headline, with anything the way out has already produced beneath it, because after a change the headline is smaller
than what somebody owns and hiding the rest would tell them their money had gone.

**Two decimal widths that are not the same number.** The stablecoins have six, the network's own coin has eighteen.
The parser was fixed at six. Against an eighteen-decimal amount it would have cut twelve digits off, which reads like
a rounding error and is most of the money. `test/send-amount.test.ts` now covers both widths.

**Two domains that are not the same either.** AUSD signs under "Agora Dollar" version 1. USDC on Monad signs under
"USDC" version 2, read on chain at `rpc.monad.xyz` on 16 Sep, where `transferWithAuthorization` is present (an empty
probe reverts with "FiatTokenV2: authorization is expired"). A signature made under the wrong one is not slightly
wrong, it is refused by the token and nothing says why. A test now proves a signature for one coin does not move the
other.

**The one thing Viky cannot do for somebody, and it is on the screen.** MON is the network's own coin, so there is no
authorization to sign: nobody can move it on another person's behalf. The route refuses it with `SENT_BY_THEMSELVES`,
and the browser uses the person's own transaction, which checks that the amount **and** the fee both fit before
sending and says afterwards what the fee actually was. So "nothing to pay, Viky covers what it costs to move" is now
printed only where it is true, and the other sentence where it is not. This was asked for as "the same signed
mechanism as AUSD", which is impossible for a coin that is not a token; the intent was met the only way it can be.

**Not printed, deliberately.** No figure about fees appears on any screen until a real amount has gone through one of
these rails, at the funder's instruction. The figures are measured and recorded in `src/rails.ts` and simply not
shown. No captures either, for the same reason.

## D79, 16 Sep 2026: the widget decides, the API only prepares

**The measurement.** Asked from France on 16 Sep, the euro service's own quote endpoint prices AUSD without
complaint: **16.20 EUR net on 20.994751 AUSD, fee 1.99**, offering both SEPA and card. On the same day, in the
same country, the funder cannot find AUSD in their widget at all, while other assets do appear there greyed out
with a message about location.

**The rule this settles.** Four sources from the same company disagree, and the funder walked the widget to find
out which one is telling the truth:

| source | what it says about selling AUSD from France |
|---|---|
| their published asset page | MiCA bars it in the EU and the EEA |
| their quote endpoint | sells it: 16.20 EUR net on 20.994751 AUSD, fee 1.99, SEPA and card |
| their widget's asset selector | lists AUSD on Monad under **"available in your location"** |
| their sell screen, the last one | **"Selling AUSD is not supported in your location yet"** |

Two of them promise and one refuses, and the one that refuses is the last screen before somebody's money moves.
**Only the sell screen is authoritative.** An endpoint that quotes is not a service that pays, and neither is a
dropdown that lists.

**And the same screen says yes to the coin we chose**, which is the other half of the rule and was measured the
same day at 03:52, from France: their order summary read "Sell 117,67 USDC on Monad", paid to "Bank transfer
(FR76 … 2922)", total payout 100,00 EUR. So the rule is not "distrust them", it is "ask the screen that decides".
USDC on Monad with a SEPA payout to a French account passes it; AUSD does not. Nothing after order creation is
proven by this: not the deposit being credited, and not the transfer arriving.

**And a rule about our own words.** A refusal shown on a Viky screen about what a rail will do must be **the
rail's own sentence**, never one of ours dressed up as theirs. We may refuse early on a number they publish, and
say it is theirs. We may not invent a refusal about who is allowed to sell, because that is the one thing only
their last screen knows.

**What follows, and it is general.** An API answer is good enough to prepare something and never good enough to
promise it on a screen. This is the same shape as the earlier finding that the quote endpoint happily quoted
assets and US states its own help centre bars: it enforces countries, not assets. Where the two disagree, Viky
believes the more restrictive one and says nothing the customer's own screen would contradict.

**What does not change.** France stays on USDC, and the router keeps its place: the coin comes back as the terms
name it (D77), so nothing had to move to absorb this. What would have been wrong is building the French exit on
an AUSD quote that a real customer can never reach.

## D80, 16 Sep 2026: the first real attempt failed, and the message told nobody anything

**What happened.** The funder opened the way out in production and asked for ten dollars. The quote came back.
The conversion then failed with **"Something went wrong. Nothing was changed."**, and that sentence is the whole
defect: it says neither what happened nor whether their money moved.

**The cause, from production's own logs.** Not either of the two things suspected.

```
03:56:16.80  λ POST /api/exit/quote     200
03:56:36.88  λ POST /api/exit/prepare   500  NeonDbError: relation "viky_exits" does not exist
```

The table had **never been created in the production database**. `ensureExitSchema` is called only by
`scripts/migrate-db.ts` and by the tests, and nobody had run the migration since the way out was written.
Production held `viky_gifts`, `viky_proof_sessions` and `viky_relayed`, and nothing else.

So the session was fine and the contract was never reached: nothing was signed, the relayer submitted nothing,
its nonce stayed at 35, and the router is empty. Every check the funder made agreed with that, which is why the
message was worse than useless: it pointed at nothing, while the truth was three steps away from anything they
had done.

**Why it arrived as a shrug.** `giftErrorResponse` names auth failures, `GiftApiError`, `RequestError` and
`RelayerError`. A driver's error is none of those, so it fell to the last branch. **An untyped throw on a money
route is a design fault, not an accident**: every refusal here is meant to be demonstrable.

**Three fixes, in the order they matter.**

1. The table exists now, created with production's own credentials. Its columns were checked afterwards:
   `token_out` present, `payout_to` gone.
2. A missing table or column is now a **typed** refusal, `NOT_CONFIGURED`, 503, "Viky cannot pay out yet.
   Nothing was taken." It can never again reach anybody as "something went wrong".
3. The screen no longer shrugs. A session that closed says so and offers the way back (D74's shape), a named
   contract refusal keeps its name, and anything left over still says the one thing always true here: nothing
   was taken, and the money is where it was. The router holds nothing between transactions, so that is the
   design rather than reassurance.

**And one silence that was worse than the message.** If the passkey session closed mid-flow, `changeIt` did
`if (!account) return` and the button simply did nothing, with nothing on screen to read. Sessions close after
ten quiet minutes and placing an order with a payout service takes longer than that, so **a session closing is
an expected part of this journey**, not a failure in it.

**Still not verified.** Nothing has passed through the router. The trial has not been run again.

## D81, 16 Sep 2026: the exchange refused its own bytes, and no number could have told us

**What happened.** The ten dollar trial reached the exchange and was refused with `ExchangeFailed`. Nothing was
taken: the relayer's nonce never moved, because the refusal came from `simulateContract` and no transaction was
ever submitted.

**Why the contract could not say more.** `exit` does `(bool ok,) = t.exchange.call(exchangeCall)` and throws the
reason away, so on mainnet it can only ever report `ExchangeFailed`. The cause had to be found off chain.

**Found on a fork, with the bytes that actually failed** (`test/ExitRouterFork.t.sol`, replaying the `call_data`
`prepare` had stored):

| run | result |
|---|---|
| stored bytes, latest block | refused, `0x5264a63f` |
| stored bytes, **their own block** | refused, `0x5264a63f` |
| fresh bytes, that same old block | **succeeded**, 9,999,167 out |
| stored bytes, embedded minimum lowered to 1 | **succeeded**, 9,968,242 out |
| fresh bytes, embedded minimum doubled | refused, `0x5264a63f` |

So the route inside those bytes could deliver 9,968,242 and was asked for 9,998,810. `0x5264a63f` is the
exchange's own minimum check, identified by moving that number alone and watching the refusal appear and
disappear. It is in the entry contract's bytecode and in neither signature registry.

**The cause.** The engraved minimum sits a constant 0.040 % under what the route says it will deliver, measured
over sixteen quotes, so the exchange is coherent when it quotes. That margin does not survive a human delay:
between the quote and the relay the route moved 0.3 %, seven times the margin.

**Two things that are not the cause**, both of which I proposed and the evidence refused:

- **The caller.** The same bytes fail identically from a contract and from an account that is its own origin.
  The router's shape was never the problem.
- **Two quotes disagreeing.** `prepare` did bind the floor from the shown quote while relaying a second quote's
  bytes, which is a real fault and is fixed. But the two numbers were **identical**, and over sixteen quotes the
  engraved minimum always equals the announced one, so comparing them can never catch anything. I wrote such a
  check, called it a protection, and its own unit test passed only because I had built the fake payload with
  mismatched numbers, encoding my assumption instead of the measurement. A check that cannot fail is worse than
  none: it implies a cover that does not exist. It is deleted.

**The lesson to keep.** This exchange leaves 0.040 % of margin, and asking it for slippage explicitly returns a
minimum **equal to the output**, which is none at all. So no setting buys safety here, and no arithmetic of ours
makes a moved route fill.

**What was done.**

1. The floor is bound from the quote whose bytes are relayed, never from the ticket. One signature, one quote.
2. The word-one check is gone.
3. **No simulation at prepare.** The router holds no authorization then, so it would fail on the authorization
   rather than the swap, and making it meaningful needs non-standard state overrides for balance and allowance
   slots. `relayExit` already simulates after signing, which is where the answer actually is.
4. **A retry instead.** A relay refused for a moved route sets those terms aside (`stale`) and the browser asks
   for a new price, new terms and a new signature, three attempts in all.

**How well the retry works is not known, and the first estimate was wrong.** It was sized on the funder's
sample, fifteen pairs of quotes taken thirty seconds apart with none unfillable, which suggested one retry
would collapse the odds. Then a fork run executed a quote seconds after fetching it and the route delivered
9,992,703 against the 9,995,387 engraved in its own bytes: short by 2,684 units, **0.027 %**, well inside the
0.040 % margin and a tenth of the 0.3 % excursion that failed the real attempt. One refusal on one attempt is
not a rate, but it was enough to retire the claim that a single retry is provably sufficient.

Six freshly fetched quotes were then executed on a fork within seconds of fetching: **six filled, none
refused**. So the ordinary case is healthy and the refusal was a genuine intermittent rather than the norm,
which is the better news. It still does not give a rate, and it does not say what was different about the one
that failed. The retry is therefore a reasonable measure of **unknown strength**: good enough to ship, not
something to call proven, and the thing to watch when real money starts moving.

**What a retry does not undo.** The set-aside signature stays valid until its deadline and `exit` is open to
anyone. What bounds it is the fifteen minute window and the fact that the same account rarely holds twice the
amount.

**Why a live attempt cannot prove this fixed.** The defect is intermittent: a fresh trial will most likely
succeed whatever we did. The proof has to be a test that builds the failing shape deliberately.
