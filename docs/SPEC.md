# Viky, product and technical specification v1 (9 Sep 2026)

> Destination: `Viky/docs/SPEC.md` in the public repository. Written in English for the developer
> agent. Every external fact below was verified at source and is recorded, with its tier, in the
> Master repository (`monad-build-facts-2026-09.md`, `metropolis-officiel-2026-09-08.md`,
> `metropolis-audit-2026-09-09.md`). Nothing here is to be treated as "working" until the spike in
> section 12 has run once end to end on mainnet.
>
> Name: Viky (chosen 9 Sep 2026; repository `RedGnad/Viky` to be renamed `Viky`).

## 1. One sentence

**The money is already in their name. Every day they miss, a piece comes back to you.**

Viky turns a promise into money that arrives on its own. A funder puts money behind someone's
goal. The money is allocated in the recipient's name from day one, becomes theirs as verified
progress accrues, and returns to the funder for whatever is not accomplished. Nobody else ever
profits from a missed day.

## 2. Who it is for, and who it is not for

**Funder**: a person who wants to back someone else's goal from a distance and hates that money
sent with no strings vanishes without a trace. Enters with a bank account or card (no crypto), or
with stablecoins already held (crypto-native). Both paths are first class.

**Recipient**: a learner who never asked for crypto. Receives a link in a message, taps it, and sees
money in their name. Never sees the words wallet, gas, chain, seed phrase or token.

**Not for**: employers paying salaries (illegal in stablecoins in FR and US), gamblers (there is no
counterparty who wins when the recipient loses), and streamer audiences (deferred, different
verification surface).

**Design bar**: non-crypto end to end. "My grandmother uses the app." Judged harshly on any point
of friction that reveals the chain.

## 3. The primitive, three configurations, one contract

| configuration | funder | recipient | role |
|---|---|---|---|
| gift | a third party | a learner | the product, named and pitched |
| self-commitment | self | self | test mode only, never pitched (it is Metropolis starting point 02, the crowded twin) |
| pool | several third parties | one recipient | emergent, allowed by the contract, not in the pitch |

**Invariant that separates a gift from a bet, enforced by the contract**: unearned money goes back
to the funder (or, optionally, to a charity address the funder chose at creation). It never goes to
another participant. With this invariant, two friends funding each other's goals are two independent
gifts: on double failure each recovers their own money and no value changes hands.

## 4. Behaviour model, from the evidence

- **Loss framing** (Patel, Volpp et al., Ann Intern Med 2016, randomised, n=281, identical amounts
  across arms): money allocated up front and removed per missed day produced 0.45 goal-days versus
  0.35 for the same money paid per achieved day. The only significant arm. Design consequence: the
  recipient's screen shows the full amount as theirs from the first second, and shows it draining.
- **Inputs, not outputs** (Fryer, NBER w15898): pay for measurable effort (XP, commits, sessions),
  never for a grade or an outcome.
- **No one profits from failure** (HealthyWage/DietBet postmortem curated by the organisers): the
  business never keeps forfeited principal.
- **The effect fades when incentives stop** (same RCT). We never promise durable behaviour change.

## 5. Certifiable goals at launch, and the scale rule

Rule: a condition is offered only if it scales to one hundred users without asking anyone's
permission.

| goal | verification | scale | status |
|---|---|---|---|
| Duolingo XP per day | Reclaim zkTLS, our private provider (`cdf8cb3b-2976-4413-ab2d-693ae5028380@1.0.8`, two claims: self-only ownership + total XP), TEE attestation required, AI fallback refused | unbounded (the user proves their own session; no platform API key) | launch, port from Lock-In; `LIVE_SCHEMA_CONFIRMED` to be resolved (KT3) |
| GitHub contributions per day | Viky's own read of GitHub's GraphQL API with a project token, signed by the evidence signer; the attested read waits for the reading service to carry a secret header (D166, 23 Sep 2026) | unbounded within GitHub's rate limits (5,000 an hour) | built behind the operator door; goal 2 to register, token to set, one real gift to run |
| on-chain conditions (balance held N days, repayment) | native | unbounded | launch, zero cost |
| university graduation | Reclaim full-stack (universities preconfigured, Reclaim's own UI) | unbounded | phase 2, it is the literal "$500 when you graduate" |
| Strava distance | closed, D123 of 20 Sep 2026: Strava's API Agreement (section 4.4) requires deleting all Strava data on termination and certifying it in writing, which what Viky writes on a public chain cannot honour; the verifier and its two tests stay in the repository, unwired | none | not offered |
| screen time | Apple DeviceActivity has no network; lead: a third-party web dashboard (RescueTime) via zkTLS | unknown | not offered |

**Accrual mechanic for Duolingo (fits Lock-In's baseline/final delta model)**: the recipient proves
total XP at each check-in. `creditedDays = min(elapsedDaysSinceLastCheckIn, floor(deltaXp / dailyTargetXp))`.
Missed days = elapsed days not covered. One proof per check-in, drain computed per day. Binge within
a period is allowed in v1 and stated as such.

## 6. Screens and states

### 6.1 Funder
1. **Create**: amount (AUSD, displayed as dollars or euros), recipient contact (phone or email),
   goal from the menu (never free text), daily target, duration (7 to 90 days), what happens to
   unearned money (back to me, default; or a charity), a private message.
2. **Fund**: one of
   - bank transfer or card through the embedded on-ramp (Calm `<CalmOnramp destinationToken="ausd">`
     if the tenant is obtained; else Transak or Mercuryo, which show "MON" and require a swap, see 9.3);
   - AUSD already held on Monad, EIP-3009 `receiveWithAuthorization` signed with the passkey account;
   - any chain, deposit-and-execute through Aurora Intents (phase 2, bounty).
   The funder sees "Funded" only after finality (k = 3 blocks, about 1.2 s).
3. **Gift page** (shareable link): amount, recipient's first name, goal, days earned, days missed,
   amount already theirs, amount returned so far, next check-in due. Rendered from verified signals
   only. No free-text posting.
4. **Refund**: unearned money is claimable by the funder at any time after it has drained, and in
   full if the recipient never claims within 14 days.

### 6.2 Recipient
1. **Link tap** (from SMS, WhatsApp, email): a page in the browser. No install required. Shows
   "[Funder] put $500 in your name for [goal]. It is yours as you go."
2. **Create passkey** (Mera `createPasskeyWithPrfOutput`): Face ID or fingerprint. On
   `PRF_UNAVAILABLE` (Chrome local profile, Bitwarden, Dashlane): plain-language guidance to use
   iCloud Keychain, Google Password Manager or 1Password. This is refusal case 3.
3. **Money in your name**: full amount shown as theirs, with the drain schedule in words ("$7 comes
   back to [Funder] for each day without your lesson").
4. **Connect the goal**: Duolingo username (resolved through Duolingo's public profile API, as in
   Lock-In); the proof is bound to that profile id, not to whichever account is logged in.
5. **Check-in**: opens the Reclaim verification (channel decided by the zkTLS spike: `portal` or
   `app` with App Clip and deferred deep link; session persistence is a Reclaim dashboard setting,
   `isRecurring`, to confirm). 2 to 30 seconds. Then days credited, amount updated.
6. **Withdraw**: keep (default), send to a card (Immersve, partner credentials required; test
   environment first), or withdraw to a bank (Mercuryo sells MON; requires AUSD to MON swap through
   Kuru Flow under the hood; the Mercuryo screen names MON). Region-gated: refusal case 4 offers the
   other exit.
7. **Install to home screen**: offered after the first successful check-in, never required.

### 6.3 Words
Never shown: wallet, gas, chain, seed, token, transaction hash, address. Shown: "in your name",
"yours", "comes back to", "verified", "check-in". Currency shown as $ or € with two decimals.

## 7. Contracts

### 7.1 `GiftEscrow` (new, derived from `LockInDuolingoEscrow` and `LockInEscrow`)
Token: AUSD (`0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`, 6 decimals, EIP-3009; EIP-712 domain
measured on mainnet: name "Agora Dollar", version "1", chainId 143). One contract, many gifts.

```
struct Gift {
  address funder;            // refund destination unless refundTo is set
  address refundTo;          // funder or charity
  address recipient;         // zero until claimed
  bytes32 recipientContactHash; // keccak of normalised phone/email, for claim binding
  uint8   goalType;          // 1 = DUOLINGO_XP, 2 = GITHUB_COMMITS, 3 = ONCHAIN
  uint32  dailyTarget;
  uint64  startsAt; uint64 endsAt;   // inclusive day window, UTC days
  uint256 amount;            // total allocated
  uint256 perDay;            // amount / durationDays
  uint32  creditedDays; uint32 drainedDays;
  uint256 withdrawnByRecipient; uint256 refundedToFunder;
  bytes32 identityHash;      // one Duolingo account per gift
  uint64  lastCheckInDay;
  bool    cancelled; bool finalised;
}
```
Functions: `createGift`, `fundWithAuthorization` (EIP-3009 receive), `claim(giftId, recipient,
claimSig)` (binds recipient account; identity binding on first check-in), `checkIn(giftId,
Attestation)` (EIP-712 signed by the evidence signer after off-chain Reclaim verification, carries
`observedAt`, `totalXp`, `identityHash`, nullifier), `drain(giftId)` (keeper; marks days past
`lastCheckInDay + 1` as missed, moves `perDay` per missed day to the refundable bucket),
`withdrawEarned(giftId)` (recipient, relayed), `refundUnearned(giftId)` (funder), `cancel(giftId)`
(funder, only before claim), `finalise(giftId)` (after `endsAt`, settles remaining days as missed).
Guards ported from Lock-In: attestation freshness (10 min), clock skew (1 min), nullifiers, identity
binding, pausable creation/check-in, typed errors.
Events (indexed by Envio): `GiftCreated`, `GiftFunded`, `GiftClaimed`, `CheckInAccepted`,
`DaysDrained`, `EarnedWithdrawn`, `UnearnedRefunded`, `GiftCancelled`, `GiftFinalised`.

**Verification path, stated honestly**: v1 uses the evidence-signer architecture Lock-In ran on
mainnet (server verifies the Reclaim proof with TEE attestation, signs an EIP-712 attestation, the
contract checks the signer). The fully on-chain `LockInReclaimVerifier` exists with real-proof tests
but its `LIVE_SCHEMA_CONFIRMED` flag is false; it becomes the verification path only once the live
schema is confirmed (KT3). The judges page discloses this trust assumption in one sentence.

### 7.2 Relayer
Pays gas for every recipient action. Keeps more than 10 MON (Monad reserve). Fixed explicit gas
limits with a 7.5 % margin (Category Labs guidance; Lock-In used 5 %). Nonces managed locally,
parallel submission. Never holds user keys. Waits for finality before showing "done".

### 7.3 Keeper
v1: self-run cron (the organisers' own recommendation, Chainlink Automation not confirmed on Monad).
Calls `drain` daily for gifts past their check-in day, `finalise` after `endsAt`.
v2 (bounty): the same logic as a Chainlink CRE workflow; CRE lists Monad mainnet and testnet as
supported (verified 9 Sep). Built only after v1 runs.

## 8. Accounts and keys (Mera)

- Account: EOA derived from the passkey PRF output (BIP-44 `m/44'/60'/0'/0/0`), same `rpId` on web
  and, if ever wrapped in Expo, on iOS and Android. No custody backend. Session key in memory, zeroed
  on sign-out.
- **Non-wallet use of PRF (bounty)**: `messageKey = HKDF(prfOutput, info = "cliff/message/v1")`.
  The funder's private message is encrypted to the recipient's message key; only the recipient's
  passkey can read it. The message is stored encrypted off-chain; its hash is in the gift event.
- Failure path: `PRF_UNAVAILABLE` handled with guidance, never a dead end.

## 9. Money rails

### 9.1 In
| path | what the user sees | status |
|---|---|---|
| Calm bank transfer (SEPA, ACH, FPS) paying AUSD on Monad | "Deposit funds", bank-like, KYC once | SDK verified; **tenant not self-serve**, Calendly with Calm required |
| Transak card, MON on Monad | "Buy MON", then our swap to AUSD via Kuru Flow | self-serve; plumbing visible |
| Mercuryo card, MON on Monad, min 25 EUR | "Buy MON", then swap | self-serve; plumbing visible; ~3.8 % |
| AUSD held on Monad | one signature | native |
| any chain via Aurora Intents deposit-and-execute | one flow | phase 2 |

### 9.2 Out
| path | status |
|---|---|
| keep the balance in the account | default |
| Immersve virtual Mastercard, USDC/USDT only (swap AUSD to USDC, ~0.01 % measured) | **partner credentials via Immersve support** (test first, then live); public sandbox exists but its funding type is Polygon Amoy; Monad testnet funding protocol `0x1754AE802dCcc5bd4fe2d2b42ac01e2AB3552086`; 137 regions incl. France, Senegal, Côte d'Ivoire |
| Mercuryo sell MON to EUR (SEPA), min 25 | real but the screen names MON |
| Transak | no sell on Monad |

### 9.3 Honesty rule
The on-ramp and off-ramp screens of third parties may name a token. That is the one place where the
chain shows. The spec does not hide it; the pitch does not claim otherwise; the Calm tenant removes
it on the way in, and is therefore worth the call.

## 10. Refusal cases (demonstrable)
1. Goal outside the certifiable menu: refused at creation.
2. Reclaim proof older than 10 minutes, wrong provider or version, missing TEE attestation, or replayed
   nullifier: refused, typed error.
3. Passkey provider without PRF: refused at onboarding with guidance.
4. Card region unsupported: bank withdrawal offered instead.
5. Check-in on a different Duolingo account than the one bound: refused (`IdentityMismatch`).

## 11. Non-goals for v1
Feed, messaging beyond the encrypted note, tips, betting between participants, yield on locked funds
(optional later, conservative source only, never in the pitch), employer payroll, native app store
listing (PWA first; Expo wrap only if Agora requires native).

## 12. Spikes and kill tests (dated)

| # | test | due | if it fails |
|---|---|---|---|
| KT1 | fiat to AUSD to escrow to recipient to card or bank, once, mainnet, small amounts (Transak or Mercuryo; Calm if tenant) | 16 Sep | funder becomes crypto-native only for the window; cross-border claim downgraded |
| KT2 | Agora's reading of "mobile app" from `/support` | 12 Sep | continue PWA; Expo wrap planned in week 4 if native required |
| KT3 | `LIVE_SCHEMA_CONFIRMED` resolved | 19 Sep | GitHub becomes the launch condition |
| KT4 | 5 real gifts between distinct people, 2 cross-border, 2 with a funder who had no crypto | 30 Sep | fewer than 3: pitch in self-commitment mode; 0 fiat funders: the "grandmother" claim leaves the pitch |
| KT5 | recipient flow on a fresh phone under 60 s from link tap to "money in your name" | 3 Oct | Design axis conceded, said as such |
| KT6 | 5 funder conversations, non-leading question | 26 Sep | market axis pitched on measured behaviour only |
| S1 | Reclaim channel decision: `portal` vs `app` (App Clip), `isRecurring` on the Reclaim dashboard | 12 Sep | portal with re-login per check-in; cadence defaults to weekly |
| S2 | Immersve support contacted for test credentials with a Monad funding channel | 12 Sep | card exit shown in test env only, or dropped from the demo |

## 13. Bounties this spec serves
Track first place; Agora cross-border (AUSD, Mera, instant settlement, mobile PWA); Mera UX (entire
account layer); Envio (event indexing); Chainlink CRE (keeper v2); Mera PRF (encrypted note);
Aurora Intents (phase 2 funding path); Alchemy (RPC, webhooks). Excluded: Privy, Dynamic.

## 14. Judges page (public, one screen)
Contract addresses, one `cast call` that shows a gift's state, one refused transaction with its typed
error, the evidence-signer trust assumption in one sentence, the Envio endpoint, and the three
artefacts. Consumer UI shows none of this.

## 15. Workspace and reuse
Write only in `Viky`. Read `Lock-in` for: `contracts/verifiers/*`, `contracts/LockInDuolingoEscrow.sol`
(structure, guards, errors), `app/api/proof/session/route.ts` and `verify/route.ts` (Reclaim
session creation, TEE-only verification, server-held session rows), `src/reclaim-channel.ts`,
`src/monad-gas.ts`, `scripts/capture-duolingo-proof.ts`. Port file by file, never fork. Skeleton:
the Foundation's Next.js PWA template (`main`; the `no-privy` branch the docs mention does not exist, strip Privy by hand), with Mera as the account layer, Serwist
offline, VAPID web push, `InstallPWA` prompt made optional.
