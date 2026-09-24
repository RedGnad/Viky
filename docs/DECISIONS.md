# Decisions and corrected facts

Every entry records a fact that was checked at its source and turned out to differ from the spec
or from the planning notes, or a design decision that refines the spec. Each entry has a date, the
statement, the source, and the consequence for the code. Nothing here is a claim about the product
working: that is only said after the fiat chain has run once end to end on mainnet.

Format: `D<n>` id, date, tier of the source (`[O]` official page or direct measurement, `[P]` third
party platform or API, `[U]` not verified).

One number carries two entries. On 18 Sep 2026 two decisions were both written as D104, the way out naming an
amount and the code that proves an account. The second is now **D104 bis**, and nothing else is renumbered: an
id here is quoted in the code and in the other documents, so moving one would make every line that names it
point at another decision.

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

## D82, 16 Sep 2026: the first real conversion, and the identifier the screen did not offer

**What passed.** At 17:40:56 ten AUSD went through the router for the first time and came back as **9.999586
USDC**, in transaction `0x7599b203c1897f6659b2c72a3603a57fd9002c8c2a92efc463d8db6bc2e1f3ae`, block 105,357,531,
666,789 gas. The minimum bound into the terms was 9.995586, taken from the same quote as the bytes (D81). This is
a conversion, not an exit: no euro has left, and nothing about fees or timing is written anywhere until one has.

**It was a first attempt.** One row was stored for it and no `stale` row came before it, while the build carrying
the retry had been live since 16:45. So the retry was available and was not needed. That says nothing yet about
how often it will be.

**The blocking defect the real journey found.** The payout service asks where the money is sent **from** before
it gives its own identifier to send **to**. The way out's screen had no answer to that question: it never showed
the account's own identifier, and the funder had to find it somewhere else, mid order.

**The fix, in the order the service asks.** After a change the screen now offers the account's identifier at the
step where the service asks for it, start and end shown for checking and a button that copies it whole, the same
pattern the funding screen already used. Then a field for the identifier the service gives back, which opens the
existing send on the coin this way out hands back. Nothing new moves money: the destination is simply no longer
something the person has to fetch from another page.

**Deliberately not done here, and left for the design pass.** The screen still says "at least" a figure when the
exact one is known on receipt and the service requires it; "Back" still stands where a next step carrying the
exact, copyable amount should be; six decimals are still asked of the person; and the instruction is still dense.

**Not pushed while the funder was mid send**, because a push rebuilds production underneath a live journey.

## D83, 17 Sep 2026: the screens are rebuilt from drawn flows, and six things change under them

**The method.** A design audit of every signed-in state (42 states, four audits against one grid) was read in
full, and a specification was written from it, screen by screen, with the founder's decisions of 17 Sep. The
screen layer is rebuilt journey by journey from flows drawn out of that specification, `docs/design/flows.md`,
never patched: withdrawal first, then the funder, the recipient, the home page, the account page. One conversation
per journey. A screen is finished when its captures at 390x844 and 1440x900, in day and in night, have been read
by the reviewer against the grid and no finding of severity 3 or 4 remains.

**What the flows settled, and the founder confirmed.** The person never reads a money name, a network name or
an identifier; when a third party demands one, it is "the code Ramp asks for", shown whole and copied in one
gesture. One figure per fact, two decimals for the person, the exact figure only where a third party requires it.
Before any irreversible gesture a review; after it a confirmation with the amount, a reference, the time and the
next step. Every refusal is typed and sits under the element in cause. A third party's published fee and delay go
on its card with their source and date: they are that party's facts. No sentence of ours about what happened on
the way out until the bank credit of 16 Sep is reported; that day, the first sentence delivered is the one with
the measured figures.

**Six changes under the screens, each accepted by the founder, and nothing else moves below them.**

1. The way out is reachable as soon as the account holds anything: the home page reads all three coins.
2. Money screens keep the signing session open thirty minutes rather than ten, and coming back after it closed
   resumes the exact state, derived from what the account holds and the server knows, never from memory.
3. One display currency per account, proposed from the device's language tag and never asked by a question,
   changeable on the account page: euros in France, CFA francs in Senegal and Ivory Coast, dollars elsewhere. The
   gift stays in dollars on chain. Every converted figure carries "about" and the date of the rate; the dollar stays
   readable beside it on reviews and confirmations. The rate is the ECB's daily reference file, named and dated in
   `src/rails.ts` as `RATE_SOURCE`; the CFA franc is derived through its fixed parity with the euro, sourced twice:
   the figure on the BCEAO's exchange-rate page of 16 Sep 2026, the fixed parity itself in Council Decision
   98/683/EC of 23 November 1998. After three days without a read the dollar shows alone and the screen says so.
   No rate is ever invented.
4. The keeper writes a per-day record at every credit and every drain, so a day can say whether it was earned or
   went back. The contract publishes two counts and settles in order, which cannot tell the two apart (D58).
   Delivered with the recipient journey.
5. The settling pass includes gifts nobody opened, or nobody connected, older than fourteen days, so the
   contract's `refundUnearned` is actually called for them and "it comes back to you" becomes true of the product,
   not only of the contract. Delivered with the funder journey.
6. A `viky_sends` table records every send of a person's own money once it is final, and the reference a person
   reads is the hash in short form.

**Also decided.** The language follows the device with English as the fallback; only English is written for the
event, and every sentence of a journey lives in one file, `src/sentences.ts`, so French is added without touching a
screen. "Ana" exists nowhere: the Duolingo name is used when known, "their" otherwise. Dollars are typed and the
display currency is read beside them. The Duolingo name a funder types is checked by a public read before any
money moves. The account page shows the account's own code under "Your code" with one line of use. The two
sign-in routes answer a typed `RATE_LIMITED`. The judges page leaves the person's path. The gift route gains
`youAreTheFunder` and the time of each return.

**Delivered in this entry: the withdrawal journey**, states W1 to W13, with changes 1, 2, 3 and 6, the typed rate
limit and "Your code". The funder, recipient, home and account journeys follow, each in its own conversation.

## D84, 17 Sep 2026: the product entire, then the journeys on it

**The unit of work changed.** After the withdrawal screens were rebuilt from their flows and accepted, the founder
stopped the screen-by-screen pass: the product is built entire, and the journeys are placed on it. The structure is
the founder's document of 17 Sep, read with its two sourced supports (the references of six money apps and the
platform guides; Reclaim and the legal pages of the sources) and the six rules of the specification, which hold on
every screen. Seven decisions were listed to be contested against the code before the first line, and two were
raised: the legal notice and the privacy page must stay reachable without an account once the footer is gone (two
text links on the promise page, nowhere else), and "Who is it for?" as a first step has nothing to ask while no
first name is collected (left to the funder journey's own line).

**What the product is now.** With an account, three destinations in a bar below 840 pixels and a rail from 840:
Home (the money, "Offer a gift", "Take it out" as soon as the account holds anything, what is moving), Gifts (given
and received), Me (the display currency, the appearance, "Signed in on this device until 14:20", installing Viky,
the account's code folded away, then Help, Privacy, Legal notice, For judges). Offering, taking out and a gift's
page are tasks that open over the destinations with the bar hidden and one way back. Without an account, the promise
page and a gift opened from a link; nothing to navigate to. The footer and "Account, help and legal" are gone from
every screen; Screen.tsx's "no menu and no tabs" was the rule of a one-use service, and Viky is an app of money with
a balance and gifts that last weeks, which is why every reference has a bar (Material: three to five destinations;
Apple: a tab bar navigates, it does not act).

**Three colours per appearance, each with a role.** Ground, surface, ink, accent. The accent is the primary button
and the active destination of the bar, and nothing else. The four stickers, the joyful yellow and the five day
surfaces are gone as backgrounds; a day says its state in words and by its shape. At night the acid green is replaced
by the day's tomato one step lighter, `#FF7A5C`, chosen by measure: indigo words on it at 6.97:1, the fill 6.97:1
against the ground and 5.92:1 against a surface, `#FF9478` as words at 8.31:1 and 7.05:1. Direction 1 stays for the
rest: Anton for one display title per destination and the mark, DM Sans everywhere else, the relief on buttons; cards
lose the hard shadow, because a card groups and is not a control. One look, no longer a poster look layered over a
calm one.

**The register of conditions is the spine.** `src/conditions.ts` holds every condition with its shape, its link, its
reading and its words; a screen reads it and never names a source itself. Only a condition wired from end to end is
live, and only live conditions are offered: today the Duolingo lesson. Chess.com's rating and Coursera's certificate
are written with their words and turn live on their own lines, once their contract is deployed and a real gift has
run. Strava only through its official API, and only after the disclosure question is answered: the zkTLS providers
exist and their use breaks Strava's terms of 1 Jan 2026, and the verifier already in this repository stays unwired.

**Delivered in this entry, S1**: the shell and the kit in `app/kit/`, Home, Gifts, Me, the help page, the register,
the tasks and documents placed on the shell, the retired components removed (Footer, Stickers, Drop, Moment,
Screen, HomeScreen, MyGifts, YourMoney, YourCode, SessionScope, ThemeSwitch, InstallPWA, the example gallery). The
lines that follow, in the founder's order: S2 Offer a gift with "What will they do?", C2 Chess.com, S3 the gift's
page, S4 Take it out placed again, C3 Coursera, S5 the judges page, C4 Strava, C5 the in-session proof.

## D85, 17 Sep 2026: offering a gift on the product, with the two names

**The names come back.** The founder replaced decision 4 of the drawn flows ("No first name"): the first step asks
"Their first name" and "Your name, as they know you". Audit C found the funder never named to the recipient
(severity 3), and every money app of the benchmark names the other side; Wise and PayPal ask for the recipient first.
The names are words for people, never terms: two columns of `viky_gifts`, `recipient_name` and `funder_name`, and
nothing in the contract or the signed terms. Required on the screen; the route accepts a request without them, so a
page loaded before this change still makes its gift. Gift numbers follow each other, so `GET /api/gift/[id]` gives the
names only with the link's key, or to the funder or the recipient signed in, and the check says before paying that
they show to whoever opens the link. The card says "For Léa" to the funder and "From Maman" to the recipient.

**The order**, one question per page, each its own address: who it is for, what they will do, the condition's own
detail (for Duolingo, their name, if known), how much and for how long, the check; then one account if there is none,
the payment, the confirmation. What they will do lists only live conditions, nothing chosen for them.

**Three accepted decisions of the flows made true under the screens.** Decision 10: a Duolingo name is read from
the public profile before any money moves, on the step (`/api/duolingo/profile`) and again by the create route before
relaying; "10 XP is about one short lesson" stays off the screen, because Duolingo's help renders in JavaScript and no
page read on 17 Sep gives a figure. Decision 5: the settling pass sends back a gift nobody opened fourteen days after
funding, or nobody connected fourteen days after opening, which the contract already allowed and nothing called; on
17 Sep all three gifts in production have started, so it sends nothing today. Decision 12: the two pass hours are
named in `src/pass-schedule.ts` and a test holds them equal to `vercel.json`, so "at about 9:00 AM your time" follows
the schedule.

**The kit, for S2 and S3.** The gift card opens as a whole, its title says for whom and for what, a strip of days
sits under it, then the state and one line of amounts. The strip draws the counts, earned days filled then returned
days struck through and faded, because the contract does not say which day was which; the founder asked for it after a
first version drew both alike, and gift 1 in production has missed days. The daily target is asked with the name, on the
condition's own step, not with the amount. The account's money is set at the display size in the text
face, out of a card. Radios are drawn in ink on the surface, since the browser's own was a grey disc at night. A
primary button that cannot be pressed yet gives the accent back and wears the surface. A milestone's meter waits for
the first milestone gift (C2); the card at the head of a gift's page waits for that page's line (S3), which also takes
Anton off its title now.

**Order of going live.** The two columns must exist before the code that writes them: the create route relays the
money first and records the gift after, so a deploy before `pnpm db:migrate` would leave a funded gift with no record
and no link. Migrate production, read the schema back, then deploy.

## D86, 17 Sep 2026: a gift's page on the product, and a record of every settled day

**The page.** Flows R1 to R12 and the funder's reading (R11) on one page, `/g/[id]`, on the task shell. Its head is the
same gift card as on Home and Gifts, standing still. Its title names the other side: "Maman put $7.00 in your name." to
the person it is for, "You put $7.00 in Léa's name." to the funder; a gift made before the names keeps "$7.00 is in
your name.". Every amount is in the text face. Every day of the gift is drawn at its date with its state in words
under it, the next reading is dated in the reader's clock, and the missed days stay counted once the gift is finished.
Taking what is earned goes through a review and ends on a confirmation with the time and a reference, "gift 3, take
1", counted by the contract's own withdraw nonce. The session closing on the page is a door to reopen, with signing in
alone. What depends on the source is the register's `recipient` words; the Chess.com entry is left to its own line.

**A record of every settled day (D83, point 4).** The contract settles days in order and publishes two counts, so the
counts cannot say which day was earned and which went back. Its events can: `CheckInAccepted` and `DaysDrained` name
the first and last day they settled. The keeper decodes them from the receipt of every check-in, drain and finalise it
relays and writes one row per day in `viky_days`, the first write kept. A failed write never fails the relay, which is
final by then; `pnpm backfill:days` writes the days of every transaction recorded in `viky_relayed` again from their
receipts. A day settled by a transaction Viky did not relay has no row and falls back to the counts, earned first, and
the page says so. Read on 17 Sep before writing anything: gifts 1 and 2 each have their first day earned and the next
three returned in their relayed receipts, and gift 3 has nothing settled yet.

**The route (decision 13 of the flows).** `GET /api/gift/[id]` also answers `youAreTheFunder`, so a funder and a
recipient are told apart before anybody opens the gift, the recorded days, the amount already taken, and the time of
the last refund Viky relayed. The naming route reads the Duolingo name from the public profile before issuing a code.

**The milestone variant, for C2.** `src/milestone-view.ts` is the shape the gift route answers for a gift held by the
milestone contract, `kind: "milestone"`: the condition's id, the start, the target, the last reading and its time, the
deadline, reached or not. `MilestoneGiftPage` draws it against the register and never offers a gesture the route cannot
answer yet; the capture run draws it from simulated data until a milestone condition is live.

**Not built.** "Copy the link again" for the funder (R11): the link's key is stored only as a hash, so no page can show
it after the confirmation closes, and keeping it is a decision about the bearer risk. The refusal of an expired code has
no test of its own.

## D87, 17 Sep 2026: a gift is recorded before its money moves

**The hole.** Making a gift relayed the money, then recorded the gift. A record that failed between the two (the
database refusing, a function cut off) left a funded gift with no row: no link that works, since a claim looks the key's
hash up in `viky_gifts`, and no pass that would send it back after fourteen days, since the pass reads gifts from the
same table. Found while writing D86, listed in `docs/OPERATIONS.md`, fix accepted by the founder.

**The order now.** The creation is recorded first, pending, in `viky_creations`, under the authorization's nonce, the
hash of the exact terms, which cannot be spent twice; everything needed to record the gift is kept with it. The relay
writes the transaction's hash onto the row the moment it is submitted, before finality. Only then is the gift recorded
and the creation marked complete. `src/gift-creation.ts` holds the order, with its dependencies injected, so each
failure is tested without a chain or a database.

**A retry.** The same signed request sent again finds its row instead of relaying twice: a complete creation answers
`ALREADY_MADE`; a pending one with a transaction is completed from the chain's receipt and given a fresh key, since the
attempt that failed ended in an error and its key was never shown; one still inside its two-minute lease answers
`IN_PROGRESS`; one whose money moved with no transaction recorded answers `BEING_RECORDED`; one refused before anything
was submitted is marked abandoned at once, so the same terms may go again. The funder's page keeps the request it signed
for the tab and sends that same request on "Try again": signing again draws a new salt, which to the server is a new
gift, and could pay for the same gift twice.

**The keeper.** Every pass first completes the creations still pending past their lease, from their transaction's
receipt, with the key hash of the attempt that made them: the gift is then in the funder's gifts and goes back after
fourteen days unopened. A creation with nothing submitted is called abandoned after an hour if its authorization was
never used; one whose authorization was used with no transaction recorded is reported for an operator.

## D88, 17 Sep 2026: the Chess.com milestone, wired from end to end before it is offered (C2)

**What was measured first.** An attested read of `api.chess.com/pub/player/erik` and `/stats` through Reclaim zkFetch and
its TEE client: both verified, both signed by the pinned attestor, about four seconds each, twenty-six through the
worker with its start. The refusals are distinguishable: an unknown name ends the fetch with HTTP 404, a profile with no
name or a cadence never played is refused by the attestor as `Regex "…" didn't match`. Without a user agent Chess.com
answers 403 with a challenge page. The name field is absent from a profile until the person fills it in, and Chess.com
lets a username change every ninety days.

**What that changed.**
1. **One reading per cadence.** The written pattern for the ratings page took whichever cadence came first, `daily` for
   hikaru and `rapid` for magnuscarlsen, and its test pinned that. Each cadence is now its own source, its own goal type
   on the contract (rapid 1, blitz 2, bullet 3, daily 4) and its own provider id, so a blitz rating can never settle a
   rapid gift (D48). A proof must also carry exactly the source's patterns, or a worker could pass one off for another.
2. **A reading is two proofs.** The ratings page carries no identity, so each reading also proves the profile:
   `player_id` is what a gift is bound to, and a change of name is followed once a proof shows the new name is the same
   player.
3. **The code is always asked.** The funder must name the account, because the target is a climb from where it stands
   today; the recipient proves it is theirs with a six-letter code in the profile's name, letters only because Chess.com
   publishes no rule for that field.
4. **Below the target, the keeper only looks.** The contract refuses a reading short of the target and records nothing,
   so an attested one there costs a proof and changes nothing. A plain read decides whether to take one; a failed plain
   read goes on to the proof. Both daily passes read, to halve the gap D48 records.
5. **A gift is refused, not made, when the rating has already passed the highest start** by the time the payment
   arrives (`STANDING_MOVED`): it could never pay.
6. **Made in D87's order.** A milestone gift's creation is recorded before its money moves and completed from its
   transaction by a retry or by the milestone pass, carrying the milestone's own record (condition, cadence, where they
   stood) until the gift exists; the page signs once and sends the same request on every retry. The reads before the
   money moves are skipped only for a creation whose money may already have moved.
7. **The first real gift is made before the condition is offered.** An account that runs Viky sees the condition on
   "What will they do?" marked as offered to nobody else, and the create route accepts it only from such an account.
   `live: true` is the last change.

**Not changed here:** `MilestoneGift.sol` was, at this entry, byte for byte the contract of D49 (13,240 bytes), whose
three review fixes nobody had read since. The fourth review read them, and D89 records what it found and what changed.

**Deployed, 17 Sep 2026 16:36 UTC,** after the fourth review (D89) and the RD (D90), with the founder's go-ahead:
`0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e`, deployment `0x12d91b78…7806e1`, ownership with the founder
(`0xe2ad6791…3181e8d`), Sourcify exact match 1855380, 0.406 MON. The steps and their checks are in OPERATIONS.md.

**Rehearsed before mainnet.** The deployment ran on a local fork with the real deployer's nonce and balance (expected
address `0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e`, about 0.40 MON at 102 gwei, ownership read back as the founder's),
then `scripts/rehearse-milestone-fork.ts` ran the routes on it: a gift made, opened, started by a real attested reading
of erik at 1904, released by a reading at the target, taken by the recipient, and a second gift nobody opened sent back
by the settling pass.

## D89, 17 Sep 2026: the fourth review, and a pause that still took a gift reached in time

- Statement: the fourth review of `MilestoneGift`, in the strategy session on Fable, read the whole contract against
  the promises of D45. Ten held. Promise 10 broke inside the pause fix of D49: `expire` refused during a pause, but once
  the pause ended `prove` still refused past the deadline plus the grace, and `expire` opened at that same instant.
  A target reached an hour before the deadline, during a pause from two hours before it to seven after, was lost to the
  funder. The same shape held for a certificate's late window and for the wait for a first reading.
- Consequence: `setProofPaused(false)` records `proofResumedAt` when it ends a pause, and only then. In `prove` and in
  `expire`, those three windows count from the later of their own moment and `proofResumedAt`. A pause that ended
  before the moment changes nothing; a pause that ran across it gives the whole window back from its end. The wait for
  a gift nobody opened is not moved, because opening a gift is not paused.
- Tested first: six tests written against the contract as it was, five of them failing on it (the one that passed is
  the pause entirely before a deadline, which must change nothing), then passing on the fix; a fuzz over any pause and
  any moment of submission; pauses added to the accounting fuzz; both fuzzes at 4,096 runs. Checked the other way too:
  with the defect put back the six fail, and with every reopening recorded the test for it fails. The existing test of
  D49 now waits for the grace after the pause, as the rule says. The keeper mirrors it (`canExpire` reads `proofPaused`
  and `proofResumedAt`).
- Deployed as asked: the four Chess.com cadences only, every one a climb, and a refusal if any fifth goal is registered.
  No "having it or not" goal until the two questions D49 left open are settled. The judges page says what the owner
  can and cannot do, including the limit of "cannot move money": the evidence signer, which the owner can replace,
  attests who opened a gift and what a reading said.

## D90, 17 Sep 2026: a rating that has not settled cannot carry a climb, measured before it was refused

- Statement: the milestone terms assume a chess rating moves about ten points a game (a start margin of 10, a smallest
  climb of 50). Chess.com's ratings page gives, beside each rating, "the Glicko RD value used to calculate ratings
  changes" (its Published Data API page), and its help centre says a new player's rating "will fluctuate significantly
  during your first few games" without giving any RD or number of games. On a new or rarely played account the
  assumption fails: the climb signed measures nothing and the highest accepted start can be jumped in one game.
- **What was measured, 17 Sep 2026.** `scripts/measure-chess-rd.ts`, 15:36 UTC: 47 profiles, the seven named in D88 and
  forty spread over Luxembourg's public list of 5,094 players (joined from 2007 to 4 days before), every cadence with
  an RD. For each profile and cadence, the RD the stats page gives now, and the absolute rating change over its last
  rated games (up to twenty), read from the monthly archives, where each game carries the rating after it. The 72 pairs
  with at least five such changes:

  | RD now | pairs | median change per game | largest change seen |
  |---|---|---|---|
  | under 40 | 18 | 2 to 9 | 15 |
  | 40 to 59 | 21 | 1 to 13 | 18 |
  | 60 to 79 | 20 | 5 to 28 | 88 |
  | 80 to 99 | 9 | 8 to 38 | 90 |
  | 100 and over | 4 | 8 to 51 | 129 |

  Accounts four days to three months old sat between RD 63 and 84 after twenty to forty games in a cadence; an account
  with five rapid games showed 197. The RD is the one after the last game, so it is paired with the changes that led to
  it, not with each change; the break at 60 is plain all the same. A second read at 15:45 UTC, 275 rating blocks of 109
  profiles: 274 carry `rd`, always right after `date`; the one without it was a blitz block at 800.
- Consequence, no threshold guessed: a rating has settled when its RD is under **60** (`CHESS_SETTLED_RD_BELOW`), the
  band where the ten points hold. Both readings read the RD: the plain read returns it, the attested pattern requires it
  (a block without one is not read), and every reading records it. The funder's step refuses a cadence that has not
  settled, under the cadence: "This rating is still settling: they need a few more games first." The create route reads
  again and refuses it before anything is relayed (`RATING_SETTLING`).
- **Found on the way.** From 15:50 to at least 15:53 UTC, erik's ratings page answered 404 "An internal error has
  occurred" while his profile answered 200 and hikaru's, magnuscarlsen's and john's ratings pages answered. The attested
  read called any 404 "no such player", which would have told a recipient their account was gone. A 404 now means that
  only on the profile; on the ratings page it is Chess.com failing (`FETCH_FAILED`), which the keeper holds on (D57).
  The rehearsal reads any settled public rating (`REHEARSAL_PLAYER`, magnuscarlsen's bullet at RD 49 by default).
- **The rehearsal gift.** The founder's new Chess.com account will start near RD 350. While the condition is not live,
  an account that runs Viky may still make a gift from a rating that has not settled, and its step says so in a
  sentence of its own; once `live` is true nobody may, operators included, and a test holds both.

## D88, 17 Sep 2026: one look, "Ink and sun", and what it changed

The art direction was chosen on the product rather than on a mockup. Three looks were built as three sets of tokens on
the same kit and photographed on the same six screens, day and night, at 390 and 1440; the founder chose look 2, "Ink and
sun", and then settled two questions the laboratory had left open. This is what the product now carries.

- **The colours.** A cool neutral ground, indigo ink, and the sun `#FFC531` as the one accent. Ground and ink change
  places between day and night; the sun does not move. The night sun was chosen by eye between three candidates seen on
  the product, and then measured: 11.71:1 on the night ground, against 10.21:1 for a more amber one and 12.70:1 for a
  lighter one. So the rule is no longer "the night accent is lighter" but "the hero hue does not change between the
  modes, and the night value is measured". By day the sun is 1.45:1 on the ground, so an ink outline is what identifies
  a button (WCAG 1.4.11); at night the fill does it alone.
- **The type.** Fredoka sets the one display title per destination and the mark; DM Sans sets everything else, amounts
  and buttons included. Anton is gone with the poster look, and so are looks 1 and 3.
- **The characters.** The days of a gift are characters, in `app/kit/Character.tsx`: three shapes, flat colour, no
  outline, a face only at the large size, three secondary colours that live only inside them. They draw the strip on a
  card, the row of days on a gift's page, and the state of a milestone; a screen where a sum is confirmed stays bare.
- **The movement.** Everything answers a gesture and nothing runs on a clock (`app/kit/Motion.tsx`): a press, the
  arrival on a screen replaying what changed since the last visit in under two seconds, a first appearance while
  scrolling, and a pointer's hover. All of it is cut under reduced motion.
- **One door.** The page without an account has one action in its body and "Sign in or create account" in its header,
  which opens the passkey at once and only then a panel. The appearance setting is gone from You: the app follows the
  device from the first pixel, so two settings can never disagree.
- **Outside the app.** A gift's link carries an image drawn by the look (`app/api/gift/[id]/preview-image`), naming the
  funder only when the address carries the link's key, and the icon is the gift character on the sun.

The laboratory stays at `/dev/looks`, behind the design gallery switch that production never sets, because the screens
behind an account cannot be photographed any other way.
## D91, 17 Sep 2026: the morning message, the only thing Viky sends

- Statement: a person who is told "you have nothing to do each day" cannot be asked to open an app to find out what
  happened. So the outcome of a settled day reaches the phone itself: one sentence, once a day for a gift, to whoever
  asked for it, on both sides of the gift.
- What it is. A `MorningMessage` button on a gift's page, for the recipient and the funder signed in. The press asks
  the browser for permission and subscribes; the row holds the browser's notification address, the two keys it needs
  and the gift. "Stop telling me" deletes it, and so does the first refusal from a push service, which is the only
  honest signal that a browser is gone.
- Where the sending starts. At the keeper's own write of the per-day record (D86) and nowhere else, so what a phone is
  told is exactly what the contract settled, never a second judgement about it. The write is the source; `viky_told`
  holds the subject, so a day is told about once even if the record is written twice. A milestone reached or expired is
  told from the milestone pass the same way.
- iOS. Web push there exists only for a web app added to the Home Screen, on 16.4 and later, and only when the request
  answers a press (webkit.org, 16 Feb 2023). So nothing is ever asked on load, and an iPhone still in Safari is offered
  installing first rather than told its browser cannot.
- What replaced what. The template's `/api/notification` sent any text to any subscription its caller supplied: anybody
  who knew a browser's address could have written a notification from Viky to it. It is deleted. The route that stands
  takes a gift and the caller's own browser, nothing else, and only from the two people the gift is between.
- Words. The sentences are in `src/sentences.ts`, a name only when the gift carries one, and what was done yesterday is
  the register's word ("yesterday's lesson"), so no sentence names a source. The founder's draft said "$3.57 is hers";
  it is written "is theirs", because Viky is never told anybody's gender and a guess would be wrong on a real person.

## D92, 17 Sep 2026: the highest accepted start is one below the target, and nothing tighter

- Statement: the funder signed a ceiling of today's reading plus ten (D45, `startMargin`). The founder found what that
  does to an honest recipient: between the payment and the connection they play, two wins put them over the ceiling,
  and the gift is dead without anybody cheating. On a rating whose RD is 156, as the founder's own new account, one
  game can do it.
- What the tight ceiling was for is already done elsewhere: the creation reads the rating, reads it again just before
  the money moves, and refuses any target under `minimumClimb` (50) above it. The target is therefore already a real
  climb from the day the funder paid. The only start left worth refusing is one **already at or past the target**,
  which would pay for nothing.
- Consequence, in the app alone; the contract only ever insisted on `maximumStart < target`, so nothing about it
  changes: `startingCeiling` is `target - 1` and `startMargin` is gone. The funder's step says "Today they are at 1420.
  The gift is theirs when they reach 1500." and no longer names a starting ceiling; the check loses that row and keeps
  "If they have already reached 1500 when they connect, this gift cannot count it and comes back to you at the end".
  The recipient's page says it in plain words when it happens: "You had already reached 1500 when you connected: you
  were at 1520, so this gift cannot count it. Ask Maman for a new one." The funder reads the same fact from their side.
- The funder's step also shows the best that account ever held in that cadence, under today's reading ("Their best
  ever: 1510."), as information and never as a refusal. Measured on 17 Sep 2026: `best` is a block beside `last` and a
  young account has none, so the line is shown only when the page gives one.
- Tests: a start two ordinary wins above the day of the payment settles as any other; a start already at the target
  never settles, the money goes back, and the words say why; the funder's sentence. The RD threshold of D90 is
  untouched.

## D93, 18 Sep 2026: a Chess.com account its own police has closed can earn nothing here (U1)

- Statement: Chess.com publishes the standing of an account on the same public profile Viky already reads, in the
  documented field `status`, whose values it lists as "closed, closed:fair_play_violations, basic, premium, mod,
  staff". Its Fair Play policy, which forbids engines, third party help and a lent account, says Chess.com "may close
  your account and label it publicly closed for Fair Play violations". So the source's own police is readable, and a
  gift can rest on it: an account it has closed can neither be connected to a gift nor reach its target.
- What was measured, 18 Sep 2026: hikaru `premium`, magnuscarlsen `premium`, danielnaroditsky `premium`, erik `staff`,
  SevyB `basic`, dubov `closed`. A closed account still serves its profile and its ratings pages exactly as any other,
  so nothing but `status` says it. `closed:fair_play_violations` is Chess.com's documented value and was not met in
  this sample: it changes nothing here, because any status that is `closed` or begins with `closed:` is refused. Forty
  club matches and sixty tournament groups were read for a live `fair_play_removals` list and all were empty.
- The rule. `status` is read with the identity on every reading, the plain one and the attested one
  (`chessStatusPattern` in the attested source, so it is signed with the rest). A closed account gets:
  - the funder's step and the create route refused before any money moves ("Chess.com has closed this account, so
    nothing on it can be earned.");
  - no binding, and no attested reading sent, whatever the rating says;
  - one sentence on the gift's page, the same for both sides ("Chess.com has closed this account, so this gift can no
    longer be earned."), and no gesture beside it that the routes would refuse;
  - the gift held until its deadline and the whole amount returned to the funder then, exactly as for a target not
    reached. Nobody profits from the closure, us included.
- A profile whose `status` cannot be read is not an open account: it is a reading that failed on our side
  (`PROOF_INVALID`, which the keeper holds a gift on). Nothing is paid and nothing is taken back that day.
- What this does not do: it catches what Chess.com catches, when Chess.com catches it. A player cheating and not yet
  detected reads as `basic`, and a closure that lands after a gift has settled changes nothing. Chess.com's policy
  does not cover games against bots. This is written on the judges page with its source and its date.

## D94, 18 Sep 2026: a Duolingo gift counts one course, and the chain can tell the two apart (U1)

- Statement: counting the experience total pays for any lesson in any course, which is the easiest thing to game and
  the furthest from what a funder meant. A gift can now be made on one course: the funder picks it from the courses
  that account's own public profile carries, the daily reading is anchored on that course's id, and experience won
  anywhere else is not in the reading at all.
- What was measured, 18 Sep 2026, over 19 public profiles and 74 course objects: every course carries `id`, `title`
  and `xp`; the keys of a course object come in one order on every profile (`authorId, fromLanguage, healthEnabled,
  id, learningLanguage, placementTestAvailable, preload, title, xp, crowns`); a course object holds no object of its
  own, so a pattern anchored on the id and stopped by the end of that object cannot run into the next course; and the
  sum of the courses is exactly the `totalXp` the profile prints, on all 19. Course ids read `DUOLINGO_<learning>_<from>`,
  with a region on some (`DUOLINGO_NL-NL_EN`, `DUOLINGO_ZH-CN_RO`).
- On the chain. A course gift is goal 5 of `GiftEscrow`, registered on 18 Sep 2026 with the provider id
  `keccak256("viky:provider:duolingo-course-zkfetch:v1")` (tx `0xcaadaca7…8a69`, read back). The contract refuses an
  attestation whose provider id is not its goal's, so a course reading can never settle a gift made on the total, nor
  the other way round. The identity a course gift is bound to is the person **and** the course
  (`checkInSubject`): the contract pins it at the first reading and refuses any later reading carrying another, so a
  gift for Spanish cannot be settled by a reading of German on the same profile. Every gift made before this keeps
  goal 1, the total, and exactly the identity it already had.
- The same transaction ended the last thing the deployment key could still do alone: ownership of `GiftEscrow` went to
  the founder's wallet (`0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64`, tx `0xa01ae787…a009`), the wallet that already
  owned `MilestoneGift` and `ExitRouter`. Registering another goal now needs the founder's own signature.
- What this does not cover, written on the judges page as it is: a gift whose funder did not name the account has no
  course to choose from and counts the whole profile, as before; and the course, like the account name, is recorded by
  Viky rather than signed into the terms on the chain. The first reading is what pins it where nobody can move it.
## D95, 18 Sep 2026: what a judge may re-verify, and what stays between the two people of a gift (U2)

- Statement: everything that settles is published, and the thing that would name a person never is. For every settled
  day of every gift, `/api/gift/<id>/journal` gives what happened, the transaction that settled it, and the
  fingerprint of the claim it settled against. That fingerprint is already public: it is the nullifier the contract
  stores so the same claim can never be used twice, `keccak("viky:zkfetch:" + claim identifier)`. The proof itself is
  never in that answer: a Duolingo proof carries the account's name, its display name and its points, and Privacy
  promises the public sees only a pseudonym.
- The proof goes to two people and no one else. `/api/gift/<id>/proof?day=` and `?reading=` answer the funder and the
  recipient of that gift, and refuse everybody else with a typed error (`NOT_IN_THIS_GIFT`, 403). On the gift's page,
  "Check this day yourself" downloads that day and prints the one command that checks it: `pnpm verify:day --file`.
  The command needs no key and no account. It recomputes the claim identifier from the signed claim, recovers the
  attestor that signed it and compares it with the pinned one, recomputes the fingerprint, asks the contract whether
  that fingerprint is recorded, and reads the transaction back.
- One example is public, for judges, and it can only ever be one of Viky's own gifts: `exampleForJudges` takes the
  operator's own accounts as an argument, so no other gift can be returned by it, whatever is asked. The account
  holder agreed on 18 Sep 2026 that this one proof may be public. When there is no such day, the page says there is
  none rather than showing a stand-in.
- What a verified day proves: the source's own servers answered that, and the contract credited that day against that
  one answer, which can never be replayed. What it does not prove: that the account belongs to the person the gift is
  for, or that a human did the work. Reclaim writes the same about its attestor: a third party must trust that it did
  not collude with the user.
- The reliability figures are a journal, not an estimate. No table logged the passes, so `viky_passes` now takes one
  row per pass (plan, start, end, readings attempted and answered, days held of our doing, errors). The judges page
  counts from the day that journal was switched on and says which day that is. Nothing is back-filled: a pass that
  never ran leaves no row, and shows as a run fewer, never as a late one. Days lost through our own fault are shown
  as measured, beside the rule in the code that wants them to be zero.

## D96, 18 Sep 2026: the rails are ordered by country, never hidden by it (R1)

- Statement: no rail serves everybody, and which one fits is something the person's country decides. A guess about
  that country is wrong often enough (a trip, a shared connection, a private network, a device bought abroad) that
  hiding a way out on it would take somebody's money out of reach with no way back. So the guess **orders** the ways
  out and preselects the first; both stay on the screen whatever it says, and the rail's own identity check remains
  the only thing that actually decides.
- Two signals, neither asked of the person: the country the platform reads from the connection
  (`x-vercel-ip-country`, which a page cannot forge) and the region of the device's own language, which the browser
  sends because the server cannot see it. They agree, nothing is asked. They differ, one question is:
  "Where is your bank or card?", with those two countries as its two answers, and nothing is ordered until it is
  answered. The answer is kept for the tab and orders cards, nothing else.
- Availability is read at the rail, live, and no country list is copied into the repository (the rule of 16 Sep, and
  one of these lists changed on 15 Sep). Measured on 18 Sep 2026:
  - `GET https://api.ramp.network/api/host-api/v3/payout-methods`, public and keyless: SEPA in 35 countries (`fr`,
    not `sn`, not `ci`, not `us`), CARD in 119 (`fr`, `gb`, not `sn`, not `ci`, not `us`), an American bank transfer
    in `us`, PIX in `br`, SPEI in `mx`. A country in none of them is a country it pays nobody in.
  - `GET https://api.mercuryo.io/v1.6/lib/currencies`: for `{currency: "MON", network: "MONAD"}`,
    `restricted_countries_offramp` and `restricted_countries_onramp` are both exactly `["gb"]`.
  - Its other limit, no card payout in France, the rest of the EEA or the United States, is in its help centre and
    not in that answer, so it stays where it already is: in that rail's own conditions, on its card, with its date.
- A read that fails answers "unknown", never "does not serve", and a failed read is held for thirty seconds against
  ten minutes for an answer: one bad minute at a service must not leave every screen guessing.
- The same question is asked at the way in, where there is one rail: the payment step says when that rail does not
  sell where the person is, rather than sending them to a page that will refuse them.
- **Verified lead, not built.** Ramp sells on Monad at purchase as well: their public asset list carries
  `MONAD_AUSD` at `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`, enabled, beside `MONAD_USDC` and `MONAD_MON`, with a
  purchase floor of 6 EUR and fees of 0.99 % to 3.9 % (minimum 2.49 EUR), read 18 Sep 2026 at
  `https://api.ramp.network/api/host-api/assets`. That is the coin gifts already hold, so a second way in for the
  euro countries would need no exchange and no router, and would sit far under the card rail's 25 EUR floor. It
  changes the money path, so it is written here and decided by the founder, not slipped in.

## D97, 18 Sep 2026: the appearance control comes back, with three states and the device by default

- Statement, and the reason, which is not a design one: the product is being shown before it is really put in front of
  people, and somebody opening it on a device set to light would never see the night side of the work at all. So a
  small control sits in the header of every screen, opposite the mark. It walks three states in this order: as your
  device, day, night. The device is the default and stays it until somebody presses, which is what keeps the product
  and the device from ever disagreeing unless a person asked them to.
- The deviation is named rather than dressed up. Apple: "Avoid offering an app-specific appearance setting", because
  two settings that disagree read as a bug. The brief of 17 Sep had removed the setting for exactly that reason, and
  the founder amended its section 7 on 18 Sep. The control goes away when the product is really put in front of
  people; D88, which removed it from Me, stands for everything else.
- How it works, exactly as it did before the look removed it (`src/theme.ts`, restored from 7b2f649): the choice is
  written on the document as `data-theme`, and removing that attribute hands the appearance back to the device. It is
  remembered in the person's own browser under `viky.theme` and nowhere else: no account carries it and nothing is
  sent. An inline script applies it before the first paint, so a chosen appearance never flashes the other one first.
  React reads it through a store rather than an effect, so every copy of the control agrees the moment one changes it.
- The stylesheet now says night twice, with the same values. `@media (prefers-color-scheme: dark)` is guarded by
  `:root:not([data-theme="light"])`, so a chosen day survives a dark device, and `:root[data-theme="dark"]` paints the
  night a person asked for on a device set to light. A test compares the two lists value by value.
- What it looks like: an icon alone, a target of 48 by 48, in the ink and never in the accent, because the accent is
  the action a screen asks for and the destination the person is on. Its accessible name says both the state it is in
  and what the next press will do, since an icon says neither. On the page without an account it shares the header
  line with the door and stays the quieter of the two; the one action in the body did not move.
- Measured, 18 Sep 2026: six screens reachable without an account, in the three states, at 390x844 and 1440x900
  (`pnpm capture:appearance`). Each state is captured against the device setting that proves it, and each image is
  kept only if the ground the browser painted is the ground that state asks for and the control's own name says that
  state. Signed-in screens are not in the set, because a passkey cannot be replayed by a script; they share the same
  header.

## D98, 18 Sep 2026: two sessions, one of which survives a page load

- Statement: Viky has two sessions and they are not the same thing. The **server session** is a twelve hour cookie
  that says which account this browser is; it holds no key and can sign nothing. The **signing session** is the key
  the passkey derived, held in memory only, closing after ten idle minutes (thirty on a money screen) and dying with
  the page. Until today the app announced an account only when both were open, so every page load signed the person
  out of a product they were still signed in to.
- Source: the founder, in production, 18 Sep 2026: he signed in with his passkey and was signed out again at once,
  and had to sign in on every load. Measured here the same day on the live site with a test account: after a reload
  and in a second tab, `/api/account/session` answered 200 with the account both times. The cookie was never the
  problem. The page simply never asked.
- **What changes.** The page asks the server who it is at load, with no passkey and no prompt. Every money path
  opens the signing session at the moment it signs, through one function, rather than reaching for a key a load has
  lost. A funder who reloads, changes tab, or comes back from the card page keeps their account and their draft, and
  meets one passkey prompt at the signature instead of losing the path.
- **What this asks of Mera: nothing new, and that is the finding.** The key comes from the passkey's PRF output,
  which WebAuthn produces only inside a ceremony answering a user gesture. There is no silent re-derivation, and
  storing the key anywhere would be the one thing a passkey product must not do. So the signing session cannot
  survive a load, and should not. What was wrong was treating it as the whole session.
- **What it changes for session scope**, which is what the Mera UX bounty looks at: the scope is now written down as
  two reaches. *Reading* is the cookie: who you are, your gifts, your page, twelve hours, no prompt. *Signing* is the
  key: one prompt, at the first signature of that page's life, then ten or thirty idle minutes. A passkey product
  does not need a ceremony to know who you are, only to act, and saying so halves the prompts of an ordinary visit.
- **No sentence promises what is not there.** "Signed in on this device until 11:19 PM." is said only while the
  signing session is open, because that time is the signing window. A browser that is signed in and cannot sign yet
  reads "Signed in on this device." and, under it, that the passkey is asked again the moment money moves.
- The mismatch case is kept explicit: if the key that opens derives another account than the cookie names, the
  browser is signed in again as that account. A screen showing one account while the key signs another never happens.

## D99, 18 Sep 2026: a gift's page has a third reader, and they are told the truth from the title down

- Found in production by the founder: signed in as neither of the two people of gift 1, `/g/1` read "$20.00 is in your
  name". The page had two cases, the funder and the person the gift is for, and gave a third reader the second one's
  words, with a single line at the bottom saying the gift had already been opened by somebody else.
- Statement: there is a third voice, and it is the one a judge meets. From the title down, a reader who is neither of
  the two reads the gift in the third person: what it is, who it is between, and where it stands. The card at the head
  of the page names both sides ("From Maman, for Ama") instead of addressing the reader, the amounts line says "theirs"
  and "gone back" rather than "yours", and a day that went back says "gone back" rather than "back to you".
- Who is a reader: whoever meets a gift that is already opened and is neither its funder nor the person it is for.
  Before a gift is opened, whoever holds the link **is** the person it is for, because the link is the key and opening
  it is what makes them that person, so a reader never meets an unopened gift.
- Two different questions, answered separately (`src/gift-voice.ts`). The words need no account: a reader with no
  account may be the person the gift is for, coming back to sign in, and the third person is the only thing true of
  both. Saying "this gift is not yours" needs one: it is said only to somebody signed in as neither of the two, with
  the two names beside it.
- No gesture: opening, connecting the account, asking for a reading now, taking the money, downloading the proof of a
  day, being told each morning, copying the link again. Every one of them now reads from `gesturesFor(voice, gift)`
  rather than from a condition of its own, so a reader cannot be offered one by an oversight in the tenth condition.
  A test walks all seven for the three voices, and a gift taken back before it was opened offers none to anybody.
- Also on the judges page (`src/judges-gifts.ts`): gifts 1 and 2 were made and opened on `viky-two.vercel.app`, before
  `viky.cash` served the app. A passkey is bound to the hostname it was created on, so that account cannot sign in
  here and the app cannot show its gifts. A judge reading the contract would find two gifts the app never mentions and
  read an inconsistency where there is a hostname. The page now says it, and reads every figure of those two gifts
  from the contract while it is served: days earned, days gone back, days not settled yet, what was taken out, what
  went back, and each settled day by its date.
## D100, 18 Sep 2026: a gift on a supervised result, read three fields deep (U3, C3)

- Statement: the first source whose result the person cannot award themselves is the Duolingo English Test, chosen
  against Coursera, edX and Lichess in the report of 18 Sep 2026. The test is recorded, the identity checked against a
  document, and the session reviewed by examiners. What Viky reads is the page its taker chose to make public.
- **Three fields, and the reason.** The answer behind a certificate page carries the score, the day of the test, the
  name, the sub-scores, a date of birth and a link to the photograph taken on the day. The reading matches three of
  them: the score, the day, the name. The other three are matched by no pattern, returned by nothing, and stored
  nowhere; the attestor sees the whole answer, and the privacy page says so in those words. A gift needs a result, a
  date and whose it is, and a product that fetches more than it needs has already lost the argument about why.
- **The name is the binding, with the gap D49 wrote down.** The certificate has no field its holder can edit, so
  there is no short code as on Duolingo and Chess.com. The funder types the name, it is hashed into the terms as the
  contract's `subject`, and a proof carrying another name pays nothing. Two people with the same name, the same
  result and the same window still cannot be told apart, which is promise 9 exactly as D49 narrowed it.
- Names are compared as a set of words, accents, case, punctuation and order removed, because the certificate prints
  a legal name surname first with a comma while a funder types the name they use. A name missing a part is another
  name: it refuses rather than guesses.
- **A withdrawn link is a fact about the page, not a failure of ours.** The answer is 403 once the taker makes the
  certificate private again and 400 once it passes its two years, both measured on real certificates on 18 Sep 2026.
  The attested reading now tells those apart from a failure to read, because the keeper holds a gift open on our own
  failures: a link somebody withdrew would otherwise be held until its deadline instead of refused in words.
- **Well inside two years.** Their terms: after two years a certificate is marked expired and can no longer be
  shared. The contract already caps a deadline at a year, and this condition caps itself at 180 days, so a
  certificate a gift pays for is at most half its life old when it is proved.
- **The two questions of D49 are answered as the report proposes**, and the founder has accepted them: one
  certificate may pay several gifts, one per funder; the nullifier is scoped to the reading and carries the gift,
  never the certificate, because `usedNullifiers` is one mapping for the whole contract.
- `live` stays false. It opens when a real gift has run end to end on it and the founder has settled whether we read
  Duolingo automatically at all: their terms forbid "data mining, robots, scraping" to obtain their content, which is
  the same clause the daily Duolingo reading already runs under, and a written request is the honest move.
- Lichess is prepared at the same time and offers nothing yet: four goals, numbered above Chess.com's, waiting in the
  same registration session. Coursera comes after.
- **The two screens, 18 Sep 2026.** The funder's flow gained the shape it was missing: the step that asks what they
  will do offers the supervised result to an account that runs Viky, the detail step asks the name the certificate
  will carry and the score to reach, the amount step bounds the days at 180, and the review says in one line what the
  certificate has to show and what happens if none arrives. The recipient's page asks for the link, names the button
  on Duolingo's own site that makes it public, says what is read and what is never kept, and answers each refusal in
  its own words: taken private again, expired, another name, under the score, outside the days.
- Nothing is read on the funder's side, because there is nothing to read: the page a certificate has does not exist
  until the test has been sat. That is the whole difference from a climb, and it is why this shape has no ceiling.
- The recipient's link is read plainly first and proved second, so a link that cannot pay is answered before anything
  touches the contract. The alias is never stored: it is a key to a page carrying a date of birth and a photograph,
  and nothing ever needs to read it again, because one reading settles the whole gift.

## D101, 18 Sep 2026: two ways in, and what each one does to the money

- Statement: the card rail sells the chain's own coin, so every euro that has ever entered Viky arrived as MON and was
  turned into AUSD by a swap the funder signs and pays gas for. Ramp sells `MONAD_AUSD` itself, the very coin a gift
  holds, from 6 EUR. So there are two ways in, they coexist, and they are shown exactly as the two ways out are
  (D96): ordered by the country the two signals agree on, never hidden, each with what it keeps, its source and the
  date that source was read. The founder decided this on 18 Sep 2026; this entry is the money path, written before
  any of it is coded.
- **What each rail delivers, and what that changes.**

  | | the card rail (Mercuryo) | the euro rail (Ramp) |
  |---|---|---|
  | what arrives | MON, the chain's own coin | AUSD, the coin a gift holds |
  | smallest purchase | 25 EUR (their floor, D59) | 6 EUR (`minPurchaseAmountEur`, read 18 Sep 2026) |
  | what it keeps | about 3.8 % | 0.99 % to 3.9 %, minimum 2.49 EUR, read the same day |
  | a swap after it | yes: MON to AUSD through the exchange, quoted at `/api/fund/quote` | **none** |
  | who pays for that swap | the funder, from their own account, in MON | nobody |
  | MON left behind | 11 MON, which Monad requires an account to hold to call a contract at all (D53, D56) | none, and none is needed |

- **The path, step by step, and it is the same path after the money lands.** The funder writes the terms, the device
  keeps them (D74), and nothing is signed yet. They pay by card at whichever rail they chose. Then:
  - Ramp: AUSD arrives. `nextFundingStep` sees `held >= wanted` and goes straight to making the gift. One passkey
    signature over the EIP-3009 authorization whose nonce is the hash of the terms, our relayer submits it, the
    escrow pulls the AUSD. No quote, no second signature, no price to move between the two.
  - Mercuryo: MON arrives. `nextFundingStep` sees an arrival worth converting, the funder signs and sends the swap
    themselves, keeping the 11 MON reserve, and then the same single signature makes the gift.
  Nothing downstream changes: the same terms, the same nonce, the same contract, the same creation row written before
  the money moves (D87).
- **What it changes for a gift set up before the money arrives.** Nothing in what was signed, because nothing is
  signed until the money is there: the terms live on the device and carry no rail. Three things do change, and they
  are the work this decision opens:
  1. The smallest gift a card payment can fund follows the rail chosen: about 6 EUR of AUSD through Ramp against
     25 EUR through Mercuryo. The amount step's floor and the words on the check ("You pay 25 EUR by card") must come
     from the rail, not from a constant.
  2. The waiting screen tells the person what to set at the service they actually opened, and today it names one.
     What arrives differs too: AUSD ends the wait at once, MON ends it at the swap.
  3. A gift paid for at one rail and picked up later at the other is the ordinary case, not a special one: the screen
     watches both balances, so whichever arrives, the gift is made from what is there.
- **What it does not change.** The gift's own minimum stays the contract's 1 AUSD; the rail's floor is about what a
  card purchase can be, not about what a gift can be. A gift funded from money already in the account touches no rail
  at all.
- **The one consequence worth naming, corrected the same day by reading the code rather than reasoning about it.**
  An account funded only through Ramp holds no MON. Everything Viky relays needs none: making a gift, taking what is
  earned, the euro way out, sending to another Viky account. The sentence first written here said the card way out
  would be the exception, and that is **wrong**: `ExitRouter` pays the person in the coin their terms name, and for
  that rail the coin is the chain's own (`t.tokenOut == NATIVE`, the payout is a call carrying value to the person,
  `contracts/ExitRouter.sol`). So the person holds it before they send it, and the fee of that send comes out of the
  same coin, which the screen already says. The one thing that truly needs the chain's coin in hand beforehand is a
  contract call the person makes themselves, and today there is exactly one: the swap after the card rail's way in,
  which is the rail that provides the coin. The two never collide, and no path leaves somebody unable to move their
  money.
- **Not verified.** That Ramp's widget lets a real person in each of its countries buy `MONAD_AUSD` to an address
  they paste: the asset list says it sells it, and an endpoint that lists is not a service that pays (the lesson of
  D79). The first real purchase is what will say so, and until then no screen promises it.

## D102, 18 Sep 2026: the salt is the account and the course, so one signature says them

- Statement: a funder signs one thing, the EIP-3009 authorization whose nonce is the hash of the gift's terms. Those
  terms carried a goal type, a target, an amount, a length and a **random** salt. Which account the gift would be read
  on, and since U1 which course a day is counted in, lived only in Viky's own record. The contract pins an identity at
  the first reading and refuses any other afterwards (`IdentityBound`, then `IdentityMismatch`), so the window where
  our record alone decided ran from the signature to that first reading. The audit of 18 Sep listed it as gap b.
- The fix needs no new contract and no new deployment, because the salt is already inside the hashed terms:
  `salt = keccak256(tag, account, course, seed)`, where the account is the name as the source spells it, lower case and
  trimmed, the course is the course id or an empty string, and the seed is the 32 random bytes that used to be the
  whole salt. The seed travels with the request, so the create route rebuilds the salt byte for byte and refuses the
  creation when it differs (`TERMS_MISMATCH`), before anything is relayed.
- It keeps what the salt was for (D19): two gifts with identical terms still get distinct nonces, through the seed.
- The same is done for a milestone gift, whose account is the Chess.com name. Its cadence needs nothing: the cadence
  **is** the goal type, which the funder already signs.
- A certificate gift needed nothing either: the person it is for is already hashed into `subject`, which the terms
  carry.
- What it does not do. It commits the funder's signature to an account and a course; it does not prove that account is
  the recipient's. That is what the code in the profile name proves, at the first reading, and that has not changed.
  And a gift whose funder names no account commits to an empty account, which is the honest answer: there was nothing
  to commit to.

## D103, 18 Sep 2026: every refusal a reading met is counted, by its own code

- Statement: the keeper counted a reading as attempted, as succeeded when a day was credited, and as a failure only
  when the refusal was one of ours to fix. Everything else vanished. The counting pass of 18 Sep 00:40 UTC wrote
  "3 attempted, 0 succeeded, 0 errors, 0 held", which is exactly what a morning with nothing to do writes, and it was
  in fact three readings the contract refused with `NothingToCredit`. The audit of the money paths listed it as gap a,
  and the figures it makes wrong are the ones the judges page shows.
- The rule now: every refusal is counted by the code the contract or the source gave it, ours or not
  (`countRefusal`), kept per run in `viky_passes.refusals`, and summed by `refusalsByCode`. What was already there is
  unchanged: a refusal that is ours still holds the gift, still counts as an error, and still appears in `failures`.
- The judges page shows them as they came, with no translation: `NothingToCredit 3, PROFILE_NOT_FOUND 1`. A code from
  the contract is the contract's word and a code from a source is that source's. The line that matters beside them is
  the honest one: a morning where nothing was credited is either a quiet morning or a morning of refusals, and this is
  what tells the two apart.
- What it does not cover: milestone readings, which run in their own pass and are in neither number, exactly as the
  page already says of the two counters beside it.
- Rows written before the column existed carry an empty object, which is what they knew. Nothing was back-filled and
  nothing was estimated, as with every figure on that page.

## D104, 18 Sep 2026: on the way out, the money leads and the quantity follows

- The defect, found by the founder in the relecture of 18 Sep: the way out said "Send 9.99 to Ramp. This cannot be
  undone." and "Sent 9.99 to Ramp on 18 Sep 2026 at 9:15 AM." on the screen whose own heading read "$10.99". A number
  with no symbol, on the one screen nothing can be taken back from. The same screen's other branch, sending to another
  Viky account, already wrote the symbol.
- The rule the founder set with the fix: **a person never reads a bare number, and never the name of a chain's own
  coin.** So the amount they read, decide on and confirm is dollars, with "about" whenever it came from a conversion,
  and the rate and its date are said beside it as everywhere else.
- Why it could not be a symbol added in front of every number. The bank rail buys a dollar coin, so its number **is**
  dollars: 9.99 means $9.99. The card rail buys the chain's own coin: the capture of 18 Sep shows 138.43 of it, worth
  about $3.24. "$138.43" there would have been false by a factor of forty. The founder chose the shape when this was
  put to him: dollars in front, the exact quantity after, in the technical line under the action.
- What it looks like now. Bank rail: "Send $9.99 to Ramp. This cannot be undone." Card rail: "Send about $3.24 to
  Mercuryo. This cannot be undone.", and under the button, in the help size, "Mercuryo asks for the exact quantity:
  138.43. It is the same money, counted the way Mercuryo counts it." The confirmation follows the same shape.
- One place composes both forms, `exitAmount` in `src/exit-amount.ts`, and the screen reads from it: every sentence of
  the way out takes an amount that already carries its form and adds no symbol of its own, so no caller can produce
  "$$9.99" and none can print a quantity as if it were money. A test walks the sentences to hold that.
- Where no price answers, no dollar figure is invented: the quantity leads, with the same line under it saying what it
  is, and the line that says the value in dollars will come when the price does. The dollars themselves are asked of
  the same quote the funder screen converts with, for whatever is ready, not only for an account holding nothing else.
- What stays behind is said the same way. The dust is always under a hundredth of what the service buys, because the
  order is floored to two decimals, so the sentence is "Less than $0.01 stays in your account." on the dollar rail and
  "Less than 0.01 of what Mercuryo buys stays in your account." on the other. `dustInWords` had no other caller and is
  gone.

## D104 bis, 18 Sep 2026: a code proves an account only when its own recipient named it

- Statement: D27 said it on 11 Sep, for Duolingo: the funder enters the username if they know it, otherwise the
  recipient enters it and proves control with a code in their display name. The daily path followed that rule. The
  milestone path did not: it minted a code as soon as a gift was unbound, refused `CODE_EXPIRED` then
  `CODE_NOT_IN_NAME` whoever had named the account, and asked a recipient to put six letters in the name field of a
  profile the funder had already named in what they signed for.
- What that cost, on the day it mattered: the rehearsal gift 1000000, created on mainnet with `sevyb` named by the
  funder, could not start. The recipient was asked for a code, put it in their Chess.com name, pressed, and the
  reading still had to find it there.
- The rule now, the same one on both paths: when the funder named the account, the first attested reading binds that
  player directly, with no code and without reading the name at all, so a profile that carries no name works. A code
  exists only where the recipient named their own account, and the screen offers one only there; the account route
  refuses to mint one otherwise (`NO_CODE_NEEDED`).
- What still proves what: the funder's signature commits to the account (D102), the contract pins the player at that
  first reading and refuses any other afterwards, and the recipient who names their own account still proves it with
  the code. Nothing was loosened: what was removed was a step that proved nothing in the case it was asked for.

## D106, 18 Sep 2026: a function carries the platform it runs on, and nothing else

- Why it came up: the Vercel account went past its free limits, Functions Storage 76.6 GB against 10, Deployment
  Storage 10.7 against 10. On Hobby an overage can cut the functionality for thirty days, which would take viky.cash
  offline. The count of deployments is one half of it (327 on the project on 18 Sep, nine days' worth); the size of
  each function is the other.
- Measured, from the build's own trace files (`.next/server/**/*.nft.json`, every path they list, sizes on disk):
  the heaviest function was `api/gift/[id]/preview-image` at 174.4 MB and every reading route at 149.3 MB. Inside the
  heaviest one: 141.5 MB of `@reclaimprotocol/zk-fetch`'s native library, shipped in four platform builds inside one
  package (linux/amd64 42.5 MB, linux/arm64 38.8 MB, darwin/amd64 31.4 MB, darwin/arm64 28.8 MB), plus 18.5 MB of
  sharp's macOS binaries, which exist only on this laptop.
- The cause was ours, not the package's: `outputFileTracingIncludes` asked for the whole of `zk-fetch/**` for every
  `/api/**` route, so the tracer put all four platform builds into every function. The include now names what is
  needed: `dist/**`, `package.json`, and `lib/linux/**`.
- Both Linux builds stay. Nothing Vercel publishes says which CPU a function runs on, and a reading that cannot load
  its library is the product stopping; 38.8 MB is not worth that. The macOS builds go: a function never runs macOS.
- Measured after: the heaviest function 114.2 MB, the reading routes 89.0 MB, the sum over all traced routes from
  5,882 MB to 3,533 MB, a cut of 40 %. An `outputFileTracingExcludes` also keeps the local capture folders
  (`review-captures`, `test-results`) out of a laptop build, which had been adding 56 MB to a measurement.
- Alongside it, and not in the repository: branch deployments are off (D105), 248 deployments older than 18 Sep were
  removed one by one by id (never touching anything queued or building, the founder's rule), and the retention policy
  is the founder's to set in the dashboard, which is the only place it lives.

## D107, 19 Sep 2026: a pilot ceiling of a thousand dollars a gift, held off chain

- Statement: no gift may be made for more than $1,000 during the pilot (mitigation b). **The contracts keep their own
  constant of 100,000 AUSD and neither one is redeployed.** The ceiling lives in the product, above them: one line in
  `src/money.ts` and one in `src/milestone-protocol.ts`, which is what makes it a decision we can raise or drop in a
  minute rather than a migration of money to a new contract.
- Where it bites, on every path a gift can be made through. `dollarsToUnits` is the single place every screen turns a
  typed amount into units, so the field refuses more than a thousand before anything is signed, in the same sentence
  the step shows. The three create routes refuse it again where it counts: the milestone one, the certificate one, and
  the daily one.
- **The daily route had no ceiling at all.** It checked a floor of one dollar and nothing above, so the only bound on
  a daily gift was the contract's hundred thousand. Adding the pilot's sentence to the amount step without that check
  would have printed something false on the most ordinary gift there is, which is why it was added in the same pass.
- The words: "During the pilot, a gift is at most $1,000." It is one constant, said under the amount field and used as
  the refusal, so the two can never drift apart. The routes answer "The gift must be between $1.00 and $1,000.00".
- What this does not do: it does not protect anybody from a contract that would still accept a hundred thousand. A
  funder who signed terms by hand, outside our screens, would be bounded by the contract and not by us. That is the
  price of holding the ceiling off chain, and it is the right price while the number is still being chosen.

## D108, 19 Sep 2026: the funder takes a gift back themselves, and the relayer pays for the gesture

- Statement: a gift nobody has opened can be taken back from its own page, by the account that made it. The whole
  amount comes back at once, the link stops working, and the fourteen day wait is no longer the only way out
  (gift 1000001, where the funder had neither the link nor a way to close it).
- **Why this one call is not relayed like everything else.** `cancel(giftId)` checks `msg.sender == g.funder` on both
  contracts, and neither has a signed intent for it. Every other move in the product is a signature the relayer
  carries, so a person's account holds nothing of the chain's own coin, by design. This gesture cannot be carried, so
  the account has to send it, and it cannot.
- What we chose: `POST /api/gift/[id]/cancel` reads the gift, refuses everything the contract would refuse, then the
  relayer sends that account exactly what its own transaction will cost, and hands back the call for the browser to
  send with its own key. Monad charges the limit that is declared, so what is sent is the declared limit at today's
  price and a third again, under a hard ceiling of 0.05 MON per ask. The dust stays in the account afterwards.
- What it costs us: about a hundredth of a MON per gift taken back, from the relayer, for a gesture only a funder of a
  gift nobody opened can ask for. Rate limited like a relay, and refused the moment the gift is opened, cancelled or
  settled.
- The alternative we did not take: redeploying both contracts with a signed cancellation. It would keep the relayer's
  coin where it is, and cost a migration of live gifts to new contracts, which is a far larger risk than a hundredth
  of a MON.
- Irreversible, so it is built like every irreversible gesture here: the amount before, in the same words the
  contract will pay, and the amount with its date after.

## D109, 19 Sep 2026: while we build, a condition is offered as soon as a gift can be made on it

- Statement, the founder's, 19 Sep 2026: during development a condition that is wired from end to end is offered the
  moment a gift can be created on it. The strict door, which waited for a real gift to have run before anything was
  offered, is kept for the version that is submitted. So `live` now means "a gift can be made on it today", and the
  public page says so in the same word, Open.
- **Chess.com is the first under the new rule.** Two real gifts run on it, 1,000,000 and 1,000,002, both created on
  mainnet by the founder's account, both connected and read by the keeper: identity pinned at
  `0xa9f5280a…4095`, both started from a rating of 383, last read on 19 Sep 2026 at 01:55 UTC, neither settled nor
  cancelled. Read from the milestone contract itself, not from a record of ours.
- What changes in the code: one line of the register, `live: true` on `CHESS_RATING`, which is what `/api/conditions`
  answers everybody, what "What will they do?" lists, and what the public page prints as its state. The operator door
  (`VIKY_OPERATOR_ACCOUNTS`) keeps its purpose for whatever is still wired and not live, which today is the Duolingo
  English Test alone.
- **What follows without asking again**: the Duolingo English Test and Lichess take the same step the day goals 5 to 9
  are registered on the milestone contract, because that registration is the only thing between them and a gift being
  creatable. Nothing else about them changes, and what is not settled is still said where it matters: the English test
  stays a condition whose source has a question to answer about reading its pages.
- What this does not loosen: no screen claims a gift has settled that has not, the judges page still carries what each
  condition proves and does not prove, and a condition with no reading behind it is not written here at all.

## D110, 19 Sep 2026: the gift is an object on the first page, not a journey to it

- Statement, the founder's, after the product vision of 19 Sep 2026: Viky opens on a gift to fill in. The first
  screen is the product itself, a real card, and the account and the money are asked for only when Pay is pressed.
  The eight step assistant is gone, and nothing of it survives in a second version: one screen, one live version.
- **What the card is.** Four cases, For, will, worth and for how long, each opening in a sheet at the bottom of the
  screen rather than on a page, each changing the card as it is answered, and the shape of the gift drawn empty as
  soon as the condition is chosen. Four cases filled, one button: Pay. There is no review screen, because the object
  was built in front of the person.
- **What it does not touch.** No contract, no route, no reading, no register. The create routes receive exactly the
  same terms, in the same shapes, signed the same way, with the same attempt key (D87) and the same refusals. The
  screen above them was the whole change.
- **Where the gift lives.** On the device, in the draft of D74, which now also holds a card nobody has signed in for:
  `account` is empty until somebody pays, and a gift already held for an account is still never handed to another.
  One store (`src/card-draft.ts`) is read by the card and by the paying screen, so there is one gift in one place.
- **What is left of the old screen.** Its money half, unchanged: the ways in, the watching of the account, the swap,
  the one signature, the link. It is `app/components/PayGift.tsx` at the same address, and the vision's Pay sheet
  (V3) replaces it next. Keeping it working was the condition for deleting the assistant in the same change.
- **Measured, before and after**: screens a funder passes before the gift exists, five then one (the card), with the
  paying screen after it; addresses in the journey, eight then four. The report is
  `docs/reports/2026-09-19-the-card.md`.
- What this does not claim: that it is faster in seconds, or easier for anybody in particular. Nobody outside the
  team has used it yet, and the first real gift made on it will say more than any of this.

## D111, 19 Sep 2026: one scale, one rhyme, a third voice

- Statement, the founder's, 19 Sep 2026, from K's references (rules 5, 6, 10, 13, 14, Ramp section 2): the type sizes
  come from one ratio, letters are spaced by role, a small line in capitals is the third voice, the second button is
  filled with a surface tone rather than hollow, and everything with four corners takes the same radius as the card.
- **The scale is a major third, 1.25, on a base of 16**: 13, 16, 20, 25, 31, then 39 and 49 in a compact screen and 61
  and 76 in a wide one. Before it, the four sizes in use stepped by 1.14, 1.37, 1.45 and 1.5, which is four decisions
  rather than one voice. `src/design-tokens.ts` holds the scale and `test/design-tokens.test.ts` refuses a size that is
  not a step of it.
- **A voice is a role, not a font.** The third voice is the text face at 13 in capitals, spaced a pixel, and it speaks
  the line that says where you are: the step caption of a task. A voice with no line to speak is not written.
- **The second button is filled and still outlined.** Filled, because a hollow button is read as decoration (rule 10,
  and Material 3's filled tonal). Outlined, because the outline is what tells a person this is a control, and WCAG
  1.4.11 wants 3:1 for that, which a fill this quiet cannot give on its own.
- What this does not change: the accent stays the one action's colour, the grounds and the ink are untouched, and every
  pair is still measured, now twice over: from the palette in the tests, and from the colours the browser resolves on
  the live page (`pnpm measure:contrast`).


## D112, 19 Sep 2026: the card a gift is filled in on is the gift's own card, empty

- What was wrong, and it was the vision's fault rather than the code's: the vision of that morning described a
  sequence, four cases each opening in a sheet, and never described what the card looks like. The first build took
  it literally and drew a list of definitions, a label on the left and an underlined value on the right. That is a
  settings screen. The founder's words on the captures: the art direction had been lost.
- **There is one card.** `app/kit/GiftCard.tsx` already drew a real gift, with its title, the row of day characters
  or the climbing meter, and its amounts. The card being filled in is that card, empty: both are drawn by one
  function, `CardFace`, and the one being filled in draws the product's own `Character`, `DayStrip` and
  `MilestoneMeter` rather than shapes invented beside them. The shape invented for the first version is deleted.
- **What it shows while it fills** (the drawn card, section 2): "A gift" in the quiet voice with "Who is it for?"
  under it, then "For Léa" at the card's title size with the condition under it, then the shape, empty, then the
  amount at display size, then the length in the third voice, and at last the one action. A case nobody has answered
  says the word that is missing where that word will be, and the whole line opens its sheet: an underlined link is
  not how a card says something is missing.
- **The accent is the sun, and it is for two things**: the action a screen is asking for, and the moment something
  succeeds. It is on Pay and on nothing else on this screen, so the sheets' own buttons took the quiet fill.
- **A card has to be seen as a card.** Measured: the surface stands at 1.09:1 on the ground by day and 1.12:1 by
  night, under the 1.3:1 asked for, so the card's edge is the ink now. It is still a hairline and still carries no
  relief, because a card is not a control.
- **The sheets** rise from the bottom at every width, darken the page once and lightly (0.32 by day, 0.45 by night,
  where it was 0.55 and 0.7), and are dismissed by a pull downwards as well as by Escape, the backdrop and Done. The
  point of a sheet rather than a page is watching the card change while you fill it in.
- **The page without an account** is one line above the card, the card, and one line under it. At 1440 the card sits
  in the height instead of at the top of an empty page.
- What this changes for every other card in the product: the ink edge and the title face, because there is one card
  and it is the same everywhere. Nothing else moved: no route, no contract, no word of the register.

## D113, 19 Sep 2026: the rendered mockups are the specification, and two amendments to the brief

- Statement, the founder's: the visual direction is settled and **images decide it now, not prose**. The four
  rendered screens of `design-mockups-2026-09-19` (home, the empty card, a sheet, a gift's page) replace every
  written specification for those screens, including the document written the same morning. A detail that is not in
  the image is not in the instruction: it is free, and it is asked about.
- **The two amendments to the art direction brief, validated on the images.** A character keeps its face at the
  small size, where the brief kept faces for the large one: a row of faceless shapes reads as a chart, and the faces
  are what hold a screen together. And the one action fills the width of its card, which the brief advised against.
- **What the images fix, and what was copied from `shared.css` rather than interpreted**: the card is cream
  `#FFF6E2` at radius 28 with a shadow under it, on the ink ground, and never the same value as it; the ground
  carries two very diffuse halos, the sun at the top right and the violet at the bottom left, with no texture and no
  grain; one star per screen, the amount, in the title face at 42, tabular; the action is the full sun with three
  pixels of its own shadow under it; the sheets rise from the bottom with a handle, stop at 74 % of the height and
  scroll inside themselves, over a single veil the card is still read through; a case nobody has answered says the
  word that is missing in its own place on the card, never a link at the right.
- **Three places where the image was not copied exactly, each measured and each said here.**
  - The image's quiet ink on the cream, `#907F52`, measures 3.66:1 where a small line needs 4.5:1, and its faint
    ink `#B5A67C` measures 2.24:1. They are `#7C6C3F` (4.79:1) and, for the two large lines only, `#96844F`
    (3.42:1, above the 3:1 large text asks).
  - The words of the shut action, `#9A8B62` on `#EFE3C4`, measure 2.64:1. They are `#6F6133` (4.79:1).
  - The sun button on the cream measures 1.47:1, so it keeps the ink outline the image does not draw: WCAG 1.4.11
    asks 3:1 of whatever identifies a control, and the outline is what identifies this one.
- **What this overrules, and it is one morning old**: the tokens of the same day said a control that cannot be
  pressed gives its fill back entirely. The image draws the shut action filled and relieved, saying what it waits
  for, and that is what a person on a card is waiting to press. The rule still holds for every other button.
- **Day is not drawn yet.** It keeps the palette it had, and what does not work in it is written in the delivery
  rather than invented here: the white card stands at 1.09:1 on its ground and needs its hairline, there are no
  halos, and a case nobody has answered has no faint ink of its own.


## D114, 19 Sep 2026: paying is a sheet over the card, and the wait is the whole screen

- The rendered mockups pay.html and paying.html decide these two surfaces, and they replace what was left of the
  eight step assistant: the check screen with its rows and its two cards of figures, and the account step before it.
- **The sheet says three lines and no fourth**: what goes in their name, what the card service charges, and that
  Viky takes nothing. Then what this person actually pays, in their own money, at a rate with a day on it. Then the
  sentence that says the account is made by their face or their fingerprint at the press, and nothing was asked of
  them until then. One action in the sun, full width.
- **What the old screen promised is still promised**, where the money is about to move: the link warning stays in
  front of everybody, and what only some readers need went behind the mockup's second, quiet button, "What happens
  to my money": what this condition pays for, the two names on the gift, the fourteen days, the service's own fee
  and the day it was read.
- **The second way in is not hidden** (D101), it is under the action: "Pay with Mercuryo instead". The image draws
  one action and one price, and two cards of figures in front of a person choosing neither is what it replaced.
- **The wait is the whole screen** (paying.html): the ring at 54 pixels, what is being done in the title face under
  it, how long it takes and what closing the page costs, and the gift itself, small, so the thing being made never
  leaves the screen.
- **The account panel is the fallback, in place**: a device that cannot make a passkey, or somebody who waved the
  sheet away, gets the panel inside the sheet rather than a screen of its own.
- **Day is drawn now** (home-light.html): the ground is the lavender `#DDD6EB`, the card is the same cream as night
  with a softer shadow and a warm hairline, the halos are there, a case nobody has answered is the same faint ink,
  and the shut action keeps its filled shape. The neutral-ground rule of the tokens is retired: what a card has to
  do is stand off its ground, which is measured at 1.31:1 by day and 17.2:1 by night.
- What this does not change: no route, no contract, no reading, no word of the register. The money path is the one
  that has run since D33, D42, D74 and D87.

## D115, 19 Sep 2026: the keys that own the product are the product's own, and there are three

- Statement, the founder's: no personal address owns anything of Viky. The four contracts go to a Safe of **two of
  three**, and the three keys are made for the project by the founder, never by a developer and never by the advisor.
  His hardware wallet signs the four handovers and is then out of it for good.
- **Why three and not two.** Two of two is one loss away from a product nobody can act on: a goal that cannot be
  registered, an evidence signer that cannot be replaced, a pause that cannot be lifted. Two of three survives one key
  lost, and still refuses one key stolen.
- **Why the keys are his to make.** A key a developer generates is a key a developer has held. The procedure in
  docs/OPERATIONS.md is commands he runs himself: two encrypted keystores in two different places, each with a
  password only he types, and one key on paper that exists nowhere else. What leaves his machine is three addresses.
- **What the shape costs.** Every owner action is now two signatures and a Safe transaction rather than one signature:
  registering a goal, replacing the evidence signer, pausing creation or readings, allowing an exchange on the router.
  That cost is the point, and the scripts carry it: `pnpm safe:action` builds and signs in three passes, each of which
  can happen on a different machine.
- **The one step no script of ours can send.** `pnpm safe:handover` asks for `OWNER_PRIVATE_KEY` to send, and a
  hardware wallet never hands its key over. So the script prints the four calls and `cast send --ledger` carries them,
  once, with the device confirming each. OPERATIONS carries the exact command, and the script now prints it too rather
  than offering a road the owner cannot take.
- **Two corrections from the founder the same day, both measured before they were written.** The paper key is twelve
  words and not a raw key: sixty-four hexadecimal characters copied by hand are ruined for ever by one wrong
  character, while a mnemonic is read back and corrected by anybody (`cast wallet new-mnemonic`, twelve words by
  default). And the two encrypted keys are enrolled for the fingerprint reader with `--touch-id`, which is comfort
  and not a replacement: the flag's own words are "The macOS login password and explicit keystore passwords remain
  available", so the password stays the way in on another machine and still has to be worth having.
- **What those two changes forced, and it is the better half of them: no raw key is needed to sign either.**
  `cast wallet sign --no-hash <hash>` signs a Safe transaction hash straight from a keystore, from a mnemonic or from
  a hardware wallet. Measured on 19 Sep 2026: 65 bytes, `v` of 28, and the signer recovers from it, which is the form
  the contract accepts and the form `pnpm safe:action` checks. So the three passes never decrypt anything into a
  shell, and the script now prints those three commands rather than only the raw key route.
- **Done on 20 Sep 2026**, and the table in docs/OPERATIONS.md carries every transaction. The Safe is
  `0xE08D926c148A5065F4Df2892702785a183de86F9`; the four contracts answer it, read back from the chain; the hardware
  wallet spent about 0.0147 MON and has nothing left to sign for Viky.
- **What it cost to get there, because the next key replacement should not repeat it.** Three keys were thrown away
  and a first Safe abandoned before the real one: a paper phrase pasted whole into a conversation, and two encrypted
  files sharing one password, one of which was pasted as well. It cost nothing because none of them owned anything
  yet. The rule that comes out of it is short: a key is proved by its address, and a file, a phrase or a password
  that reaches a conversation is spent.
- What this does not change: the contracts, which are not redeployed and whose `Ownable` is one step with no
  acceptance; and the relayer and evidence signer keys, which are operational and were never owners.

## D116, 19 Sep 2026: a gift's page is the card, alive, and it leads with the moment it is in

- Statement, the founder's, 19 Sep 2026: the page of a gift is the same card as everywhere else, living. What it
  shows when is document J's table of moments; what it looks like is the rendered mockup `gift.html`. The content
  brief and the image each decide half, and neither overrules the other on the other's half.
- **The defect it closes, measured.** The page tried to be two things at once: the agreement, which is fixed and read
  once, and the state, which changes and is read every day. Both were written at the same weight, in the same prose,
  at every visit. On 19 Sep, all twenty-three states of the page said at least one figure twice; the milestone before
  its deadline said its target three times, its amount three times and its date three times.
- **Four things, in one order, and one of them dominates**: the state in one sentence, the figure that counts now
  with a label saying what it is, the next moment with its date, and one action or none. The agreement and how it is
  checked are folded under their own names, open only at the one moment a person is discovering the gift.
- **Nine moments, three shapes, three readers, one place that decides.** `src/gift-moment.ts` says which moment a
  gift is in and what this reader may do there; `src/gift-live.ts` composes the three sentences. The page draws what
  they answer and decides nothing itself, which is what the two pages before it did in ten places each.
- **The row of days keeps one size and scrolls.** 48 pixels on a gift's page, 42 on a card in a list, never wrapped
  and never shrunk, with a fade at its right edge and a line under it saying which day is in view. Thirty days
  shrunk to fit were thirty smudges.
- What this does not touch: no contract, no route, no reading, no register. The same gestures reach the same routes,
  with the same refusals, and the passkey is still opened at the one moment a signature is needed.
- What it removes: `app/components/MilestoneGiftPage.tsx`, and the gesture table of D99, which said what a voice may
  do without knowing what the moment allows. A voice and a moment decide it together now.

## D117, 20 Sep 2026: the puzzle record is a condition of its own, and its policing is weaker than the rating's

- Statement, the founder's, 20 Sep 2026: Chess.com's puzzle rating becomes a condition, on goal 12, registered in the
  same signing session as the two others.
- **What the source gives, measured the same day on sevyb, hikaru, magnuscarlsen and erik.** The stats page carries
  `"tactics":{"highest":{"rating":2096,"date":...},"lowest":{"rating":1795,"date":...}}`, and nothing else: no `last`,
  no RD, and no current rating at all. `highest` is the best that account ever reached and never goes down.
- **So the gift is "beat your own record", not "hold a rating".** Nothing the person does after beating it can take
  the gift away, which is the opposite of a cadence where a rating reached on a good afternoon can be lost the next
  day. The pattern is anchored on `highest`, because `lowest` sits in the same block and a looser reading would let
  the worst rating an account ever held settle a gift made on its best.
- **No cadence to choose, so the sheet asks no question.** A milestone with one climb answers it when the condition
  is chosen; the chooser draws the question only from two.
- **No RD, so the settling guard does not apply.** `recordHasSettled` says so in the register rather than letting
  `ratingHasSettled(null)` refuse every reading. The same standing route serves both, and it now asks which condition
  owns the climb before it judges anything.
- **Said on the judges page: this is the weaker of the two Chess.com conditions.** Chess.com's Fair Play policy and
  its help centre article on Fair Play were read on 20 Sep 2026 and neither mentions puzzles; what they forbid is
  written about play. The closed-account status is still read on every reading, which is what Chess.com does publish.
- **A defect found while building it.** A cadence reading that arrived without its RD was read as RD zero, which is a
  rating that has settled perfectly. `Number("")` is zero. It is now read without a fallback, so a missing RD is
  refused as an incomplete proof.
- What this touches: `src/chess-com.ts` and `src/attested-sources.ts`, so the reading fingerprint changes and the
  worker is redeployed before this merges (docs/OPERATIONS.md). No contract, no migration: goal 12 was registered on
  19 Sep with the provider id this build sends.

## D118, 20 Sep 2026: a certification is known by two ids, so it is chosen from a list and never named

- Statement, the founder's, 20 Sep 2026: Credly becomes a condition, on goal 11, with the certification read from
  the Open Badges assertion and the holder's name from the public page.
- **A badge is two public records, so a reading is two proofs.** The assertion at
  `credly.com/api/v1/obi/v2/badge_assertions/<id>` carries the day and a `badge` URL pinning the issuer's id and the
  badge class's id; the public page carries one `og:title` of a fixed shape, "<title> was issued by <issuer> to
  <holder>.", and it is the only place the holder's name is published. Both halves must be about the badge that was
  asked for, and they are taken within five minutes of each other, as a Chess.com reading is.
- **The certification is the pair of ids, never the title.** A title can be edited, translated or reused between
  issuers; the ids cannot. So the funder chooses from a short list in the repository, three certifications whose ids
  were read from Credly's own `badge_classes` endpoint on 20 Sep 2026, with Credly's own words for each: AI
  Fundamentals with IBM SkillsBuild, Introduction to Cybersecurity and Python Essentials 1, all issued by Cisco.
  A real badge for a certification that is not on that list is refused as such, and told it is not what the gift is
  for rather than that something broke.
- **Nothing takes the hashed email.** The assertion carries the holder's email as a hash. No pattern matches it, so
  the attestor never hands it over, and the sentence a person reads says so.
- **What says a badge exists is the assertion.** Measured on an id nobody has: the assertion answers 404 while the
  public page answers 200 with no `og` tag at all. A 404 on the page alone is Credly failing and never a fact about
  somebody's badge.
- **Not measured:** what either end answers for a badge its holder has made private again, because no private badge
  was to hand. A reading that stops carrying what it needs refuses and says the page could not be read.
- What this touches: `src/attested-sources.ts`, so the reading fingerprint changes again and the worker is
  redeployed before this merges. No contract, no migration: goal 11 was registered on 19 Sep with the provider id
  this build sends. The chooser now has six conditions, so it draws one section per family.

## D119, 20 Sep 2026: a catalogue is read by its titles, and a certification is a family

- Statement, the founder's, 20 Sep 2026, with `chooser.html` as the image that decides: one line per condition, the
  verification sentence only under the one that is chosen, the list opening at its top, a fade of 22 pixels at each
  edge only when it really scrolls, and four families.
- **What was measured on production the same day.** The scrolling part of "What will they do?" was 524 pixels and its
  contents 720, and it opened at 196, in the middle of the list, cutting a sentence in two against the top edge. In a
  window 732 tall, two conditions of six were whole and both edges were cut. Every row carried three lines of
  explanation, so the list grew by about 80 pixels for each condition added: the shape could not hold what the
  register already had, let alone what comes next.
- **Two defects underneath it, both found by measuring rather than by reading the code.**
  - A `<dialog>` carries the browser's own `max-width: calc(100% - 6px - 2em)`, 38 pixels on a phone. The sheet was
    inset from both edges where the image draws it flush, and its list was 38 pixels narrower than the screen, which
    is what wrapped titles the image holds on one line.
  - The sheet opened on the answer already given, which was written the same night to help somebody returning to
    change a choice. On a list of six it opened in the middle instead. A sheet opens at the top of what it says.
- **The catalogue's own shape**, beside the one the other lists keep: one line per option in the title face at 17,
  which is what makes one line true rather than aspirational, no box and no sentence until an option is chosen, and
  then that one alone takes the ink edge, the warm fill and its line. Measured after: the list is 436 pixels where it
  was 720, all six conditions are whole at 390x844, five of six in the founder's 732, and the sixth is behind a fade
  that says so.
- **Four families, and the fourth is a distinction rather than a shelf.** A certification is awarded by somebody who
  is not the person, and it is not a course taken: a CompTIA is sat as an examination with no course at all. Credly
  filed under "Finish a course" erased exactly what made it worth building. Learn a language, Play, Finish a course,
  Get certified, in that order; "Move" left with nothing filed under it, and comes back the day something is.
- **One thing the image asks that is not done here**, and it is the founder's to settle: the image shortens "Reach a
  score on the Duolingo English Test" to "Reach a score on the English Test", which is what holds that row to one
  line at 390 (327 pixels of title against 298 of room; at 430 it fits as it is). The name is left whole, because
  nothing else in the chooser names that source and "the English Test" could be any of them.

## D120, 20 Sep 2026: a request is part of what is fetched, so it lives where the fingerprint can see it

- Found by taking the one reading the tests cannot take: a real proof, from the real attestor, of each of the two
  conditions opened that day. The puzzle record answered (erik, 2096, two proofs). **Credly failed**, and the
  condition was live in production at the time.
- **Why.** Every attested reading was made with `accept: application/json`, written once beside the verification.
  Credly's badge page varies on `Accept` and answers 500 to JSON (measured the same day), so the half of the reading
  that carries the holder's name could never be taken. Nothing in the tests could catch it: they build their own
  proofs, and a built proof never asks a server anything.
- **What changed.** A source says what it accepts, and the headers moved into `src/attested-sources.ts`, which the
  reading fingerprint covers. They used to sit in `src/attested-read.ts`, outside the number, so a change of headers
  would have been invisible to the app and the worker alike, which is exactly what the number exists to prevent.
- **Proved after**: both readings taken through the real attestor, two proofs each, the badge read as Elio Vantar,
  `ai-fundamentals-with-ibm-skillsbuild`, issued 30 Aug 2024.
- **The lesson worth keeping**: a condition is not proved by its tests. It is proved by one real reading, and that
  reading costs a minute. Take it before calling a condition live, not after.

## D121, 20 Sep 2026: the card keeps its shape, and it is the form

- Statement, the founder's, 20 Sep 2026, with `desktop.html` as the image that decides the card's shape. Measured on
  production at 1440 first: the card took its whole column, about 880 pixels wide; the pay sheet stood 57 pixels
  off the page's axis; and a person opened a sheet to type a first name.
- **The card never widens.** 440 pixels at every width above 480, and the column less its margins below. A gift
  card that stretches to its column stops being a card, and it is the object the whole product is about. The row of
  days keeps one mark a day, thirty for thirty, and scrolls behind a fade at its right edge; on the wide card the
  fade had nothing to hide and looked gone.
- **The layout does not change.** The founder saw the desktop page with the promise above the card and kept it; the
  image's two columns were not built.
- **A sheet stands on the page's own axis.** How far the column is pushed in by the rail is one number,
  `--page-offset`, read by the shell and by every sheet: measured after, page and sheet share the same axis at 390,
  430, 1024 and 1440 (195, 215, 556, 764).
- **A field is edited where it stands.** The first name is typed in the line that carries it, the amount in its own
  place, the length on chips (the register's shortest, suggested and longest) with one more chip that opens a field
  in the same place. What keeps a sheet is what is a real choice: the condition, with its families and a sentence
  under the one being considered, and then that condition's own questions. Two sheets where there were five. Each
  field on the card is 48 pixels tall, the size every control keeps; a field the size of the card's label would be
  under a thumb and under the 16 pixels a phone zooms in on, so the funder's own name, which the image does not
  draw at all, is asked where they pay, at a size a phone reads, and it never blocks.
- **The card opens filled.** A visitor arrives on a plausible gift, not four holes: the daily lesson the register
  starts on, thirty dollars, thirty days. The one empty field is the first name, because it is the one thing Viky
  cannot guess, and it carries the cursor. The action says what it will take from the first second; the passkey is
  still the only door, and a gift whose recipient nobody named is a gift for whoever opens the link, which this
  product has always made.
- **Pressing the condition again keeps its answers.** The card's line opens the catalogue; choosing the one already
  chosen opens its own questions without dropping what it was told, and choosing another drops all of it, because a
  name on one source means nothing on another.
- Nothing else moved: the tokens, the sun for paying and for reaching, the three voices, the character, the
  families of the catalogue, and no chain word on any screen.
## D122, 20 Sep 2026: a certification is found by Credly's own search, and no list of ours decides

- Statement, the founder's, 20 Sep 2026: the three certifications written into the repository were a stopgap.
  Credly exposes its own search, found in their application bundle and unauthenticated:
  `GET credly.com/api/v1/global_search/badge_template?q=<words>`, fifty results in under a second, each with the
  badge class's id, the issuer's id, the name and the issuer's name.
- **Verified the same day, not taken on trust**: 200 in 0.73 s; the ids it gives for Cisco's Introduction to
  Cybersecurity are exactly the pair read by hand from a live badge that morning (`10b1a2de…` / `74381078…`); it
  sends no CORS header, so the browser cannot ask it and Viky's own route does (`/api/credly/search`, rate limited,
  no sign-in because the card is filled before any account exists, nothing stored).
- **What the funder's step becomes**: a search field, not three radios. They type "comptia", read the answers each
  with who awards it, choose one, and the pair of ids is pinned into the terms exactly as before. Four different
  issuers award an "Introduction to Cybersecurity" in the first six answers, which is why the issuer stands beside
  every line and why the words are never what the terms carry.
- **What the terms carry**: the pair `issuerId/classId`, checked by shape before anything is signed (`credlyPairOf`).
  The reading compares it by the subject, so a badge for another certification is simply another subject and says
  so in the same sentence as another name; the refusal "a certification Viky does not read" is gone with the list.
- **What this does not change**: the two proofs of a badge, the hashed email that nothing matches, the day judged
  from the assertion, goal 11 and its provider id. The demo constraint that put AI Fundamentals first in a list has
  nothing left to order; the search shows what the funder types.

## D123, 20 Sep 2026: Strava is closed, and the bounded trial is not launched

- Statement, the founder's, 20 Sep 2026: Strava is closed. The bounded trial planned for it is not launched, and the
  half day it would have taken is kept.
- **The reason, for the record**, from Strava's API Agreement at strava.com/legal/api, read the same day, section
  4.4: "Upon termination of this Agreement, you must promptly cease using and permanently delete all the Strava API
  Materials, any links or access to the Strava Platform in your Developer Application, and all Strava Data provided
  hereunder and so certify in writing to Strava." What Viky settles on the chain derives from that data, and a
  public chain cannot delete anything: the day a gift was earned is written where nobody can unwrite it. The web
  page is their official interface, so access was never the problem. The problem is that we would sign an
  undertaking we know we cannot keep.
- **Why the three open sources are different.** With Duolingo, Coursera and Credly nobody signs anything: Viky
  reads a public page, in a grey area it has taken on knowingly and says so on the judges page. Strava's agreement
  is the opposite: a signature, and a clause that a chain makes false the day it is signed.
- **What stays in the repository.** `contracts/verifiers/VikyStravaReclaimVerifier.sol` and its two tests,
  `test/VikyStravaReclaimVerifier.t.sol` and `test/VikyStravaRealProof.t.sol`, remain, unused and unwired, each
  carrying this entry's number at its head. They are a working record of a reading that was proved and then
  refused for a reason that is not technical, and deleting them would make that reason harder to find.
- What this closes: D15 (Strava as a launch candidate) and the "Strava only through its official API" line of the
  entry of 17 Sep. The spec's table says the same in one row.

## D124, 20 Sep 2026: the way out is one decision, and the way that leaves the most leads it

- Statement, the founder's, reading viky.cash/cash-out against out.html on 20 Sep 2026: the screen's work is one
  decision, and each card is a title, a figure, a line and a button. "Ramp" and "Mercuryo" are not titles: our
  public does not know what they are. The titles are "Your bank" and "Your card"; the company is named in the line,
  on the steps that open its page, and behind a fold. The way that leaves the most goes first, carries the accent,
  and a line under its figure says the gap in the person's words ("€2.01 more than to your card."). This replaces
  the arbitration of 19 Sep that no card carried the accent: that arbitration answered an accent that marked the
  country's order, which read as a recommendation of nothing. An accent that marks the larger figure recommends
  what the figure recommends. A card with no figure (no rate read) carries none.
- **The order.** The country keeps its one say (D96): a way whose own service says it does not serve there goes
  last. Among the rest, the net figure decides, descending. Nothing is removed. `orderByWhatReaches` in
  `src/exit-steps.ts`.
- **Off the card.** The source line ("Read from Ramp's own payout-methods list and asset page, 16 Sep 2026") is
  for a judge, and noise for somebody who wants their money: it is behind "Where these figures come from" under the
  cards, with each service's fee sentence and the rate's source. The conditions (identity check, the name on the
  account or the card) are said at step 2, where that service's page opens. "Selling is shut in the United Kingdom"
  is off the card: it is about selling, the screen reads that restriction live from the endpoint and says it under
  the card for whoever is there, and everybody else was reading it for nothing.
- **The defect.** The head of the screen said "$10.14" and both cards "If you sent all $10.13". The head added the
  six-decimal balances of the two dollar coins and cut the sum; the cards used what a gift holds alone. The account
  held 10.13 of that and 0.0096 of the other, left by a payout, which tipped the sum. Neither figure was false and
  neither was the money that can move. Now each coin is cut to the cent before they are added (`dollarsToTheCent`),
  the cards compute on what can be changed cut the same way, and Home's figure uses the same cut, so the two screens
  agree. When the other coin holds a cent or more the head is larger than the cards and the line "$X of it is ready
  to send to Ramp" says why.
- **The head.** Dollars lead, the conversion is the caption, as out.html draws it: the cards under it say what
  arrives in the person's currency, so the dollars are what they have and the euros are what they get.
- Closes the arbitration of 19 Sep on the accent (`docs/reports/2026-09-19-the-way-out.md`).

## D125, 20 Sep 2026: a way in is offered by what the gift needs against its published floor

- Statement, the founder's, 20 Sep 2026: the choice of the way in is a choice of cost, not a minimum on the gift.
  A way whose published floor is above what this gift needs is not offered for this gift. Between the ways left,
  the one that leaves the most (the one that asks the fewest euros for the same gift) goes first and stands in
  front of the action. The gift's own minimum does not move: the gift costs nothing, the way costs.
- **The floors are theirs, re-read 20 Sep 2026.** Ramp: `minPurchaseAmountEur: 6`, fees 0.99 % to 3.9 % with a
  2.49 EUR minimum, `MONAD_AUSD` enabled, at `https://api.ramp.network/api/host-api/assets`. Mercuryo:
  `fiat_payment_methods.EUR.limits.min` is `"25"` for card, Google Pay and Apple Pay, at
  `https://api.mercuryo.io/v1.6/lib/currencies`, the same figure as on 10 and 14 Sep (D20). **The founder's brief
  said Mercuryo had no minimum and no floor**, from their `public/convert` endpoint, which prices a 1 EUR purchase
  (fee 0.04 EUR) and a 6 EUR one (fee 0.23 EUR) without complaint. That is D79 again on the other rail: an
  endpoint that quotes is not a service that pays. The published limit is the figure a screen may act on, so at
  6 EUR only Ramp is offered, and the 41 % it keeps there is what the person pays for a gift that small. The rule
  is exactly the one asked for; only the premise about one figure was wrong, and the source says so.
- **Not the country.** `rails/where` orders and never hides, because a guess about a country is wrong often enough
  to put money out of reach (D96). The amount is a published figure; the country is a guess. We hide on the first,
  never on the second: the country still sends a way that says it does not serve there to the back, and no further.
- **Under every floor.** A one dollar gift needs 4 EUR at Ramp and 2 EUR at Mercuryo, under both floors. The
  gift's minimum does not move: the way with the lowest floor is offered at its floor, and the sheet says "The card
  service takes nothing under 6 EUR, so that is what you pay. What is left over stays in your account for your next
  gift." It does: the coin lands in the person's own account and the gift takes its part.
- **No company on the sheet's lines or buttons.** "What Ramp charges" is "What the card service charges"; "Pay with
  Mercuryo instead" is "Pay by card another way". The service is named where it is met, on the page that opens and
  on the wait that says what to set there, and behind the fold that says where its figures were read.
- **The rate line.** "at the rate of 18 Sep 2026" on a Sunday looked stale. The figure was right: the European
  Central Bank sets one each working day and none at the weekend. The line now names the source and says so.
- `waysInFor` and `eurosNeededOn` in `src/gift-amount.ts`; `test/pay-sheet.test.ts`.

## D126, 20 Sep 2026: one type scale, no size between two steps, and one left edge per screen

- Statement, the founder's first principle of the design pass of 20 Sep 2026, measured by the advisor and settled
  by the founder on two images: the visual hierarchy read as weak. Our scale was declared (a major third on 16: 13,
  16, 20, 25, 31, 39, 49, 61, 76) and the page without an account did not use it: the hero was 36, on no step, and
  the head of the page measured 2.3 hero over body where Wise (105 px), Revolut (88) and Ramp (64) measure 5.3, 4.9
  and 4.0 at 1440, in the same browser. And there was no grid: the hero started at 548 px, the paragraph at 448, the
  card at 544, because the character beside the title pushed it right and the card sat in the middle of the column.
- **The rule, everywhere.** Every text size on every screen is a step of the scale, and nothing between two steps.
  At the head of a page the first level over the body is at least 4. One left edge per screen, and everything that
  is not the card aligns to it. The founder chose to apply it to everything at once rather than screen by screen.
- **What moved.** The hero: 39 on a phone, 49 from 600, 76 from 840 (the founder chose 76 over 61 on the image:
  4.75 over the body, between Ramp and Revolut; 61 would have measured 3.8). The card's three voices, drawn at 28,
  42 and 11 by the mockups of 19 Sep, are 25, 39 and 13; the amount over the name keeps the image's one and a half.
  A catalogue line and the action's words go from 17 to the body step, 16; the wait's sentence from 26 to 25.
  The character sits above the title, and the card on the column's left edge, where the title and the paragraph
  start. `HERO_TYPE`, `CARD_TYPE` and `TYPE_SCALE` in `src/design-tokens.ts`; the stylesheet is read by
  `test/design-tokens.test.ts`, root and breakpoints, so a size typed from an image cannot come back.
- **What was not taken.** The advisor's desktop.html also drew two columns at 1440 (the text left, the card right,
  centred in the height) and a small-caps hint under the paragraph. The founder kept the stacked column he had
  chosen that morning ("the card fixed, not the layout"), with the one left edge; the hint was part of the other
  layout and is not on the page.
- "Peu punchy" is a different question, the promise's wording, and it is not mixed into this decision.

## D127, 20 Sep 2026: Home is the product, the card is its star, and the promise sits under it

- Statement, the founder's, written as a specification the same evening D126 shipped, and inverting its hero on
  purpose: the recommendation of a 76 px hero had measured Home against Wise, Revolut and Ramp, which are landing
  pages whose job is to send a visitor to a product elsewhere. Home is the product. The vision of 19 Sep, section 5,
  had said it from the start: the card to fill at the top, and under it one line of promise. Rule 4 adds one star
  per screen; with the hero there were two, and the card lost: 114 px of it under the fold at 1440x788, measured on
  production. The mockup that decides is `desktop.html` (second version) and `promise.html` shows the promise at its
  size; the two-column version is deleted, not archived.
- **The order, at every width.** The card first, the promise under it. The 76 px title above the card is gone, with
  its tokens (`--type-hero`) and its class. The character keeps its place above the card.
- **The card is an object placed on the page, not a panel floating over it.** It carries the rank by its edge and
  its relief, not by a font size (the niche, "Neo Brutalism Juice": an object sits by a full offset, never a blur).
  A 2 px edge (`--card-placed-edge`: the ink by day, the controls' night edge `#F3F0FA` at night) and a hard
  `10px 10px 0` relief (`--card-placed-relief`: the ink `#1E1633` by day; at night the characters' lavender
  `#BBA3FA`, where the ink would vanish into the ground, the same inversion `--control-relief-colour` already does).
  What leaves the card: the blur `0 20px 44px rgba(0,0,0,.5)` and the transparent edge that went with it. Nothing
  else in the card changes: radius 28, the amount the largest size on the screen, the chips from the condition.
  Scope: the gift card (`.gift-card-placed` on `OfferCard`). The other cards of the product still wear
  `--card-shadow`; the niche says no blur anywhere, and that is the next question to the founder, not a decision
  taken here.
- **The promise, under the card.** The title at 25 (Fredoka 600, leading 30, tracking -0.5, `var(--text)`), the
  sentence at 16/24 in `var(--muted)`, at most 460 wide, 24 px between the card's bottom and the title, 6 between
  the title and the sentence. The words do not change: "Money that arrives as they earn it." and the sentence under
  it; `promise.html` holds candidates the founder will choose from separately.
- **The composition.** One column, centred, at every width, and no second column. From 1024: centred in the
  window, the card and the promise together centred in the height, text centred. Below 1024: as online at 390,
  everything on the left edge, the card the full width less the margins. What fills a wide screen is air around
  one object. The shell learns `bare` for the page without an account: no bar, no rail, and no 88 px kept for a
  rail that draws nothing, which is what had the card 52 px right of centre.
- **The acceptance test**, in `test/browser/home-card-first.spec.ts`, readable on a capture: (1) at 1440x900 the
  whole card, button included, and the promise are visible without scrolling; (2) the card's centre within 10 px of
  the window's; (3) `boxShadow` is a 10 px offset with no blur; (4) `rgb(187, 163, 250)` at night, `rgb(30, 22, 51)`
  by day; (5) no text larger than the card's figure; (6) at 390 the same order and nothing cut across. A merge
  waits on all six.
- Supersedes the hero and the "one left edge above 1024" parts of D126. The scale rule of D126 stands.

## D128, 20 Sep 2026: a flat ground, no shadow, a new promise, two columns from 1024, and the column at the card's width

- Statement, the founder's, on the advisor's preview built in the real page with the real components ("A"), the
  same evening as D127 and changing it on purpose, one thing at a time so that a line can be refused alone:
  1. **The halos go.** `body::before` and `body::after` carried `filter: blur(90px)`. The ground is a flat of ink,
     the niche's rule: no gradient on a ground, no blur.
  2. **The card loses its offset relief**, and no blurred shadow replaces it. It keeps its 2 px edge. Cream on the
     ink ground measures 17:1: it stands by its colour and needs no shadow. The founder saw it and validated it.
     Applied to every card: `--card-shadow` is `none` by day and by night, because the niche allows no blur
     anywhere and the acceptance test reads the whole page.
  3. **The promise changes**: "Money that cheers them on." The sentence under it does not change.
  4. **Two columns from 1024 on the page without an account**, the values read on the preview: the page column
     1240 max, centred; the row flex, items centred, gap 80, min-height 560; on the left flex 1, max 620, text on
     the left, the character above the title, the title 76 / 1.02 / -2, the sentence 20 / 28 at most 460 wide, 20
     under the title; on the right the card at 440. Below 1024: one column, exactly the page of D127 at 390, the
     title at 39. One DOM serves both: the left block is `display: contents` under 1024, so the card can stand
     between the character and the promise there, and a flex column from 1024.
  5. **The page with an account**: the `<main>` was 680 wide with the card at 440 on its left, so the card fell at
     668 where the usable centre is 764 and every block under it was 240 wider than it. The column is now the
     card's width plus its margins (`width="card"` on the shell: 440 + 2 x 24), so everything shares two edges and
     centres itself, with nothing to centre by hand.
- **The acceptance tests**, in `test/browser/home-flat.spec.ts` for what needs no account: (1) no element with a
  blurred filter or a blurred shadow, `body::before` and the card included; (2) at 1440x900 without an account the
  title is 76 px, on the left, two lines, and the whole card is visible on the right; (4) at 390 one column, the
  title at 39, nothing cut across; (5) the title reads "Money that cheers them on." Test (3), the column at the
  card's width with an account, is read on the connected captures, which sign in with a passkey the runner lacks.
- This replaces the composition of D127 (one centred column with the promise under the card at 25) and its relief;
  D127's order stands below 1024. The scale rule of D126 stands: 39, 76 and 20 are its steps.

## D129, 20 Sep 2026: one column, the text above the card, from the phone to the desk

- Statement, the founder's, the same evening as D128 and correcting it: the order is the character, the title, the
  sentence, the card, identical at every width. **The text is always above the card.** D128's two columns had put
  the text under the card on a phone, and that was a regression on the page of that morning, not a choice.
- **Kept from D128, and only this:** the two blurred halos are gone and the ground is a flat; the card has no offset
  relief and no blurred shadow, and keeps its 2 px edge; the title says "Money that cheers them on."; the title is
  76 from 1024 and 39 below; with an account the column is the card's width plus its margins (488) instead of 680,
  so the card and every block under it share one edge.
- **The constraint, over the spacing:** at 1440x900 the whole page stands without scrolling, the title and the card
  included. Where it did not fit, the vertical spaces between the blocks were tightened, never the order and never
  the title. What was tightened, measured on the build: the gaps between the blocks are 12 under 1024 and 8 from it;
  the character is 88 on a phone and 72 from 1024. What made it fit at all is the wide column: the title at 76 takes
  898 px on **one line** there, where a 620 column held it on two and cost 78 px more than the screen had.
- **Measured at the four widths** (`review-captures/measure-home.ts`, on the build): the order is the same at 390,
  430, 1024 and 1440, everything on one left edge (16, 16, 24, 124), and at 1440x900 the page is exactly 900 tall,
  the card ending at 796 and the last line at 868.
- Acceptance in `test/browser/home-order.spec.ts`, day and night, at the four widths: the order, one left edge, the
  title's step, no blur anywhere, nothing cut across, and at 1440x900 no scrolling with the card entire.
- Replaces the composition of D128 (two columns from 1024) and, with it, the last of D127's.

## D130, 20 Sep 2026: the column is centred at every width, and a card offers three lengths and no fourth

- **The column.** The founder, on the production of that evening: the card and the text are not centred. Measured
  across widths on viky.cash: at 360 to 430 the card filled the column and sat centred (16 each side), but from 480
  the card stopped growing at its 440 and stayed on the left, with the air all on its right, 24 px at 480 and 559 at
  1023. The column of the page without an account is now `.home-column`: below 1024 exactly the card's width plus its
  margins, so the card, the text and the footer share two edges and the block sits in the middle of the window; from
  1024 `fit-content`, which is the title at 76 on one line, centred the same way. The order of D129 does not move.
- **The chips.** The founder saw "7 days, 30 days, 90 days" on one screen and "1 day, 30 days, 365 days" on another,
  and asked why the two disagreed. They do not: the chips are the chosen condition's own bounds, and the two screens
  held two different conditions. A daily condition is 7 to 90, suggested 30 (`DAILY_DURATION`); a climb, which is
  what a chess rating is, is 1 to 365, suggested 30 (`src/milestone-conditions.ts`), and that is where the "1 day"
  comes from: the register lets somebody back a single day of climbing. Whether a one-day gift should be offered at
  all is a question for the register, not for the card, and it is asked of the founder rather than decided here.
- **"Other" is removed**, on every size, as the founder asked. With it goes the field it opened and the two sentences
  it carried (`otherLength`, `daysLabel`, `daysUnit` of the offer). **What that costs, said plainly:** a funder can
  now choose only the three lengths the register gives that condition. A gift of 45 days cannot be made from the
  card any more. Nothing else refuses it: the route still accepts any length inside the bounds, so the day it is
  wanted back it is one chip away.
- `test/browser/screens.spec.ts` counts the chips at three and asserts no "Other"; `test/gift-card.test.ts` holds the
  three to `bounds.min`, `bounds.suggested` and `bounds.max`.

## D131, 20 Sep 2026: the diamond in the hollow, a bigger promise, and a composition centred on the desk

- **The desk was not centred, and the founder was right.** Read in his own browser at 1438 x 788: the column was
  `fit-content`, 946 wide and centred (246 each side), the title centred in it, and the card 440 hugging the column's
  left edge, 270 on its left and 728 on its right. A centred title over a left-hugging card is not a centred page.
  From 1024 every block now sits on the window's axis, the card included: the character, the title, the sentence and
  the card are centred, the text with them, and the footer's links too. Measured at 1440: all four centres at 720.
- **The diamond.** The founder asked for a diamond in place of the gift box at the head of the page. It is a fourth
  shape where the brief had three, and it obeys the same rule as the triangle: its corners are rounded, generously,
  so nothing the product draws is pointed. It wears the gift's own tone, the sun with the ink face, and it stands
  without a shadow, because a shape floating in a line of text stands on nothing.
- **In the hollow, on a phone.** It is floated to the right of the title's first lines, in the hollow the title's own
  ragged edge leaves, which is what the founder drew. The text flows around it, so the block starts at the top of the
  page instead of a hundred pixels down: the title's top went from 188 to 88, and the card's from 344 to 316.
- **The promise is bigger on a phone**: 49 instead of 39, the next step of the scale (D126), which puts it above the
  amount on the card under it rather than level with it. It takes three lines at 390 and two from 768.
- **The constraint of D129 still holds**: at 1440x900 the page is exactly 900 tall and does not scroll. It is what
  decided the sentence's width from 1024: at 460 it took two lines and the page measured 914, so it runs on one line
  there. On the founder's own window, 788 tall, the page scrolls: 900 was the height he set, and this is said rather
  than hidden.
- Acceptance in `test/browser/home-order.spec.ts`, day and night, at 390, 430, 1024 and 1440: the order, the text
  never under the card, the block centred on the window's axis from 1024 and the diamond in the hollow below it, the
  title at its step, no blur, nothing cut across, and no scrolling at 1440x900.

## D132, 21 Sep 2026: the title holds two lines, the sentence says what it is, and the characters get their juice

- **The title on a phone.** The founder's screen showed four ragged lines. Two causes, both measured: `text-wrap:
  balance` fights a float, and a float's **margin box** is what the text avoids, so the eight pixels under the
  diamond pushed the second line aside as well. The balancing is gone, the diamond has no margin under it on a
  phone, and it is 80 wide by 50 tall, under the title's 54 of line, so only the first line is narrowed. Measured
  on the build: two lines from 375 up ("Money that" is 254 px at 49 and the first line leaves 270), three at 360,
  and the page went from 920 to 866 at 390.
- **The sentence under it**, chosen by the founder from three: "Back someone's goal with real money. They earn it as
  they do it, and you get back the rest." It names who does what, and it ends on what makes Viky different, where
  the old one opened with an instruction and ran to nineteen words.
- **The diamond, drawn wider than it is tall**, in a box of its own (64 by 40), as asked.
- **The juice** (the founder, on a sheet of glossy jelly shapes): every character keeps its flat fill and gains one
  highlight of two white circles at its upper left and one soft shade lying at its foot, both as their own variables
  (`--character-gloss`, `--character-shade`). No gradient, no outline, no new colour in the range.
- **The head of the page is the one exception, and the founder settled it on an image** of six drawings, night and
  day: it is a blend of its own tone's two colours, the sun into the pink, with the highlight on it, **no shade at
  its foot** (on a shape that wide it read as a beard) and **an edge of 2.2**. The edge is the card's own
  (`--control-border`): the ink by day and the pale by night, because black on the ink ground is no edge at all.
  It is the only blend and the only outline in the product, and `test/character.test.ts` says so by name.
- **The card's own pictures.** The day characters are 52 where they were 42: at 42 a sleeping day is a capsule
  seventeen pixels tall, which is what the founder could not read. And a climb on a card being filled in draws its
  character alone: its meter's bar belongs to a gift that has been read, and before any reading it was an empty
  rounded line that said nothing, which is the strange horizontal bar he saw.

## D133, 21 Sep 2026: the head character takes its place, and the card gets its air

- **The head character's edge, in the founder's own two colours**: the ink at night, a light yellow (`#FFE7A8`) by
  day. He asked for it knowing what it costs: that yellow on the lavender ground is under the 3:1 a border needs
  when it identifies a control. This one identifies nothing and decides nothing, it is the drawing at the head of
  the page, and the trade was his to take. `--character-hero-edge`, read by `test/design-tokens.test.ts`.
- **Its size and its place, chosen on an image** of four placements shot on the real page, night and day
  (`review-captures/hero/four-placements.png`): in the hollow of the title's first line, at the column's right
  edge, and bigger, 86 wide by 54 tall. 86 is not a taste, it is the largest the hollow takes: at 54 tall the
  shape is exactly one line of the title, and a pixel more bites into the second line and breaks the title into
  three. Measured after: two lines from 390 up, three at 375 and below.
- **More air against the screen's edge**: the page margin on a phone goes from 16 to 20. The founder read the page
  as cramped on a real handset, where a browser window on a desk is always kinder. It costs the title its second
  line at 375 and below, which is said rather than hidden.
- **The card.** The condition line sits eight pixels lower: it is a control, and at the four pixels a caption gets
  it sat on the name's own box. And a gift with a goal to climb draws its one character in the middle of the card
  rather than at its left margin, where a single shape read as a row that had lost the rest of itself.

## D134, 21 Sep 2026: a blend per appearance, an edge that is not black, bigger days, and a shorter sentence

- **The night edge is not black.** The founder asked for a dark blue or violet, a shade above the ground and no
  more: `#2A2247`, which measures 1.25:1 on the ink. Black had made the shape look bitten out of the page rather
  than outlined.
- **The blend is not the same by day as by night**, because the founder could not see the head character on the
  lavender. Measured on that ground: the sun is 1.12:1, our pink 1.72, our violet 1.63, our blue 1.58. So the day
  takes pink into violet, chosen on an image of the three (`review-captures/hero/day-blends.png`), and the night
  keeps the sun into the pink, which reads on the ink. Two variables, `--character-hero-from` and `-to`, and the
  head character is the one character that names no colour of the range.
- **The days are bigger, twice asked for**: 60 on a card, where 42 left a sleeping day seventeen pixels tall and 52
  was still small. And the sleeping shape itself is taller in its own box, because a day that sleeps is still a day:
  at a quarter of its box it read as a line rather than as a character.
- **The sentence under the title, shorter**, chosen by the founder from three: "Back their goal. They earn it day by
  day, and the rest comes back to you." Fifteen words where there were seventeen, two lines on a phone where there
  were three, and the difference still at the end of the sentence.

## D135, 21 Sep 2026: the title asks for the gesture, and the icon is the head character

- **The title is an instruction now**: "Send money that motivates." The founder wanted the page to ask for the
  gesture. Measured in the real face before choosing, and the choice was his between four: this one is 955 px at 76,
  the same width as the old title, so the desk keeps its single line; on a phone it takes three lines at 390 and two
  at 430. "Send money that cheers them on." was 1138 and cost a line everywhere; "Send money that cheers" loses the
  idiom, because in British English "cheers" alone means thanks. The honesty rule stands: nothing here claims a
  durable change of behaviour, only that money motivates while it runs.
- **The icon is the diamond**, on the ink tile, which is what the product looks like at night. The link preview
  keeps the gift box, because what it previews is a gift. `pnpm make:icon` writes both, and the standalone drawing
  now carries the head character's own variables, which live in the stylesheet and not in the palette.
- **The night edge is lighter again**, at the founder's second asking: `#3B3266`, 1.62:1 on the ink, where the
  first try was 1.25.
- **The chips were never wrong.** The founder read "90 days" where he expected 365: the three lengths are the chosen
  condition's own (a daily lesson is 7/30/90, a rating to climb 1/30/365, a certification 30/120/365, the Duolingo
  test 14/90/180). He confirmed he was reading a daily lesson on a page the service worker had kept. Nothing changed.

## D136, 21 Sep 2026: one gesture, one result, on all six conditions

- **The defect, measured on the screen by the founder.** On the page without an account, with a daily condition
  chosen, pressing "What they will do" reopened the catalogue, and the condition's own step was unreachable: the
  funder could not name the account, choose the course, or set the bar for a day. On a certificate the same gesture
  opened its questions, because choosing a condition lands on them. Two conditions, two behaviours, one gesture. All
  of the content existed already in `src/conditions.ts`; nothing had to be written.
- **The card carries a detail line** under the condition, for every condition the register gives a `detailTitle` or
  a certificate's `detailQuestion`, and pressing it opens that condition's own step (`WillSheet` takes `at`). The
  condition line still opens the catalogue. `src/card-detail.ts` says what the line reads, from the register's own
  words and never a summary of ours.
- **Nothing given is still something said.** On a daily condition an empty name is a real answer (D27), so the line
  reads the register's own sentence, "They name their own when they open it", beside the bar for a day. On a climb
  or a certificate, which must be answered, it reads "Not filled in yet".
- **The courses are the profile's own.** Once a name is checked, the list is what the source answered, the course it
  says is current first, each line carrying the experience won in it; the choice at the top is "Any course on that
  profile" and it is what is selected, because nothing should be chosen for the funder and the whole profile is the
  answer that cannot be wrong. Without a name there is no list, and the step says the courses appear once a name is
  given, and that without one any course counts. The gift stays creatable either way.
- **Two sizes, again**: the lone character of a climb on the card is 60, like the days beside it, and the small
  milestone character is 44 where it was 24.
- **What it cost, and how D137 gave it back.** The detail line made the card 648 where it was 506, and at 1440x900
  the page measured 1006. The founder chose the third way out the same night: the line went behind the one control
  it belongs to, and the characters are drawn in the box they fill. The card is 549 and the page is 900 again.
- Acceptance in `test/browser/detail-step.spec.ts`, on the four viewports: on each of the six conditions the detail
  line opens that condition's step and never the catalogue; with the name "Luis" the step lists the five courses the
  profile carries with their experience, French first, and the whole profile selected; with no name the line is
  visible, says it is optional, and the step says the courses come after. The profile read is stubbed with what
  production answered for that name on 20 Sep 2026, so the check measures our screen and not the source's uptime.

## D137, 21 Sep 2026: one line on the card, a sheet on the window's axis, and names that fit it

- **One line, not two.** The detail line of D136 was a second control on a card the founder wants quiet. What it
  opened now opens from the line that was already there: "What they will do" leads to the catalogue while nothing
  is chosen, and from then on to that condition's own questions, whose first control is the way back to the
  catalogue. What the condition has been told is read on that line, under its name, in the register's words. The
  card is 549 again where the two lines made it 648, and the page stands in 900 at 1440 (D129).
- **The sheets sit on the window's axis.** They were placed by `--page-offset`, which is the navigation rail's
  width, and the page without an account draws no rail: every sheet opened there sat 88 pixels right of centre,
  which is what the founder measured on the catalogue. The bare shell now sets that offset to zero, so the sheet's
  two margins are equal (measured: 440 and 440 at 1440).
- **Names that fit one line.** The card's control holds about thirty characters of the body face on a phone, and
  two conditions ran past it, which is why the cards were not the same height. They are shorter and all of one
  voice, a thing rather than an order: "A Duolingo English Test score", "A puzzle record on Chess.com", "A chess
  rating on Chess.com", "A Coursera certificate", "A certification on Credly". `test/conditions.test.ts` holds
  every name to thirty.
- **Every floorless character is drawn in the box it fills.** A character standing on nothing has no shadow to
  leave room for, and the fifteen empty pixels above each one made every shape look small whatever its width. The
  strip on a card and the row on a gift's page both gain from it, at the same width.
- **The night edge, a third time lighter**: `#4C4189`, 2.14:1 on the ink, after 1.25 and 1.62.
- **The sentence loses its "and"**: "Back their goal. They earn it day by day. The rest comes back to you."

## D138, 21 Sep 2026: a quiet card, an honest install, and an icon that fills its tile

- **The card says less.** Three lines came off it, all for the same reason: each said something the funder already
  knew or almost never needs.
  - "A gift from you" (and "A gift from V" once a name was typed). Material's card anatomy makes the overline
    optional and NN/g's rule for a label is that it carries what the rest does not; on the card a funder is filling
    in, above a page that says "Send money that motivates", it carried nothing. It stays where the reader is
    somebody else: on a gift's own page and on the cards of the list.
  - "During the pilot, a gift is at most $1,000." It is a rule almost nobody meets, and it spent a line of every
    card. It is now what the amount says back to somebody who types past it, under the figure, where a refusal
    belongs. The words and the bound are unchanged.
  - What the chosen condition had been told, which D136 had put on the line and D137 under it. The line is the
    label and the condition's name; what it has been told lives in the step the line opens, one press away.
  The card measures 483 where the two lines of D136 made it 648.
- **The install offer never claims the phone.** It said "Viky is on this phone", and it kept saying it after the
  founder uninstalled, leaving no way back in. A page cannot know that: `display-mode: standalone` says only that
  this window was opened from the icon, and a browser stops firing the install prompt while it believes the app is
  there, which on Android outlives removing the icon. So: nothing when this window is the installed one, the
  browser's own prompt when it gives us one, and otherwise a sentence saying where the browser keeps the same
  thing. The display mode is watched rather than read once, and `appinstalled` is listened to.
- **The icon fills its tile**: the drawing takes 92 per cent of the square where it took 74, which left it mostly
  empty.

## D139, 21 Sep 2026: the money leads, the card sends, and the blend is CSS

- **The blend is set in CSS, not in an attribute.** `stop-color="var(--x)"` is a variable inside a presentation
  attribute: Chromium resolves it and other engines leave it alone, which is why the founder's phone drew one blend
  in both appearances while the desk drew two. Measured on viky.cash before the change, Chromium gave the right
  two; the founder's did not. It is `style={{ stopColor: … }}` now, which is CSS everywhere.
- **The card's action says Send**, not Pay: the card sends the money, and the sheet it opens is where it is paid.
- **The install offer lives where it needs no account.** It was on Me, behind a sign-in, so somebody who had
  uninstalled could not get it back. It is a quiet line in the footer of the page anybody can read, and the button
  on Me is unchanged.
- **Signing out lands on the landing page.** It stayed on the page that needs an account, which then had nothing
  on it.
- **With an account, the money leads.** Every account app people already use puts the balance at the top, Wise,
  Revolut and Monzo among them, and NN/g's rule is that the most-sought information comes first: what somebody
  opens Viky to read is what they hold. The card is the one action under it. Without an account there is nothing to
  read and the card leads, which is D129's order, unchanged.
- **The amount is read in the account's own currency.** The gift is signed in dollars, which is what the card takes
  and what the chain holds, so the figure does not change; under it the card says what it is worth in the currency
  this account reads in, with the rate's own day, and nothing at all when that currency is the dollar or when no
  rate answered (decision 1 of 17 Sep 2026).
- **The catalogue follows the register, not the alphabet.** Inside a family the first line is the one to offer
  first, and the founder put the daily lesson before the test because it asks less of whoever receives it.

## D140, 21 Sep 2026: the night a person chooses, the currency beside the figure, and no keyboard on arrival

- **The blend never followed the appearance control, and that is why three fixes changed nothing.** There are two
  nights in the stylesheet: the one a device reports, `@media (prefers-color-scheme: dark) :root:not([data-theme=
  "light"])`, and the one a person chooses, `:root[data-theme="dark"]`. The head character's edge was written into
  both; its two colours were written into the first alone. So pressing the control turned the whole page and left
  the diamond in the day's blend, which is exactly what the founder kept seeing, and every measurement of mine
  passed because it emulated the device and never pressed the control. The colours are in both blocks now, the
  duplicate pair in the first is gone, and **a test compares the two blocks variable by variable**, so a value put
  in one and forgotten in the other fails from here on. Verified by pressing the control: device light, pressed,
  gives the night blend and the ink ground; device dark, pressed, gives the day blend and the lavender.
- **The currency sits beside the figure, never under it.** The line made the card taller, and the card is the thing
  the founder keeps quiet. Nothing at all when the account reads in dollars or when no rate answered.
- **Nothing takes the cursor on arrival.** The card's one empty field had it, which raised the keyboard the moment
  a phone opened the page and hid half of what there was to read.
- **The app a phone installs is painted in the product's own ground**: the manifest's background and theme colours
  were white while the app is ink, so the splash flashed white and then the page. What an installed app draws is
  baked into it when the phone installs it, so the icon a person already has changes when they install it again;
  no code here can reach into that.

## D141, 21 Sep 2026: beside or not at all, and a drawing that fills its tile

- **The conversion is one row with the figure, and that row never wraps.** Put under the figure it made the card
  taller; put beside it in a wrapping row it fell under the figure again on a phone, which is what the founder saw.
  A converted figure carries its rate's own day (decision 1 of 17 Sep), which makes the sentence about 230 pixels
  wide: beside a 39 pixel figure it fits from 480 and cannot below, so below 480 it is not drawn at all. Measured
  after: at 390 and 430 nothing and the card at 483; at 480 and 1440 beside the figure and the card still 483.
- **The icon fills its tile.** The drawing takes the whole width of the square now, after 0.74 and 0.92 both read
  as a small drawing in a large tile. The one exception is the icon a phone is allowed to crop: a maskable icon may
  be cut to a circle, and a shape this wide at 0.8 would have its two points on that circle's edge, so it is drawn
  at 0.7 there and at 1 everywhere else.
- **What a phone already installed does not change by itself.** The splash the founder photographed is the WebAPK's
  own, baked when the phone installed it: the old gift on white. The manifest now says ink (D140), and Chrome
  refreshes a WebAPK on its own schedule; installing it again is the only immediate way. This is written here
  because it will be asked again.
- **Why there is no install offer inside the installed app**: there is nothing to install there, and a page cannot
  honestly say more (D138). In a browser tab it is in the footer of the landing page and on Me: measured on
  production, the landing page's controls end with "Install Viky on this phone". The way to tell which one you are
  in is the address bar.

## D142, 21 Sep 2026: the ink under the one action, and the launcher's own icon

- **The action stands on ink.** The rendered mockups drew three pixels of a darker yellow under the sun button, and
  against a sun fill the founder read that as no thickness at all. It is the relief colour now, four pixels of it,
  which is the ink by day and the night's muted lavender after dark: the same slab every other control in the
  product stands on, and the press that flattens it is unchanged. `--sun-deep` stays for the day row's hover and
  nothing else.
- **The launcher gets its own icon, at 512.** Android prefers the largest maskable icon, and the only one we gave it
  was 192, upscaled into a 512 slot, which is what made it look small and soft on the founder's home screen. There
  is a 512 maskable now beside the 512 that nothing crops. The drawing in a maskable one is at 0.78 of the square:
  a maskable icon may be cut to a circle whose diameter is 80 per cent of it, and the two points of a diamond are
  its farthest pixels, so 0.78 is as large as a shape this wide can be drawn there without losing them.
- **"What's missed comes back to you."** Shorter, and it keeps what matters: whose money it is on the way back.

## D143, 21 Sep 2026: a gift is typed in the currency the person reads in

- **The question, the founder's**: why must a card show dollars, when a funder in the euro area meets a dollar sign
  on the first screen and reads "this app is not for me"? And what do the apps of the kind do?
- **What they do.** Wise, Revolut, Remitly and every remittance app take the amount in the currency of whoever is
  paying and show the other side as an estimate with its rate. Nobody makes a payer type in a currency they do not
  hold. The founder chose that model, on an image of three.
- **What cannot move.** The chain holds dollars: the escrow, the terms that are signed, and what is released day by
  day are a dollar figure. No screen may pretend otherwise, and the card says that figure beside the one that was
  typed, "$30.00 in their name", because that is what the contract will hold.
- **What the card does now.** The field takes euros or CFA francs and carries the currency's own mark; what is
  typed becomes dollars at the day's rate from the European Central Bank, cut to the cent and never rounded up, so
  what is signed is never more than what was asked for. The action and the note speak the same currency: "Send
  €26.18", "€0.87 a day". A franc is whole and grouped where it is read. An account that reads in dollars sees
  exactly what it saw before, and so does every test that runs in English.
- **The bounds stay the contract's** and are said in both: "The smallest gift is $1.00, about 0.87 EUR", "During
  the pilot, a gift is at most $1,000, about 866.78 EUR".
- **What is not done, and is the next thing to ask for**: the cards of the gift list and a gift's own page still
  print dollars, and the starting figure is a round thirty dollars, which reads as €26.18 to a French phone rather
  than a round thirty euros. Both are a sweep of their own.
- **The language stays English for the pilot** (the founder, same evening). The norm is the device's language,
  which Duolingo, Wise and Revolut all follow, and our 630 sentences with their tests are a day of work to
  translate and re-read: the five first users are chosen by the founder, and the hackathon is judged in English.

## D144, 21 Sep 2026: the money sign is the control, and the contract is nobody's business

- **The sign is drawn in the text face.** Fredoka's dollar and euro are the face's own idea of a money sign, and the
  founder reads them as unreassuring on the one figure of the screen. The mark keeps its size and takes DM Sans,
  which draws them the way every bank does. The figure stays in the title face.
- **The sign is how a person changes what they read in.** Pressing it takes the next of the three, dollars, euros,
  CFA francs, and everything on the card follows: the field, the action, the line under it. A visitor without an
  account had no page to set that on, and the account page's choice stays what follows a person across devices: a
  press writes it there too when somebody is signed in, and into the tab's own memory when nobody is.
- **"$30.00 in their name" is gone.** It was the contract speaking: a person who is not in crypto has no use for
  the figure the escrow holds, and nothing obliges us to print it. What is true is still true, and it is said where
  it matters: the sheet that pays shows what is paid, and the gift's own page shows what is held.
- The mark is a control, so it is 48 by 48 like every other, pulled back by its own padding so the sign still sits
  against the figure.

## D145, 21 Sep 2026: the money marks are drawn by hand, and a row fades where it hides something

Three defects the founder found on the card, each of them a thing the screen was saying that was not true.

- **The mark is drawn, because neither face could carry it.** D144 put the dollar and the euro in the text face,
  and beside a figure in the title face they are visibly another hand, which is what the founder saw. Both symbols
  are now drawn: the conventional skeleton, an S through a bar and a C through two bars, in one even stroke with
  round ends, which is the line the characters are already drawn in. They are built to the measured figure rather
  than to taste: Fredoka 600 at the card's 39 pixels is 29 tall with a 6.5 stem
  (`review-captures/measure-fredoka.ts`), so the stroke is 6, the euro stands 29 on the line, and the dollar's bar
  is the one thing that passes below it. Everything is in `em`, so the mark is the same mark at any size.
- **The mark stands in front of the figure in every currency.** The CFA franc's name used to follow it, the way it
  is written in prose, so pressing the mark moved the field itself from one side of the box to the other. The
  franc's letters now lead, at 0.58 of the figure, which is what every money app does with a code rather than a
  symbol and what keeps three letters from reading as part of the number. All three marks sit in the same 48 pixel
  control, so the field stands in the same place whichever currency is read: measured at 85 pixels in all three.
- **A row of days fades at the end that still hides a day, and only there.** The right end faded whatever it held,
  which dimmed the last day of a gift nobody could scroll, and the left end never faded at all, which cut the days
  clean off on a gift's own page, where the row opens on today with the first days behind it. Each fade is now as
  long as what its end actually hides, up to a day's width: a row hiding seven pixels fades by seven. It is a mask
  on the row rather than a patch of paper painted over the last day, because the same row sits on the card, in the
  gift list and on a gift's page, and a patch has to know what colour is behind it. The cards of the gift list had
  no fade at all before this.

## D146, 21 Sep 2026: a screen arrives, which is the first step of the motion roadmap

The founder's roadmap of 21 Sep 2026 orders the movement the product already has numbers for, one step per change.
Step one is the arrival on a screen, which is the second of the four triggers the tokens name.

- **What happens.** On every page change, what the page carries enters: it rises 8 pixels and comes up from nothing
  in 250 ms on Material's standard curve, once. That is `MOTION.reveal` exactly, read from the token file by
  `test/motion.test.ts`, and it is the movement the sheets already make in their own way.
- **What does not.** The mark and the appearance control beside it stand still. They are in the same place on every
  screen, so a page change is not something that happens to them, and a thing that jumps while everything else
  arrives reads as a fault. Nothing else on the page is exempt.
- **A block that arrives after its data enters too**, because it is a new block on a page that has already arrived:
  a gift's page waits for its card, and the card enters where it lands rather than appearing. This falls out of the
  rule rather than being asked for separately.
- **Reduced motion keeps the arrival and drops the rise**: the fade alone, at the same 250 ms. Apple's own technique
  is to replace a movement with a fade rather than to take it away, and a fade moves nothing. It is the one place in
  the stylesheet that names an animation for that query, and it has to say its duration again, because the rule
  above it cuts every animation on the page to nothing.
- **How it plays at all.** `app/template.tsx`, which is Next's own way: a template is given a key of its own, so
  "DOM elements inside the template are fully recreated" on navigation, and a CSS animation plays when an element is
  built. It wraps nothing: a `<div>` there would hold the bar of destinations, which is fixed to the window, and for
  those 250 ms the bar would travel with the page.
- **Where it was measured.** The founder asked for the way through the product itself rather than the pages of the
  footer: the landing, me, the gifts, a gift and the way out each enter on arrival, and a page change pressed inside
  the app enters too, measured on the built app as every block's `animationstart`.
- **One side effect, written down.** A screen that is still arriving is measured through a transform, in floating
  point, so a control exactly 48 pixels tall reads 47.999999999999996 and failed the rule it passes. The tap target
  check now rounds to a hundredth of a pixel before it compares. The rule is 48 CSS pixels, and that figure is 48.
- **What is not done, on purpose.** The cards in a gift list already answer the scroll (`Reveal`), and whether a
  card already in view should enter when its data lands is step 5's question, not this one. Nothing else in the
  roadmap is touched: no character reaction, no arrival replay, no confetti.

## D147, 21 Sep 2026: Home arrives once, in order, and then stops moving

The founder on the arrival built the day before: "les animations des pages sont un peu trop basique, toutes les
cartes qui s'affichent en meme temps", the money and the way out "clippent en s'affichant", the rate line
"bouleverse l'UI pour rien alors qu'on veut pas afficher ces choses au user", and the landing "fait clignoter l'UI".
Four faults, and the last one was not about animation at all.

- **The landing was rebuilt on every visit, and that is the blink.** React refused the page the server sent and
  built it again from nothing: "Hydration failed because the server rendered text didn't match the client" (React
  error #418), on one sentence inside the paying sheet. `settlingTimeInWords` wrote the hour in the language of
  whoever rendered it: "8:00 AM" from a server in English, "8:00" from a French phone. The product speaks one
  language for the pilot, so its clocks do too: `PRODUCT_LOCALE` in `src/moments.ts`, used by every clock a screen
  prints. Measured before and after on the built app: the landing's blocks entered twice, 85 ms apart; they enter
  once now. The cost was never only the blink, it was the whole page thrown away and rebuilt on every visit.
- **The blocks arrive one after another**, 50 ms apart, which is Material's shortest published step, and none waits
  more than 200, so a page of any length has arrived inside 450 ms. A page that groups its blocks in one box says
  so with `arrives-in-turn`, and its children take the turns instead of the box: on the landing the words arrive,
  then the card, where before the two faded in as one flat rectangle.
- **The money block keeps one shape whether it knows the figure or not**: the heading, the amount and the line
  under it, with a quiet placeholder at the size a figure takes while the balance is read. It was two lines and
  then four, so the page moved twice before it had said anything.
- **The way out keeps its place.** The room the button takes is held while the balance is read, on a device that
  saw money here last time (`useSawMoney`), so the card under it does not jump when the answer lands. A first visit
  holds nothing, and an account with nothing to take never keeps a hole where a button is not.
- **"About, at the rate of 18 Sep 2026: $10.13" is gone.** It is the contract speaking, which D144 already took off
  the card, and it arrived a beat after the figure and pushed the whole page down for it. What is really held is
  said where money leaves: the way out leads with the dollar and says the euro as an estimate.
- **A device that holds a passkey for this app draws its own Home from the first render**, rather than the promise
  page for as long as the session cookie takes to come back over the network. The browser knows before the server
  answers; the figures still wait for the answers they need.
- Measured on the built app at 390 wide, with the balance answering 350 ms late and the gift list 550 ms late: the
  card sat still at 286 through the whole arrival for an account with money, and at 210 for an empty one. Before,
  it stood at 322, then 189, then 308.

## D149, 21 Sep 2026: a passkey on the device is not a session

D147 made Home draw its signed-in face as soon as the browser said it held a passkey for this app, so that a person
coming back would not meet the promise page while the session cookie travelled. It was wrong, and the founder met it
on his own phone within the hour: signed out, with a passkey still stored from an earlier account, he was given the
signed-in page. Three dots where his money would be, the line about keeping it, no promise, no character, no way in,
and nothing to load because there was no session. "Comme si ça me connectait arbitrairement à rien, alors que je
suis sign out."

- **The page waits for the answer to the question it is asking.** Whose page this is, is a session, and only the
  session answers it. A passkey on the device says that somebody signed in here once, which is not the same thing:
  signing out leaves it exactly where it was, on purpose, because it is how the next sign-in finds the account.
- **What it cost to get the flash instead.** A returning person meets the promise page until the session comes back,
  which is about a tenth of a second on a fast network and longer on a train. That is the price, and it is paid
  rather than guessed at. The blink the founder reported before this had a different cause and is still fixed: the
  page was being thrown away and rebuilt whole (D147, the clock's language).
- Everything else of D147 stands: the blocks arrive in turn, the money block keeps one shape, the way out keeps its
  room, and the contract's figure is not printed on Home.

## D148, 21 Sep 2026: the character is there, and it answers

Step 2 of the founder's motion roadmap, and the only part of it the tokens had not already decided: what a character
does when somebody is doing something. "Ce n'est pas un ornement : c'est lui qui réagira."

- **It stands on four screens now**, where it stood on one: the page without an account, a gift's own page, the
  sheet that pays and the way out, in the same corner of the head each time. It is the same drawing at 72 wide in a
  head beside a way back, and the page without an account keeps its own 86 floated into the title's hollow.
- **Two expressions, built from the parts it already has**, with nothing new drawn. On the line that says what they
  will do, the gaze turns towards that line and the mouth opens a little: curious. On a length, the eyes narrow into
  a smile and the mouth widens a touch: happy. Where the line is, is where it looks: the direction is measured from
  the character's own box to the control's, which is the arithmetic the pointer's gaze already does.
- **A pointer hovers, a finger cannot.** With a pointer it is the hover, 200 ms there and 200 ms back when the
  pointer leaves (`MOTION.hover`). With a finger there is no hover at all, so the expression plays once when the
  choice is made and comes back by itself: one movement of 700 ms, in, held for 300, and back, which is Material's
  extra-long1 made of its own steps. Nothing plays on a clock and nothing repeats.
- **How the two ends meet.** The character is at the head of the page and the controls it answers are inside the
  card below it, so they are never in the same component: the controls write what they are being asked about to a
  store (`app/kit/mood.ts`) and the character reads it, the same shape `src/card-draft.ts` already uses.
- **What it keeps.** Each movement writes the face it reached into the drawing and lets go, so the next expression
  starts from the face that is there and the pointer's own gaze keeps writing to the same place. Under reduced
  motion the face stays at rest, pressed or hovered.
- Measured on the built app: at rest every part is the identity; curious moves the gaze 2.5 pixels down towards the
  line and takes the mouth to 1.6; happy takes the eyes to 0.34 and the mouth to 1.18 by 1.08; the pointer leaving
  puts all three back. On a phone, a length pressed plays it once and is back inside a second.

## D150, 21 Sep 2026: the test that failed one run in two, and the two faults behind it

One browser test had been failing in about half of the full runs since 20 Sep, on whichever width lost the race, and
had been called a flake twice in three pull requests. It was two faults, and neither was in the test.

- **A service worker answers requests a test meant to answer itself.** The course list showed a real Duolingo
  profile with eighteen courses where six were stubbed: the stub is a `page.route`, and a request made by the
  service worker never goes through it. Whether it happened depended on whether the worker took the page over
  during that test. Workers are blocked in the browser tests now (`playwright.config.ts`): what a worker does is
  not what these tests measure.
- **Blocking it uncovered a fault of our own**: with a registration refused, the library reads `registration.waiting`
  on a registration that never came, and every screen throws a TypeError at load. A private window, a policy, a
  blocked worker: the app threw on every page and nothing said so. The worker is registered by `app/serwist/Register.tsx`
  now, where the refusal is caught, rather than by the provider, which does not watch what comes back.
- **And one fault the hunt found on the way.** The card told the sheet two things, whether to open and which of its
  two faces to open on, and a sheet can only be right if they arrive in the same render. A click that lands while
  the page is still being hydrated is replayed by React, and the two changes were then applied one after the other:
  the sheet opened on the face of the last time and kept it. It is one value now, `openAt`, shut or a face, so the
  two cannot be split. The sheet also decides its face when it is built already open, which it could not before.
- **A measurement taken while something is moving is a measurement of the movement.** The sheet rises 24 pixels when
  it opens, and the test that checks its action is whole was reading it on the way up. It waits for the sheet to
  have arrived now, as the arrival tests do. Two full runs, 264 passed, none failed.

## D151, 21 Sep 2026: the blink was a clock, and a mark that ran ahead of its figure

The founder, on the landing: "d'abord elle affiche la carte a 30$, ensuite seulement elle se recharge en clignotant
et je vois le montant dernierement choisi dans la currency choisie mais du coup il y a des racing conditions".

- **The page was still being thrown away and built again**, and D147 had only found half of it. The sheet that pays
  says when a missed day comes back, "about 09:00 your time", in the reader's own clock. A server has no idea which
  clock that is: the page is rendered in UTC at build time and read in Paris, so the two texts differ and React
  discards the whole page. Fixing the language of the clock (D147) left the zone, and the zone is invisible on this
  machine, where the test server and the browser share it. The hour is printed once the browser has said what it
  is, never before, which is what a gift's page already did with the same sentence.
- **The tests read in a zone that is not the server's** (`timezoneId: "America/New_York"` in `playwright.config.ts`).
  With the fault put back, the landing fails on all four widths; with it fixed, all four pass. A fault that only
  production can see is a fault nobody sees.
- **The mark ran ahead of its figure.** The currency is known as soon as the page runs, the rate arrives over the
  network a moment later, and every figure falls back to the dollar until it does: for that moment the card printed
  "CFA 51.56" for a gift of 29,512 francs. The mark falls back with the figures now: the screens read in the dollar
  until a rate makes another currency true, so both change in the same instant.
- **What is left, and it is not a blink.** A device that kept a card shows the starting card first and that card a
  tenth of a second later, in one change: the page is static, so the server cannot know what this device kept.
  Removing that last change means a page rendered per request, which is a bigger trade than the change costs.
- **The door says "Sign in"** (the founder: "c'est trop long"). It named both of the things it does; the sheet it
  opens says that in its own line and its action is still "Create your account".

## D152, 21 Sep 2026: the currencies are a list that is asked for, and the sign is a key

The founder: "LE CHANGEMENT DE DEVISE : UNE LISTE, PAS UN CYCLE." Pressing the sign took the next of three, so
nobody could know what existed or how many, going from the dollar to the franc meant passing through the euro and
redrawing the screen twice, and the gesture stops working at all past five entries.

- **The list is derived, never typed**, which is D39's rule applied to what a screen reads in. A currency is offered
  when somebody can be paid in it, the union of the euro rail's payout methods and the card rail's fiat list, and
  when we can convert into it honestly, the European Central Bank's daily file plus the two CFA francs, fixed to the
  euro by treaty. Measured through our own route on 21 Sep 2026: 71 payable, 32 with a rate, **31 offered**. The
  yuan has a rate and no rail, and a test holds that it never appears. When a source says nothing, the three the
  product was built on are offered, because they are proven; never a longer list written by hand.
- **What a currency is called, its sign and its decimals are asked of `Intl`**, not kept here either: "Indian
  Rupee", "₹", two decimals; "Swiss Franc", "CHF", standing away from its figure; the yen and the franc counting in
  whole units. Even the space between a sign and its figure is read off what `Intl` formats rather than decided.
- **The sign is a key.** It carries the two pixel edge and the four pixel relief every control here wears, a chevron
  at the small voice's size against it, and the 48 by 48 the product keeps, which clears the 44 the founder asked
  for. Its name says what it does and what is being read: "Read in another currency, Euro now". Under a pointer it
  lifts two pixels, a press crushes its relief: `MOTION.hover` and `MOTION.press`, which the class already plays.
- **It opens a sheet and changes nothing by itself.** Each line carries the sign, the name, the code, and on the
  right the amount on the screen converted into that currency, because that is what makes the choice useful rather
  than administrative: €26.18 beside ₹2,876.32 beside FCFA 17,172. What the device suggests comes first under
  "Where you are", the rest by name under "All currencies", the one being read is filled, and the rate's day is said
  once at the foot. While the rate is still coming, the sheet says nothing about it: not yet is not no.
- **What this supersedes.** D145 fixed the mark in a 48 pixel box so the field never moved: with thirty-one signs,
  from "$" to "F CFA", a fixed box would cut them, so the key sizes to its sign and the field sits after it.
- **The account page uses the same key and the same sheet**, so there is one way to change what money is read in,
  and its list of three names is gone with `DISPLAY_CURRENCIES`.

## D153, 21 Sep 2026: a page does not restart itself under somebody

The founder, on his phone: "la landing clignotte encore quand je la lance. Ca ne le fait plus sur desktop mais sur
mobile oui. La landing a l'air de se charger 2 fois de suite." It was loading twice, and this time literally.

- **The worker's provider reloads the whole page on every `online` event.** `SerwistProvider` takes
  `reloadOnOnline` and it defaults to true; the handler is `location.reload()`. A desktop on a steady connection
  never fires that event. A phone fires it when it finishes connecting, when it wakes, when it changes network,
  which is exactly when somebody launches an installed app. Measured: dispatching one `online` event took the page
  from two navigations to four; with the option off, it stays at two.
- **It is off, and nothing else in the app may ask for a reload.** A page that restarts itself throws away whatever
  was being typed and shows the arrival twice, and the person who did nothing is the one who pays for it. A test
  holds both halves: the option in `app/layout.tsx`, and no `location.reload()` anywhere in `app/`.
- **What this was not.** The two earlier causes were real and both are still fixed: the page thrown away over a
  clock written in two languages (D147), and again over its zone (D151). This one only ever showed on a phone,
  which is why two rounds of measuring on a desktop found nothing.
- An installed app keeps the build it was launched with until its worker updates, so the first launch after this
  can still carry the old one. The second launch is the one to judge.

## D154, 21 Sep 2026: the character on every screen, the lists in turn, a press a finger can see

- **The character stands on the three screens of the app** as well, Home with an account, the gifts and the account
  page, at the end of the title's row. It was on the landing, a gift's page, the sheet that pays and the way out
  (D148), which is not where a signed-in person spends their day.
- **The cards of a list arrive one after another**, 50 ms apart, seven turns deep and then together, inside the box
  that holds them (`arrives-in-turn`): a list is where a cascade says something, and a page of cards that faded in as
  one rectangle was the "assez artificiel" the founder named.
- **A press a finger can see.** The relief collapsed on `:active`, which a mouse holds and a finger does not: a tap
  is over in milliseconds and Chrome waits before applying `:active` at all, so on a phone the movement only showed
  when the button was held, which is also the one way to make a press miss. On a device without a pointer the press
  is now held for its own 120 ms and given back (`app/kit/Pressed.tsx`), the same movement, on the gesture that was
  made. Measured: a short tap goes down four pixels over 120 ms and comes back, and the chip is chosen.
- **The door keeps one width**, "Sign in" and "One moment" in the same box of ten characters, so the mark beside it
  never moves while the passkey is open. Measured 125 pixels in both states.
- **The currency key loses its relief** (the founder): it sits inside the field's own box, and a slab inside a box
  read as two boxes. The edge and the chevron still say it is pressed.

## D155, 21 Sep 2026: the worker keeps nothing about a person, and no figure is shown before it is true

The founder, after three fixes to the landing's blink: "toujours ce fichu clignotement... ça fait ça sur chaque page,
la landing apparaît une fraction de seconde puis enfin la page voulue se charge... l'erreur où 30$ est affiché par
défaut puis la landing recharge avec le montant personnalisé existe encore... Pourquoi on arrive pas à gérer l'app
dans son ensemble ?" He was right on every count, and the reason it survived three fixes is written here.

- **What it was.** The service worker's default kept every page, every payload the router fetches and every answer
  under `/api/`, network first with a fallback to the cache, for a day. Across the eight deploys of that day, on a
  phone on a slow network, that meant: a page served from the previous build whose files were gone, so the page
  loaded twice; "nobody is signed in" served from the cache to somebody who was, so the landing showed before every
  screen; a balance from the morning. None of it can be seen from a fresh browser on a fast network with one build,
  which is where every measurement had been taken. Reproduced by installing the worker on one build, serving the
  next, and opening a page by its address on a throttled phone: the document came through the worker, the session
  answer came through the worker, and the page loaded twice.
- **What the worker keeps now** is what cannot be wrong: a build's own files, named by their content, kept a day so a
  screen open across a deploy can still load the piece it asks for next; the fonts and the drawings; and the offline
  page, the one thing precached, named for its build. A page, a payload and an answer about somebody come from the
  network and from nowhere else. A previous worker's caches are deleted the moment this one activates. The offline
  fallback was also never precached before, so it had never worked.
- **No figure is shown before it is true.** The page is static and drawn once, thirty dollars in dollars. A device
  that kept a card, chose a currency, or sits where the dollar is not the currency says so before the first paint
  (`src/money-boot.ts`, the same trick as the appearance), and the card keeps its figures out of sight until the
  rate has answered. Measured on a throttled phone with a card kept in francs: "30.00" hidden at 46 ms, "51.56"
  hidden at 79 ms, the person's own 29,512 the first figure ever shown, at 409 ms. A device with nothing kept and
  nothing to convert sees the thirty dollars at once, because for it they are true.
- **What "gérer l'app dans son ensemble" means from here.** Every fix before this was measured on a fresh browser
  against a single build. The founder's phone carries yesterday's worker, yesterday's cache and the previous deploy,
  and that is the condition to measure in. `review-captures/stale-worker.ts` does it: install on one build, deploy
  the next, open a page on a slow network. It is the check to run before calling any load-time behaviour fixed.

## D156, 21 Sep 2026: a screen for a person is drawn as theirs from its first byte

The founder, after D155: "NON, on a TOUJOURS un double load de la landing... c'est quand on reload la page." He was
signed in, on his phone, reloading.

- **What it was.** Every screen was built once, at deploy time, for nobody: the landing, the gifts page's "sign in"
  panel, the account page's door. Who was signed in was learned in the browser, by asking the server after the
  page had run. On a desktop that is a tenth of a second and reads as nothing; on a phone it is half a second in
  which the landing stands, whole, and is then replaced by Home. That is a page loading twice, seen from a chair,
  and D149 had written it down as the price of a static page rather than fixing it.
- **The server knows, so the server says.** The root layout reads the session cookie while it renders, checks it
  exactly as the routes do, the cookie and the origin it was served on, and seeds the account provider with the
  account. A signed-in person's screen is theirs from its first byte, on every screen, on a reload or on a link.
  The browser still asks the server afterwards, and its answer wins, so a cookie that has gone is noticed.
- **What it costs.** Reading the request makes every screen render on request rather than at build time. That is
  the point rather than a cost: a screen for a person cannot be drawn before the person is known. The worker no
  longer keeps pages (D155), so nothing served stale sits between the server and the screen.
- Measured on a phone profile with an account, reloading Home: the money block is in the first frame, and no
  landing is drawn at any point.

## D157, 21 Sep 2026: the card starts on a round figure in the reader's currency, or on the account's own money

The founder: thirty dollars, yes, but thirty euros in euros and fifteen thousand francs in francs, on the card as it
comes pre-filled and for somebody signed in with nothing in the account; and for somebody signed in with money in
the account, that money. "C'est juste une histoire de confort user design."

- **What it was.** Thirty dollars were written on the card for everybody, and a phone in Dakar read them as 17,172
  francs, a phone in Paris as 26.18 euros: a figure nobody would ever type, on the first screen.
- **Round is a ladder, not a table.** The rung nearest to what thirty dollars is worth, on the ladder every price
  list climbs, 1, 1.5, 2, 3, 5 and the next 1, in the value's own decade: 26.18 euros lands on 30, 17,172 francs
  on 15,000, 2,876 rupees on 3,000, 22.48 pounds on 20. A currency nobody had thought of gets a round figure too,
  and nothing is written per currency.
- **The account's own money leads when there is any** within the gift's bounds: $10.13 in the account is $10.13 on
  the card, 8.78 euros for a reader in euros. Nothing in the account, or under the smallest gift, or over the
  pilot's ceiling, and the round figure stands.
- **What is shown is what is sent.** The starting figure is written into the draft the card works from, as the
  dollars it makes, cut to the cent, so pressing Send without touching the amount sends exactly that; it reaches
  the device the first time anything on the card is changed, and a card somebody already kept is never touched.
  The action repeats the figure as it was asked for: a whole currency does not sit on the cent, so 15,000 francs
  are held as $26.17, which are 14,995 francs, and "Send F CFA 15,000" says what the person asked while the sheet
  that pays says the dollars themselves.
- **No thirty is shown before the account's money is known.** Signed in, the server marks the screen as settling
  (D155's attribute, from the server this time, since the server knows the person), and the card's figures wait
  for the balance and the rate. A device with nothing kept and nothing to convert still sees its round figure at once.

## D158, 21 Sep 2026: a card is the card's until somebody types an amount, and then it is theirs exactly

The founder, on his own phone after D157: "la pas connecté j'ai 26.18 euros affiché, et connecté pareil alors que
j'ai 9 euros dans mon account. Donc je crois pas que tu aies changé vraiment ?" It had changed, and it could not
reach him: what D157 measured was a device with nothing kept, and his had a card.

- **What it was.** A card is written to the device the first time anything on it changes: a length pressed, a
  condition chosen, a name typed. What was written carried the amount the card came with, "30" dollars, and from
  then on the card read that back, 26.18 euros in France, whatever the account held. D157's rule only applied to a
  device that had never touched the card, which after a day of use is nobody.
- **The card now knows whether the amount is its own or the person's.** Nothing typed, and the card follows what
  D157 decided: a round figure in the reader's currency, or the account's own money when it holds any. An amount
  typed, and that amount stands, until it is typed again or the gift is made.
- **What was typed comes back exactly.** The chain holds dollars, cut to the cent and never rounded up, so 45 euros
  are held as $51.91, which are 44.99 euros back: somebody who typed 45 and came back to 44.99 would be right to
  call it a bug. The card keeps the figure as typed and the currency it was typed in, shows it back when that is
  still what they read in, and sends the dollars underneath, unchanged.
- Measured on a device that pressed a length and never typed an amount: 30.00 euros signed out, 8.84 euros signed
  in holding $10.13, and 45 after typing 45.

## D159, 21 Sep 2026: day or night is remembered, and the browser's own bar says what the page says

The founder: "ce serait bien que l'app se souvienne aussi du mode sombre ou clair, car là si on est dans un mode et
qu'on reload ça peut changer de mode et revenir au mode par défaut."

- **The page itself never lost the choice**: measured on production, a press then a reload, on a device set either
  way, kept it every time. What changed on a reload was **the browser's own bar**. The page declared two colours,
  one per appearance the device may be in, and a bar follows the device, never the choice: somebody reading by day
  on a phone set to night had a black bar over a lavender page, which from a chair is the app in the other mode.
  A press did repaint it, and the next hydration rendered the two metas again and took it back.
- **One colour, decided where the choice is known.** The layout renders a single theme colour from the appearance
  that was chosen, and the two device-driven ones only while nobody has chosen. It is the ground the screen stands
  on, the day's lavender or the night's ink; the day's used to be a near-white that was not even a ground of the look.
- **The choice reaches the server, so the page arrives already right.** A cookie carries it, which is the one thing
  a browser sends by itself: the appearance is on the document and the colour is in the head before the first byte
  reaches the phone. Nothing is corrected after the fact, and there is no flash to mask.
- **And the account remembers it**, beside the display currency: a choice made on a phone is the choice on the
  laptop, it comes back to a browser that forgot, and it reaches the installed app beside the browser it was made
  in, which is the one place a device's own storage does not carry. The device answers first because it answers
  before anything is painted; the account answers for a device that has never been told.
- Nothing is stored until somebody presses: a person whose device decides has chosen that.
- **The column was added to production the moment the build went out**, because the build reads it: `appearance` on
  `viky_accounts`, read back beside the five currency choices already kept, which are untouched. Until it existed,
  the read threw and took the display currency with it. The device path is measured on viky.cash; what an account
  carries from one device to the next is proven against the test database in the gate, and is true of production
  from the first press made there.

## D160, 21 Sep 2026: a screen is drawn once, by the server, with what it is about

The founder, three times in two days, and right each time: "quoi qu'on fasse on a toujours un double chargement des
pages. Il y a toujours un premier chargement instantané, avec le mode par défaut sans devise affichée ou alors $, sur
la page gift elle est juste vide, sur la home on a juste '...' au lieu du montant, la landing avec la card vide. Puis
une fraction de seconde après la page se recharge avec les bonnes data." Then the measurement that broke it open:
"c'est visuellement une page qui s'affiche vide pendant un quart de seconde puis recharge visuellement (on voit bien
les micro animations d'apparition) et cette fois avec les infos perso du user. Donc si tu arrive pas a trouver c'est
que le probleme est STRUCTUREL."

- **It was never a second load, and every fix aimed at one was aimed at nothing.** Measured on viky.cash, one
  document is fetched and one only (`review-captures/first-frames.ts`, `documents fetched: 200 /`). The worker, the
  reload on reconnect, the two theme colours: all real defects, none of them this one.
- **What the animations were saying.** Counting every entrance from before the page's own scripts run
  (`review-captures/replays.ts`) on the gift's screen, on a phone on a 4G line:

  ```
   538ms  page-enter  a "Back to my gifts"     the waiting screen
   539ms  page-enter  p "One moment"
  1337ms  page-enter  div "About Viky"         the real one, 800 ms later
  1337ms  page-enter  section "Your gift For sevyb..."
  ```

  Two trees, two entrances. The screen was not filled in: it was thrown away and built again. That is what the eye
  reads as a second load, and it is why nothing about caching ever moved it.
- **The cause, written in our own code.** `src/client/display-currency.ts` said it plainly: "the server snapshot is
  nothing, so the first paint proposes dollars everywhere and the browser corrects it without a mismatch." Every
  money screen was rendered for nobody on purpose, to avoid a hydration mismatch, and corrected in the browser. The
  gift's page rendered "One moment" and fetched the gift it had already read on the server for the link's preview.
  Home rendered three dots and read the balance over the network after the page had been parsed and hydrated.
- **So the server is told the three things the browser knows**, and draws the screen once:
  the **currency** (the account's choice, then the cookie this device writes when the key is pressed, then the
  language the page was asked in) with the **rate** it keeps for an hour; the **card this device kept**, from a
  cookie carrying its figures and none of its people; and for somebody signed in, their **money** and their
  **gifts**, read while the page renders. `src/gift-status.ts` and `src/my-gifts.ts` came out of their routes so a
  page and a request read the same thing the same way.
- **The curtain of D155 is gone**, and with it the script that ran before the paint. It hid every figure until the
  browser had settled them, which is exactly the card with a hole in it the founder was looking at: a card whose
  amount, action and footnote were blank for 605 ms on a phone. Nothing is hidden now because nothing is wrong.
- **A first screen arrives, a page change enters.** The other half was our own step 1: `backwards` fill holds each
  block invisible until its turn comes, so a cold load showed the words standing over the empty space where the card
  goes. A screen reached from another screen has something to have come from and still enters block by block; the
  first screen a document draws has not, and arrives whole, in one fade. Asked once when the screen is built, never
  on every render: read on every render it flips under the screen and everything enters a second time, which is the
  defect wearing a different hat (measured, `review-captures/on-navigation.ts`).
- **What it costs.** A signed-in Home now waits for a chain read before its first byte. That is the trade: a page
  that arrives later and complete, rather than at once and wrong. If the gifts list ever makes that wait long, the
  answer is to stream that section rather than to go back to filling it in from the browser.
- **Names never travel.** The card's cookie carries the amount, the length, the condition and the course. Not the
  two first names, not the account, not the goal's username: a name has no business in a header sent with every
  request for a font. The names stay on the device, so a kept card still asks "For who?" for a moment on a device
  that has one. That is named here rather than hidden.
- **Not done.** The way out still leads with the dollar. `/cash-out` reads its own money in the browser: it is a
  task reached by a press, not a screen somebody lands on.
- **Measured on production after the merge, and one more found.** The landing: one fade, one state at 507 ms, the
  euro in the first byte. The gift's screen: "One moment" gone, but the fade played twice on the same page, and the
  console said why: React error 418, the server's text and the browser's did not match. A date. The server wrote
  "26 Sep 2026" in UTC and a phone in New York wrote the 25th; the settling hour, "2:00 your time", the same. Nothing
  zone-dependent had ever been drawn by the server before today, so nothing had ever disagreed. **The zone travels
  now as the currency does**, in a cookie (`viky.zone`), and `dateInWords` and `settlingTimeInWords` take it. Until
  the cookie exists the server says UTC and the browser starts from UTC with it, then corrects the dates once and
  writes the cookie; every visit after is right in the first byte. Verified in a development build, where React
  names the text: no complaint on the gift's screen from New York, none on Home from Auckland.

## D161, 22 Sep 2026: the shekel is not offered

The funder: "enlève la devise israélienne, on ne la propose pas dans notre app." The list of currencies is not
written down (D152): it is what the rails pay and the rate file converts, and the shekel was in both, so it was
offered. A currency the product chooses not to propose can only be written down, so `NOT_OFFERED` in
`src/currencies.ts` is the one list of its kind, with the reason each entry is there. It is out of the sheet, and a
cookie or an account row that still names it is ignored: such a device reads in what its language proposes.

## D162, 22 Sep 2026: a proof the person shows, from their own account, is the second nature of a condition

The founder, with the product report of 22 Sep 2026 (`Master/data/viky-reclaim-rapport-produit-2026-09-22.md`)
in hand: the connected flow ported from Lock-In is dormant, not absent; take it out of "duolingo"; a shown proof
settles a milestone (form 1) exactly as a reading does; the contract does not change.

- **What was read first.** The Reclaim directory, by its public API (`/api/providers/explore/paginated`,
  `pageKey` and `pageSize`, about 608 pages of 50): "TOEFL MyBest Score", `67ec1b13-b206-4fac-a78c-fbd5a2af55b3`,
  version 1.0.0, active, used by two applications, not verified by Reclaim. Its configuration, fetched the way the
  SDK fetches it (`api.reclaimprotocol.org/api/providers/<id>/configs`): behind the ETS sign-in
  (`v2.ereg.ets.org/ereg/public/jump?_p=TEL`), one request, `GET /ereg/pbs/getPbs?testId=…&source=…`, two fields,
  `$.scores.TOTAL.scoreValue` and `$.scores.LISTENING.bookingId`, WITNESS, no geography. No name, no test date,
  no account id. Our own application accepts it (a session was initialised on it with our keys, never launched).
- **The TEE attestation is a property of the session, not of the provider**: the nonce binds the application and
  the session, `acceptTeeAttestation` is the SDK's default, and `verifyProof` checks every proof carries one. So
  the rule the verify route has always had, TEE required and the AI fallback refused, applies unchanged.
- **Two decisions the contract forced, both the founder's.** (1) *The subject.* Form 1 checks
  `identityHash == subject`, the subject the funder signed at creation; today `hash(source, name)`, checked
  against the name printed on a certificate. The proof carries no name. The subject is therefore **constant per
  condition**, `hash("viky:subject:toefl-mybest-shown:v1")`: the funder signs "a score shown from the person's
  own ETS account", the screen says it in those words, and what binds the person is the account they signed in to
  and the recipient the contract already checks. Level 2, the account, which is the definition of a shown
  condition: the link is the account and the recipient's own account, not a name. (2) *The date.* Form 1 dates the
  event by the day the page itself gives, and refuses one before the gift. The proof has no date. Not
  `eventAt = observedAt` unsaid: until a provider of ours extracts `testDate` (PR 2 builds it on a real ETS account,
  the endpoint carries a `testId` and the MyBest page shows the dates), the condition is a **possession**, "Show a
  TOEFL score of at least X", whose sentence says "a score they hold, shown from their own ETS account; when it
  was earned is not read", and the day it is shown is the event. The day `testDate` comes out, the condition becomes
  "reach", with `EarnedBeforeTheGift`, under its own goal number: `registerGoal` never overwrites, and the two
  senses are never mixed under one goal. Goal **13**, `viky:provider:toefl-mybest-shown:v1` =
  `0xa07cae8e7502221e9a33445deb8f4f5e12d9ccdfd35b5e53d9eb38f32d75db7d`, is the "show" one.
- **The flow, with the source taken out of it.** `src/shown-proof.ts` is the policy every shown proof is read by:
  the context sealed `<giftId>:<phase>` (`baseline`, a day, or `reach`) with the account and the session id, the
  provider and version pinned, every request pinned by its hash, the fields read by the condition's own `read`.
  `src/shown-conditions.ts` is the register of what can be shown, two kinds: a daily one keeps the policy it always
  had (the ownership marker, the profile the baseline bound, the XP since the previous proof are things only
  Duolingo knows); a milestone one takes one proof, turned by `src/shown-verification.ts` into the same `Proof`
  attestation a certificate reading produces and relayed to the milestone contract, which checks it again. The
  routes are `/api/proof/session` and `/api/proof/verify`, keyed by the condition; the Duolingo ones are gone, their
  tests moved unchanged. `viky_proof_sessions` carries `condition_id`. Nothing on a screen calls it yet: that is
  PR 3.
- **What is not verified.** No proof has been shown end to end: the routes are exercised without a network, the
  core with every dependency injected (17 refusals and one success), and production holds no Reclaim application
  id at all (OPERATIONS, "The Reclaim account"). The first real session waits for the Viky application's keys in
  production and for a real ETS account, which is PR 2.
- **The two natures, on the screens (PR 3, the founder's direction 1 corrected).** READ FOR YOU or SHOWN BY THEM,
  in the meta voice the product already has (`META`: DM Sans, 13 px, capitals, a pixel of tracking, the muted ink,
  no fill), before the line of help; on every line of the chooser, chosen or not (the founder, 22 Sep 2026: the six
  conditions), on the card under the condition (on Home, on Gifts, and
  at the head of a gift's own page, which is another component of the same card), on the catalogue, and nowhere
  else, which a guard holds by listing the files. `--on-paper-soft` was asked for and does not exist:
  on the paper `--muted` is already the paper's own soft ink (`app/globals.css`, `.on-paper`), 4.79:1 on it and
  5.05:1 on the ground, so one token does both and no new one was written. A shown condition's page: for the
  person, one button, "Show it", which opens the verification and, once the proof is taken, makes the character
  smile as a day earned does; for the funder as for the person, "Shown on <day>." at the head instead of a meter or
  a row of days, "Nothing shown yet." before. No condition of the pilot is shown yet, so those two render for
  nobody until PR 2; the words are listed in SCREEN-CLAIMS all the same.
- **Not done here, by order.** The TOEFL condition and our own provider (PR 2);
  the measured gesture on real devices (PR 4, the founder's or a tester's phones, never a number from here); the
  public page's sentence (PR 5).

## D163, 22 Sep 2026: the public page says what is being built, line by line

The founder, point 5 of the shown-proof plan: "so nobody can check it: not Viky, not you" becomes "No public page
shows it. The person can show it from their own account, and Viky is building that." And the three lines of the
frontier say which of them are on their way.

- The state "No public page exists" keeps its title and changes its sentence to the founder's. It was true and it
  is still true: it said what a public page cannot do; it now also says what the other reading (D162) can.
- Each frontier line ends on one of two sentences: "Being built: a TOEFL score the person shows from their own ETS
  account, with the two words SHOWN BY THEM on it." on the exams, "Not being built." on state diplomas and school
  marks. A guard holds that exactly the exams are being built; adding a second is a decision, not a default.
- Nothing else on the page moves: the conditions, their natures and their states are as D162 left them.

## D164, 23 Sep 2026: the TOEFL score shown, built up to the ETS sign-in

The founder, 22 Sep 2026: the two variables are in place on Vercel, sensitive, and a sensitive value is never read
back by `vercel env pull`; verify at execution, by a boolean; start PR 2 up to the ETS sign-in screen.

- **The condition.** `toefl-mybest-shown`, nature shown, family language, "A TOEFL score, shown": a score they
  hold, shown from their own ETS account; when it was earned is not read. Not live, and not in the register: D109
  holds that the register contains only what a gift can be made on today, and its goal, 13, is not registered yet.
  It lives in `BUILDING` beside the register, resolvable by id, offered on the chooser to an account that runs Viky
  and to nobody else, so the first real proof can be shown at all. The public page says it on the frontier's line.
- **The shape.** The certificate shape with no name asked (`asksName: false`): the funder sets the score to show,
  0 to 120, and the days; the subject is the condition's own, `hash("viky:subject:toefl-mybest-shown:v1")`, for
  every gift on it; the person is asked nothing to paste, only "Show it". The "show" sense, goal 13, provider id
  `viky:provider:toefl-mybest-shown:v1`; the call to sign is in OPERATIONS.
- **The proof.** The Reclaim provider "TOEFL MyBest Score", pinned (`67ec1b13…`, 1.0.0, one request,
  `0x881b7539…`), one proof, `scoreValue` on the test's own scale as the metric, `bookingId` as the account's key,
  no date claimed. Verified by `src/shown-verification.ts` like any shown milestone and relayed to the contract.
- **Our own provider, for the date and the name.** Written down as a definition to register on the dashboard
  (`docs/reclaim/toefl-mybest-shown-provider.md`): the same request, two more fields attempted, `testDate` and the
  name. A provider is built against a real account, so the fields are marked "to confirm" until one has been
  captured; nothing in the code reads them yet. The day `testDate` comes out, the condition becomes "reach", under
  its own goal number.
- **What is not verified, and waits for a person.** No session has been opened on production: the ETS sign-in is
  the person's own gesture, with the account the gift is for. Until then the flow is exercised without a network
  (749 rules) and the condition stays "Being built".

## D165, 23 Sep 2026: staying enrolled at a university, shown from the person's own student portal

The founder, 23 Sep 2026: the universities, second nature, built entirely except what needs a real student account;
one goal on the chain for the family with the portal pinned in the gift and required at verification; if a reason
for a goal per portal appears, say it in the PR before building.

- **The condition.** `university-enrollment-shown`, nature shown, in a new family "Stay enrolled": "Stay enrolled at
  their university", the page of their own student portal that says they are enrolled, shown from their own
  account; when they enrolled is not read. The corridor's own case, a family abroad paying the year. It lives in
  `BUILDING` beside the register, offered on the chooser to an operator alone, and on the public page as the
  frontier's line "Being enrolled at a university", "Being built: …", so the page says what is on its way without
  pretending it is offered.
- **The shape.** Having it or not: enrolled is one, and the target is fixed. Thirty to 365 days, 180 suggested: a
  semester is not thirty days and a year is long. No name asked. What the funder chooses is the university, from the
  portals Viky has proved, and the portal's id is the subject they sign:
  `hash("viky:subject:university-enrollment-shown:v1:<portal id>")`.
- **One goal for the family, number 14,** `viky:provider:university-enrollment-shown:v1`, shape 1. The portal is
  bound into the subject the funder signs, so a proof shown from another portal fails the contract's own
  `identityHash == subject` check; the proof's provider (Reclaim id, version, request hash) is pinned by the portal's
  row at verification and required: a gift naming no portal is refused `NO_PORTAL` before any session opens. A goal
  per portal would add nothing the subject does not give and would cost an owner signature through the Safe for
  every university. Said in the PR before building, as asked. The call to sign is in OPERATIONS.
- **The table of proved portals.** `viky_portals`, one row per portal proved with a student present: the name, the
  university, the country, the Reclaim provider by id and version, its one request by hash, the sign-in address, and
  the least extracted that means enrolled (one field, one pattern, and in words what is kept). Written by
  `pnpm portal:add` from an operator's command, never by a screen; empty tonight. "Which university?" searches it and
  nothing else, and says so when nothing answers: an empty answer means no portal was proved for those words, never
  that a university does not exist. The chooser reads each answer as the university and its country in words.
- **What is not read.** The portals' terms of use, portal by portal: Reclaim treats them as its own question, and
  the judges page says so, with the risk spread one portal at a time and each portal named in the gift.
- **What is verified, and what waits for a student.** The reading per portal is exercised without a network (the
  portal's provider, another portal's subject, no portal, not enrolled, a broken pattern); no provider has been
  registered on any portal, no row exists, no proof has run. The thirty minutes with a student are written in
  OPERATIONS, and the condition stays "Being built" until goal 14 is registered and one proof has run end to end on a
  real portal with real money, on the founder's word (the rule of D164).

## D166, 23 Sep 2026: a GitHub contribution each day, read by Viky from GitHub's API

The founder, 23 Sep 2026: the GitHub daily condition, "a contribution each day", in a PR of its own, the API's terms
read first.

- **What was read, and what it allows.** GitHub's Terms of Service, section H ("API Terms"): the API may be used
  within its rate limits, tokens may not be shared to exceed them, and data may not be taken for spamming or for
  selling personal information. The Acceptable Use Policies, "Information Usage Restrictions": scraping the site is
  allowed to researchers (non-personal information, open-access publications) and to archivists, and to nobody else;
  personal information gathered through the API may be used only for what the person authorised, and must be secured.
  The rate limits: sixty requests an hour for an unauthenticated address, five thousand for a token. So Viky reads
  the API and never the profile page, with a token of the project's, one question about one account that a person
  connected to a gift. All read on docs.github.com on 23 Sep 2026.
- **What is counted, by whose rule.** The contribution calendar GitHub keeps on the profile: a commit on the default
  branch or `gh-pages` of a repository that is not a fork, with an email the account owns; an issue, a pull request
  or a discussion opened; a review. Private work only if the person chose to show it, as a number. A commit is dated
  by the time zone in its own timestamp, an issue or a pull request opened on the web by the browser's ("Timezone-aware
  contribution graphs", GitHub's blog). Measured the same day: the calendar's days do not move with the time zone the
  page is asked in, nor with the offset the API is asked with. The condition therefore counts what GitHub counts, on
  the day GitHub says, and the contract credits days from the total since the first moment of the day the account
  was connected, exactly as it does from a Duolingo experience total: a total that can only grow, one contribution a
  day by default, the catch-up window as for every daily gift.
- **The condition.** `github-daily`, kind daily, nature read, on the daily contract under goal 2, the number the port
  reserved for it (`GOAL_TYPE_GITHUB_CONTRIBUTIONS`) and the chain read back empty on 23 Sep 2026. A new family, "Keep
  coding". The funder may name the account (checked by GitHub's own rule for a login, and read from GitHub before the
  money moves), or the person names their own and proves it with the code in the profile's name or bio; the identity
  bound is GitHub's numeric id, which survives a change of login. In `BUILDING`, offered to an operator alone,
  `live: false`; the daily create route now refuses a goal that stands for no condition, and a condition that is not
  live to anybody but an operator, which it did not before.
- **Not attested, and said so.** The reading service reads a public page by GET with no secret; the calendar is only
  read with a token, by POST. So this reading is Viky's own, signed by the evidence signer on Viky's word, with a
  nullifier of Viky's making rather than an attestor's identifier. The register's help sentence says "by Viky
  itself", the judges page says no attestor stands behind it, and the four answers say the same. The reading is
  listed in `src/plain-readings.ts`, the list of what Viky reads on its own word, and not in the attested source
  list: that list is fingerprinted with the reading service, and a change to it without redeploying the service stops
  every attested reading in production (the incident of 18 Sep 2026), which nothing tonight touches. The day the
  service takes a secret header, the reading moves there under the same goal.
- **The state.** The four states are the founder's, and none of them says "wired and not run on a real account yet".
  Decided the same day (D169): no fifth state; a line being built carries no state at all, and the public page says
  "Being built" of it.
- **What waits.** Goal 2 to register through the Safe (the call is in OPERATIONS), `GITHUB_API_TOKEN` on Vercel
  (sensitive, read at execution as `github.configured`), and one real gift run end to end. Until then the condition
  refuses `NOT_CONFIGURED` and stays behind the door.

## D167, 23 Sep 2026: a freeCodeCamp certificate is not offered, because its terms forbid a program reading the site

The founder, 23 Sep 2026: a freeCodeCamp certificate condition, if its page or API carries the name and the date and
its terms allow it; if not, say so and skip.

- **What was read.** freeCodeCamp's Terms of Service (freecodecamp.org/news/terms-of-service, read 23 Sep 2026)
  forbid automating access to the website or monitoring it with anything that is not a web browser, and make one
  exception, crawling to index it for a public search engine. Viky's reading is neither a browser nor a search
  engine. The same day, the two API paths a certificate page could be read from (`/api/certificate/showCert/…` and
  `/api/users/get-public-profile`) answered "path not found", and the certification page itself is a script
  application whose sentence is not in the page as served.
- **Decision.** Not offered, and not built: no condition, no frontier line, nothing in the register. The written
  answer is the source's own terms, so it is not "waiting for the source's answer" either. It reopens only if
  freeCodeCamp publishes terms that allow a program to read a certificate, or answers in writing that Viky may.
- **What it is not.** No claim that a freeCodeCamp certificate cannot be verified by a person: the page exists for
  that. The claim is that Viky may not read it for them.

## D168, 23 Sep 2026: the Lichess line, in the register and behind the door, with its reading still to build

The founder, 23 Sep 2026: the Lichess register entry and the chooser line, goals 6 to 9 being on the chain.

- **What is in.** `lichess-rating`, the twin of the Chess.com rating: a milestone in the family "Play", the four
  cadences by Lichess's own definitions on goals 6 to 9 (read back `registered` on 23 Sep 2026), the funder's step
  reading where the player stands from the one answer Lichess's API gives about a user, with Lichess's own verdict on
  whether the rating has settled (the question mark, a Glicko-2 deviation above 110, from their FAQ) and Lichess's
  own marks on a closed or violating account (`disabled`, `tosViolation`), refused before any money moves. In
  `BUILDING`, offered to an operator alone. The shape and its margins are Chess.com's, measured there and not on
  Lichess; a first real gift is one of the things that will say whether they hold.
- **What is not, and why the create route refuses.** The keeper's attested reading of Lichess is not built. Its
  sources belong in the attested source list, which is fingerprinted with the reading service (OPERATIONS: a change
  to that list is not merged until the service runs it), so it is a PR of its own, merged the day the service is
  redeployed with it. Until then `LICHESS_MILESTONE.unread` makes the create route answer `NOT_CONFIGURED` by name:
  the line can be seen behind the door and nothing can be made on it, because nothing could ever read it. The
  reading the funder's step makes today is listed in `src/plain-readings.ts`.
- **The terms.** Lichess's terms of service (read 23 Sep 2026) offer the API as one of its services, for personal
  and commercial applications, under caps and limits at Lichess's discretion; its API documentation asks for one
  request at a time (read 18 Sep 2026, `src/lichess.ts`). Nothing forbids a program reading a public profile.
- **The state.** As for the GitHub line (D166), settled by D169: no state while a line is being built, and "Being
  built" on the public page.

## D170, 23 Sep 2026: GitHub and Lichess are withdrawn; the goals stay on the chain without effect

The founder, 23 Sep 2026: "GitHub et Lichess ne sont pas voulus. Lichess est un doublon de Chess.com, un commit
GitHub vide passe. Retire les deux du registre et de l'aperçu opérateur ; pas de jeton, pas de redéploiement du
worker pour eux ; les objectifs restent sur la chaîne sans effet."

- **Why.** A Lichess rating is the Chess.com rating again, on another house: one line already answers "reach a
  chess rating". A GitHub contribution proves that the account did something GitHub counts, and an empty commit is
  something GitHub counts, so the condition proves nothing about work. Neither is worth a token, a redeployment of
  the reading service, or a line on the chooser.
- **What goes.** The two conditions and their families' lines (D166, D168), the two readings and their routes, the
  four answers, the judges' line on GitHub's terms, the list of readings made on Viky's own word (nothing is read
  that way any more), and the plan to carry the GitHub reading through the reading service with a secret. D166 and
  D168 stay as the record of what was built and why.
- **What stays.** Goal 2 on the daily contract and goals 6 to 9 on the milestone contract, registered through the
  Safe on 23 Sep 2026: a `registerGoal` is never undone, and a goal nothing names settles nothing. The daily create
  route keeps the gate that came with the GitHub line: a goal type that stands for no condition is refused, and a
  condition that is not live is made by an account that runs Viky and by nobody else, which the daily route did not
  check before. `conditionOfGoal(5)` keeps answering the lesson.
- **What is not decided by this.** Decision D169 holds: "Being built" for everything that has not run on a real
  account, and no fifth state.

## D169, 23 Sep 2026: no fifth state; a line being built says "Being built", and "Being tested" only once a real gift runs

The founder, 23 Sep 2026: "pas de cinquième état. Une condition construite mais jamais courue sur un vrai compte reste
« Being built », comme le TOEFL, jusqu'à la première preuve réelle ; « Being tested » ne s'imprime que quand un vrai
cadeau tourne dessus."

- **The four states stay the four**, and they belong to the register: a condition in `CONDITIONS` always carries
  one, and `stateOf` is what the two pages ask. A condition beside the register (`BUILDING`) carries none.
- **"Being built" is the frontier's word, not a state.** A line being built that has a public page is printed under
  its family, with its nature and its help, then "Being built." and what has to happen first (`beforeItOpens`). The
  two shown from an account (TOEFL, enrolment) are said to be being built by the frontier lines about the page nobody
  can open, and each frontier names the line it is about (`conditionId`), so nothing is printed twice. Today the two
  are the only lines being built, so the catalogue prints nothing this way; the rule is written for the next one. The
  table "What each state means" keeps its four rows.
- **"Being tested" is printed the day a real gift runs** on a line, and not before: the register's `state` is set
  then, by hand, with the gift's number in the decision that opens it.
- **Where the judges' page stands.** It lists the register's conditions with their state, as before; a line being
  built is not on it until it is in the register.

## D171, 23 Sep 2026: the entrance of a page, 80 ms apart and the same on a reload (motion PR A)

The founder's review of D160: "ça clippe, il n'y a pas les animations". And the instruction: "le décalage passe de
50 à 80 ms (quatre blocs entrés sous 500 ms, plafond 240), et le rechargement joue la même entrée que la navigation,
plus seulement le fondu. Si 80 se lit encore comme simultané, 100."

The sheet, as every motion PR carries one:

- **Trigger.** A page change, whether reached from another screen or by a reload: the template builds the screen
  again on every navigation, and the first screen a document draws now enters the same way, since the server has
  drawn it whole since D160 and the turns leave no hole in it. D160's one fade for the first screen is withdrawn.
- **Rule.** Every block the page carries rises 8 px and comes up from nothing in 250 ms on the standard curve, each
  block 80 ms after the one above it, three turns at most (0, 80, 160, 240), so four blocks have arrived in 490 ms and
  a page of any length inside the half second. A list takes the same three turns: its fourth card and every one after
  arrive together at 240 (D154 gave a list seven turns at 50; they ran to 350 and read as a queue).
- **Material token.** The rise is medium1 (250 ms) on the standard easing, as before. The stagger of 80 ms is not a
  step Material publishes: it sits between short1 (50) and short2 (100). It is the founder's number; short2 is the
  next to try if 80 still reads as simultaneous, and the test names 80 rather than a Material list.
- **Loop.** None: each block plays once, `backwards` keeps it unseen until its turn, and nothing repeats.
- **Reduced motion.** Unchanged: every block fades in over 250 ms, no rise, no delay, all at once.
- **Test.** `test/motion.test.ts`: the tokens (80, 240, 240), the stylesheet's variables equal to them, the list's
  cap at the fifth child, the shell entering on every screen, no screen arriving in one fade outside reduced motion.
- **Judged by eye on viky.cash**, by the founder, with a reduced-motion capture and a film strip of the entrance at
  0, 80, 160, 240 and 490 ms attached to the PR.

## D172, 23 Sep 2026: a gift's page is the card of Home, alive; first group, the moments of a gift that runs (V4-1)

The founder, 23 Sep 2026, document J sections 2 and 3: the page carries four things in one order (the state, the
figure, the next dated moment, one action or none), then two folds; nine moments, two roles and a third reader; V4 is
"la carte de Home rendue vivante pour les trois formes (rangée de personnages, montée vers la cible, tampon)", one
group of moments per PR, each with its motion sheet, the old pages deleted at the end.

What this first group does, relu contre le tableau:

- **The frame is the card of Home.** `GiftLive` draws in `CARD` with `gift-card-placed` and `gift-card-width`, the
  classes of `OfferCard`: the same edge, width and paper. The page's own `.gift-card` (the mockup of 19 Sep) is gone.
- **The three shapes, alive.** The row of days stays as it was. The climb replaces the bar (which D132 had taken off
  Home as "une ligne horizontale étrange"): a slope, climbed in ink, dashed ahead, the flag with the target at its top,
  the character standing at today's reading. Where they started is not drawn: it is in "What was agreed" and is not
  said twice. The stamp is new: a dashed ring beside the character while the proof is awaited, inked in the sun colour
  with its tick once taken, faded if the time ran out. Both drawings are one proposal each, judged on the image.
- **The three moments of a gift that runs.** En cours, quotidien: the last day judged, in words ("Yesterday
  counted."); no action. En cours, progression: how far is left as the state ("90 to go."), today's reading as the
  figure; no action. En cours, obtenu ou pas: the one gesture as the state, "Share the page that proves it" on a
  certificate and, new, "Show it from your own ETS account" on a proof shown by the person (D162); the action is that
  gesture.
- **A contradiction, settled by the founder's current table.** #76 made taking money already earned the action of
  every moment money had been earned. The table says "aucune" while a gift runs and "sortir l'argent" at "Atteint".
  The table wins: a recipient takes what was earned at the end, and not while it runs. Nothing is lost by it; the
  contract keeps what was earned until it is taken.
- **Four defects found on the images and fixed.** A reader of a daily gift was told "Yesterday came back to you",
  true of the funder alone. A reader given no names read "Your gift" above the name, and "For" with nothing after it
  on a certificate. Three sentences said "Léa have" and "Léa were".
- **A reader without an account** on an opened gift is offered one quiet line, "Sign in if this gift is yours.",
  which opens the sign-in; it was a sun button on every moment, which made every moment ask for something.
- **The board.** Every moment for every reader, drawn by the production page from example data, at
  `/dev/looks/gift` behind the design gallery's door (never open in production): production holds six gifts, all
  connected, so most moments can only be seen there. `test/gift-examples.test.ts` holds each example to the moment
  its name says.

The motion sheets of this group:

- **En cours, quotidien.** Trigger: the arrival on the screen. Rule: the days settled since this device last saw the
  gift play in order, earned then gone back, then the amount counts (the existing `Arrival`, brief section 6), under
  two seconds. Material token: earned `MOTION.earned` on the expressive spring, gone back medium2 (300 ms) standard,
  the count extra-long1 (700 ms). Loop: none. Reduced motion: the final state, nothing moves. Test:
  `test/motion.test.ts`, `test/browser/arrival.spec.ts`.
- **En cours, progression.** Trigger: the arrival on the screen, when the keeper has read a new figure since this
  device's last visit. Rule: the character walks up the slope from the reading this device kept to today's, once.
  Material token: extra-long1 (700 ms) on the standard easing (`MOTION.count`). Loop: none; a first visit or an
  unchanged reading does not move. Reduced motion: it stands where it is. Test: `test/gift-examples.test.ts` for the
  moments, captures for the drawing; the walk itself is read on viky.cash.
- **En cours, obtenu ou pas.** Trigger: none; the page waits for the person's gesture and answers nothing before it.
  Rule: the stamp and its character stand still (the character's gaze answers a pointer, as everywhere). Material
  token: none. Loop: none. Reduced motion: unchanged. Test: captures.

## D173, 23 Sep 2026: the opening of a gift, relu contre le tableau (V4-2)

The second group of document J: "Jamais ouvert" and "Ouvert, pas relié", for the two roles and the third reader.

- **Jamais ouvert.** The person it is for: the promise with the first name as the state ("Maman put this in your
  name."), the money, and under it what makes it theirs ("Yours day by day", "Yours at 1500", "Yours with the proof"),
  so "in your name" is said once; the next moment is the day it goes back unopened; the action is opening it, or
  making the account, which is opening it. The funder: "Léa has not opened it yet.", then "If not by 2 Oct 2026, it
  comes back to you."; the action is the link again, with taking it back under it, never beside it. The date was said
  to the recipient of a daily gift only; it is true of both contracts (14 days after funding), so it is said on all
  three shapes and to both sides.
- **Ouvert, pas relié.** The one gesture as the state ("Connect Chess.com and it starts."), the agreement unfolded
  (the only moment it is), and a next moment that was missing: an opened gift nothing has started goes back 14 days
  after it was opened, on both contracts. Said to the person as "By 3 Oct 2026, or it goes back to Maman." and to the
  funder as "If not by 3 Oct 2026, it comes back to you." The connect block stops saying how many days they then
  have: the unfolded agreement says it.
- **A certificate has no such moment.** Its clock starts when it is funded (`MilestoneGift` sets its deadline then),
  so it goes from unopened to waiting for its proof. The board's examples were corrected to match.
- **The drawings before it starts.** The row of a daily gift was not drawn at all until it started; it is drawn asleep
  now, one character a day, as on Home, with no dates and no "Day 1 of 7". The stamp's character sleeps until the gift
  is opened, like the climb's.
- **Two corrections to the first group.** The target over the flag is right-aligned on the cloth, so a four-figure
  target no longer reaches the card's edge at 390 (measured on production, 2500 on gift 1,000,002). A reader given no
  names read "Yesterday went back to them."; it says "to the person who offered it" now.

The motion sheets of this group:

- **Jamais ouvert.** Trigger: the arrival on the screen. Rule: the page enters as every page does (D171); the
  characters of the drawing are asleep and do not move; nothing else plays. Material token: the entrance's own
  (medium1, 80 ms turns). Loop: none. Reduced motion: the fade of D171. Test: `test/browser/arrival.spec.ts`.
- **Ouvert, pas relié.** Trigger: the press on "Open my gift" brings the person here. Rule: the same screen is
  refreshed in place with the gift's new state; it is not a new page, so nothing enters again, and the characters
  wake (asleep to awake is a change of drawing, not a movement). Material token: none. Loop: none. Reduced motion:
  unchanged. Test: captures of both moments; `test/gift-examples.test.ts` for the moments themselves.

## D174, 23 Sep 2026: passing the year and reaching a grade at a university, shown from the results page of the same portal

The founder's plan for the second developer, accepted 23 Sep 2026: two conditions on the universities' rail, the family
renamed "Study" (its id `study` unchanged), behind the operator door, "Being built" while no student has shown theirs.

- **The two conditions.** `university-year-passed-shown`, "Pass the year at their university", had or not, shown from
  the results page of the person's own student portal, the year or the semester as the page says it; goal 15.
  `university-grade-shown`, "Reach a grade at their university", had or not with a target as the TOEFL score has
  (D162), one gesture, the portal in the signed subject; goal 16. Both in `BUILDING` beside the register (D164), offered
  to an operator alone, and printed on the public page under "Study" with "Being built." and what has to happen first:
  the first lines the D169 mechanism prints, since no frontier line names them.
- **The row gains a results extraction.** `viky_portals.results`: the results page's own provider and request, the field
  that says passed and its pattern, the field that carries the grade and its scale, and, optionally, the field that
  names the year with the pattern this year's page matches. A page of another year does not pay (`WRONG_TERM`);
  without a year field, the day of the proof is what dates it, as for enrolment. Written by `pnpm portal:add` in the
  same command or by `pnpm portal:results` afterwards, and kept when enrolment is proved again. A portal without it
  takes no gift on either condition: the create route refuses `NO_RESULTS_PAGE` before any money moves, and the
  verification refuses it by the same name before any proof is fetched, never as `NO_PORTAL`.
- **Scales.** Numeric only tonight: out of 20, a GPA out of 4, out of N in a step (`20`, `4`, `20/0.5` on the command
  line). A grade is carried to the contract in hundredths, 14.00 out of 20 as 1400, and the funder's target is signed
  in the same hundredths by the browser and rebuilt by the route (`targetUnits`), so the contract's `NotThereYet`
  compares like with like; the scale lives on the row and never on the chain. A scale of letters is declared on the
  row so the portal is described as it is, and refused at creation with `LETTER_SCALE` until a later PR says what a
  letter is worth; a target off the scale is refused `INVALID_TARGET` with the scale in words.
- **The words the person reads back.** A reading now carries `inWords`, and the verify route's answer carries `shown`:
  "14.50 / 20", "Passed", or the number itself where the number is the scale (a TOEFL score). `app/kit/ShowProof.tsx`
  prints `shown` on its one line and never the raw metric. The founder's example wrote the grade with a comma,
  « 14,00 / 20 »; the app's own money sentences use a dot ("$14.00"), so the dot is kept, and it is one word to change.
- **What crossed the frontier, said in the PR.** The create route (`app/api/gift/certificate/create/route.ts`), the
  browser's terms (`src/client/certificate-gift.ts`), the one line of `app/kit/ShowProof.tsx`, the outcome type in
  `src/client/gift.ts`, and `targetNumber` in `src/gift-draft.ts`, which takes a decimal where the shape's step is
  under one and a whole number everywhere else. Nothing else in `app/kit`, nothing in `globals.css`, no token.
- **Refusals, typed.** `NOT_PASSED`, `NO_GRADE`, `WRONG_TERM`, `NO_RESULTS_PAGE`, `LETTER_SCALE`, `INVALID_TARGET`,
  each a unit test.
- **What is verified, and what waits for a student.** The scale, the units, the words, the reading by the row's rule,
  the two shapes, the register, the door, the store's column against a real Postgres, and the verification with every
  dependency injected. No provider has been registered on any results page, no row holds one, no proof has run.
  Goals 15 and 16 are read `missing` on the chain on 23 Sep 2026; the two calls are in OPERATIONS for one Safe
  session (nonces 7 and 8). The conditions stay "Being built" until a results page has been proved with a student
  present and one gift has run end to end on each, on the founder's word (the rule of D164).
## D175, 23 Sep 2026: the endings of a gift, the one confetti, and the spring at payment (V4-3)

The third group of document J: "Départ trop haut", "Atteint", "Échéance passée", "Repris ou remboursé", and decision
B: "jamais au paiement, seulement « atteint » pour le receveur et « they did it » pour le financeur ; au paiement,
l'arrivée du personnage sur le ressort, sans confetti."

- **Départ trop haut.** The reason without jargon as the state, what happens to the money under it ("Goes back to
  Maman", "Comes back to you" to the funder, which it used to read in the person's words), and the day it moves, the
  gift's own deadline. The action was named ("askAgain") and drew nothing; it is now "Ask Maman for a new one" to the
  person, which hands them the words through the phone's share sheet, or the clipboard, and says which (Viky sends no
  message for anybody), and "Make a new gift" to the funder, which is Home. The climb drew the character on the flag,
  since the first reading stood above the target, and that read as reached: it stands at the foot, leaving.
- **Atteint.** The money at its largest, "It is yours." to the person, "Léa did it." to the funder (the founder's
  words), the day it was reached, and taking it out, the action this moment alone carries (D172). The stamp is inked
  and lands. The one confetti of the app plays here, to those two people, once per device and per gift.
- **Échéance passée.** The two questions diverge: "The time is up." to the person, "Léa did not make it in time." to
  the funder, whose question is what comes back; the figure is the whole amount, since nothing was earned, "Back to
  Maman" or "Back to you" (a reader was told "Back to you" until now). Then the day it came back, or that nothing needs
  doing because it goes back by itself.
- **Repris.** "Maman took it back before it was opened." to the person holding the link, "It is in your account
  again." to the funder, and the date when the page knows it.
- **At payment**, on the made screen, the gift's character arrives on the expressive spring with its bow a beat
  after, once, for the press that made the gift and not on a reload; no confetti.

The motion sheets of this group:

- **Départ trop haut.** Trigger: the arrival on the screen. Rule: the page enters (D171); the character stands at the
  foot of the slope in its leaving drawing and does not move. Token: none of its own. Loop: none. Reduced motion:
  unchanged. Test: captures.
- **Atteint.** Trigger: the arrival on the screen, the first time this device sees the gift reached, for the person
  and the funder. Rule: twenty-four pieces in the characters' three shapes and the look's four colours burst from the
  gift's drawing and fall, once, in 900 ms, then are removed; a stamp lands from 1.5 times its size on the expressive
  fast spring, overshooting once; a row plays its settled days and the amount counts (the existing arrival). Token:
  Material extra-long3 (900 ms), emphasized decelerate for the burst and emphasized accelerate for the fall
  (`MOTION.confetti`); the expressive fast spatial spring for the stamp. Loop: none; a second visit throws nothing.
  Reduced motion: nothing is thrown, the stamp is inked where it stands. Test: `test/confetti.test.ts`; caught in
  flight at 200 and 500 ms, and absent on a second visit (`review-captures/v4-confetti.ts`).
- **Échéance passée.** Trigger: the arrival on the screen. Rule: the days gone back play if this device has not seen
  them (the existing arrival); nothing else. Token: medium2 (300 ms) standard for a day gone back. Loop: none. Reduced
  motion: the final state. Test: `test/motion.test.ts`.
- **Repris.** Trigger: the arrival on the screen. Rule: nothing plays beyond the page's entrance. Token: none. Loop:
  none. Reduced motion: unchanged. Test: captures.
- **Au paiement.** Trigger: the press that made the gift, answered on the made screen. Rule: the gift's character
  grows from 0.55 of its size on the expressive fast spatial spring and fades in on the effects spring, its bow opening
  120 ms later (the existing `Success`), once. Token: `MOTION.gift`. Loop: none; a reload of the made screen draws it
  still. Reduced motion: drawn still. Test: `test/confetti.test.ts`.

## D176, 23 Sep 2026: five examination results shown from the person's own account, the family "Pass an exam"

The founder's plan for the second developer, 23 Sep 2026: every condition "shown by them" of the list, each up to the
sign-in screen like the TOEFL, the terms of use read before any line, one PR per family, one Safe session at the end.
The first family: "Pass an exam", beside the TOEFL.

- **The family.** `exam`, "Pass an exam", after the languages. The TOEFL score moves into it; the Duolingo English Test
  stays with the lesson, where the audit filed it and a test pins it.
- **The five lines**, all in `BUILDING` beside the register, offered to an operator alone, "Being built" on the public
  page under their family (D169): a Cambridge English result (goal 17, the overall score on the Cambridge English Scale,
  80 to 230, the funder typing the score of the level in mind: B1 from 140, B2 from 160, C1 from 180, C2 from 200, the
  floors read on Cambridge English's results pages), an IELTS band (goal 18, typed in halves, carried in tenths, the
  British Council's Test Taker Portal; IDP's page, which asks no account, is a second provider to come), and the
  baccalauréat passed in Morocco (goal 19, Bac Digital, the candidate's CNE and CIN typed in their own browser; the
  service sits behind Cloudflare, so it is shown by the candidate and never read by Viky), in Cameroon (goal 20,
  Epim-Exam) and in France (goal 21, Cyclades). Each subject is constant per condition, as the TOEFL's is (D162): the
  pages carry no name the funder could sign. The day a result is shown is the event.
- **No provider exists for any of them.** The Reclaim directory, searched by its API the same day, reads none of these
  pages. Each provider is ours, to register from a real candidate's session; its page, its sign-in (the identifiers
  typed by the person in their own browser, never sent to Viky) and its fields are written in `docs/reclaim/<id>-provider.md`,
  every field "to confirm". Until it is pinned in `EXAM_PROVIDERS` (`src/exam-shown.ts`), the line refuses every gift
  `NOT_CONFIGURED` by name at creation (`notOpen`) and at verification (`notRegistered`), whoever asks, and never as
  "no portal". The frontier lines say what is on its way: the exams' line names the TOEFL, Cambridge English and IELTS;
  the state diplomas' line, which said "Not being built", now says the baccalauréat is, in the three countries.
- **The terms, read before any line.** Cambridge's website terms forbid scraping or storing the site's content on a
  server and building a database from it, and sharing a password; the British Council's forbid copying its content,
  misusing data on its services and sharing a password, and name no automated access; Bac Digital and Epim-Exam show
  no terms on their public pages; Cyclades's legal notice opens only inside the application and could not be read from
  outside a session. None forbids a person opening their own result in their own browser; whether Viky keeping the one
  score a candidate shows is the storing of a site's content Cambridge forbids is a question the line does not answer.
  It is quoted in each definition and on the judges' page, and it is the founder's call before each line opens. Nothing
  was refused tonight on the terms; nothing opens on them either.
- **The goals** are in OPERATIONS for one Safe session at the end of the night, nonces 9 to 13, each read `missing` on
  the chain on 23 Sep 2026. The DECO of Côte d'Ivoire is written there as a window to come back to in July, with
  nothing built.
- **What crossed the frontier, said in the PR.** The create route (`notOpen`), `/api/conditions` (the door), the
  judges' page (one bullet). Nothing in `app/kit`, nothing in `globals.css`, no token.
- **What is verified, and what waits for a candidate.** The scale, the bands, the decision, the subjects, the goals,
  the register, the door, and the refusal before any fetch, each a unit test. No provider registered, no proof shown,
  no goal signed.
## D177, 23 Sep 2026: what the old gift page left behind is gone (V4-4)

The last step of V4: "les anciennes pages supprimées à la fin". The two old pages themselves went in #76; what they
left behind went now, each piece checked to be read by nothing in the product, the tests or the scripts:

- **The laboratory's gift screen** (`app/dev/looks/screens/GiftScreen.tsx`) was a hand-built copy of the old page,
  so the looks boards showed a page that no longer shipped. It draws the production page now, from the board's
  example of a daily gift that runs.
- **The board of moments moved** from `/dev/looks/gift` to `/dev/looks/gift-moments` (D172 names the old path): at the
  old path it had taken the place of the laboratory's gift screen, and `pnpm looks:capture` would have photographed the
  list of moments and failed its measurement of the arrival there.
- **The still card and the large meter.** `GiftCard`'s `still` variant drew the head of the old page; only the
  laboratory's copy used it. `MilestoneMeter` keeps its one size, on a card in a list.
- **Thirty-five sentences** of `GIFT_PAGE`, `MILESTONE_PAGE` and `MILESTONE_ACTIONS` that no screen says any more:
  the old page's totals ("Already taken", "6 of 7 days were yours", "Back to Maman: $1.00, 1 day"), its milestone
  lines ("Last read…", "Not read yet…", "Nothing shown yet.", "Reached on … is yours"), and the old take review.
- **Five rows of SCREEN-CLAIMS** quoted those sentences as promises of the screen: each was a claim nobody kept any
  more, and each is gone or rewritten to what the page says now.
- **The words-only states board** (`/dev/states`, `src/state-catalogue.ts`) described the old gift page state by
  state, and passed only because those sentences lingered unread. Its gift page is the nine moments of the table now,
  quoting what the page says; two real gaps V4 leaves are written there (taking out while a daily gift runs, and the
  date a milestone gift was taken back), and one it listed as a gap is built ("Get the link again").

## D178, 23 Sep 2026: a Udemy course finished, shown from the person's own account, beside the Coursera certificate

The founder's plan, the family "Finish a course": Udemy, a course finished, shown from the account, the terms first.

- **The terms.** Udemy's Terms of Use (last updated 31 Jul 2026, read 23 Sep 2026), section 7: no scraping, no robot,
  no "other automated means of any kind to access the Services", no access "by any means (automated or otherwise)
  other than through our currently available search functionalities"; section 1: no sharing of login credentials. So
  Viky reads nothing from Udemy by a program: not the person's pages, and not the certificate page Udemy publishes
  for a finished course, which a reader of Viky's would reach by automated means. The line is of the second nature
  only: the person shows their own account in their own browser, shares no credential, and a witness in a TEE attests
  the one response. Whether that tab is "automated means" in Udemy's sense is written on the judges' page and left
  to the founder before the line opens; nothing was refused tonight, nothing opens.
- **The line.** `udemy-course-shown`, "A Udemy course finished, shown", family "Finish a course", `BUILDING`, offered
  to an operator alone, "Being built" on the public page under its family. The funder names the course by its link, as
  for Coursera; the course's slug is the subject they sign, `hash("viky:subject:udemy-course-shown:v1:<slug>")`, no
  name in it, and a proof of another course is refused `OTHER_COURSE` by name, and would fail the contract's own
  check besides. Finished is one; a course not finished is `NOT_FINISHED`. Goal 22, in the night's Safe session.
- **The record remembers the course.** `viky_milestone_gifts.course`, written by the create route for a shown course
  gift, read by the shown register for the subject and for the provider's reading. A university gift keeps its
  `portal`; the two columns are the two things a shown gift can be about.
- **No provider exists.** The directory's six Udemy providers read other things; ours is defined in
  `docs/reclaim/udemy-course-shown-provider.md` (the "My learning" page, the sign-in in the person's own browser, the
  course's slug and its completion, all to confirm), and `UDEMY_PROVIDER` is empty until it is registered from a real
  account. Until then the line refuses `NOT_CONFIGURED` by name at creation and at verification.
- **What crossed the frontier, said in the PR.** The create route (the course recorded), `/api/conditions` (the door),
  the judges' page (one bullet), `src/gift-store.ts` and `src/milestone-creation.ts` (the fact carried to the record).
- **What is verified, and what waits.** The links and slugs, the subjects, the reading (`OTHER_COURSE`,
  `NOT_FINISHED`, "Finished"), the goal, the register, the door, the refusal before any fetch, the column against a
  real Postgres. No provider registered, no proof shown, no goal signed.

## D179, 23 Sep 2026: an average at school shown from EcoleDirecte, the family "School"; PRONOTE is not offered

The founder's plan, the family "School", new if the terms allow it: PRONOTE and EcoleDirecte, a grade or an average
from the pupil's or the family's account, the terms first, had or not with a target.

- **The terms, read before any line.** Aplim, EcoleDirecte's publisher and host ("Dispositions générales applicables
  EcoleDirecte", the privacy policy of "Mon EcoleDirecte", read 23 Sep 2026): the holder of a password reaches only
  the information about themselves or those they answer for; the school alone answers for the information; Aplim
  makes the site's content available to no third party; no clause names a program. Index Education, PRONOTE's
  publisher ("Mentions légales et Conditions Générales d'Utilisation", the same day): users commit not to "Utiliser
  tout dispositif manuel ou automatique permettant toute récupération de données sans notre autorisation expresse
  écrite" on its sites, and the spaces are served from its own hosting (index-education.net). The first allows a
  person reading their own page in their own browser; the second forbids any device retrieving data without written
  authorisation, which a verification tab is.
- **Decision.** EcoleDirecte is built up to the provider: `ecoledirecte-grade-shown`, "Reach an average at school,
  shown", family "School", `BUILDING`, offered to an operator alone, the target typed out of 20 with decimals and
  signed in hundredths as the university grade is (D174), the scale fixed rather than declared on a row, the subject
  constant per condition, goal 23 in the night's Safe session, the provider ours and empty until registered from a
  real pupil's session (`docs/reclaim/ecoledirecte-grade-shown-provider.md`). PRONOTE is not offered and not built:
  no condition, no goal; the frontier's line on school marks now says which of the two is being built and why the
  other is not, in the publisher's own words. It reopens only with Index Education's written authorisation, or terms
  that allow it. Whether the school, as the data controller, should be asked before the EcoleDirecte line opens is
  written on the judges' page and left to the founder.
- **What crossed the frontier, said in the PR.** `/api/conditions` (the door), the judges' page (one bullet). The
  create route needs nothing new: `notOpen` and `targetUnits` are the university grade's.
- **What is verified, and what waits.** The scale and the units, the reading (`NO_GRADE`, "14.50 / 20"), the goal,
  the register, the door, the refusal before any fetch, the frontier's words. No provider registered, no proof
  shown, no goal signed.
## D180, 23 Sep 2026: the arrival on a return (motion, step 1 of the life of the product)

The founder, 23 Sep 2026: "à l'ouverture d'un cadeau, ce qui a changé depuis la dernière visite joue une fois : les
jours gagnés atterrissent l'un après l'autre, puis les jours revenus glissent à gauche, puis le montant compte jusqu'à
sa valeur. Rien ne joue si rien n'a changé. Sur la montée : la pente avance jusqu'au chiffre du jour."

- **What was already there.** The days of a gift's page played through `Arrival` since the brief of 17 Sep; the
  amount did not, and the climb moved only its character.
- **A defect under it, found while wiring the amount.** `useLastSeen` froze the first render's answer in state. On a
  screen the server draws, every screen since D160, the first render is the hydration, which is given the server's
  answer, nothing, so the amount on Home counted from its own value to its own value and never moved. What was seen is
  now kept per screen outside the component, read by the browser on the render after hydration, and forgotten when the
  screen goes, so the next screen reads what this one wrote. Home's amount counts again.
- **The gift page's money counts**, last in its arrival, from what this device last saw of it; a rating is a reading
  and does not count. Nothing plays when nothing changed.
- **The climb's ink advances** with its character, from the reading this device last saw to today's.

The sheet:

- **Trigger.** Opening a gift, or Home, when something changed since this device's last visit; nothing otherwise.
- **Rule.** Every day earned lands, one after the other (80 ms gathering, 170 ms rising, 130 ms falling, then the face
  opening on the landing spring), then every day gone back slides left (300 ms), then the amount counts to its value
  (700 ms), all of it inside 2,000 ms, 120 ms apart at most. On a climb, the slope's ink and the character advance
  together to today's reading (700 ms).
- **Material token.** `MOTION.earned` (the expressive fast spatial spring for the landing), `MOTION.returned`
  (medium2, standard), `MOTION.count` (extra-long1, standard), `MOTION.arrival` (budget 2,000 ms, stagger 120 ms).
- **Loop.** None; once per change, the device writes what it saw as the screen is built.
- **Reduced motion.** Nothing plays: the final state is drawn, and no animation runs at 300 ms (measured).
- **Test.** `test/arrival-return.test.ts` (the store after hydration, the count, the ink), `test/motion.test.ts` (the
  schedule under two seconds). Measured on the board: the amount counted $1.00, $1.11, $1.75, $1.94, $2.00; the
  climb's character moved from 61 to 190 px and its ink from 0.09 to 0.59 of the slope in 700 ms. What the eye may
  catch: the server draws the final state, and for about 160 ms before the browser starts the arrival it is visible;
  the card is still entering then (D171), which is what hides it.

## D181, 23 Sep 2026: the character reacts (motion, step 2 of the life of the product)

The founder, 23 Sep 2026: "regarde le curseur au survol (2,5 px, 200 ms, pointeur seulement), s'ouvre quand un jour
gagné atterrit, baisse le regard 300 ms quand un jour revient, saute une fois à « atteint ». Chaque état attaché à une
ligne du journal, jamais à une horloge ; jamais de gronderie."

- **The gaze** was there (step 2 of 21 Sep): the character at the head of a screen looks at a pointer hovering it,
  2.5 px in 200 ms, and a finger moves nothing.
- **Three reactions**, on the mood channel the two hover expressions already use (`app/kit/mood.ts`): `open` when a
  day earned lands, `down` when a day gone back has slid to its place, `jump` once when the gift is reached. Each is
  cued by the event itself: a day's cue is an animation that moves nothing and ends exactly where the day lands (or
  stops sliding), so it belongs to that day's line of the record and is cancelled with it; the jump is thrown with the
  one confetti, from the same first sight of the gift reached. Nothing uses a clock.
- **Never scolding.** A day gone back changes the gaze and nothing else: the eyes look down, the mouth and the eyes
  keep their shape.
- **A collision found by measuring.** The look down was first cued on the start of the slide, which is the very frame
  the last day earned lands, and the second reaction erased the first; it is cued on the end of the slide now.

The sheet:

- **Trigger.** A pointer over the character; a day earned landing and a day gone back arriving in the arrival of D180;
  the first sight of the gift reached on this device.
- **Rule.** Gaze: the pupils move 2.5 px towards the pointer. Open: the eyes 1.18 times, the mouth opened, held and
  back, once. Down: the gaze 2.5 px down, in and back inside 300 ms. Jump: the character gathers, rises, falls and
  lands exactly as a day earned does.
- **Material token.** `MOTION.hover` (200 ms standard, held 300, gaze 2.5), `MOTION.returned` (300 ms) for the look
  down, `MOTION.earned` for the jump. No new token.
- **Loop.** None; each answers one event, once.
- **Reduced motion.** The rest face and nothing else; measured, the mood never leaves "rest".
- **Test.** `test/character-reacts.test.ts`. Measured on the board: a returning arrival with a day earned and a day
  gone back reads rest, open at 567 ms, down at 867 ms; a first visit to a reached gift reads rest, then jump at
  133 ms; under reduced motion, rest throughout.

## D182, 23 Sep 2026: the character on every screen (motion, step 3 of the life of the product)

The founder, 23 Sep 2026: "le personnage sur toutes les pages, pas seulement Home, avec ses deux expressions au
survol (ligne de la condition : curieux ; puces de durée : content), comme décidé le 21 Sep."

- **Where it was missing.** Home, Gifts, You signed in, a gift's page, the way out and the made screen drew it; You
  signed out, the paying screens and their waits, a gift's page while it loads or after the session closed, and every
  document (What Viky can check, the judges page, help, privacy, the legal notice, offline) did not.
- **One place decides it now.** The shell gives a screen that names no character the head character, with its gaze,
  its two hover expressions and the reactions of D181; a document carries it beside its way back, as a task does. The
  page without an account keeps its own, larger, beside its title, and the made screen its gift.
- **The two expressions** answer the card's condition line (curious) and its duration chips (happy) as decided on
  21 Sep; those controls exist on the card of Home and of the page without an account, and both characters there hear
  them. Every other character hears the same moods, so any screen that later carries those controls is answered.

The sheet:

- **Trigger.** A pointer over the character (gaze); the card's condition line (curious) and its duration chips
  (happy), by hover with a pointer and by the choice with a finger; the reactions of D181.
- **Rule.** Unchanged from D148 and D181; what changes is where it stands: every screen.
- **Material token.** `MOTION.hover`, as before. No new token.
- **Loop.** None.
- **Reduced motion.** The rest face and nothing else.
- **Test.** `test/browser/character-everywhere.spec.ts`: ten screens a person reaches, each drawing exactly one visible
  character inside the mood channel, at four sizes.

## D183, 23 Sep 2026: the reveal on scroll, on every screen (motion, step 4 of the life of the product)

The founder, 23 Sep 2026: "L'apparition en défilant (reveal, 250 ms, 8 px), en dernier."

- **Where it was.** `Reveal` played on the lists of cards of Home and Gifts only. A long screen, a gift's page on a
  phone, the catalogue, the judges page, the documents, showed its lower blocks already there when scrolled to.
- **One place decides it now.** The shell watches the blocks of its `main`, and the turns of a box that arrives in
  turn: a block below the fold when the screen opened rises the first time it is scrolled into view, once; a block in
  view as the screen opened never moves again, since the entrance brought it; a block holding its own `Reveal` is left
  to it, so nothing moves twice.

The sheet:

- **Trigger.** A block scrolled into view for the first time, which was not in view when the screen opened.
- **Rule.** It comes up from nothing and rises 8 px, once. Nothing behind it moves, no parallax.
- **Material token.** `MOTION.reveal`: medium1 (250 ms), standard easing, a rise of 8 px. No new token.
- **Loop.** None; a second pass over the same block moves nothing (tested).
- **Reduced motion.** Every block is where it is; nothing is caught rising (measured).
- **Test.** `test/browser/reveal.spec.ts`: a block rises when scrolled to, not on a second pass, and nothing rises under
  reduced motion, at four sizes. Filmed on the catalogue at 390: the two sections that entered are invisible at 0 ms,
  nearly in at 80 ms on the standard curve, in place at 250 ms.

## D184, 23 Sep 2026: a condition built is open; no door; the truth line by line; the count of real proofs

The founder, 23 Sep 2026, replacing D109 and everything written this night about "Being built" and the operator door:
"une condition construite est OUVERTE à tout le monde dès que son chemin de code est complet (registre, objectif sur
la chaîne, fournisseur défini, flux construit jusqu'au bout). Plus de porte opérateur pour ce qui est construit. La
page publique dit la vérité par ligne : « Open. Nobody has shown one yet. » tant qu'aucune preuve réelle n'est passée,
puis « Open. » ; la page des juges porte le compte de preuves réelles par condition. « Being built » seulement quand
une pièce manque vraiment. Jamais « tested » ni « used by N » sans preuve."

- **Open now.** The TOEFL score shown: the register, goal 13 on the chain, the directory's provider pinned, the flow
  built to the end. `live: true`, in `CONDITIONS`, under "Pass an exam", "Open. Nobody has shown one yet." on the
  public page. The exams' frontier line says the TOEFL is open and names Cambridge English and IELTS as being built.
- **No door.** `/api/conditions` previews nothing to anybody; the three create routes refuse a condition that is not
  live to everybody, the operator included, and the rehearsal exception on a rating still settling is gone.
  `VIKY_OPERATOR_ACCOUNTS` keeps the dev pages and the boolean answers, nothing else.
- **The truth line by line.** `src/proof-counts.ts` counts real proofs per condition from the rows (attested
  milestone readings that started or reached a gift; check-ins relayed for a daily line) when a page is served. The
  catalogue prints, beside "Open", "Nobody has shown one yet." (or "read on it", or "connected one", by the line's
  nature) while the count is zero, and nothing while it cannot be read; the judges' page prints the number. The state
  "Being tested" is gone: three states, no fourth.
- **"Being built" names the missing piece.** Each line beside the register says in one line what really lacks: a
  provider registered on the Reclaim dashboard from its definition and a goal signed (the exams, Udemy,
  EcoleDirecte); a portal row, or a row's results page (the university rail). The registration on the dashboard
  needs a dashboard session, which no key of the project holds: it is the founder's step, and OPERATIONS says so.
- **The Safe session of every remaining goal**, in one sitting and one order, is in OPERATIONS: nonces 7 to 16, goals
  15 to 23 on the milestone contract and 6 on the daily one.
- **What crossed the frontier, said in the PR.** The three create routes and `/api/conditions` (the door), the
  catalogue page and `JudgesConditions` (the counts), `src/sentences.ts` (the words).
- **Not done here.** The privacy rule of the same morning (the number read shown to the two parties only, never
  stored beyond the verdict, the chain carrying the verdict alone) is its own PR; the portal rows for the corridor
  (UCAD, FHB) wait for their providers on the dashboard, their definitions being written from the public pages.

## D185, 23 Sep 2026: a number that is the person's own is seen once by them, kept nowhere, and the chain carries the verdict

The founder, 23 Sep 2026, for every condition of the Study rail and the exams, the same rule as for Fitbit and Strava:
"le chiffre lu (score, note, moyenne) est montré au financeur et au receveur seulement, jamais à un tiers par le
lien, jamais stocké au-delà du verdict ; sur la chaîne, seulement le verdict (atteint, ou pas). La page de vie privée
le dit, condition par condition."

- **Which conditions.** Every condition a person shows from their own account (`nature: "shown"`): the TOEFL score,
  the five exam results, the three Study lines, the EcoleDirecte average, the Udemy course. The register of the rule
  is `src/condition-privacy.ts`, one line per condition, `kept: "verdict"` for these and `"number"` or `"fact"` for
  what a source publishes about the person (a rating, the XP a day is counted on, a certificate page they share),
  which is kept as read, as before. A test pins that every condition has a line and that every shown one is under the
  verdict rule.
- **What the chain receives.** At or over the target, the attestation carries the target as its value: the verdict,
  in the contract's own comparison (`metricValue >= target`), and never the number. Under the target, nothing is
  signed, relayed or written: the verification refuses `NOT_THERE_YET` (409) with the number, to the person who
  showed it. So a proof under the target is not on the chain either.
- **What the rows keep.** For these conditions the readings row keeps no number, no account key and no proofs; the
  session row keeps `{ verdict: "reached" }` and no proofs. The judges' count of real proofs still counts the row
  (attested, reached). The number reaches one screen: the verify response of the person who showed it, once.
- **Who is shown the number.** "Montré au financeur et au receveur": the number is kept nowhere, so it can be shown
  only at the moment it is proved, and only the recipient is on that screen. The funder is told that it was reached
  and knows the target they chose; they do not see the number. If the founder wants the funder to see the number,
  it has to be stored, and that is a different rule: said on the privacy page and here, so it can be overruled.
- **The cost, written.** Nobody, us included, can re-verify such a proof from our rows afterwards; what remains is
  the contract's record of the signed attestation. The judges' page says so.
- **A defect found by the test.** The session row is JSON and the evidence carried a bigint: the store's
  `JSON.stringify` would have thrown after the proof was relayed and the reading recorded, leaving the session
  unconsumed and the person with an error for a proof the chain had accepted. The evidence is now stored with the
  number as a string (or the verdict alone), and the test stringifies what it is given, as the store does.
- **What crossed the frontier, said in the PR.** `app/kit/ShowProof.tsx`: one line removed, so the server's
  sentence for `NOT_THERE_YET` (with the number) reaches the screen instead of a fixed one; `app/privacy/page.tsx`
  (the section, and Reclaim named for every proof); `app/judges/page.tsx` (the cost); `app/api/proof/verify/route.ts`
  (the target); `src/sentences.ts` (the words). Nothing else outside the catalogue's files.
## D186, 23 Sep 2026: a closed gift's last refund is sent by the settling pass

The founder, 23 Sep 2026: "le passage ignore les cadeaux déjà clos, donc le dernier remboursement n'est jamais envoyé ;
2,857148 AUSD du cadeau 1 attendent dans le contrat."

- **The defect.** The settling pass left every finalised or taken-back gift alone. Finalising makes the remaining
  missed days refundable, and when the finalisation came after the pass's own refund, nothing ever sent them.
- **The fix.** A closed gift is still read, and on the settling pass what it owes its funder
  (`refundable - refundedToFunder`) is sent with `refundUnearned`; nothing is drained or finalised again, the counting
  pass sends nothing, and a gift paid back already is left alone (`test/daily-pass.test.ts`).
- **The money owed today** was sent the same day by hand, gift 1's 2.857148 AUSD, read before and after in
  OPERATIONS. It used the relayer's gas (18,640,500 gwei), which the founder's instruction of the night asked for
  ("déclenche ce remboursement").


## D187, 23 Sep 2026: the judges page reads who owns the contracts from the chain, and prints the public endpoint only

Two lines of the money path review of 23 Sep 2026 (`docs/reports/2026-09-23-money-path-security.md`, items 1 and 10),
put in the catalogue developer's queue by the founder the same morning.

- **The owner, read.** The page said one wallet, the founder's key, owned all four contracts, three days after the
  Safe `0xE08D926c148A5065F4Df2892702785a183de86F9` (Safe 1.4.1, two signatures of three) had taken them on 20 Sep 2026
  (D115, the table in OPERATIONS). Now each contract is asked `owner()` as the page is served; when all four answer one
  address, that address is asked its version, threshold and keys, and the sentence is built from those answers
  (`src/judges-owner.ts`). When the chain cannot be read, or the owners differ, the page says so, contract by
  contract, and claims no single owner. The hand-over transactions stay on the page as history. Read on 23 Sep 2026:
  all four answer the Safe; the Safe answers version 1.4.1, threshold 2, three owners.
- **The endpoint, public.** The "RPC" line printed the server's variable, which carried a key; it prints
  `https://rpc.monad.xyz`, the endpoint every `cast` command on the page already named. A test pins that no judges
  surface prints or imports the browser's endpoint, that every `--rpc-url` names the public one, and that the owner
  sentence is the one read from the chain. Regenerating the key and moving it to a server-only variable is the
  founder's step (item 1 of the review), not done here.
- **Also corrected:** the owner row of the router's table in OPERATIONS, and the milestone section's "owned by the
  founder's key" (`app/components/MilestoneJudges.tsx`, said in the PR).

## D188, 23 Sep 2026: Fitbit, connected by the person, the third nature of a condition and the family "Move"

The founder, 23 Sep 2026: two conditions of a third proof mode, "connected by them", built whole up to the screen:
the person authorises Viky once by OAuth, in place of a name, and each morning the reading service reads the source's
API through zkFetch with the key as a secret; an attested reading, the attestor never seeing the key, nothing read on
Viky's word. The eight rules of the mode are the founder's; this is the first source, Fitbit.

- **The nature.** `connected`, "CONNECTED BY THEM" in the meta voice, beside read and shown, in the same three places.
  The family "Move", id `move`. The line `fitbit-daily`, "Active minutes each day, on Fitbit", a daily condition on
  goal 6 of the daily contract (`viky:provider:fitbit-connected:v1`), in `BUILDING`, offered to nobody (no operator door, D184), "Being built" on the
  public page with the three missing pieces named on the line: the founder's variables, the reading service running
  the source, goal 6 signed. The target is the funder's, in active minutes a day (Fitbit's fairly plus very
  active minutes, what its own daily goal counts), thirty suggested; steps are the same summary and one more line away.
- **Rule 1, consent.** The link of the line carries the consent in Viky's words, printed by the connect screen before
  the gesture: what the funder is told (a yes or a no for the day), what they never see (the route, the times, the
  numbers), how to disconnect and erase. Every sentence passes the consumer words check.
- **Rule 2, nothing raw kept.** The morning reading judges the summary and drops it. What is signed for the contract
  is the verdict, encoded as the contract counts: its own baseline plus the target when the day was won, the baseline
  alone when it was not (which the contract refuses as `InsufficientProgress`, a no in the journal). No proof is
  stored, the session row keeps the day and the verdict, and the chain holds a yes or a no. The person's own reading
  of the day is written as a sentence and not built.
- **Rule 3, disconnect and erase.** From the gift's page, by the recipient: the key revoked at Fitbit first, the row
  deleted whole whether or not Fitbit answered; the gift goes on, each day counted as not done until they connect
  again, with the same account, since its pseudonym is bound on the chain.
- **Rule 4, keys at rest.** Sealed under `CONNECT_TOKEN_KEY` with AES-256-GCM (`src/connect-vault.ts`), opened for
  one reading, never in a proof, never in a log. The application's credentials are `FITBIT_CLIENT_ID` and
  `FITBIT_CLIENT_SECRET`, on Vercel, sensitive; nothing on Railway, the worker holding no key. OPERATIONS gives the
  founder the three names, the callback URL to register, and nothing else to do.
- **Rule 5, the reading.** The Fitbit summary source, with `auth: "bearer"`, lives in `src/fitbit-source.ts`, a file
  the reading fingerprint does not cover, so that this merge changes no fingerprint and breaks no reading on main
  (the founder's rule of the same morning: this developer touches neither Railway nor a variable). The attested read
  and the worker carry the key in the secret half of zkFetch. Moving the source into the shared list, which moves the
  fingerprint, is the branch `catalogue/fitbit-source`, and the founder redeploys the service from it and merges it
  back to back (OPERATIONS, step 3); until then the morning reading refuses `NOT_CONFIGURED` before asking the service.
- **Rule 6, the goal.** `registerGoal(6, 0x1945fcd8…a701)` on `GiftEscrow`, in the night's Safe session, nonce 16.
- **Rule 7, the frontier.** The connect screen is `app/kit/ConnectTheAccount.tsx`, on the model of the screen that
  asks the name, said in the PR; `app/components/GiftPage.tsx` gained one branch to draw it; the other developer did
  not touch either meanwhile.
- **Rule 8, the pages.** "Move" and "CONNECTED BY THEM" on the public page, "Being built"; the judges' page carries
  Fitbit's four clauses and the one risk: the funder's daily yes or no is one bit about the person given to a third
  party under the consent they gave.
- **Defaults applied, to confirm (the founder away, 23 Sep 2026).** The suggested target of thirty active minutes a
  day; the day judged being yesterday in UTC, whatever the person's own time zone on Fitbit; the split of the source
  into a second branch with the redeploy sequence above; the line opening on the three pieces alone, without a week
  of one real person first. Each is written where it applies and reverses in one commit.
- **What is verified, and what waits.** The vault, the signed state, the PKCE round trip up to the exchange, the
  token exchange, refresh and revoke against a fake Fitbit, the verdict metric, the source's patterns, the store
  against a real Postgres, the register and the door. Not verified: no application exists, so no real connection, no
  real reading, no goal signed, and the worker not redeployed until this merges.
## D189, 23 Sep 2026: an arrival's first image is its start or its end, never its end then its start (the fix to #154)

The founder, 23 Sep 2026: "le « la page se recharge une fraction de seconde après s'être chargée » est revenu, et c'est
#154." And the rule: "la première image est soit l'état final (rien n'a changé, rien ne joue, montant compris), soit
l'état de départ de l'arrivée (jours à poser non dessinés, montant à l'ancienne valeur), jamais l'état final suivi
d'un redémarrage."

**Read this before touching the arrival.** The chain, each step right about its own thing and wrong about the next:

1. **D160** made the server draw every screen once, with what it is about, because the browser used to draw an empty
   screen and then the real one: the founder's "double chargement". The server has drawn the final state since.
2. **D171** made every screen, the first one too, enter block by block. The entrance hides a screen's first quarter
   second, which is also what hid step 3 for a while.
3. **#154** (D180) made the arrival replay what changed since the last visit, the days landing and the amount
   counting. What was seen lived in the browser's storage, which the server cannot read: so the server drew the final
   state, the browser read its storage after hydration, and the days and the amount started again from the start.
   Measured then at 160 ms, and written in D180 as "masked by the entrance". It was not masked: it was the double load
   again, by another road.
4. **This fix.** What was seen lives in a cookie, `viky.seen` (`src/seen-cookie.ts`), which the root layout reads and
   gives the screens (`app/kit/seen.tsx`). The server therefore knows what will play and draws its starting state:
   a day that changed since the last visit is drawn not there (`arrival-pending`), the amount at its old value, a
   climb's walker and ink not there. The browser's first render reads the same cookie, so hydration agrees, and the
   arrival starts from what is on the screen. Nothing changed, or a first visit: nothing is pending, the first image is
   the final state, and the amount does not count (measured, see below). Reduced motion never moves, so a rule in the
   stylesheet shows it everything pending where it is: its first image is the final state.
5. **One more of the same, found while measuring.** The row of a daily gift's days was drawn by the browser alone,
   because it needs a clock and the server had none; it appeared 80 to 160 ms after the first image, and its days to
   come were visible for one frame before they were hidden. The clock of a screen's first render is now the minute
   the server drew it at (`renderMinute`, given by the layout to `useMinute`), so the row and the next reading are in
   the first image and hydration agrees.

Measured on the board of moments, frame by frame from the first one (`review-captures/first-image.ts`):

| case | first image | then |
|---|---|---|
| a day earned and a day gone back since the last visit | $1.00, five of seven days | the two land, then $1.01 … $2.00 |
| nothing changed | $2.00, seven days | nothing |
| a first visit | $2.00, seven days | nothing |
| a climb that moved | the walker not there | it appears at 1300 and walks to 1410 |
| a climb that did not move | the walker at 1410 | nothing |

No hydration error on any of them, nor on Home and the catalogue (`review-captures/hydration-check.ts`). What was
seen before this fix lived in the browser's storage and is not read any more: the first visit after it is a first
visit, and nothing replays.

## D190, 23 Sep 2026: what the proof checks really are, in production and behind the switch

The founder's instruction: README and CLAUDE.md said every Reclaim proof is verified with its TEE attestation
required. That holds for one of the two kinds of proof only. They now say what is true in production today and what
is true behind `PROOF_VERIFIER=local`, which production does not set.

- **A proof shown from a Reclaim session** (`/api/proof/verify`): js-sdk `verifyProof` with the application secret,
  the TEE attestation required, the AI fallback refused. True in production.
- **A reading Viky makes itself** (zkFetch through Reclaim's TEE client: Duolingo's daily lesson, Chess.com, the
  certificates, a connected source's reading): verified by the attestor's signature against the list Reclaim serves at
  that moment, then Viky's pin. The proof carries no enclave attestation (measured 11 Sep 2026), so the TEE is not
  verified on this path in production.
- **Behind the switch:** offline verification by Viky alone, every signer pinned, and each witness's enclave
  attestation verified and pinned by image digest when `RECLAIM_ATTESTOR_IMAGE_DIGESTS` is set.

No code changes: the documents were wrong, not the checks.

## D191, 23 Sep 2026: Strava, connected by the person, the second source of the third nature

The founder, 23 Sep 2026, with Fitbit (D188): two sources of the mode "connected by them", built whole up to the
screen. This is the second, on the model of the first, under the same eight rules.

- **The line.** `strava-daily`, "Kilometres each day, on Strava", a daily condition on goal 4 of the daily contract
  (`GOAL_TYPE_STRAVA_DISTANCE`, written with the contract and never registered; provider id
  `viky:provider:strava-connected:v1`), in `BUILDING`, family "Move", offered to nobody, "Being built" on the public
  page with the missing pieces named. The target is the funder's, in kilometres a day, three suggested.
- **What differs from Fitbit, and only that.** Strava takes no PKCE: the exchange carries the application's secret,
  and the signed state's verifier is empty. Strava sends back what the person allowed beside the code, and a
  connection without `activity:read` is refused (`SCOPE_MISSING`) rather than kept. The page is the list of the
  day's activities, captured whole by the attested fetch since a day is a sum and a pattern captures one value; the
  app adds the `distance` fields (metres) of the activities whose start falls in the UTC day and drops the list. The
  key lives six hours; the revoke goes to `/oauth/revoke`, the endpoint Strava recommends since 1 Jun 2026.
- **One reading for every connected source.** `src/connected-checkin.ts` became one reading with one line per
  source (`ConnectedLine`: the page, the judge, the refresh, the provider id); Fitbit's behaviour is unchanged and
  its tests say so. The consent, the vault, the signed state, the store and the connect screen are shared as they
  were built to be; the routes are Strava's own under `/api/connect/strava`.
- **The source waits with Fitbit's.** `src/strava-source.ts` is outside the fingerprinted file for the reason of
  D188, rule 5; the branch `catalogue/fitbit-source` is to move both at once, one redeploy by the founder for the two.
- **Defaults applied, to confirm (the founder away).** Three kilometres suggested; the day being the UTC calendar
  day; the whole list captured (the alternative, one pattern per activity, cannot sum an unknown number of them);
  the line opening on the pieces alone. Strava's single-player mode means only the founder's own account can connect
  until Strava raises the limit: written on the judges' page and in OPERATIONS as the founder's step with Strava.
- **What is verified, and what waits.** The authorisation URL, the scope check, the exchange, refresh and revoke
  against a fake Strava, the day's bounds and sum, the verdict, the source's pattern on a sample list, the state's
  round trip, the register and the privacy line. Not verified: no application exists, so no real connection, no
  real reading, no goal signed, and the service not redeployed.
- **What crossed the frontier, said in the PR.** `app/judges/page.tsx` (Strava's clauses), the four routes under
  `app/api/connect/strava`, `src/gift-terms.ts` (the provider id). Nothing in `app/kit`: the connect screen knew no
  source by name.
## D192, 23 Sep 2026: a refusal of the RPC provider is never a refusal of the product

**What happened.** From 09:21 on 23 Sep 2026, every contract read of the server failed: `/api/gifts/mine` and
`/api/gift/[id]` answered 500, Home and Gifts said "Your gifts could not be loaded", and the pages that read a gift on
the server (D160) found nothing and were built a second time by the browser. The provider answered every call with
"Unspecified origin not on whitelist": its key had just been restricted to the viky.cash origin, after the security
review of #160 found it public. A browser sends that origin; a server sends none. Measured on the same key:

| call | answer |
|---|---|
| no origin (the server) | `-32600 Unspecified origin not on whitelist.` |
| origin `https://viky.cash` | the block number |
| `https://rpc.monad.xyz` | the block number |

**What changed.** Every client, on the server, in the browser and in the operator scripts, goes through one transport
(`monadTransport` in `src/monad/chain.ts`): the configured provider first, Monad's public endpoint when the provider
refuses or fails. A contract's own revert is not retried elsewhere. The server now reads `MONAD_RPC_URL` first when it
is set, a server-only variable, so the server can have its own unrestricted key without it ever reaching the browser.

**What waits for the founder.** No variable, key or provider setting was touched. Until a server key is set in
`MONAD_RPC_URL`, every server call asks the restricted key, is refused, and is answered by the public endpoint: one
extra round trip per call, and the public endpoint's limits (100 blocks per `eth_getLogs`).

## D193, 23 Sep 2026: providers defined from public pages, patterns on stable labels, a miss by its name; the corridor's two portals, unverified

The founder, 23 Sep 2026: "Méthode pour les fournisseurs qu'on ne peut pas essayer sur un compte : tout ce qui est
public sert [...] définis l'extraction sur des libellés stables [...] jamais sur des sélecteurs fragiles. Une
extraction manquée doit échouer proprement [...] un événement nommé arrive dans le journal [...] Écris pour chaque
fournisseur, dans docs/reclaim/, d'où vient chaque motif." And, for the corridor: "définis le fournisseur depuis la
page de connexion publique et la page de résultats la plus probable, marqué « unverified » dans la ligne."

- **Where each pattern comes from, provider by provider** (docs/reclaim, read 23 Sep 2026). Cyclades: its own FAQ
  names the rubric ("Mes inscriptions", then "Mes notes") and the words ("Admis", "Refusé", "Admis au second groupe").
  Epim-Exam: the candidate space's own bundle names the sign-in ("Matricule", "Mot de passe"), the results routes and
  the labels ("Décision", "Admis", "Refusés", "Relevés de notes"). Bac Maroc: the Ministry's results page prints one of
  "Admis avec mention", "Admis", "Rattrapage", "Non admis". EcoleDirecte: the application's API as its users documented
  it (`notes.awp`, `periodes[].ensembleMatieres.moyenneGenerale`, "14,50"), and the definition now carries that request
  and a regex on the field's own name. Udemy: the "My learning" request as its users wrote it down
  (`api-2.0/users/me/subscribed-courses/`, `completion_ratio`, `published_title`), and a regex that takes the ratio and
  the slug from the same course object. Cambridge and IELTS already sat on the Statement of Results' own labels.
  Every one of them stays unverified until a real session, and says so.
- **A miss, by its name.** A page that does not carry what the pattern names is refused before anything is signed, as
  before, and now also: the gift's journal gets one row `refused:<the name>`, not attested, with no number, no
  fingerprint and no proof, so the founder reads the miss and corrects the pattern; and the person reads the refusal
  followed by "Nothing was counted and nothing is lost: this gift stays yours to earn until its deadline, and only then
  does the money go back.", true of the contract.
- **The corridor.** UCAD: the Student Center's sign-in (`studentcenter.ucad.sn/login`, the form's own fields) for
  enrolment, and the university's grades platform (`pubnotes.ucad.sn/resultats`, named by its information portal) as
  the most probable results page. UFHB: the ministry's registration platform (`inscription.mesrs-ci.net`, its form's
  own fields) for enrolment; the student space the university names (`ufhb.mysonec.com`) answered nobody from outside
  and has no secure address, so the row carries enrolment alone. A portal row takes `unverified`, written by
  `UNVERIFIED=1`, and the chooser prints "(unverified)" beside the university; the mark goes when the row is written
  again from a student's session.
- **Defaults applied, to confirm (the founder away).** The words the patterns accept beyond what a source printed
  ("Validé" for a semester at UCAD, "Payé" for a paid registration at UFHB); EcoleDirecte reading the last period that
  carries an average; a row opening its lines while unverified (the rule of D184 opens a built line, and the mark
  tells the funder what is not yet proved); the word "unverified" itself on a consumer screen.
- **What is not done.** No provider is registered: the dashboard needs the founder's session. No row is written: the
  providers' ids do not exist yet.

## D194, 23 Sep 2026: the eleven goals in one Safe transaction, through Safe's canonical MultiSendCallOnly

The founder, 23 Sep 2026: eleven calls are twenty-two signatures by hand; build one batched transaction through
MultiSendCallOnly 1.4.1 at its canonical address, verified in safe-deployments and read on the chain, one hash, two
signatures, and write why this delegate call is accepted when 20 Sep avoided one for three calls.

- **Built.** `safeMultiSendCallOnly` in `src/safe.ts`, the one place a delegate call is built, to a constant address;
  `pnpm safe:session` reads what is missing from both contracts, checks the library's code hash and the Safe's guard,
  prints one hash, and later recovers the two signatures and rehearses before sending.
- **Read on 23 Sep 2026.** The canonical address `0x9641d764…02e2` for chain 143 in safe-deployments; its code on
  Monad hashing to the published `codeHash`; the Safe at nonce 7, threshold 2, no guard; the hash
  `0x8b90a99b…2d99` equal to the Safe's own `getTransactionHash`; the eleven calls rehearsed from the Safe's address
  without a revert (672,256 gas).
- **Why accepted.** Written in OPERATIONS: Safe's own library, checked byte for byte each time, the call-only variant,
  no storage and no owner in it, atomic, rehearsed; against eleven sittings of the same keys. No technical reason
  forbade it. The eleven single hashes remain the fallback, by `pnpm safe:action`.

## D195, 23 Sep 2026: an unverified portal does not refuse the gift; the funder reads why before paying

A default applied by the founder on the remark of the fourth developer: a portal row marked unverified (D193) does
not refuse creation. Where the university is chosen, before paying, the funder reads the sentence under it, the
founder's own words: "Nobody has shown a proof from this university yet. If it cannot be read, your money comes back
to you at the deadline." It passes the consumer words check (the register file is scanned, and the test scans the
sentence as printed). It is true of the contract: a gift never proved returns whole to the funder at the deadline.
The sentence goes when the row is written again from a student's session, since the mark goes with it.

## D196, 23 Sep 2026: a signed-in screen is drawn once, and proven by a test; the entrance starts at 60 %

The founder: the landing, Home and You still load twice with his account, not a gift's page. His method: reproduce,
name the trigger, a regression test as the only proof, no blind fix.

**Reproduced, measured.** Cold loads of the three pages, marks at hydration and at every replacement of `<main>`, every
animation that starts, frames every compositor frame:

| where | account | replaced after the first image | an entrance played twice |
|---|---|---|---|
| viky.cash, Chromium | a new test account, no gift | never | never |
| local production build, Chromium | the founder's four gifts, euros and day copied onto a test account (test branch) | never | never |
| the same, service worker on, cold, reload, then the bar | the same | only on a page change | never |
| the same, WebKit 26 (Playwright 1.58, the one macOS 14 still runs) | the same | never | never |

**The trigger, named by a control.** With the server's read of the session switched off (`signedInAccount` answering
nobody), the symptom is exactly the founder's: the server draws the page for nobody, the browser then learns the session
from `/api/account/session` and replaces `<main>` with the account's, and every block enters a second time. A gift's
page does not change, because anybody may read it. So the double load is a first image drawn for nobody on a device
that is signed in. On every configuration this machine can drive, the server draws the account from the cookie in the
first byte, which is already what the founder asks for (D156, D160); what makes his phone's first image differ is not
known. The trace below is how it becomes known.

**What changed.**
- `<main data-drawn-for="account|nobody">`: whom a screen was drawn for is on the page itself.
- `test/browser/first-image-signed-in.spec.ts`: an account made with a virtual passkey; the landing, Home, Gifts and
  You loaded cold; the page the server sends must be the account's, `<main>` never replaced after the first image, no
  block entering twice. With the server's read switched off it fails twice over: on the page sent, and, with that
  check removed, on `<main>` replaced by the account's. It is in the local pass.
- `?trace=1` on any page (kept for the tab, closed with `?trace=0` or ×): the phone prints when the page came alive,
  whom it was drawn for, "SAME PAGE drawn again" when `<main>` is replaced without a page change, and any block that
  enters twice. Nothing is sent anywhere.
- The entrance starts at 60 % and rises 8 px (`MOTION.reveal.fromOpacity`, `--page-enter-from`): from 0, the first
  image after a press was 5 % visible on the catalogue. Reduced motion fades from 60 % too. **Default applied, to
  confirm by eye.**

**What waits for the founder.** Open viky.cash/?trace=1 on the phone, then the landing, Home and You, and send a
screenshot of the trace: a "drawn for nobody" line on a signed-in phone, or a "SAME PAGE drawn again", names the cause
on his device.

## D197, 23 Sep 2026: Fitbit is read through the Google Health API; the Fitbit Web API closes

The founder, 23 Sep 2026: the Fitbit Web API closes on 30 Sep 2026 (the banner on dev.fitbit.com, registrations
closed); retarget the line on the Google Health API, `https://health.googleapis.com`, v4, Google's OAuth 2.0,
`users.dataTypes.dataPoints.dailyRollUp`; the variables `GOOGLE_HEALTH_CLIENT_ID` and `GOOGLE_HEALTH_CLIENT_SECRET` in
place of the `FITBIT_*`; read Google's terms first. The banner read here the same day says "September 2026".

- **Read first** (23 Sep 2026): the API's discovery document (revision 20260922) for the scope, the method, its
  request and its answer; the setup guide (a web application client, testing mode of a hundred users and seven-day
  refresh keys, CASA beyond); the Developer Terms (24 Mar 2026) and the Developer and User Data Policy (24 Mar 2026).
  Nothing in them forbids a verdict shared with the funder under the person's consent; they ask for the disclosure
  immediately before that consent, deletion on request, and use limited to the feature. Written in OPERATIONS and on
  the judges' page.
- **What changed.** Google's authorization page, PKCE and the client secret, `access_type=offline` and `prompt=consent`,
  one scope (`googlehealth.activity_and_fitness.readonly`); the account is the API's `healthUserId`, asked of
  `users/me/identity` with the new key; a connection without the scope is refused (`SCOPE_MISSING`); the revoke is
  Google's. The reading is `POST …/users/me/dataTypes/active-minutes/dataPoints:dailyRollUp` with a body naming the
  civil day and the next, one window: the attested read gains a method and a body for a connected source, both part
  of what is signed and both checked. The minutes are `MODERATE` plus `VIGOROUS`, the counterpart of the legacy
  "fairly" and "very"; the roll-up is captured whole, since its levels come in no promised order.
- **What did not change.** The line's id, goal 6 (registered on 23 Sep), its provider id, the routes and the redirect
  path `/api/connect/fitbit/callback`, the consent and the verdict rule, the vault, the connect screen. The source keeps
  its name for the person: they wear a Fitbit, and connect the Google account it uses.
- **Defaults applied, to confirm (the founder away).** `google-wearables` as the data source family, so minutes logged
  by hand do not count; the civil day asked being yesterday's UTC date (the API reads it in the person's own civil
  time, which for a person west of UTC is not over when the pass runs after midnight UTC); the moderate and vigorous
  levels.
- **Strava.** What the line needs is the application's Client ID (a number) and Client Secret; the access and refresh
  tokens shown on Strava's settings page are the owner's own and are not used. Said in OPERATIONS.
- **Still the founder's.** The two variables, the consent screen's test users, and the reading service redeployed with
  the source (PR #166, to be rebuilt on this).
## D198, 23 Sep 2026: the first image of a document is the whole screen, still; the audit of a reload

The founder: the blink is systematic on a reload on his phone, never on a navigation; the answer is in the code, and
a bug named is a bug fixed professionally. So: the whole path of a reload, read in the code, each step judged on one
question, can it change the image after the first one.

**The path of a reload, in the code.**

1. The request carries the cookies. The root layout reads the session, the appearance, the currency, the card, the
   zone, what was seen and the render minute (`app/layout.tsx`), and the page reads the money and the gifts
   (`app/page.tsx`). The document is drawn whole, for the account, in one render. Cannot change the image afterwards.
2. The document is streamed and parsed. A browser paints what it has parsed when the rest has not arrived or the
   parser yields. Measured on this machine with the CPU slowed six times on a Fast 3G profile: 40 to 100 ms between
   `<main>` existing and its blocks existing (the log's `font-used` mark, which needs a block, came that long after
   `main-first`), and with the service worker streaming the response, one reload in two painted a frame in that
   window: the mark and the appearance control alone on the lavender ground. **Changes the image: a first image that is
   the head of the screen, then the screen.**
3. The stylesheet applies. Every block of `main.page-enters` starts its entrance: dim, 8 px low, the later blocks held
   at that state by `backwards` until their turn (`app/globals.css`, `.page-enters`). On a navigation the previous
   screen is gone and a new one enters, which reads as a change of screen. On a reload the browser keeps the previous
   screen on the glass until the new one paints, and the new one is the same screen, dim and low: the same screen
   goes out and comes back. D171 asked for exactly this ("le rechargement joue la même entrée que la navigation");
   it is what the founder now names as the blink. **Changes the image: the screen, then the screen dim, then the
   screen.**
4. The theme script runs before paint (`THEME_BOOT_SCRIPT`): it applies the device's stored choice to `<html>` and
   the bar's colour. React never patches an attribute at hydration, and the appearance control reads nothing at
   render (D159), so nothing flips afterwards. Cannot change the image.
5. The fonts. `next/font` serves both faces from the build with stable names, the service worker keeps `_next/static`
   for a day and the browser keeps them as immutable: a reload has them. Cannot change the image on a reload.
6. Hydration. Every value the browser knows and the server does not is read through `useSyncExternalStore` with a
   server snapshot (the session, the zone, the language, the tab's currency, the seen cookie, the minute, the display
   mode), so the first render agrees with the markup and no tree is thrown away. No hydration error on Home, Gifts,
   You, the catalogue or a gift's page, in Chromium and in WebKit. `Install` on You alone answers `standalone` after
   hydration and withdraws its block in the installed app: a block leaving, not a screen redrawn.
7. After hydration. The session is asked again (`/api/account/session`) and confirms what the server drew; the gifts
   are asked again and replace equal cards under equal keys; the preferences confirm the currency of an account that
   chose one; the arrival plays only what the seen cookie says changed (D189); the reveal on scroll waits for a
   scroll. A server that cannot read the session draws the screen for nobody and the browser then replaces `<main>`:
   that is the double load of the morning (the RPC refusal, D192), and D196's test now refuses it. Cannot change the
   image when the server reads the session.

Two steps change the image, 2 and 3, and both are on a reload only, which is the founder's observation exactly. Step 3
is systematic, on every device, at every speed; step 2 is one reload in two on a slowed phone, and never at this
machine's speed.

**What changed.**

- **Step 3.** The first screen a document draws is drawn whole and still: `Shell` gives `page-enters` to every screen
  but the document's first, by a module variable the server never sets, so the server and the browser's first render
  agree. A navigation still enters, with the turns of D171. This withdraws the reload part of D171, on the founder's
  instruction of today, which outranks it.
- **Step 2, tried and withdrawn.** Hiding the body until the end of the document is parsed (a mark set by the first
  script in the body and removed by the last, the body `visibility: hidden` meanwhile) was built and measured on the
  same slowed profile: the reload then painted a blank lavender ground in place of the head, for the same 40 to 100
  ms, and the whole screen after it. The browser paints the ground before the body is parsed whatever the body is,
  so the frame does not go away, it changes content. Withdrawn, and `test/first-image.test.ts` refuses it coming back.
  What the window really is: React streams the shell in chunks and the browser parses and may paint between two
  chunks; the document of Home is 88 KB, of which 35 KB are the thirty-seven characters drawn inline as SVG and 15 KB
  the payload React hydrates from. The remedy is a smaller document, one drawing of each character referenced by
  the rest, which is a task of its own and not a blind change here.
- **Tests.** `test/browser/arrival.spec.ts`: a load and a reload play nothing, the next screen enters with the turns. `test/browser/first-image-signed-in.spec.ts` (D196): on a load and a reload
  of the landing, Gifts and You, signed in, `<main>` is drawn once, for the account, with no entrance at all.
  `test/first-image.test.ts` and `test/motion.test.ts` pin the scripts, the stylesheet and the shell.

## D199, 23 Sep 2026: seven directory university providers read; one proves enrolment and is pinned

The founder, 23 Sep 2026: seven public university providers of the Reclaim directory, used by other applications;
read each (fields, version, request), keep those whose fields prove enrolment, pin them like the TOEFL, write their
portal rows and open them; the ones that prove only a name stay closed, and say why.

- **Kept, one.** The American University of Rome, `8a769077…` ("Student Status", used by three applications): the
  student's own course schedule and the term it is for. Pinned in `src/directory-portals.ts` (id, version 1.0.0,
  request hash), row `aur-it`, field `Current_semester` against a term of 2026-2027, marked unverified.
- **Closed, six**, in docs/reclaim/directory-universities.md: HUJI (the fields would do, but one student's own name and
  number are written into its patterns, so it matches nobody else), Sharjah (an account and a department, no term),
  Innopolis (the verified one builds its request in a script, nothing to pin; the others a name), IGNOU and Dhaka (a
  name), Lagos (an AI-witnessed proof, refused everywhere).
- **Not done, and why.** The row is written by `pnpm portal:directory`, one command; it needs the production
  `DATABASE_URL`, which Vercel returns empty (sensitive), so it waits for the founder's shell. The enrolment line is not
  opened in this PR: opened before the row exists, it would offer a chooser with no university in it. The PR that
  opens it follows the row, and changes one line of the register.
- **Default applied, to confirm.** The term's pattern accepts both "Fall 2026" and "2026 Fall", and this academic
  year's two years; it is rewritten each year with the row.

## D200, 23 Sep 2026: staying enrolled at university opens, on the American University of Rome

The founder, 23 Sep 2026: open the enrolment line as soon as the other developer confirms the row. The other
developer's session reported, from Viky-c2, the migration and `pnpm portal:directory` run against production: one row,
`aur-it`, provider `8a769077…` 1.0.0, request hash `0xe7543349…f18c`, unverified, proven by `0x350aF869…107761`.
Read back independently here through the public search: `/api/portals/search?q=Rome` answers "The American University
of Rome (unverified)", Italy.

- **Opened.** `UNIVERSITY_ENROLLMENT_SHOWN` joins the register, `live: true`, `state: "open"`: its path is complete
  (goal 14 registered on 22 Sep, the portal's provider pinned in its row, the flow built), the rule of D184.
- **Words the chooser holds.** The name is "Enrolled at university, shown", thirty characters at most on a card, as
  "A TOEFL score, shown" is; the line under it is shortened to the chooser's hundred and sixty; the card's sentence
  reads "Opened. Nothing shown yet from their university." from the register's source word.
- **Not opened.** The year passed and a grade reached: the row holds no results page (`NO_RESULTS_PAGE`, by name).

## D201, 23 Sep 2026: Fitbit and Strava open, the reading service running their sources

The founder, 23 Sep 2026: redeploy the reading service from PR #166, merge it only when `/health` answers its number,
then open Fitbit and Strava.

- **The redeploy.** From `catalogue/fitbit-source`, rebased on main (the two fingerprinted files unchanged on main,
  the number unchanged), a clean tree, the full local pass run on that commit, then `railway link -p viky -s
  zkfetch-worker -e production` and `railway up --ci`. `/health` answered
  `0x1dbac43b34f0e5162fa3d22d87346e3e7821d8e81ad3c4c6fc038f61cdc36008` at 20:29 UTC; #166 merged after that, and
  production served its commit.
- **Opened.** `FITBIT_DAILY` and `STRAVA_DAILY` join the register, `live: true`, `state: "open"`: the five variables
  set on Vercel (`CONNECT_TOKEN_KEY` generated in the pipe, never shown; `GOOGLE_HEALTH_*` by the founder;
  `STRAVA_CLIENT_ID` 265669 and its secret, checked against Strava's token endpoint with a fake code before being
  set), `viky_connections` migrated, goals 6 and 4 registered, the service running both sources, Strava's callback
  domain set to viky.cash. The rule of D184.
- **Words the chooser holds.** Fitbit's name is "Active minutes a day, Fitbit" (thirty characters at most); both lines
  under the option are shortened to the chooser's hundred and sixty, and their proof lines to a hundred and twenty.
- **What is still true, and said.** No real connection has run on either. Strava's application is in single-player
  mode until Strava raises the athlete limit, so only the founder's own Strava account can connect; Google's client
  is published in production, so the seven-day lapse of testing mode does not apply, and past a hundred users
  Google's verification does. Both are on the judges' page.

## D202, 23 Sep 2026: the funder's private space, one passkey and a second key (Mera "One Passkey, Many Keys")

The founder's instruction, in the autonomous queue of 23 Sep 2026: his people and their nicknames, and his own notes,
encrypted with a key derived from the passkey under its own salt, stored encrypted on the server, readable on any
device with the same passkey, never readable by us; the key persists nowhere and nothing sensitive goes on disk; the
recipient's first name stays in clear on the gift; the PR carries a multi-device test.

**Built.**

- **The key.** `mera.passkeyOutputFor(salt)`: one passkey prompt, restricted to the passkey this device signed in with,
  for the salt `sha256("viky:private:v1")`, which is unrelated to the account's (`sha256("mera.prf.salt.v1")`). The
  output goes through HKDF-SHA-256 into an AES-256-GCM key that cannot be exported, and the PRF bytes are zeroed at
  once (`src/private-space-crypto.ts`). The account is the additional data of every seal, so a copied envelope does
  not open under another account.
- **What the server holds.** One envelope per account, `{version, nonce, ciphertext}`, with a revision
  (`viky_private_spaces`, `src/private-space-store.ts`, `/api/account/private`). It accepts an envelope by its shape
  and size alone and writes only over the revision the device read; a device that lost the race is told "It was
  changed on another device" and opens again. The server never sees a key, a nickname or a note.
- **The screen.** A card on You, "Private to you": "Open" asks the passkey once and lists the first names of the gifts
  this account funded, each with a field for the funder's own name for them, and one field of notes; "Keep" seals and
  sends; "Close" forgets the key. The first name written on a gift stays on the gift, and the card says so.
- **The key's life.** In the card's memory only, never in storage: gone on "Close", on leaving You, on another account,
  and after the ten idle minutes of a signing session. Nothing about it is written anywhere.

**Defaults applied, to confirm.** The card lives on You, under the session card. The people are the first names of the
gifts funded, once each, plus anybody the space still names whose gift is gone. The notes are one text. Nicknames are
40 characters at most, notes 2,000, people 60.

**Measured.** Chrome's virtual authenticator does not carry a passkey's PRF secret across an export: a credential
exported from one profile and imported into another answers no PRF at all (23 Sep 2026, `WebAuthn.getCredentials`
then `addCredential`, `prf.results` undefined). So the two-device test stands the PRF in with a script in each
profile that answers HMAC(seed, passkey id, salt), the same output for the same passkey and salt on both, as a synced
passkey does; the sign-in, the route, the database and the sealing in the page are the real ones. The test
(`test/browser/private-space.spec.ts`, in the local pass): the first device creates the account, names Léa "Lili" and
writes a note, keeps; the request that leaves it carries a nonce and a ciphertext and none of the words; a second
profile holding nothing but the passkey signs in as the same account and reads "Lili" and the note; a third profile
with the first device's session but another key is told "This passkey does not open it" and is offered nothing to
keep. `test/private-space.test.ts` seals and opens on Node's Web Crypto, refuses another output, another account and
a tampered envelope, and drives the store on PGlite and the route with a signed session.

**Waits for the founder.** `pnpm db:migrate` on production for `viky_private_spaces` (run after the merge, as for the
other tables), and his eye on the card.

## D203, 23 Sep 2026: PRONOTE is built, its publisher's terms and the risk written

The founder, 23 Sep 2026: PRONOTE is added, as Duolingo is: Index Education's terms forbid any retrieval device
without written authorisation; the risk is assumed and written on the judges' page (the person shows their own marks
at their own request, GDPR rights of access and portability, articles 15 and 20; no mark kept, only the verdict).
Built as EcoleDirecte, from the parents' account by preference; the spaces are hosted per establishment
(index-education.net), so the line carries the space's address as a portal line does. This replaces the refusal of
D179 for PRONOTE.

- **The line.** `pronote-grade-shown`, "An average on PRONOTE, shown", family School, goal 24 on `MilestoneGift`,
  shape having it or not, the target out of 20 in hundredths as EcoleDirecte's. The funder pastes the space's address;
  its word (`0123456a` in `0123456a.index-education.net`) is bound into the subject they sign, so another
  establishment's space pays nothing; the person signs in on that space's `parent.html`.
- **One technical limit, said.** PRONOTE answers in clear JSON unless the establishment switches on its own AES
  encryption or compression (`CrA`, `CoA`); a space that does gives a proof with no average in it, refused `NO_GRADE`,
  nothing lost. How many do is not known; the public demonstration space does neither.
- **Being built.** The provider is ours and is registered from a real family's space; goal 24 is one Safe transaction.
  Until both, the line says so on the public page and nobody can make a gift on it.
- **Default applied, to confirm.** The parents' page as the sign-in, the pupils' page accepted in the provider; the
  space taken from an `index-education.net` address only (a school hosting PRONOTE elsewhere is not served).
## D204, 23 Sep 2026: ceilings on what the relayer pays for

The founder's instruction, from finding 2 of the money path review of 23 Sep 2026 (#160): per account and per
connection, a most of relayed actions per hour and per day (20 and 100, adjustable); a smallest amount for a relayed
send and a relayed withdrawal (one dollar); the cancel route's readying limited to one top-up a minute; beyond, a named
refusal and an honest sentence; the daily pass and the keeper's claims outside these; and the MON left after a refused
burst measured in the PR.

**Built.**

- **The counts** live in the database, one row per scope and window bucket (`viky_relay_counts`,
  `src/relay-ceiling-store.ts`): every server counts the same actions, and the increment is one statement, so two
  requests at once each see their own count. A refused action is taken back out, so only what the relayer was asked to
  pay for is counted. Buckets are UTC hours and days; rows two days old are swept by the first action of an hour.
- **The door** (`src/relay-admission.ts`): `admitRelay` counts an action against four ceilings, the account's hour and
  day and the connection's hour and day, and refuses by name, `RELAY_CEILING`, 429, with the wait in minutes or
  "tomorrow"; `admitTopUp` holds a readying top-up to one a minute for the account and for the connection,
  `TOP_UP_TOO_SOON`; `assertNotTooSmall` refuses a send or a withdrawal under the smallest amount, `TOO_SMALL_TO_RELAY`,
  409, unless it is everything the person has: small money is never locked, and dust is never relayed. The numbers are
  `RELAY_PER_HOUR`, `RELAY_PER_DAY`, `RELAY_MINIMUM_CENTS` and `TOP_UPS_PER_MINUTE` when set.
- **Where it stands:** the send, the withdrawal of a daily and of a milestone gift, the way out, the cancel and its
  top-up, the claim, the check-in, the proof shown (where a refusal is reported beside the attested proof, which
  stands, and nothing is relayed), and the creation. Always after the request has been checked and before the relayer
  is asked for anything, so a refusal costs nothing. `test/relay-ceiling.test.ts` reads each route and checks the
  order. The daily pass and the keeper call the relayer directly and never go through the door.
- The in-memory limiter of a warm instance (20 per ten minutes per connection and account) stays in front, as before.

**Measured: a refused burst costs nothing.** A local production build with `RELAY_PER_HOUR=5`, a fresh account made
with a virtual passkey holding nothing, thirty relayed sends of $1.00 in a row, 1.9 seconds:

| answer | how many |
|---|---|
| 409 `NOT_ENOUGH` (admitted, refused by the account's own balance before any send) | 5 |
| 429 `RELAY_CEILING` "That is as many actions as Viky sends for one account in an hour. Try again in 24 minutes." | 15 |
| 429 "Too many attempts. Try again shortly." (the warm instance's own limiter, at its twenty-first request) | 10 |

The relayer `0x150d…CFE4` held 53.3275262432 MON before and 53.3275262432 MON after: a difference of 0. Nothing was
sent to the chain by any of the thirty.

**Default applied, to confirm:** the exception to the smallest amount, everything the person has may always go, which
the founder's instruction did not name; without it a gift of fifty cents could never be taken out.

## D205, 23 Sep 2026: PRONOTE encrypts its answers by default; D203 corrected, the line blocked

The founder asked whether PRONOTE's public demonstration space carries the same `appelfonction` request as a school's,
so that a provider registered from it would serve any `*.index-education.net` space.

- **The demonstration space is a faithful model.** Its parents' page and two real schools' (`e972000a`, `e212074o`),
  read on 23 Sep 2026, load the same client script, byte for byte, and start the same way; the demonstration adds only
  `"d":true`.
- **But no space sends the average in clear.** The current client library (Pawnote) reads the page's `sCrA` and `sCoA`
  as flags to skip encryption and compression, both false when absent, and decrypts every answer with a key derived at
  sign-in. None of the three pages carries either flag. A witness would attest ciphertext, and no pattern can read an
  average in it. D203 said the opposite, from an older client (pronotepy); that sentence was wrong and is corrected in
  the code, the definition and OPERATIONS.
- **So the line stays being built, with its real reason.** Registering a provider from the demonstration space or a
  parent's would read nothing. Goal 24 is prepared for the next Safe session all the same, as the founder asked, and
  opens nothing by itself. What would unblock it is a readable answer: a provider that can decrypt with the session's
  key inside the verification, or another PRONOTE surface that serves the average in clear. Neither is known today.

## D206, 24 Sep 2026: the characters out of the page, the second cause of the flash on a reload (D198)

The founder, 24 Sep 2026, first of three: the drawings of the characters out of the document, because D198 named the
second cause of the flash on a phone's reload: the browser paints what it has parsed between two chunks of the
document, and Home's document was 91 KB, a third of it thirty characters written in full.

**Built.** `public/characters.svg` holds each drawing once, 32 `<symbol>` with no box of their own (37.5 KB), written
by `pnpm make:characters` with its version in `app/kit/character-file.ts`; the screens name a drawing with
`<use href="/characters.svg?v=…#today-1">` inside their own `<svg>`, which places it. The file is asked for in the head
(`preload`, high priority) and kept a year (`Cache-Control: public, max-age=31536000, immutable`): its address changes
with its content. `Character` names its drawing by default and writes it into the page only where a part moves,
because a named drawing's parts cannot be reached from the page:

- the row of a gift's page, whose days follow the pointer and jump in the arrival (`DayRow`, `drawn="inline"`);
- on a card, a day earned or gone back, which jump or leave in the arrival (`DayStrip`);
- the gift answering a payment (`PayGift`, inside `Success`);
- the diamond, always, because its blend reads the look's colours inside its own gradient;
- the pictures drawn on the server (`characterSvg`), which have no page to read a file from.

**Measured.**

| | before | after |
|---|---|---|
| Home's document, signed out | 91,433 bytes | 68,020 bytes |
| whole pages at 390 and 1440, day and night (Home, You, Gifts, the catalogue, Help, Privacy, Legal, Fund) | | 32 of 32 identical pixel for pixel |
| a named drawing against the same drawing written into the page, day and night | | identical pixel for pixel in Chromium and in WebKit 26 |
| eight reloads of Home, the founder's four gifts copied onto a test account, service worker on, CPU slowed six times, Fast 3G: first images with a block or the bar missing | 8 of 8 | 1 of 8 |
| characters painted empty on those first images | | 0 |

`test/character-file.test.ts`: the file is what the drawings make today and the address names its version; every
character that does not move names a drawing the file holds; named and written are the same drawing, symbol for
symbol; every character whose parts move is written into the page; the preload and the cache header are there.

**Not done.** One reload in eight still paints before the end of the document on the slowed profile. What remains of
Home's document is the page itself and the payload React hydrates from; a smaller payload is a task of its own.

## D207, 24 Sep 2026: PRONOTE is parked; its bulletin PDF is encrypted too

The founder's last lead before parking PRONOTE: the bulletins and grade reports downloaded as PDF from the parents'
space. Checked on the demonstration space, signed in by the founder's session, 24 Sep 2026.

- **The file comes in the open**: a plain `GET` on `/pronote/UrlUnique/<name>.pdf`, outside `appelfonction`,
  `application/pdf`.
- **But it is encrypted**: the PDF standard's own security handler (`/Filter/Standard /R 3 /V 2`, RC4 128 bits). Its
  page stream is ciphertext; the average on screen (14,94) is nowhere in the bytes, raw or inflated. A witness would
  attest ciphertext, as for the answers of D205.
- **So PRONOTE is parked**, as the founder said: off the register's lists (the public page, the chooser, the proof
  sessions, the privacy and proof answers), its reason on the public page's school line and on the judges' page, the
  code kept for the day a readable answer exists. Goal 24 stays in the list of goals and waits.
- **Why the family sees the marks**: their browser decrypts them with a key made at sign-in; a zkTLS proof attests the
  bytes on the wire, before that.
## D208, 24 Sep 2026: money a daily gift already paid is taken out from Home while the gift runs

The founder's default of 23 Sep 2026, confirmed 24 Sep with its route chosen: a daily gift's earned share stays
withdrawable while the gift runs, from "Take it out"; the gift's page says so quietly, with no competing action; a
milestone offers nothing before "Atteint".

**Why a route had to be chosen.** What a daily gift earns stays in its contract until the person it is for signs a
withdrawal, and that withdrawal existed only on the gift's page, as the action of "Atteint" (D172). Home's balance and
the way out read only the account's own coins. So the default's sentence, "$3.00 already in your balance", would have
been false while the gift runs. The founder chose: the gift's page keeps no gesture, and the way out learns to take
the gifts' part first.

**Built.**

- `/api/gifts/earned`: for the signed-in account, each gift it is the contract's recipient of that holds something for
  it now, with its contract, the amount and the withdrawal nonce the contract expects next (`src/earned-in-gifts.ts`).
  Read from the contracts, never from a record.
- The way out (`CashOut.tsx`) reads that with the balances and counts it in the figure at its head and in every way's
  figure, and says so: "$3.00 of it is still in your gifts. It comes out first, with one signature per gift." Choosing
  a way first signs one withdrawal per gift for its whole part, relayed into the account ("Taking what your gifts hold
  into your account."), reads the balances again, then goes on as it always did. A refusal stops there: whatever came
  out is in the account, whatever did not is still in its gift, and the screen says nothing was lost.
- Home offers "Take it out" when only the gifts hold money (`holdsAnything(holdings, gifts)`, each gift's summary now
  carrying `takeable`), because the gift's page sends its recipient there.
- The gift's page, a daily gift that counts, to its recipient, while the contract holds some of what they earned: "It
  is yours already. Take it out from Home whenever you like." under the figure, with no amount, since the figure says
  it, and with no button. A milestone gains nothing: before "Atteint" it has earned nothing, and at "Atteint" its page
  keeps its own action.
- Each withdrawal is a relayed action, so it counts against the ceilings of D204; being the whole of a gift's part, it
  is never refused as too small.

**Not verified.** No gift with an earned balance for a test account exists on mainnet, so the gathering step has not
run end to end with money; the withdrawal it calls is the one the gift's page has used since D51.

## D209, 24 Sep 2026: the currency sheet against its spec, and what was missing

The founder, 24 Sep 2026, third of three: the currency selector, per the spec of 21 Sep. Read item by item against the
code before building anything, because D152 had built it the same day:

| the spec | the code | measured |
|---|---|---|
| the list derived: Ramp's payout methods and Mercuryo's fiat, against the ECB file plus the two CFA francs | `src/currencies.ts`, `/api/rates` | 30 offered on viky.cash on 24 Sep 2026 (31 on 21 Sep), no yuan |
| a source silent: the three of the day, nothing false | `offeredCurrencies` | `test/currencies.test.ts` |
| the sign a key: edge, relief, chevron, 44 px or more, a name saying the action and the currency | `MoneyKey` | `test/browser/currencies.spec.ts` |
| pressing it opens a sheet and changes nothing | `CurrencySheet` | the same |
| every line the current amount converted, "about" and the rate's day once at the foot | the same | the same |
| "Where you are" first, the rest by name under "All currencies", the fade of the picker | the same | the same |
| **the one being read carries the filled mark of the choice** | a warmer fill only | **missing** |
| **left to right: the sign, the code, the name, the amount** | sign, name, code | **in another order** |

**Changed.** Each line now opens with the mark the condition picker draws for its radio, a ring of ink, filled with ink
and a ring of surface on the currency being read (`data-choice`), and reads the sign, the code in the label voice, the
name, and the amount on the right. The line stays a button with `aria-pressed`: a radio group would choose on an arrow
key, and choosing closes the sheet. `test/browser/currencies.spec.ts` asserts one filled mark, on the pressed line,
and the order. Nothing else moved.

What my report of the morning said about it, "not done", was wrong: it had been done since 21 Sep, less these two
points.

## D210, 24 Sep 2026: the lead under the promise, bounded at 34em from 1024 (default applied, to confirm)

The founder's default of 23 Sep 2026, taken on 24 Sep without priority: the line under the promise on the page without
an account, from 1024 pixels, bounded to two centred lines at 34em rather than `max-w-none`.

**Measured before changing it.** The sentence of today ("Back their goal. They earn it day by day. The rest comes back
to you.") holds on one line at every width from 1024: 903 px wide before, 680 px wide at 34em, centred both times, and
the card ends at 746 px either way (its action at 698) at 1440 by 900, 1280 by 800 and 1024 by 768. Home signed out,
whole page, before and after, at 1440 and 390, day and night: identical pixel for pixel.

So the bound changes nothing a person sees today. It holds a longer sentence to two centred lines instead of the
column's width, which is what the default asked for. The earlier comment's reason for one line (a second line pushed
the card past the fold, 914 for 900) was measured on a longer sentence and no longer applies.

## D211, 24 Sep 2026: the gift card's sizes are named tokens, and not one pixel moves

The founder's last item of 24 Sep, without priority: the gift page and every class with sizes written in it back to
the tokens, the scale being 13, 16, 20, 25 and 31, without changing a single render.

**What was found.** In the product's own components, one size is written as a number (the trace, 11 px, a tool and
not a screen). In the stylesheet, the fifteen sizes written as numbers are all in the gift card's block, drawn from the
mockup of 19 Sep: 15, 24, 14 and 23 pixels and line heights of 16, 21, 22 and 29, none of them on the scale. The comment
over that block said `test/design-tokens.test.ts` held them equal to `src/design-tokens.ts`; neither the test nor the
values existed. The two constraints could not both hold, so the founder chose: no pixel moves.

**Changed.** `GIFT_CARD_TYPE` in `src/design-tokens.ts` names every size of the card; `:root` carries each as a
variable (`--type-gift-what`, `--type-gift-state-leading` and so on); every class of the card reads its variable; the
one size that was on the scale (the aside, 13) now reads `--type-help`. The test the comment promised exists: each
variable equals its token, and the card's block writes no size as a number. The rule that every `--type-*` size is a
step of the scale exempts the card's own, by name, with the reason. The comment says what is true.

**Measured.** The gift pages of a daily gift, of a climb and of two stamps (the founder's four gifts, copied onto a test
account on the test branch) and Home, whole page, at 390 and 1440, day and night, before and after: 20 of 20 identical
pixel for pixel.

## D212, 24 Sep 2026: an edX verified certificate, read for the person like Coursera's

The founder, 24 Sep 2026: four public registers read without a session, on the model of Coursera and Credly; edX
first, set aside on 18 Sep for identity (D100), back because the issuer attests.

- **Measured on a live certificate**, `courses.edx.org/certificates/0a1b2c3d…e8f9`: server-rendered HTML, the title
  `GTx ISYE6501x Certificate | edX`, the track in `wrapper-accomplishment-title verified`, the holder, the course's
  name, "Issued August 6, 2018", the id again in its own link. Six patterns on those classes and words. A certificate
  that does not exist answers 404 (`f0e1d2c3…`).
- **The line.** `edx-certificate`, "An edX certificate", family "Finish a course", goal 25, having it or not: a
  verified (or professional) certificate, in the name the funder types, for the course they name by its code
  (`HarvardX CS50x`, or a link carrying `course-v1:`), issued inside the gift's window. An honour certificate is refused
  by name. Being built until goal 25 is signed and the service runs the source.
- **The terms**, read 24 Sep 2026: edX's 11.6 forbids robots and crawlers other than its own; written on the judges'
  page, the risk as Duolingo's and Coursera's.
- **Defaults applied, to confirm.** The course named by organisation and number, as the certificate's title prints
  them; an edX catalogue link (`edx.org/learn/…`) is not accepted, since it carries no code; `professional` accepted
  beside `verified`. Whether a run whose key reads `HarvardX+CS50+X` prints `CS50` or `CS50x` on its certificate is not
  measured.

## D213, 24 Sep 2026: a credential on Accredible, read for the person like a Credly badge

The founder's second public register, 24 Sep 2026: Accredible (credential.net), family "Get certified", beside Credly.

- **Measured on a live credential**, `credential.net/0a1b2c3d…3c4d`: the page is a JavaScript application whose data is
  `GET https://api.accredible.com/v1/credential-net/credentials/<uuid>` (the path its own bundle builds), public JSON.
  Seven patterns anchored on their keys or objects: uuid and title together, day of issue, expired, revoked, private,
  the recipient's name (its masked email matched, never captured), the issuer's website. An unknown uuid answers 404.
- **Naming the credential.** Accredible's course search (`/course_finder/search_courses`) is not open to a reader, so
  the funder types the title as the issuer prints it and the issuer's website, one line; the title is compared word
  for word, the website by its host and the domains it sits under. The reading proves the subject the funder signed
  among those domains. The weakness is written on the judges' page: an issuer copying another's title and website would
  pass.
- **The line.** `accredible-credential`, goal 26, having it or not, refused by name when private, expired or revoked.
  Being built until goal 26 is signed; the service redeployed from the branch before the merge.
- **Terms**, read 24 Sep 2026: Accredible's terms (April 2026) bind issuers and name no automated access.
- **Default applied, to confirm.** The title and website line in place of a search.

## D214, 24 Sep 2026: the hero moment of the landing, and the character's arms and legs

The founder, 24 Sep 2026, on his two sketches: the landing more open, the promise then the character then the card,
and the character hidden behind the card that rises and stands; direction A of the four proposed, chosen; arms and
legs that can fold; simple movements first, mathematical and vector, polished step by step afterwards; and the
mascot's reactions to buttons judged hazardous and unreadable, to be removed (a PR of its own, D215).

**The landing, in his sketch's order.** The promise, its sentence, one way to the card ("Offer a gift", tonal, so the
card's own action keeps the screen's one accent), the hero moment, and the card, whose top shows at the foot of the
first screen: 556 px of 844 on a phone, 494 of 900 at 1440. The diamond that floated into the title's hollow (D131) is
gone from the landing; it stands in the moment instead. Everything else on the landing is as it was.

**The character with limbs.** The diamond takes arms and legs on the landing only (`limbs` on `Character`): pills of
the face's ink with a hand and a foot, hung from the sides and stood under the body, drawn behind it so the joints
stay under it; round caps, nothing pointed, no fourth colour. Each folds from its joint (scaled to nothing) and
unfolds. The box grows from 64 by 40 to 64 by 64. The head character of every other screen keeps its shape: the limbs
everywhere, and the glass or crystal the founder has in mind, are the character sheet's work, later.

**The motion sheet.**

- **Trigger.** The landing drawn for the first time in the session: the first visit of the tab.
- **Rule.** The first image is the starting state: the figure 42 units down in its 64 unit box (66 %), behind the
  card's paper, only its eyes over the edge, its limbs folded; drawn so by the server (`data-hero="peeking"`) and the
  stylesheet, and the animation starts from exactly there in the same task the attribute goes. It rises to its place,
  the mouth opens at 70 % of the rise, the limbs unfold once the body has landed. Then nothing moves.
- **Material token.** The rise and the unfolding on `MOTION.gift.spatial`, the expressive fast spatial spring (damping
  0.6, stiffness 800, about half a second); the mouth on `MOTION.gift.effects`, the critically damped one.
- **Loop.** None, and once per visit: a session cookie (`viky.hero`, no age) written when the moment is drawn, read by
  the server, so every load after it in the session is drawn standing and still. A moment that replayed on every
  reload was the same screen going out and coming back (D198).
- **Reduced motion.** Standing from the first image, in the stylesheet and in the script; nothing plays.
- **Test.** `test/browser/hero.spec.ts` (the server sends the starting state, the figure ends on its floor with its
  limbs out, the card's top is in the first screen, the next load in the session is drawn standing and moves nothing,
  the way to the card reaches it, reduced motion stands still) and `test/hero-moment.test.ts` (the limbs, the cookie,
  the tokens, the order of the landing). `home-order`, `appearance`, `character` and `gift-card` follow the new order.

**Measured.** Frames at 0, 150, 300, 450 and 900 ms and the reduced-motion image, at 390 and 1440, sent to the
founder, who judges on the image. One finding on the way: a transform on an SVG group is read in the drawing's own
units, so the peek is 42 units, never a percentage or a pixel of the screen. Until D215 the hero character still hears
the card's moods and follows the pointer, as the head of the landing did.

## D215, 24 Sep 2026: enrolment in China, shown from the person's own CHSI report

The founder's third register, 24 Sep 2026: CHSI (学信网), "captcha to study: shown if the captcha blocks the server".

- **It does.** The report's page, `/xlcx/bg.do?vcode=<code>&srcid=bgcx`, answers an invalid code without a captcha,
  but can put an image captcha (`/xlcx/yzm.do`) in front of a reader it does not take for a browser (a public parser
  solves it with a real browser). Viky's server does not answer captchas. So the line is shown: the person opens their
  own report in the verification tab and answers anything CHSI asks there.
- **The line.** `chsi-enrolment-shown`, "Enrolled in China, shown", family Study, goal 27, one field (学籍状态, enrolled
  when it starts with 在籍), the verdict rule (D185): the report's photograph, identity number and birthday are never
  extracted. Being built: our provider is registered from a real report (none found in the open to test), and goal 27
  is one Safe transaction.
- **Terms**, read 24 Sep 2026: the copyright statement forbids other uses of CHSI's content and services, commercial
  ones included, without its consent; on the judges' page, the founder's call.
- **Default applied, to confirm.** The student-status report (学籍) rather than the degree report (学历): the founder's
  line said "inscription et diplôme"; the diploma is a second line on the same page, one more field.
## D216, 24 Sep 2026: the character answers no button and no pointer

The founder, 24 Sep 2026: the mascot's animations when a button is pressed are "hyper hasardeux et pas lisible", to be
removed; what he wants are few movements, well made, à la Duolingo or Phantom.

**Removed.** The two expressions of D148 that answered the card's controls (`curious` on the line that says what they
will do, `happy` on a length) with a pointer or a finger; the smile a proof shown gave; and the gaze that followed a
pointer on every head character and on the row of a gift's page (`Gaze`). The card asks the character nothing, and
`feel` is called from two places only: the arrival's cue and the confetti.

**Kept.** The three reactions that tell the money, from the gift's own record and never from a clock: the face opens
when a day earned lands, looks down for 300 ms when a day goes back, and jumps once at "atteint". The hero moment of
the landing (D214) stands as it is.

**One thing it freed.** The days of a gift's page were written into the page only so a pointer could move their eyes;
now only the days that jump or leave in the arrival are written, and the others name their drawing (D206), which
lightens a gift's page by about a kilobyte a day.

`test/character-reacts.test.ts`, `test/motion.test.ts`, `test/character-file.test.ts` and `test/browser/character.spec.ts`
say what is gone: no `Gaze`, no `curious`, no `happy`, nothing on the card asks the character anything, and a hover or a
press on the card leaves the face at rest, with or without reduced motion.

## D217, 24 Sep 2026: WASSCE credits, shown from WAEC's own result checker

The founder's fourth register, 24 Sep 2026: WAEC (waecdirect.org), the examination number, the year, the type and the
e-PIN given by the person, family "Pass an exam", results since 1980.

- **Shown, not read for them, because of WAEC's terms.** Read before any line: waecdirect.org carries WAEC's privacy
  policy, no terms of use, no robots file. The fuller policy on waecnigeria.org tells the holder of an access code WAEC
  allocates "you must not disclose it to any third party". The result card's PIN is one. Read for them, the person would
  give it to Viky. So the person types it on WAEC's own page in the verification tab, and it never reaches Viky. The
  read-for-them version was built and works (the checker has no captcha: a POST to `/Result/EncryptPayload` gives a token,
  `/Result/Display?q=` gives the result), and it is kept on a local branch, not shipped: the founder's call.
- **The line.** `waec-result-shown`, "WASSCE credits, shown", family Pass an exam, goal 28. The target is a count of
  credits (A1 to C6, suggested 5), which counts only with English Language and Mathematics among them, as universities
  across the region ask. Refused by name: a result of a year before the gift's (the checker opens every result since
  1980), a withheld result, a page without a result. The verdict rule (D185): the count is kept, no subject, grade,
  name or examination number.
- **Tested** on a real 2018 result published in a public repository: 9 credits. Being built until our provider is
  registered from a live result and goal 28 is signed. No change to the reading service, so no redeploy.
- **Default applied, to confirm.** The subject is the same for every gift on the line, as the baccalauréat's: the
  result carries a name the funder does not sign.

## D218, 24 Sep 2026: edX and Accredible open

The founder, 24 Sep 2026: the Safe session of goals 24 to 28, then edX and Accredible opened in the same move.

- **The session.** One Safe transaction at nonce 8 registers goals 24 to 28 on `MilestoneGift`, carried by the relayer
  (hash to sign `0xf0ac66bf5d34cd1f8b0ff859c63b3c937434d3998e87223f008f1fe99638bbc6`, equal to the Safe's own
  `getTransactionHash` read on Monad). Signed by the encrypted file (`0x19d4…b794`) and the second phrase on paper
  (`0xED4c…67B3`), carried by the relayer: tx `0x291b3274fc7a2aa946a85d70fae3666c2d7f13b2561d4620f41a5cbb0f09e25b`,
  block 107,477,350, success, 486,112 gas, Safe nonce 8 to 9. Read back: goals 24 to 28 each carry the provider id
  and shape 1 the code expects.
- **What opens.** edX (goal 25) and Accredible (goal 26): both sources already run on the reading service, each read
  once for real (D212, D213). They move from the lines being built to the register, `live` and open.
- **What does not.** PRONOTE (goal 24) stays parked (D207); CHSI (27) and WAEC (28) wait for our provider registered
  from a real report and a real result. Their goals on the chain open nothing by themselves.
## D219, 24 Sep 2026: the hero moment choreographed, and the limbs redrawn on the founder's sketch

The founder, 24 Sep 2026, on the first version (D214): the arms and legs too thick and not placed as on his sketch,
to be worked with a very slight but visible curve, and readable by night; and between the start and the end, the
character whirls as it comes out from behind the card, bounces on the floor, and only then takes its pose and
unfolds its limbs. To be done properly, step by step, on animation and mobile design references, nothing by chance.

**The limbs.** Lines of 3.2 units instead of 5, hung from the body's lower sides (the arms) and stood under it (the
legs), each one slight bow outward (`Q` paths), a hand and a foot at the end. Their colour is a token of its own,
`--character-limb`: the face's ink by day, the text's light by night (both night blocks), because the face's ink is the
night ground's own colour and a limb in it could not be seen.

**The choreography**, on the principles every animator works from (Thomas and Johnston, The Illusion of Life, 1981:
squash and stretch, slow in and slow out, follow through, arcs) and on Material's curves and springs, every number a
token (`MOTION.hero`):

| from | to | what | curve |
|---|---|---|---|
| 0 | 400 ms | the leap out from behind the card, one whirl (a group turning from its middle), the body stretching (0.94 by 1.08), 5 units above the floor at the top | emphasized decelerate |
| 400 | 500 | the fall, the whirl ending upright as it touches the floor | emphasized accelerate |
| 500 | 550 | the squash on the floor (1.14 by 0.84); the mouth opens, on the effects spring | emphasized decelerate |
| 550 | 800 | one bounce, 2.5 units up and down, a second lighter squash (1.06 by 0.93) | decelerate up, accelerate down |
| 800 | 1,251 | the settle, on the expressive fast spatial spring (damping 0.6, stiffness 800) | the spring |
| 1,131 | 1,582 | the limbs unfold from their joints, on the same spring, once the body is almost still | the spring |

Under the arrival's budget of two seconds. The first image is the starting state as before (peeking, 42 units down,
limbs folded), once per visit by the session cookie, standing from the first image under reduced motion.

**Measured.** Frames at 0, 200, 400, 450, 500, 600, 700, 800, 1,000, 1,300 and 1,700 ms at 390, by day and by night,
sent to the founder: the whirl at 200, the squash at 500, the bounce between 600 and 800, still at 1,000, the limbs
from 1,300; by night the limbs read in the text's light. `test/hero-moment.test.ts` holds the order of the moments,
the curves of each segment, the budget, the thin bowed limbs and their two colours.

## D220, 24 Sep 2026: four families, Learn, Exams & school, Play, Move

The founder's decision, 24 Sep 2026: the families go from seven to four, in this order.

- **Learn**: the Duolingo lesson each day, Coursera, edX, Credly, Accredible.
- **Exams & school**: the Duolingo English Test, the TOEFL score, enrolment at university, and every line being built
  there (Cambridge, IELTS, the three baccalauréats, WAEC, EcoleDirecte, the year passed, the grade).
- **Play**: the Chess.com rating and puzzles. **Move**: Fitbit, Strava.
- **Ids.** `exam`, `play` and `move` stay; `learn` is new. The five retired ids (`language`, `course`, `certification`,
  `study`, `school`) still read through `familyOf`, to the family their lines went to. No gift record stores a family
  today, so nothing already created changes.
- **Order.** Inside a family, the register's order (D139), set to the founder's list: Coursera and edX before Credly
  and Accredible, EcoleDirecte after WAEC and before the year passed and the grade.
- **The screens.** The public page and the chooser draw their sections from the register, so they follow. The judges'
  table of what each condition proves is grouped under the same four titles.
- **Defaults applied, to confirm.** Three lines the list does not name: the Udemy course (being built) goes to Learn,
  with the other courses; enrolment in China from CHSI (being built) and PRONOTE (parked) go to Exams & school, with
  enrolment and EcoleDirecte.
