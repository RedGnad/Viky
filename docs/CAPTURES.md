# Capturing every signed-in state

The tool that validates the design pass. Every reworked screen is replayed with it, at 390x844 and 1440x900, in day and in night, before it is called done.

## Running it

```
pnpm build
pnpm review:capture-connected
```

It starts a production server of that build for each size and appearance, on ports 3101 to 3104, signs in with a virtual passkey, walks every state, and writes the images with a `captures.md` into `review-captures/<time>-connected/`. That folder is gitignored: the images are never committed.

## What changed on 18 Sep 2026, and what is no longer there

The manifest below belongs to the run that wrote it; every run writes its own. Two things moved under it since, and
the states they describe are gone rather than renamed:

- **The session.** D98 split it in two: the account lives twelve hours in a cookie and the key that signs lives in the
  page. Thirty-one idle minutes now take the key and leave the account, so a driven clock no longer produces a
  signed-out screen. Where a state needed nobody signed in, the run drops the cookie, which is what twelve hours do.
- **Two states are no longer reachable at all**, and are reported rather than staged: "Your session closed while you
  were paying" (`FundGift.tsx`, F8) and "Your session closed while you were away" on a gift's page (`GiftPage.tsx`).
  Both wait for the account to go while the screen stays open, and nothing there drops it any more: a reload lands on
  "A gift is waiting for your payment" or on the ordinary signed-out gift. The screens are still in the product; the
  founder decides whether they go. The way out's own closed screen is untouched, because that one is reached by the
  server refusing a call, which still happens.
- **The words the run waits for** followed the screens: the amounts on the way out carry their symbol (D104), Me says
  "Signed in on this device" with or without a time after it, and /me signed out offers the door in the header rather
  than a button in the body.

Options, which can be combined:

- `--only=390x844-day` runs one size and appearance (`390x844` or `1440x900`, with `day` or `night`).
- `--scenario=<words>` runs only the scenarios whose name contains those words, for example `--scenario=withdrawal`. An account is made first when none of the chosen scenarios makes one.
- `--serial` runs the four combinations one after another instead of together.
- `http://localhost:<port>` runs against a server you started yourself, which is then never restarted. Always `localhost`: a passkey refuses an IP address as its domain, so `127.0.0.1` makes every sign-in fail.

The states, their order, the clicks that reach them and what each one replaces are in `scripts/capture-scenarios.ts`. The harness (sizes, appearances, the virtual passkey, the balance interception, the manifest) is `scripts/capture-connected.ts`.

To check one reworked screen, run its scenario at all four combinations, for example `pnpm review:capture-connected --scenario="withdrawal refusal"`, and compare the images with those of the run below.

---

Since 17 Sep 2026 the run signs in through Me and comes back by the bar, the withdrawal states follow the drawn flows (W1 to W13), and the home, gifts and me states follow the product structure; a funder's session is closed by driving the page's clock thirty-one minutes forward, since the session is a sentence and no longer a button. A whole page is taken through a screen as tall as the page rather than with Playwright's fullPage, so the bar fixed to the bottom sits at the foot of the page instead of across its middle. Since S2 the funder states follow the rebuilt offer: the two names, what they will do, their Duolingo name read before any money moves, the refusals under their fields, and the check in its three cases (paying by card, a payment arrived, enough in the account). The screen for a payment that falls short is not captured: it follows a conversion, and the run refuses every broadcast. Since S3 the recipient and donor states follow the rebuilt gift page, with the names, the recorded days and the take in two steps, and three milestone states are drawn from simulated data, because no route answers a milestone gift until C2.

What follows is the `captures.md` of the first run, on 16 Sep 2026 at commit `34d6cec`. The file names it lists belong to that run's folder, which is not in the repository.

---

## Every signed-in state, captured

- Taken 2026-09-16T22:18:11Z, against http://localhost:3101 to :3104, one local production server per size and appearance: a local production build (`pnpm build`, `pnpm start`) of commit `34d6cec`, in Chromium 153.0.8010.12.
- Two sizes, 390x844 and 1440x900, each in day and in night, set as a phone sets them. Each of the four ran in its own browser with nothing stored.
- File names: `journey--state--size--appearance.png` is what fits on the screen. `--full.png` beside it is the whole page, taken whenever the page is taller than the screen, because an audit needs what is below the fold too.
- A few states are also photographed scrolled to the part that matters (a refusal, the day row, a button further down). The path says so.

### How these were reached, and what is not real

A **virtual passkey with PRF** signs in through the product's own account code, so accounts, sessions, signatures and every click are real. A new account holds no gift, no money and no day history, so most states are reached by letting the real screens render while the answers that describe the state are **replaced in the browser**: the product's own `/api` routes, and the balance reads the screens send to the Monad RPC. Each state below lists exactly what was replaced. The figures used come from the first real conversion of 16 Sep where one was needed (10 AUSD in, 9.999586 USDC out). **Nothing was sent to the chain**: a transaction broadcast is refused by the capture run itself, whatever a screen tries.

Day numbers in the gift fixtures are relative to the day of the run, so the day row reads as it would on that day. The catch-up window in the day-state fixture is widened to two days so the catchable day stays catchable whatever the hour; the real window is thirty hours.

**Do not grade this sentence as a defect.** On the recipient's gift with every day state, the line "Yesterday is not counted yet, and not lost either. Do a lesson before today at 2:00 AM…" comes from that widened window. The catchable day there is two days old, so "Yesterday" is wrong for it, but with the real thirty-hour window the catchable day is always yesterday. The run also took place at 22:18 UTC, just after midnight in Paris: the day row counts days in UTC while clock times are written in local time, which is why the deadline reads "today at 2:00 AM".

A signed-in session lives in memory, so a direct navigation signs a page out. Where the run had to navigate directly, it signed in again on the account page and came back by the link. Paths below are the way a person gets there, starting from the home page, signed in unless they say otherwise.

### recipient

#### link opened, no account

- Path: Opened from the link the funder sent (a link, not a click from home), with no account on this device
- Reached: replaced: GET /api/gift/[id]

| size | day | night |
|---|---|---|
| 390x844 | `recipient--link-opened-no-account--390x844--day.png` | `recipient--link-opened-no-account--390x844--night.png` |
| 1440x900 | `recipient--link-opened-no-account--1440x900--day.png` | `recipient--link-opened-no-account--1440x900--night.png` |

#### link opened, signed in, before opening

- Path: Opened from the link the funder sent, with an account already on this device: Sign in
- Reached: replaced: GET /api/gift/[id]

| size | day | night |
|---|---|---|
| 390x844 | `recipient--link-opened-signed-in-before-opening--390x844--day.png` | `recipient--link-opened-signed-in-before-opening--390x844--night.png` |
| 1440x900 | `recipient--link-opened-signed-in-before-opening--1440x900--day.png` | `recipient--link-opened-signed-in-before-opening--1440x900--night.png` |

#### name their Duolingo

- Path: On the link, signed in: Open my gift
- Reached: replaced: GET /api/gift/[id], POST /api/gift/claim

| size | day | night |
|---|---|---|
| 390x844 | `recipient--name-their-duolingo--390x844--day.png` | `recipient--name-their-duolingo--390x844--night.png` |
| 1440x900 | `recipient--name-their-duolingo--1440x900--day.png` | `recipient--name-their-duolingo--1440x900--night.png` |

#### code to add

- Path: After opening it: type the Duolingo username, Continue
- Reached: replaced: GET /api/gift/[id], POST /api/gift/claim, POST /api/gift/[id]/account

| size | day | night |
|---|---|---|
| 390x844 | `recipient--code-to-add--390x844--day.png` | `recipient--code-to-add--390x844--night.png` |
| 1440x900 | `recipient--code-to-add--1440x900--day.png` | `recipient--code-to-add--1440x900--night.png` |

#### counting started

- Path: On the code screen: I added it
- Reached: replaced: GET /api/gift/[id], POST /api/gift/claim, POST /api/gift/[id]/account, POST /api/gift/[id]/bind

| size | day | night |
|---|---|---|
| 390x844 | `recipient--counting-started--390x844--day.png`, `recipient--counting-started--390x844--day--full.png` | `recipient--counting-started--390x844--night.png`, `recipient--counting-started--390x844--night--full.png` |
| 1440x900 | `recipient--counting-started--1440x900--day.png` | `recipient--counting-started--1440x900--night.png` |

#### every day state

- Path: Signed in, on the home page: the gift under "What I receive"
- Reached: replaced: GET /api/gifts/mine, balance reads, GET /api/gift/[id]

| size | day | night |
|---|---|---|
| 390x844 | `recipient--every-day-state--390x844--day.png`, `recipient--every-day-state--390x844--day--full.png` | `recipient--every-day-state--390x844--night.png`, `recipient--every-day-state--390x844--night--full.png` |
| 1440x900 | `recipient--every-day-state--1440x900--day.png` | `recipient--every-day-state--1440x900--night.png` |

#### take what is earned

- Path: Signed in, on the home page: the gift under "What I receive"
- Reached: replaced: GET /api/gifts/mine, balance reads, GET /api/gift/[id]

| size | day | night |
|---|---|---|
| 390x844 | `recipient--take-what-is-earned--390x844--day.png`, `recipient--take-what-is-earned--390x844--day--full.png` | `recipient--take-what-is-earned--390x844--night.png`, `recipient--take-what-is-earned--390x844--night--full.png` |
| 1440x900 | `recipient--take-what-is-earned--1440x900--day.png` | `recipient--take-what-is-earned--1440x900--night.png` |

#### earned money taken

- Path: On the gift: Take $2.00
- Reached: replaced: GET /api/gifts/mine, balance reads, GET /api/gift/[id], POST /api/gift/withdraw

| size | day | night |
|---|---|---|
| 390x844 | `recipient--earned-money-taken--390x844--day.png`, `recipient--earned-money-taken--390x844--day--full.png` | `recipient--earned-money-taken--390x844--night.png`, `recipient--earned-money-taken--390x844--night--full.png` |
| 1440x900 | `recipient--earned-money-taken--1440x900--day.png` | `recipient--earned-money-taken--1440x900--night.png` |

### funder

#### account step

- Path: Not signed in, on the home page: Offer a gift, type a Duolingo name, Continue, Continue, Continue
- Reached: real: nothing replaced

| size | day | night |
|---|---|---|
| 390x844 | `funder--account-step--390x844--day.png` | `funder--account-step--390x844--night.png` |
| 1440x900 | `funder--account-step--1440x900--day.png` | `funder--account-step--1440x900--night.png` |

#### who

- Path: Signed in, on the home page: Offer a gift
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `funder--who--390x844--day.png`, `funder--who--390x844--day--full.png` | `funder--who--390x844--night.png`, `funder--who--390x844--night--full.png` |
| 1440x900 | `funder--who--1440x900--day.png`, `funder--who--1440x900--day--full.png` | `funder--who--1440x900--night.png`, `funder--who--1440x900--night--full.png` |

#### how much

- Path: Signed in, on the home page: Offer a gift, type a Duolingo name, Continue
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `funder--how-much--390x844--day.png`, `funder--how-much--390x844--day--full.png` | `funder--how-much--390x844--night.png`, `funder--how-much--390x844--night--full.png` |
| 1440x900 | `funder--how-much--1440x900--day.png`, `funder--how-much--1440x900--day--full.png` | `funder--how-much--1440x900--night.png`, `funder--how-much--1440x900--night--full.png` |

#### check

- Path: Signed in, on the home page: Offer a gift, type a Duolingo name, Continue, Continue
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `funder--check--390x844--day.png`, `funder--check--390x844--day--full.png` | `funder--check--390x844--night.png`, `funder--check--390x844--night--full.png` |
| 1440x900 | `funder--check--1440x900--day.png`, `funder--check--1440x900--day--full.png` | `funder--check--1440x900--night.png`, `funder--check--1440x900--night--full.png` |

#### waiting for the payment

- Path: Signed in, on the home page: Offer a gift, type a Duolingo name, Continue, Continue, Add money and give (the card service opens in a new tab, closed here)
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `funder--waiting-for-the-payment--390x844--day.png`, `funder--waiting-for-the-payment--390x844--day--full.png` | `funder--waiting-for-the-payment--390x844--night.png`, `funder--waiting-for-the-payment--390x844--night--full.png` |
| 1440x900 | `funder--waiting-for-the-payment--1440x900--day.png`, `funder--waiting-for-the-payment--1440x900--day--full.png` | `funder--waiting-for-the-payment--1440x900--night.png`, `funder--waiting-for-the-payment--1440x900--night--full.png` |

#### session closed while waiting

- Path: On the waiting screen: Close it now (what ten quiet minutes do on their own)
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `funder--session-closed-while-waiting--390x844--day.png`, `funder--session-closed-while-waiting--390x844--day--full.png` | `funder--session-closed-while-waiting--390x844--night.png`, `funder--session-closed-while-waiting--390x844--night--full.png` |
| 1440x900 | `funder--session-closed-while-waiting--1440x900--day.png` | `funder--session-closed-while-waiting--1440x900--night.png` |

#### picked up after a reload, before signing in

- Path: On the session-closed screen, reload the page
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `funder--picked-up-after-a-reload-before-signing-in--390x844--day.png` | `funder--picked-up-after-a-reload-before-signing-in--390x844--night.png` |
| 1440x900 | `funder--picked-up-after-a-reload-before-signing-in--1440x900--day.png` | `funder--picked-up-after-a-reload-before-signing-in--1440x900--night.png` |

#### picked up after a reload, signed in

- Path: After the reload: Sign in to pick it up, Sign in
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `funder--picked-up-after-a-reload-signed-in--390x844--day.png`, `funder--picked-up-after-a-reload-signed-in--390x844--day--full.png` | `funder--picked-up-after-a-reload-signed-in--390x844--night.png`, `funder--picked-up-after-a-reload-signed-in--390x844--night--full.png` |
| 1440x900 | `funder--picked-up-after-a-reload-signed-in--1440x900--day.png`, `funder--picked-up-after-a-reload-signed-in--1440x900--day--full.png` | `funder--picked-up-after-a-reload-signed-in--1440x900--night.png`, `funder--picked-up-after-a-reload-signed-in--1440x900--night--full.png` |

#### payment arrived

- Path: Signed in, on the home page, with 50 MON arrived: Offer a gift, type a Duolingo name, Continue, Continue
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `funder--payment-arrived--390x844--day.png`, `funder--payment-arrived--390x844--day--full.png` | `funder--payment-arrived--390x844--night.png`, `funder--payment-arrived--390x844--night--full.png` |
| 1440x900 | `funder--payment-arrived--1440x900--day.png`, `funder--payment-arrived--1440x900--day--full.png` | `funder--payment-arrived--1440x900--night.png`, `funder--payment-arrived--1440x900--night--full.png` |

#### payment arrived, getting it ready

- Path: On that screen: Use the payment that arrived (the exchange quote is held unanswered, so nothing is signed or sent)
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `funder--payment-arrived-getting-it-ready--390x844--day.png` | `funder--payment-arrived-getting-it-ready--390x844--night.png` |
| 1440x900 | `funder--payment-arrived-getting-it-ready--1440x900--day.png` | `funder--payment-arrived-getting-it-ready--1440x900--night.png` |

#### gift created with the link

- Path: Signed in, on the home page, with $30.00 in the account: Offer a gift, type a Duolingo name, Continue, Continue, Put it in their name
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/gift/create

| size | day | night |
|---|---|---|
| 390x844 | `funder--gift-created-with-the-link--390x844--day.png` | `funder--gift-created-with-the-link--390x844--night.png` |
| 1440x900 | `funder--gift-created-with-the-link--1440x900--day.png` | `funder--gift-created-with-the-link--1440x900--night.png` |

### home

#### signed in, no gift

- Path: Signed in, on the home page
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `home--signed-in-no-gift--390x844--day.png` | `home--signed-in-no-gift--390x844--night.png` |
| 1440x900 | `home--signed-in-no-gift--1440x900--day.png` | `home--signed-in-no-gift--1440x900--night.png` |

#### signed in, gifts in progress

- Path: Signed in, on the home page, with one gift received and one given, both counting, and $2.00 in the account
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `home--signed-in-gifts-in-progress--390x844--day.png`, `home--signed-in-gifts-in-progress--390x844--day--full.png` | `home--signed-in-gifts-in-progress--390x844--night.png`, `home--signed-in-gifts-in-progress--390x844--night--full.png` |
| 1440x900 | `home--signed-in-gifts-in-progress--1440x900--day.png` | `home--signed-in-gifts-in-progress--1440x900--night.png` |

#### signed in, gifts finished

- Path: Signed in, on the home page, with one gift received and one given, both finished, and $6.00 in the account
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `home--signed-in-gifts-finished--390x844--day.png`, `home--signed-in-gifts-finished--390x844--day--full.png` | `home--signed-in-gifts-finished--390x844--night.png`, `home--signed-in-gifts-finished--390x844--night--full.png` |
| 1440x900 | `home--signed-in-gifts-finished--1440x900--day.png` | `home--signed-in-gifts-finished--1440x900--night.png` |

### donor

#### a gift being earned

- Path: Signed in, on the home page: the gift under "What I give"
- Reached: replaced: GET /api/gifts/mine, balance reads, GET /api/gift/[id]

| size | day | night |
|---|---|---|
| 390x844 | `donor--a-gift-being-earned--390x844--day.png` | `donor--a-gift-being-earned--390x844--night.png` |
| 1440x900 | `donor--a-gift-being-earned--1440x900--day.png` | `donor--a-gift-being-earned--1440x900--night.png` |

### withdrawal

#### base, AUSD alone

- Path: Signed in, on the home page, with money in the account: Take it out
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--base-ausd-alone--390x844--day.png`, `withdrawal--base-ausd-alone--390x844--day--full.png` | `withdrawal--base-ausd-alone--390x844--night.png`, `withdrawal--base-ausd-alone--390x844--night--full.png` |
| 1440x900 | `withdrawal--base-ausd-alone--1440x900--day.png`, `withdrawal--base-ausd-alone--1440x900--day--full.png` | `withdrawal--base-ausd-alone--1440x900--night.png`, `withdrawal--base-ausd-alone--1440x900--night--full.png` |

#### choice of rail

- Path: Signed in, on the home page, with money in the account: Take it out, then scroll to "Ways to be paid"
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--choice-of-rail--390x844--day.png`, `withdrawal--choice-of-rail--390x844--day--full.png` | `withdrawal--choice-of-rail--390x844--night.png`, `withdrawal--choice-of-rail--390x844--night--full.png` |
| 1440x900 | `withdrawal--choice-of-rail--1440x900--day.png`, `withdrawal--choice-of-rail--1440x900--day--full.png` | `withdrawal--choice-of-rail--1440x900--night.png`, `withdrawal--choice-of-rail--1440x900--night--full.png` |

#### base, AUSD and USDC

- Path: Signed in, on the home page, with money in the account: Take it out, after a change has left USDC in the account
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--base-ausd-and-usdc--390x844--day.png`, `withdrawal--base-ausd-and-usdc--390x844--day--full.png` | `withdrawal--base-ausd-and-usdc--390x844--night.png`, `withdrawal--base-ausd-and-usdc--390x844--night--full.png` |
| 1440x900 | `withdrawal--base-ausd-and-usdc--1440x900--day.png`, `withdrawal--base-ausd-and-usdc--1440x900--day--full.png` | `withdrawal--base-ausd-and-usdc--1440x900--night.png`, `withdrawal--base-ausd-and-usdc--1440x900--night--full.png` |

#### change, before the quote

- Path: Signed in, on the home page, with money in the account: Take it out, Use Ramp
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--change-before-the-quote--390x844--day.png`, `withdrawal--change-before-the-quote--390x844--day--full.png` | `withdrawal--change-before-the-quote--390x844--night.png`, `withdrawal--change-before-the-quote--390x844--night--full.png` |
| 1440x900 | `withdrawal--change-before-the-quote--1440x900--day.png`, `withdrawal--change-before-the-quote--1440x900--day--full.png` | `withdrawal--change-before-the-quote--1440x900--night.png`, `withdrawal--change-before-the-quote--1440x900--night--full.png` |

#### quote shown

- Path: Signed in, on the home page, with money in the account: Take it out, Use Ramp, type 10, See what you would get
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/exit/quote

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--quote-shown--390x844--day.png`, `withdrawal--quote-shown--390x844--day--full.png` | `withdrawal--quote-shown--390x844--night.png`, `withdrawal--quote-shown--390x844--night--full.png` |
| 1440x900 | `withdrawal--quote-shown--1440x900--day.png`, `withdrawal--quote-shown--1440x900--day--full.png` | `withdrawal--quote-shown--1440x900--night.png`, `withdrawal--quote-shown--1440x900--night--full.png` |

#### changed

- Path: Signed in, on the home page, with money in the account: Take it out, Use Ramp, type 10, See what you would get, Change $10.00
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/exit/quote, POST /api/exit/prepare, POST /api/exit/relay

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--changed--390x844--day.png`, `withdrawal--changed--390x844--day--full.png` | `withdrawal--changed--390x844--night.png`, `withdrawal--changed--390x844--night--full.png` |
| 1440x900 | `withdrawal--changed--1440x900--day.png`, `withdrawal--changed--1440x900--day--full.png` | `withdrawal--changed--1440x900--night.png`, `withdrawal--changed--1440x900--night--full.png` |

#### identifier step

- Path: After the change: Copy your identifier
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/exit/quote, POST /api/exit/prepare, POST /api/exit/relay

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--identifier-step--390x844--day.png`, `withdrawal--identifier-step--390x844--day--full.png` | `withdrawal--identifier-step--390x844--night.png`, `withdrawal--identifier-step--390x844--night--full.png` |
| 1440x900 | `withdrawal--identifier-step--1440x900--day.png`, `withdrawal--identifier-step--1440x900--day--full.png` | `withdrawal--identifier-step--1440x900--night.png`, `withdrawal--identifier-step--1440x900--night--full.png` |

#### send with the exact amount

- Path: After the change: paste the identifier Ramp gives, Send it to Ramp
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/exit/quote, POST /api/exit/prepare, POST /api/exit/relay

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--send-with-the-exact-amount--390x844--day.png`, `withdrawal--send-with-the-exact-amount--390x844--day--full.png` | `withdrawal--send-with-the-exact-amount--390x844--night.png`, `withdrawal--send-with-the-exact-amount--390x844--night--full.png` |
| 1440x900 | `withdrawal--send-with-the-exact-amount--1440x900--day.png`, `withdrawal--send-with-the-exact-amount--1440x900--day--full.png` | `withdrawal--send-with-the-exact-amount--1440x900--night.png`, `withdrawal--send-with-the-exact-amount--1440x900--night--full.png` |

#### sent

- Path: On the send: Send $9.999586
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/exit/quote, POST /api/exit/prepare, POST /api/exit/relay, POST /api/send

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--sent--390x844--day.png`, `withdrawal--sent--390x844--day--full.png` | `withdrawal--sent--390x844--night.png`, `withdrawal--sent--390x844--night--full.png` |
| 1440x900 | `withdrawal--sent--1440x900--day.png`, `withdrawal--sent--1440x900--day--full.png` | `withdrawal--sent--1440x900--night.png`, `withdrawal--sent--1440x900--night--full.png` |

#### refused, not enough

- Path: Signed in, on the home page, with money in the account: Take it out, Use Ramp, type 10, See what you would get
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/exit/quote

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--refused-not-enough--390x844--day.png`, `withdrawal--refused-not-enough--390x844--day--full.png` | `withdrawal--refused-not-enough--390x844--night.png`, `withdrawal--refused-not-enough--390x844--night--full.png` |
| 1440x900 | `withdrawal--refused-not-enough--1440x900--day.png`, `withdrawal--refused-not-enough--1440x900--day--full.png` | `withdrawal--refused-not-enough--1440x900--night.png`, `withdrawal--refused-not-enough--1440x900--night--full.png` |

#### refused, the rate moved

- Path: Signed in, on the home page, with money in the account: Take it out, Use Ramp, type 10, See what you would get, Change $10.00
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/exit/quote, POST /api/exit/prepare

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--refused-the-rate-moved--390x844--day.png`, `withdrawal--refused-the-rate-moved--390x844--day--full.png` | `withdrawal--refused-the-rate-moved--390x844--night.png`, `withdrawal--refused-the-rate-moved--390x844--night--full.png` |
| 1440x900 | `withdrawal--refused-the-rate-moved--1440x900--day.png`, `withdrawal--refused-the-rate-moved--1440x900--day--full.png` | `withdrawal--refused-the-rate-moved--1440x900--night.png`, `withdrawal--refused-the-rate-moved--1440x900--night--full.png` |

#### refused, the exchange refused three times

- Path: Signed in, on the home page, with money in the account: Take it out, Use Ramp, type 10, See what you would get, Change $10.00 (asked again twice by itself)
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/exit/quote, POST /api/exit/prepare, POST /api/exit/relay

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--refused-the-exchange-refused-three-times--390x844--day.png`, `withdrawal--refused-the-exchange-refused-three-times--390x844--day--full.png` | `withdrawal--refused-the-exchange-refused-three-times--390x844--night.png`, `withdrawal--refused-the-exchange-refused-three-times--390x844--night--full.png` |
| 1440x900 | `withdrawal--refused-the-exchange-refused-three-times--1440x900--day.png`, `withdrawal--refused-the-exchange-refused-three-times--1440x900--day--full.png` | `withdrawal--refused-the-exchange-refused-three-times--1440x900--night.png`, `withdrawal--refused-the-exchange-refused-three-times--1440x900--night--full.png` |

#### refused, the session closed

- Path: Signed in, on the home page, with money in the account: Take it out, Use Ramp, type 10, See what you would get, Change $10.00, with the server session expired
- Reached: replaced: GET /api/gifts/mine, balance reads, POST /api/exit/quote, POST /api/exit/prepare

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--refused-the-session-closed--390x844--day.png` | `withdrawal--refused-the-session-closed--390x844--night.png` |
| 1440x900 | `withdrawal--refused-the-session-closed--1440x900--day.png` | `withdrawal--refused-the-session-closed--1440x900--night.png` |

#### session closed on its own

- Path: Signed in, on the home page, with money in the account: Take it out, Close it now (what ten quiet minutes do on their own)
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--session-closed-on-its-own--390x844--day.png` | `withdrawal--session-closed-on-its-own--390x844--night.png` |
| 1440x900 | `withdrawal--session-closed-on-its-own--1440x900--day.png` | `withdrawal--session-closed-on-its-own--1440x900--night.png` |

#### send MON, the network's own coin

- Path: Typed the address /cash-out, because home offers no way out when the account holds no AUSD; Sign in, Send it to another account of mine
- Reached: replaced: balance reads

| size | day | night |
|---|---|---|
| 390x844 | `withdrawal--send-mon-the-network-s-own-coin--390x844--day.png`, `withdrawal--send-mon-the-network-s-own-coin--390x844--day--full.png` | `withdrawal--send-mon-the-network-s-own-coin--390x844--night.png`, `withdrawal--send-mon-the-network-s-own-coin--390x844--night--full.png` |
| 1440x900 | `withdrawal--send-mon-the-network-s-own-coin--1440x900--day.png`, `withdrawal--send-mon-the-network-s-own-coin--1440x900--day--full.png` | `withdrawal--send-mon-the-network-s-own-coin--1440x900--night.png`, `withdrawal--send-mon-the-network-s-own-coin--1440x900--night--full.png` |

### account

#### account, signed in

- Path: Signed in, on the home page: Account, help and legal
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `account--account-signed-in--390x844--day.png`, `account--account-signed-in--390x844--day--full.png` | `account--account-signed-in--390x844--night.png`, `account--account-signed-in--390x844--night--full.png` |
| 1440x900 | `account--account-signed-in--1440x900--day.png`, `account--account-signed-in--1440x900--day--full.png` | `account--account-signed-in--1440x900--night.png`, `account--account-signed-in--1440x900--night--full.png` |

#### legal

- Path: Signed in, on the home page: Account, help and legal, Legal
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `account--legal--390x844--day.png`, `account--legal--390x844--day--full.png` | `account--legal--390x844--night.png`, `account--legal--390x844--night--full.png` |
| 1440x900 | `account--legal--1440x900--day.png` | `account--legal--1440x900--night.png` |

#### privacy

- Path: Signed in, on the home page: Account, help and legal, Privacy
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `account--privacy--390x844--day.png`, `account--privacy--390x844--day--full.png` | `account--privacy--390x844--night.png`, `account--privacy--390x844--night--full.png` |
| 1440x900 | `account--privacy--1440x900--day.png`, `account--privacy--1440x900--day--full.png` | `account--privacy--1440x900--night.png`, `account--privacy--1440x900--night--full.png` |

#### judges, signed in

- Path: Signed in, on the home page: Account, help and legal, For judges
- Reached: replaced: GET /api/gifts/mine, balance reads

| size | day | night |
|---|---|---|
| 390x844 | `account--judges-signed-in--390x844--day.png`, `account--judges-signed-in--390x844--day--full.png` | `account--judges-signed-in--390x844--night.png`, `account--judges-signed-in--390x844--night--full.png` |
| 1440x900 | `account--judges-signed-in--1440x900--day.png`, `account--judges-signed-in--1440x900--day--full.png` | `account--judges-signed-in--1440x900--night.png`, `account--judges-signed-in--1440x900--night--full.png` |

### About the local servers

Each size and appearance ran against a production server of its own. Those servers were restarted 4 times in all during the run: the sign-in routes allow 30 requests per 10 minutes (`src/rate-limit.ts`), each sign-in costs two, and a run that signs in again after every direct navigation needs more. The limit was left as it is. Sessions are signed cookies, so a restart ends nobody's session.

### Not captured

- **Help.** There is no help control anywhere in the product: no button, link or disclosure. The only help-like content is the always visible "Lost your phone?" section on the account page, which is in the account captures (see the full-page images).
- Every other state asked for was captured at both sizes, in day and in night.

### Noticed while capturing, on the run of 16 Sep 2026 (commit `34d6cec`)

Recorded because they bear on reading the images. Not assessed, and nothing was changed. They describe the screens as they were at that commit: a later run does not check them again.

- A recipient who signs in on the link, before opening the gift, reads the funder's sentence: "You put $7.00 in their name." Signing in does not refetch the gift, and before a claim the server does not yet name them as the recipient (`GiftPage.tsx`).
- The day row cannot tell an earned day from a returned one: both are "finished" (`src/day-states.ts`, which says the order is not known from the contract's counts).
- The code a recipient adds to their Duolingo name expires after an hour, and the screen never says so (`codeExpiresAt` is not read).
- The home page offers "Take it out" only when the account holds AUSD. Somebody holding only USDC or MON, which is what a change leaves behind, has no link to the way out: the MON capture had to type the address.
- While a payment that arrived is being made ready, the big figure on the funding screen reads $0.00.
- A sign-in refused by the rate limit shows "Something went wrong on our side. Nothing was changed. Please try again.", not that there were too many attempts. It surfaced when the first run hit the limit.
- When the exchange refuses three times in a row, the way out has already asked for a new price twice by itself and stopped, yet the message it leaves still says "Viky will ask for a new one."
