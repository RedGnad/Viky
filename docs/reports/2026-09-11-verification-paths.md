# How a recipient proves progress, across goal families (memo for the strategy side, 11 Sep 2026)

The question, as the funder put it on 11 Sep: Viky is not a Duolingo product. Recipients will prove
progress in education, sport, freelance work, language learning and on-chain goals, anywhere in the
world, on a phone, without knowing there is a blockchain. Which verification paths exist, what does
each cost the person, what does each keep of "verified by a third party, not by Viky", and which do
we build first. Every claim below has a source; the ones we measured ourselves say so.

## 1. What we measured this week (gift 1, Monad mainnet)

- Reclaim `portal` channel (the SDK default for web): the Duolingo sign-in runs in a remote browser,
  so Google asks for the id and password again, then a two-step verification, on a blurry screen.
  The recipient stopped there. Same wall as Lock-in. (D24, our run.)
- Reclaim `app` channel on Android: Google discontinued Play Instant ("Starting December 2025,
  Instant Apps cannot be published through Google Play"); since the week of 4 Nov 2025 Reclaim
  redirects once to the Play Store, the app installs, "it opens automatically and verification
  continues right away" (deferred deep link). On the Xiaomi this is what we saw. (D25, Reclaim's own
  post.) iOS App Clips are still documented as install-free; not tested (no iOS 18 device at hand).
- The consent screen showed Lock-in's name because the Reclaim application was borrowed; a Viky
  application now exists and is live.

## 2. The building blocks, with what each asks of the person

| block | who acts | what the person does | what a third party can verify | source |
|---|---|---|---|---|
| Reclaim user proof through the Verifier app | the person, on their phone | Android: install the verifier once, then open it for each proof; iPhone: App Clip, no install; sign in to the source inside the app (their own device, their own Google account) | the attestor signed the person's own TLS session with the source; TEE attestation | Reclaim docs "Understanding the tech"; Reclaim post "Moving beyond Google Play Instant" |
| Reclaim `portal` (remote browser) | the person | signs in to the source again inside a remote browser, every time | same as above | our measurement, D24 |
| Reclaim zkFetch (`@reclaimprotocol/zk-fetch` 1.1.0, Jul 2026) | Viky's server or keeper | nothing | the attestor signed the HTTPS response of the source (public page, or an API called with a secret header the server holds); `useTee: true`; `verifyProof`; `transformForOnchain` for the same on-chain verifier family | npm registry readme |
| Reclaim InApp SDK | Viky as a native app | sign in inside Viky's own app | same as the user proof | Reclaim docs; needs a store app, which the spec keeps as a fallback only (KT2) |
| OAuth "Connect with X" plus zkFetch of the API with the token as a secret header | the person once, then the keeper | one conventional "Connect with Strava" screen, then nothing | the attestor signed the API response; the token is redacted | zkFetch readme (secret params); Strava OAuth docs |
| Official API without zkFetch | Viky's server | one OAuth screen | nothing beyond Viky's word | rejected: it makes the release a promise of Viky |
| Other zkTLS stacks | | | | |
| Primus zkTLS SDK | the person | web SDK, "only Android supported, iOS coming soon" for mobile | Primus signature (MPC or proxy model) | docs.primuslabs.xyz (search summary; the pages did not render for us) |
| Opacity | the person | native SDK, in-app browser | Opacity attestation (MPC, EigenLayer AVS) | docs.opacity.network; native app only |
| zkPass, zkMe | the person | browser extension on desktop, own app on mobile | | Shoal Research overview (sponsored by zkPass) |

Composing two stacks (App Clip on iPhone, another vendor on Android) is possible in principle and a
last resort: two proof formats, two verifiers to audit, two attestor trust roots, for a gain Reclaim
already covers on Android through zkFetch for every public or API-backed source.

## 3. The sources per goal family, worldwide

| family | typical sources | what is public or API-backed | the path that keeps the release verified | what the person does |
|---|---|---|---|---|
| Education, diplomas, courses ("$500 when you graduate", the organisers' own example) | Coursera, edX, Credly and every Open Badges issuer, Parchment, university registrars, national services (diplome.gouv.fr in France, National Student Clearinghouse in the US) | Coursera publishes a public verification page per certificate (`coursera.org/verify/<id>` with name, course, date); Credly badge pages are public and "digitally verifiable" (Open Badges assertions carry issuer, criteria, dates); national services differ by country (France: a control key checked on the site) | zkFetch of the public verification page or badge URL | pastes the link of their certificate or badge; one-off event, no daily gesture |
| Sport | Strava (worldwide), Garmin, Fitbit, Apple Health, Health Connect | Strava OAuth API with `activity:read`, webhooks push new activities; 10 connected athletes until Strava reviews the app, 99 after Developer Program approval, terms changed three times in two years; Apple Health and Health Connect are native only | OAuth "Connect with Strava" once, then zkFetch of the API daily with the token redacted; Reclaim user proof as the second path (the ported Strava verifier) | one conventional connect screen, then nothing |
| Freelance and work | Upwork, Fiverr, Malt, Toptal, GitHub, Deel | Upwork's API is "for personal and internal use only, commercial use isn't supported"; Fiverr and Malt have no public API; GitHub contributions are public (an example, not a target) | Reclaim user proof through the verifier app where a provider exists (private dashboards), otherwise nothing honest; GitHub by zkFetch of the public profile | verifier app: install once on Android, App Clip on iPhone, then one proof per check |
| Language learning | Duolingo (worldwide), Babbel, Busuu | Duolingo's public profile returns `totalXp` and `streak` for any username, no session; no OAuth API | zkFetch daily, ownership bound once | ownership once (a code in the display name for a minute, or one user proof), then nothing daily |
| On-chain goals | balances, repayments, holdings | native | the contract reads the chain | nothing |

## 4. What this says about the architecture

One attestation format (the provider-neutral CheckIn attestation, D14), one contract, three modes
chosen per source:

1. **Public**: zkFetch of a public page or endpoint. Automatic. Ownership bound once.
2. **Connected**: OAuth once, zkFetch of the API with the token redacted. Automatic. Ownership is
   the OAuth grant itself. Bounded by each platform's quotas and terms (Strava: 10 then 99).
3. **Session**: Reclaim user proof through the verifier app. The person acts for each proof. Install
   once on Android, App Clip on iPhone. The only mode for private dashboards without an API.

In modes 1 and 2 the person never validates a day: the keeper fetches the attested proof and the
contract credits or drains. That is the tagline taken literally. Mode 3 stays for what only the
person can reach, and its cost is honest: an app, once.

The display-name code is a mode 1 detail for sources with neither OAuth nor a login-based proof
(Duolingo). It is unconventional; the alternative for the same source is one user proof through the
verifier app at the start (mode 3 once, mode 1 daily). Both can be offered on the same screen; the
person picks. For diplomas and badges the "code" is simply the certificate link, which is
conventional. For Strava it is the OAuth button, which is conventional.

## 5. What stays open, and how each is measured

- Does the verifier app keep the source's login between proofs? The InApp SDK exposes
  `canClearWebStorage`; the web SDK does not; our code comments cite `isRecurring` from Lock-in but
  the current docs do not show it. Measured by the day-1 check-in of gift 1 if the recipient
  installs the verifier (S1).
- App Clip on iPhone: to test on an iOS 18 device (iPhone XS or later); the iPhone 6 cannot.
- zkFetch pricing and rate limits: not in the readme; to ask Reclaim (their site says "from $0.10
  per verification at scale").
- Duolingo profiles set to private: the public endpoint may hide fields; to test.
- Strava Developer Program approval time and whether Viky, as an individual publisher, is accepted:
  to ask; the 10-athlete cap covers KT4 (five gifts) without approval.
- Which providers exist in Reclaim's catalogue for freelance platforms: to read on the dashboard.

## 6. Recommendation

Build mode 1 for Duolingo first (the gift already running, no contract change, about a day), then
mode 2 for Strava (OAuth already in Lock-in's DNA, the verifier ported), then mode 1 for diplomas
and badges (Coursera and Credly links, the organisers' literal example, a one-off event which the
contract handles as a single-day gift or a milestone), and keep mode 3 through the verifier app as
the path for private sources, measured once on this gift so its cost is a number, not a guess.
GitHub is an example of mode 1 and is not a priority.

Nothing here is built until the funder and the strategy side decide. What they decide is the order
and whether the display-name code is acceptable for Duolingo, or whether Duolingo's ownership step
uses the verifier app once.

## Sources

- Reclaim, Moving beyond Google Play Instant: https://blog.reclaimprotocol.org/posts/moving-beyond-google-play-instant
- Reclaim, Understanding the tech: https://docs.reclaimprotocol.org/understanding-the-tech
- Reclaim zkFetch readme: https://www.npmjs.com/package/@reclaimprotocol/zk-fetch
- Reclaim Flutter API reference (`canClearWebStorage`): https://docs.reclaimprotocol.org/flutter/api-reference
- Reclaim InApp React Native SDK: https://github.com/reclaimprotocol/reclaim-inapp-reactnative-sdk
- Strava authentication and scopes: https://developers.strava.com/docs/authentication/
- Strava webhooks: https://developers.strava.com/docs/webhooks/
- Strava Developer Program and the 99-athlete capacity: https://communityhub.strava.com/developers-knowledge-base-14/our-developer-program-3203
- Upwork API, personal and internal use only: https://support.upwork.com/hc/en-us/sections/17976982721555-Upwork-API
- Coursera, anatomy of a verified certificate: https://blog.coursera.org/the-anatomy-of-a-verified-certificate-shareable
- Credly, verify badges: https://www.credly.com/org/the-open-group/verify and https://support.credly.com/hc/en-us/articles/5079101828891-Credly-FAQ-s
- diplome.gouv.fr (France only, control key): https://www.everycheck.com/blog/diplome-gouv/
- Primus zkTLS SDK: https://docs.primuslabs.xyz/data-verification/zk-tls-sdk/overview/
- Opacity Android SDK: https://docs.opacity.network/docs/android
- Shoal Research, zkTLS landscape (sponsored by zkPass): https://www.shoal.gg/p/zktls-verifiable-data-composability
- Duolingo public profile endpoint: measured on 11 Sep 2026 (D24)
