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
  refused as "nothing to credit" when read the next morning (the strategy review's finding); a lesson
  taken on the baseline day, before the window, can pay for a missed window day; a reading credits the
  very day it is taken on; and anyone calling `drain` between midnight and the morning reading can drain a
  day the recipient had covered on its catch-up day.
- Source: `test/GiftEscrow.t.sol` (`testTheLastDayCountsWhenReadTheNextMorning`,
  `testALessonBeforeTheWindowNeverPaysForAMissedDay`, `testAReadingNeverCreditsItsOwnDay`,
  `testADayIsNeverDrainedBeforeTheMorningReadingThatCouldCoverIt`), run against the deployed source on
  11 Sep 2026: four failures; the strategy review of 11 Sep 2026.
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
- Source: the Metropolis support answer, relayed by the funder on 11 Sep 2026.
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

