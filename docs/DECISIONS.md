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

1. **The first reading is always the start.** Whatever it says, it is recorded, and there is never a second
   chance to start from a reading that suits the recipient better.
2. **A start above what the funder accepted never pays.** The funder signs a highest accepted starting
   point along with the target; a gift started above it can never settle, and comes back at its deadline.
3. **A milestone already reached is not a milestone.** The two promises above exist so that nobody is paid
   for what was already true, including on a measure that can fall. What the contract can actually check is
   the first reading, not the day the gift was created, so the sentence is: nobody is paid for what was
   already true **when the gift was started**. For a thing that is had or not had, a certificate, that makes
   opening the link before the event part of the deal, and the screens say so (D46).
4. **The deadline judges the reading, not the transaction.** A reading taken before the deadline still pays
   if it arrives a little after, and the keeper cannot return the money while such a reading could still
   arrive. Our relayer's lateness is ours, never the recipient's to pay for.
5. **An old reading is never a start.** A reading must be recent to begin a gift, as it must be to end one.
6. **The wait for a first reading runs from the day the gift was opened**, not from the day it was funded,
   so opening the link late never shortens the time to begin.
7. **All or nothing, once.** A milestone is reached and the whole amount becomes the recipient's, or the
   deadline passes and the whole amount goes back. Never both, never in parts, never twice.
8. **Every unit ends with somebody.** For every gift: what the recipient took, plus what the funder got
   back, plus what the contract still holds for it, equals the amount that went in.
9. **A gift that is over cannot be reopened**, and a gift nobody claimed can be taken back by the funder
   until somebody does.
10. **An identifier means one gift.** Milestone gifts are numbered from a range the daily contract can never
    reach, because records elsewhere key on the identifier alone.

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
- **Two things the review sent back to the product rather than to the contract.**
  1. **A certificate must be opened before it is earned.** The contract can only judge the first reading, so
     a diploma obtained on Wednesday and a link opened on Thursday gives a first reading that is already at
     the target, which can never pay. The founding example of D36 fails if the recipient ignores the link
     until after the exam. This is not fixable on chain without trusting an unattested number, so it is a
     sentence the screens must carry: the gift has to be opened, and the account named, before the thing is
     obtained. The funder's screen says it when the gift is made, and the recipient's link says it first.
  2. **A milestone has a duration, not a date.** The clock starts at the first reading, so "a mission
     delivered tomorrow" is a day from opening, not a day from Tuesday. The funder screen must say what it
     signs, in days from the moment the recipient starts.
- State: 33 tests on this contract, 96 across the suite. Still not deployed. Nine of ten promises held on
  the second pass; the tenth is fixed, and the fix goes back for a third look before any money touches it.

