# Drawn flows for the three money journeys

Derived from the design specification of 17 Sep 2026 (section 3, screen by screen, and the five decisions of
section 4), which is kept outside this repository. Written before any line of code, for the founder to proofread.
Nothing here is built: every sentence below is what a screen will say once its journey's conversation has
delivered it and the captures at 390x844 and 1440x900, day and night, have been read against the grid.

## Decisions of 17 Sep 2026 on the thirteen open points

Taken by the founder after proofreading, in the order of the list at the end of this document. Every `[open N]`
below resolves here.

1. **Fees and delays.** Ramp's published fee and delay are shown on the card with their source and date: they
   are Ramp's facts. No sentence of ours about what happened until the bank credit is reported; on that day
   the first sentence delivered is the one with the measured figures.
2. **The Mercuryo list.** `Whose it is: your own.`
3. **A day earned against a day returned.** The keeper writes a per-day record at every credit and every
   drain. Fourth change under the screens, accepted.
4. **"Ana".** The Duolingo name when known, `their` otherwise. No first name. **Replaced the same day by the founder**:
   the first step asks "Their first name" and "Your name, as they know you", stored beside the link and never in the
   contract (D85). F2 to F10 below still show the earlier wording; the screens follow D85.
5. **The fourteen days.** The settling pass includes unopened and unconnected gifts older than fourteen days
   (`src/daily-pass.ts` skips them today). Fifth change under the screens, accepted.
6. **The rate source.** `RATE_SOURCE` in `src/rails.ts`: the ECB's daily read, dated by its own `time`
   attribute, with the CFA parity beside it. The parity is sourced twice: the figure, 655.957 per euro, buying
   and selling, is on the BCEAO's manual exchange-rate page of 16 Sep 2026; the fixed parity itself, guaranteed
   by a budgetary commitment of the French Treasury and in force since 1 January 1999, is Council Decision
   98/683/EC of 23 November 1998. Neither page says "treaty", so that word is gone. Dollar alone beyond three
   days without a read.
7. **References.** A `viky_sends` table with a readable identifier; the reference shown is the hash in short
   form. Sixth change under the screens, accepted.
8. **Typing.** Dollars typed, display currency read.
9. **The code.** Shown whole, copyable in one gesture.
10. **The Duolingo name.** Checked by a public read before any money moves. `10 XP is about one short lesson`
    only if read on a Duolingo page, otherwise left out.
11. **The account's own code.** `Your code` on the account page, with one line of use.
12. **Two route facts.** A typed `RATE_LIMITED` on the 429, and a named constant for the pass hours.
13. **The gift route.** The two fields are added.

## How to read a state

Each state is one block:

- **Reached by**: what puts a person here.
- **On screen**: the sentences, word for word. `[spec]` marks a sentence taken from the specification as written.
  `[proposed]` marks one written here because the specification is silent at that point. `[open N]` points at
  the list at the end, where the founder decides.
- **Then**: every gesture and where it leads.
- **Below**: what the state needs from the code under the screens, with what exists today. Only three things
  under the screens may change (the way out reachable as soon as the account holds anything, thirty minutes of
  session on money screens with exact resume, one display currency per account). Anything else a state needs
  from below is marked `[open N]` rather than assumed.
- **Currency**: where the display currency intervenes in this state, and where it deliberately does not.

Example figures are fixed through the document so the sentences can be compared: the withdrawal account holds
$10.99; the funder gives $25 for 7 days to `ama_learns` and pays 25 EUR by card; the recipient's gift is $7,
$1 a day, 7 days. Converted figures use the rate read on 17 Sep 2026 (1 EUR = 1.1537 USD, see the last
section): $10.99 is about 9.53 EUR or about 6 249 CFA francs.

## Rules that hold on every state

From the specification's section 2 and section 4, restated so each state below can point at them:

1. **Words.** The person never reads a money name, a network name or an identifier. When a third party
   demands one, it is "the code Ramp asks for", shown for copying, with one sentence saying why.
2. **Amounts.** One figure per fact, labelled. Two decimals. The exact figure only when a third party requires
   it, and then copyable in one gesture. What is paid, what arrives and what goes in the other person's name are
   three separate lines. A third party's fee is said before the commitment.
3. **Paths.** From every state the next step is on the screen, named, one gesture away. The way out is
   reachable as soon as the account holds anything. Help exists or the word disappears.
4. **Days and time.** Every day says its state in words. The next reading is given in the reader's local time
   with the date. The count of missed days survives the end of the gift.
5. **Commitment.** Before any irreversible gesture, a review screen. After it, a confirmation with the amount,
   a reference, the date and the next step. The bearer-link risk is said before the gift is made.
6. **Refusals and session.** Every refusal is typed, says what happened and what to do, under the field in
   cause. Money screens keep the session open thirty minutes, and coming back after it closed resumes the
   exact state, derived from what the account holds and the server knows, never from memory.
7. **Display currency** (decision 1). One per account, proposed from the device's country, never asked by a
   question, changeable on the account page. Every converted figure carries "about" and the date of the rate.
   The dollar figure stays readable, small, on review screens and confirmations. If the rate source did not
   answer, the dollar shows alone and the screen says so in one line: `Shown in dollars: the exchange rate could
   not be read today.` [proposed]
8. **Language** (decision 3). The app speaks the device's language with English as the fallback. Only English
   is written for the event; every sentence lives in one file so French is added without touching a screen.

---

## Journey 1: withdrawal

Fifteen states today, twelve after the rebuild, on one page (`/cash-out`) reached from the home page. The Ramp
branch is drawn in full because it is the one that has moved real money (16 Sep 2026, 10 AUSD to 9.999586
USDC, then 9.99 USDC sold for 6.71 EUR on Ramp's side). The Mercuryo branch differs at three points, listed
after the Ramp states.

### W1. Entry: the way out on the home page

- **Reached by**: signed in on the home page, with anything at all in the account.
- **On screen**: the "In your account" card with the total and the control `Take it out` [spec, unchanged].
- **Then**: `Take it out` opens W2.
- **Below**: the card must show whenever the account holds AUSD, USDC or MON above the unspendable reserve.
  Today `YourMoney` reads AUSD alone, so an account left holding USDC or MON after a change has no way out
  (this is the first of the three permitted changes). Balances: `readCoinBalance` for each coin in `COINS`. The
  reserve the network holds (10 MON, kept at 11 in `CONVERSION_RESERVE`) is never counted as money.
- **Currency**: the total on the card follows rule 7. `In your account: about 9.53 EUR (rate of 16 Sep)`, with
  `$10.99` beneath in the help size.

### W2. Base: what is there and where it can go

- **Reached by**: W1, or `/cash-out` reloaded at any later point when nothing is ready (see W6 for the
  reloaded state when something is).
- **On screen**:
  - `Take your money out` [spec]
  - `Your money: $10.99` [spec], and when a change left something ready, `9.99 of it is ready to send to Ramp.`
    [proposed, accepted on 17 Sep in place of the spec's `Ready to send to Ramp: 9.99`, so the figure is read as
    part of the total and not beside it]
  - Ramp card: `To your bank account, in euros. Ramp keeps 0.99 % with a minimum of 1.99 EUR, and pays within
    2 business days.` [spec] [open 1]
  - Mercuryo card: `To your card.` [S4: the spec's `where Ramp does not serve` is gone, no rail names the other]
  - Under each card, one line naming the source and its date, from `src/rails.ts`: `Read from Ramp's own pages,
    16 Sep 2026.` [proposed]
  - Below both, as a secondary link, not a button: `Send to another Viky account of mine` [spec] (W13).
- **Then**: the Ramp card opens W3 (step 1 of 3). The Mercuryo card opens W3 for the Mercuryo branch. The
  secondary link opens W13. `Back to my gifts` returns home.
- **Below**: nothing new. `WAYS_OUT` in `src/rails.ts` carries the name, the page, the coin the router hands back,
  the fee, the conditions, the source and the date. The words `USDC`, `AUSD`, `MON`, `Monad`, `identifier`,
  `exchange`, `quote` never appear: the `sells` field ("USDC on Monad") is for the code and is not printed. The
  card's fee sentence must be built from `fee` and `read`, not retyped on the screen.
- **Currency**: `Your money` follows rule 7, as on W1. The fee figures on the Ramp card are Ramp's own, in
  euros, and are never converted: they are what Ramp charges, not a value of the person's money. Nothing else on
  this state is converted.

### W3. Step 1, how much

- **Reached by**: W2, either card.
- **On screen**:
  - `Step 1 of 3: Get it ready` [spec, "Get it ready"; the numbering is proposed]
  - Field label: `How much do you want to send to your bank?` [spec] (Mercuryo branch: `... to your card?`)
  - The field holds `10.99`, the maximum, prefilled with two decimals [spec].
  - Help under the field: `Up to $10.99, with two decimals at most.` [proposed]
  - Button: `See what you will get` [proposed: the specification names the review screen and the button after it,
    not this one]
  - Secondary: `Not now` returns to W2.
- **Then**: the button asks for a quote and opens W4. A refusal under the field keeps the person here (W10).
- **Below**: `POST /api/exit/quote` with `{amount, coin}` exists and returns `{shown, sells, name, payout?,
  ticket}`; for USDC it already checks Ramp's smallest and largest sale (`payoutAsset`, `withinPayoutRange`). The
  amount is parsed by `amountToSend(text, holding, coin)`, which refuses more than the holding and more than two
  decimals with a typed message. Nothing new.
- **Currency**: the field is in dollars, because what leaves is dollars and because the next screen already
  shows Ramp's own euro figure; a second euro figure with a different meaning on the same screen is what rule 2
  forbids. The help line may add `about 9.53 EUR` after the maximum for a euro account, and `about 6 249 CFA
  francs` for a CFA one, with the rate date. [open 8]

### W4. Step 1, the review before getting it ready

- **Reached by**: W3, once the quote answered.
- **On screen**:
  - `You will get at least 9.99 to send. Ramp will turn that into about 8.60 EUR, minus its 1.99 EUR fee: about
    6.61 EUR on your bank account. Nothing leaves your account yet.` [spec, corrected by the founder on 17 Sep
    after the second review: the net is said, and the fee printed is the one that applies, the larger of the
    share and the minimum]
  - Small, under it: `That is $10.99 of your money.` [proposed, rule 7: the dollar stays readable on a review]
  - Button: `Get 9.99 ready` [spec]
  - Secondary: `Not now` returns to W3 with the amount kept.
  - One line about time, because the quote expires: `This price holds for 4 minutes.` [proposed; the ticket's
    lifetime is `TICKET_TTL_SECONDS` in `src/exit-ticket.ts`, four minutes]
- **Then**: `Get 9.99 ready` opens W5. If the ticket expired, the button asks for a new quote and redraws this
  state with the new figures, saying so: `The price was refreshed.` [proposed]
- **Below**: `9.99` is the quote's floor (`minOut`) cut to two decimals, never rounded up, so the person gets at
  least what they read. The euro figure is Ramp's own, from the quote route's `payout` (`inFiat`), so "about"
  is honest: Ramp fixes the final amount when it receives the coins (their article 8967). The 1.99 EUR minimum
  fee is from `WAY_OUT_EURO.fee`. Nothing new below.
- **Currency**: the display currency does not intervene here. The only euro figure is Ramp's, labelled as what
  Ramp will turn it into. For a CFA account choosing Ramp, this state is the same: Ramp pays in euros.

### W5. Getting it ready, in flight

- **Reached by**: W4, `Get 9.99 ready`.
- **On screen**: `Getting 9.99 ready. A few seconds.` [proposed] with the button replaced by the same words and
  no other control. Nothing else changes on the card.
- **Then**: success opens W6. A typed refusal opens W10 under the step. The session closing here is impossible
  by construction: the gesture that opens W5 is a signature, which re-arms the session.
- **Below**: `POST /api/exit/prepare` with the ticket, the person's signature over the receive authorization,
  `POST /api/exit/relay`, and the three attempts on `QUOTE_STALE` (`takeTheWayOut`, `ATTEMPTS = 3`). The relay
  waits for finality before answering. All of this exists and ran on 16 Sep.
- **Currency**: none.

### W6. Ready: step 1 done, step 2 open

- **Reached by**: W5 on success, or `/cash-out` loaded at any time while the account holds at least 0.01 of the
  coin the chosen service buys.
- **On screen**:
  - Step 1 collapsed to one line: `Ready: 9.99` [spec] and `0.01 stays in your account.` [spec] (when the dust
    rounds to 0.00: `Less than 0.01 stays in your account.` [proposed])
  - `Step 2 of 3: Place your order with Ramp` [spec]
  - Button: `Order 9.99 on Ramp` [spec], opening Ramp's sell page in a new tab.
  - `When Ramp asks where you are sending from, give them this code` [spec], then the code, whole, on as many
    lines as it needs, with `Copy` beside it and the return `Copied` [spec]. [open 9]
  - `Ramp will ask you to confirm the money is yours: it is.` [spec]
  - Step 3 visible beneath, not yet active (W7).
  - Secondary: `Not now` returns home; the ready money stays ready.
- **Then**: `Order 9.99 on Ramp` opens Ramp beside Viky and the state stays W6. Pasting into step 3's field
  opens W7. Coming back after the session closed lands on W11 and, after signing in, back here with the same
  figures.
- **Below**: `9.99` is the balance of the output coin cut to two decimals: the number to type at Ramp, because
  Ramp's amount field takes two decimals. It is read from the account, never from a flag in memory, which is
  what makes this state survive a reload. The page opened is `WAY_OUT_EURO.page`, which already carries
  `swapAsset=MONAD_USDC&flow=offramp`. The code is the account's own identifier, which `CashOut` already shows
  and copies. Nothing new below, except the thirty-minute session on this page (decision 2): a person is on
  Ramp for longer than ten minutes here, and Ramp's identity check the first time takes longer still.
- **Currency**: none. The number to type at Ramp is unitless and never converted.

### W7. Step 3, the code Ramp gives, and the review before sending

- **Reached by**: W6, something pasted into the field.
- **On screen**:
  - `Step 3 of 3: Send it` [spec]
  - Field label: `Paste the code Ramp gives you to send to` [spec]
  - The pasted code shown whole, wrapping, so it can be compared with Ramp's page.
  - The fixed amount `9.99` [spec], not a field.
  - Button: `Send 9.99 to Ramp` [proposed, naming the action and the amount; the review comes next]
- **Then**: the button opens W8, the review. A code that is not one Ramp gives is refused under the field
  (W10). `Not now` returns to W6 with the code kept for as long as the page is open.
- **Below**: the field accepts what `isAddress` accepts and nothing else; the refusal is typed on the screen
  before anything is sent. Nothing new.
- **Currency**: none.

### W8. The review before sending

- **Reached by**: W7.
- **On screen**:
  - `Send 9.99 to Ramp. This cannot be undone.` [spec]
  - Small: `The code you pasted: [whole code]` [proposed] so the last look is at the destination.
  - Buttons: `Send` and `Not now` [spec]. `Not now` returns to W7.
- **Then**: `Send` opens W9.
- **Below**: nothing new: rule 5 is a screen. The send is the existing `POST /api/send` with `coin` for USDC.
- **Currency**: the amount is dollars already; for a euro or CFA account a small line `about 8.66 EUR (rate of
  16 Sep)` may follow the amount [proposed], labelled as a value and not as what Ramp pays, which W4 already
  said. Recommended: leave it out on this state, one figure per fact.

### W9. Sent: the confirmation

- **Reached by**: W8, once the send is final.
- **On screen**:
  - `Sent 9.99 to Ramp on 17 Sep 2026 at 23:41. Reference: [id].` then `Ramp pays your bank within 2 business
    days.` [spec, with the date added: rule 5 asks for it, accepted by the founder on 17 Sep]
  - Link: `Open Ramp to follow it` [spec], to Ramp's page.
  - `Back to my gifts`.
  - The three steps above are gone: the account no longer holds anything ready, so W2 is what a reload shows.
- **Then**: the link opens Ramp beside Viky. `Back to my gifts` returns home.
- **Below**: the time is the local time at which the relay saw the send final. The reference does not exist
  today: `POST /api/send` answers `{sent, hash}` and stores nothing, and a hash is a word nobody may read. A
  stored row with an id a person can quote is needed [open 7]. The delay sentence is Ramp's, from
  `WAY_OUT_EURO.conditions`.
- **Currency**: none on the confirmation beyond the amount sent.

### W10. Refusals, each under the element in cause

Every one is typed, sits under the field or the button it belongs to, and says the figure and the correction.
Sentences [proposed] unless marked:

| Where | Refusal | Sentence | Below |
|---|---|---|---|
| W3 field | more than the account holds | `That is more than your $10.99.` with a link `Send all of it` that fills the field | `amountToSend` already returns the holding; the screen must print it |
| W3 field | more than two decimals | `Two decimals at most, like 9.99.` | `amountToSend` |
| W3 field | under Ramp's smallest sale | `Ramp takes at least 6.51 EUR, about $7.51 today. Send at least that.` | the quote route's `withinPayoutRange`; the dollar figure is from the same quote |
| W3 field | over Ramp's largest sale | `Ramp takes at most 14 737.99 EUR in one sale. Send less than that.` | same |
| W4 button | the price moved between quote and prepare (`RATE_MOVED`) | `The price changed before you confirmed. Nothing was taken.` and the button becomes `See the new price` | exists; the button label is the change |
| W5 | three refusals in a row (`QUOTE_STALE` exhausted) | `The price kept changing and Viky stopped after three tries. Nothing was taken. Try again in a minute.` with `Try again` | exists; the sentence today promises a fourth try that never comes |
| W5, W9 | the way out not configured (`NOT_CONFIGURED`) | `Viky cannot pay out yet. Nothing was taken.` [spec, existing] | exists |
| W7 field | not a code Ramp gives | `That is not a code Ramp gives. It starts with 0x and is 42 characters long.` | screen check |
| W7 field | the person's own code | `That is your own code. Paste the one Ramp shows you to send to.` | screen check |
| W9 | the send refused by the coin (`FAILED`) | `Ramp did not receive it and nothing left your account. Try again.` | exists as a code; the sentence is the change |
| any | signed out mid-way (`SIGN_IN_REQUIRED`) | W11 | exists as a code |
| sign-in | rate limit | `Too many sign-ins in ten minutes. Wait a few minutes, then sign in again.` [spec] | today a 429 on the account routes reaches the screen as `UNKNOWN` ("Something went wrong on our side"); the account routes must answer a typed `RATE_LIMITED` and `src/account/errors.ts` must carry the sentence |

### W11. The session closed while they were away

- **Reached by**: any money gesture after the signing session idled out (today ten minutes; thirty on this
  page after decision 2), or the page reopened after it.
- **On screen**:
  - `Your session closed while you were away` [spec, existing]
  - `Nothing moved and nothing was taken. Your money is exactly where it was, and nothing about it expires.`
    [existing, kept]
  - `You were at step 2 of 3: 9.99 is ready to send to Ramp.` [proposed: the exact state, from the balances]
  - `Sign in` as the primary button, `Create my account` absent, `Use another account` absent [audit: signing in
    leads, a second account would strand the money].
- **Then**: signing in returns to the state the balances dictate (W2, W6 or W7 with an empty field).
- **Below**: `AccountPanel returning` exists. The exact resume is derived: no step is remembered in memory,
  each is read from what the account holds (W6's rule). Removing the two other controls from the returning
  panel is a screen change. The countdown `Closing in 9:59` disappears from every state of this journey; the
  session's length is said once on the account page.
- **Currency**: as W2 for the recalled figure.

### W12. Session closed on its own, page reloaded

- **Reached by**: `/cash-out` opened with no signing session, credential present on the device.
- **On screen**: `Sign in to see your money` [existing], then `Nothing moved and nothing was taken. Your money
  is exactly where it was.` [proposed, the same reassurance as W11], then the panel with `Sign in` leading.
- **Then**: signing in opens W2 or W6.
- **Below**: nothing new.
- **Currency**: none until signed in.

### W13. Send to another Viky account of mine

Secondary path, off the main card, kept because the specification keeps it as a link.

- **On screen**: `Send to another Viky account of mine` [spec]; field `Paste that account's code` [proposed];
  help `You will find it on that account's page, under "Your code".` [proposed] [open 11]; amount field with the
  same rules as W3; review `Send $5.00 to your other account. This cannot be undone.` with `Send` and `Not now`;
  confirmation `Sent $5.00 to your other account at 23:41. Reference: [id].`
- **Below**: `POST /api/send` for AUSD and USDC; the account's own code is today shown only on the judges page,
  which decision 4 removes from the person's path, so the account page must show it [open 11]. The MON case
  (the network's own coin, sent by the person's own account, fee taken from it) stays: the sentence says the
  fee afterwards with its figure, as today.
- **Currency**: the amount follows rule 7 on the review and the confirmation.

### The Mercuryo branch, where it differs

1. **W2, W3**: the Mercuryo card leads to the same step 1 with `to your card` in the question. The money is
   changed into what Mercuryo buys, the network's own coin; the screen never says which.
2. **W6**: `Ready: 138.43` is the number to type at Mercuryo, two decimals, from the account's balance of that
   coin above the reserve. `Order 138.43 on Mercuryo` opens `WAY_OUT_CARD.page`. The line about the code is
   the same. One extra line: `Once you place the order, Mercuryo gives you six hours to send it.`
   [from `WAY_OUT_CARD.conditions`].
3. **W7 to W9**: the send is made by the person's own account, not relayed, and the fee comes out of the same
   coin. The review says `Send 138.43 to Mercuryo. This cannot be undone. Sending costs a small amount of what
   you hold, said afterwards with its figure.` [proposed]; the confirmation adds `Sending cost 0.02.` with the
   measured figure. `sendMon` exists and checks amount plus fee against the balance.
4. **Currency**: for a CFA account, W4 may carry `Worth about 6 249 CFA francs today (rate of 16 Sep). What
   Mercuryo pays onto your card is shown on their page.` [proposed], because no Mercuryo quote is read: the
   figure is a value of the person's money, labelled as such, never a promise of the payout.

### What the withdrawal journey needs from below

| Need | Today | Change |
|---|---|---|
| The way out shown whenever the account holds anything | `YourMoney` reads AUSD only | permitted change 1 |
| Thirty minutes of session on `/cash-out`, exact resume | `IDLE_TIMEOUT_MS` is ten minutes in `src/account/mera.ts`; resume derives from balances already | permitted change 2 |
| Display currency and rate on W1, W2 | no source, no store | permitted change 3, see the last section |
| A reference for a send | none stored | [open 7] |
| Typed `RATE_LIMITED` on the account routes | reaches the screen as `UNKNOWN` | needed by W10, a route change: [open 12] |
| The account's own code on the account page | judges page only | [open 11] |
| Sentences in one file | none exists | decision 3 |

---

## Journey 2: funder

Eleven states today, twelve after the rebuild, on `/fund`, three questions then a check, then the wait, then the
confirmation. The rail page is Mercuryo's and cannot be prefilled (D32), so the six settings stay a list, in
the words of that page.

### F1. Entry

- **Reached by**: the home page, `Offer a gift` [existing], or `Finish the gift you set up` [existing] when a gift
  is kept on the device.
- **Then**: F2, or F9 when a gift waits and nobody is signed in.
- **Below**: `loadPendingGift` exists.

### F2. Who it is for

- **Reached by**: F1.
- **On screen**:
  - `Step 1 of 3` [proposed]
  - `Who is it for` [proposed: the title carries the one question asked]
  - Field label: `Their Duolingo name, if you know it` [existing]
  - Help: `It is the name under their picture in Duolingo, like ama_learns. Naming it is the surest thing you can
    do: only that Duolingo can then earn this gift, whoever opens the link. Leave it empty and they name their
    own.` [proposed first sentence; the rest existing]
  - `Viky never writes to them. You send them the link yourself, once the gift is ready.` [existing]
  - Button: `Continue`
- **Then**: `Continue` opens F3. `Back to my gifts` returns home.
- **Below**: `isValidDuolingoUsername` checks the shape. Whether the name exists is not checked [open 10].
- **Currency**: none.

### F3. How much, and for how long

- **Reached by**: F2.
- **On screen**:
  - `Step 2 of 3` [proposed]
  - `How much, and for how long` [existing]
  - Field label: `How much, in dollars` [existing], value `25`, help: `At least $1. About 21.67 EUR (rate of
    16 Sep).` [proposed] [open 8]
  - Field label: `For how many days, 7 at least` [existing, "seven" written as a figure]
  - Field label: `Lessons a day: XP to reach for a day to count` [proposed: "XP" explained once, "day" used once]
    with help `10 XP is about one short lesson.` [open 10: this figure must be read from Duolingo's own pages
    before it is printed]
  - The live card: `Each day they reach it, this becomes theirs` / `$3.57` / `And each day they miss, the same
    comes back to you.` [existing]
  - Button: `Continue`, shut until the three fields are valid, with the refusal under the field in cause.
- **Then**: `Continue` opens F4. `Back` returns to F2 with the name kept.
- **Below**: `dollarsToUnits` refuses with `Enter an amount like 20 or 20.50` and `The smallest gift is $1.00`
  [existing, typed]. The per-day figure is `amount / days` in units: $25 over 7 days is $3.571428, printed
  `$3.57`, and seven of them make $24.999996; the difference is four millionths of a dollar, which no screen
  prints, but the check screen must not let `7 x $3.57` be read as $24.99 (F4 says `$25.00 over 7 days, about
  $3.57 a day`).
- **Currency**: the amount is typed in dollars, with the display currency beside it as `about`. [open 8]

### F4. Check this over

- **Reached by**: F3.
- **On screen**:
  - `Step 3 of 3` [proposed]
  - `Check this over` [existing]
  - Lines, each with a `Change` link back to its field:
    - `For: ama_learns` (or `For: whoever opens the link` when no name) [proposed]
    - `Goes in their name: $25` [spec] with `about 21.67 EUR (rate of 16 Sep)` after it for a euro account
    - `A day earned: $3.57, over 7 days, 10 XP a day` [proposed wording of the existing lines]
    - `First day counted: the day after they connect Duolingo` [existing]
    - `Ends: 7 days after that` [proposed; no calendar date exists before they connect]
  - `A day they miss comes back to you by itself, the morning after.` [existing]
  - The risk, before the gesture: `The link you will get opens the gift for whoever opens it first. Send it only
    to them.` [spec] and `If nobody opens it within 14 days, it comes back to you.` [decision 5]
  - The paying block, three lines [spec]: `You pay: 25 EUR by card` / `Arrives in your account: about $28` /
    `Goes in their name: $25` / `Stays yours: the rest`. Then `Mercuryo keeps about 3.8 % of what you pay, and
    checks who you are the first time, once.` [from `WAY_IN`] and `Mercuryo says most payments take 30 to 60
    minutes, sometimes several hours.` [existing sentence, moved here from the closed-session screen].
  - Button, named for what happens next: `Pay 25 EUR by card` when short; `Use the $28.51 that arrived` when a
    payment sits in the account; `Put $25 in their name` when the account already holds enough [existing third
    label]. Beside it `Not now`, which returns home with nothing made.
  - No fixed bar may cover a line at 390 px: the button follows the last paragraph.
- **Then**: the button opens F5 when there is no account yet, F6 when short (Mercuryo opens beside), F7 when a
  payment already arrived, F8 when enough.
- **Below**: `eurosToBuy` gives the euros; `roughlyInDollars(25)` gives `about $28`, both from the measurement
  of 14 Sep and both named as estimates in `src/gift-amount.ts`. The fourteen-day sentence is true of the
  contract (`refundUnearned`, anyone may call it fourteen days after funding with nobody having opened, or
  fourteen days after opening with nobody having connected) and false of the product today: the settling pass
  skips every gift whose `startDay` is 0, so nothing calls it. The pass must include those gifts, or the sentence
  cannot be printed [open 5].
- **Currency**: the three money lines are three different things and stay in the currency each one is in: what
  is paid is euros because the card rail takes euros; what arrives and what goes in their name are dollars,
  each followed by `about ... EUR` for a euro account. For a CFA account the card rail still takes euros, and
  the "about" figures are in CFA francs.

### F5. One account, and then you can pay

- **Reached by**: F4 with no account on the device.
- **On screen**:
  - `Your gift: $25 for ama_learns, 7 days.` [proposed: the gift stays in sight]
  - `One account, and then you can pay` [existing]
  - `Your face or your fingerprint is the whole account: no password, no code by text, nothing to remember.`
    [existing, once, not twice]
  - The account panel with `Create my account` leading and `I already have an account` beneath. `Name this
    device (optional)` stays behind its disclosure.
  - `Back to the check` [proposed label for the back link, so the gift is known to survive it]
- **Then**: an account made or signed in returns to F4 with its button ready.
- **Below**: `fundingStageShown` already returns the check once signed in.
- **Currency**: as F4.

### F6. Waiting for the payment

- **Reached by**: F4, `Pay 25 EUR by card`; Mercuryo opened in a new tab; or the page opened again by the
  same account within 72 hours with the gift kept on the device.
- **On screen**:
  - `Waiting for your 25 EUR payment.` [spec]. No big figure: nothing has arrived.
  - `In your account now: $0.00` [proposed; the truth, small]
  - `Your gift: $25 for ama_learns, 7 days.` [proposed]
  - `On Mercuryo's page, set these yourself:` then the list in the words of that page [spec]: `Pick: Buy.` /
    `Pay: 25 EUR.` / `Receive: MON.` / `Network: Monad.` / `Send to: the code below.` / `Whose wallet: your own.`
    [open 2] and the sentence `MON and Monad are the two words Mercuryo uses for the money it delivers to
    Viky. You never have to understand them.` [spec]
  - The code, copyable, `Copy` and `Copied`, and the check: `Before you pay, check what you pasted starts with
    0xe9 and ends with 1E9b.` [spec]
  - `Mercuryo says most payments take 30 to 60 minutes, sometimes several hours. You can leave this page: the
    gift is kept, and Viky picks it up when you come back.` [existing pieces, joined]
  - `Open Mercuryo again` [existing]
  - `Set up a different gift instead` [existing], followed by `Whatever you paid stays in your account, for this
    gift or the next one.` [existing]
  - `Back to my gifts`.
- **Then**: the page watches the account; a payment opens F7. The session closing opens F8. Reloading with
  nobody signed in opens F9.
- **Below**: `nextFundingStep`, `paymentArrived`, the pending gift on the device (72 hours), all existing. The
  session on this page is thirty minutes (decision 2), which still does not cover most payments, so F8 and F9
  stay. Copying is never done without a gesture: today the identifier is copied on the tap that opens Mercuryo,
  and the screen says `Copied and ready to paste` without naming what; the copy happens on `Copy` only.
- **Currency**: `25 EUR` is the rail's, not a conversion. Nothing converted here.

### F7. The payment arrived, and the gift is made

- **Reached by**: F6 when the account shows the payment; F4's `Use the $28.51 that arrived`.
- **On screen**, in order, one line replacing the last:
  - `Your payment arrived. Getting it ready, a few seconds.` [existing]
  - `$28.51 arrived. Putting $25 in their name.` [spec] once the change is done and the figure is known.
  - If short: `$20.10 arrived, less than the $25 for this gift. Pay 6 EUR more, or make the gift $20.` [proposed]
    with `Pay 6 EUR more` (opens Mercuryo, back to F6) and `Make it $20` (back to F4 with the amount changed).
- **Then**: F10.
- **Below**: the change is `POST /api/fund/quote` then `sendWithExplicitGas` by the funder's own account, which
  is a signature: the session must be open. `$28.51` is the AUSD balance after the change. The shortfall in
  euros is `eurosToBuy`. Existing; the short branch is a screen change.
- **Currency**: `about 24.71 EUR` may follow `$28.51` for a euro account [proposed]. The `6 EUR` is the rail's.

### F8. The session closed while you were paying

- **Reached by**: the signing session idling out during F6 or F7.
- **On screen**:
  - `Your session closed while you were paying` [existing]
  - `Nothing is lost. Your $25 gift for ama_learns is kept on this device, and whatever you paid stays in your
    account.` [existing, with the gift named]
  - `Sign in again and Viky picks up where it stopped: your payment becomes the gift as soon as it is here.`
    [existing]
  - `Sign in` alone. No `Create my account`, no `Use another account` on this screen.
- **Then**: signing in returns to F6 or F7, whichever the account dictates.
- **Below**: `AccountPanel returning` exists; the two controls are removed here. When the device refused to keep
  the gift, the existing sentence `kept while this page stays open` stays.
- **Currency**: as F4 for the recalled amount.

### F9. A gift waiting, nobody signed in

- **Reached by**: `/fund` reloaded with a gift kept on the device and no session.
- **On screen**: one path only. `A gift is waiting for your payment: $25 for ama_learns.` [existing, with the
  gift named] / `Sign in to pick it up` as the primary button / `Set up a different gift instead` as a link with
  `Whatever you paid stays in your account.` The blank form is not shown until one of the two is chosen.
- **Then**: sign in opens F6; the link forgets the kept gift and opens F2.
- **Below**: `hasPendingGift` exists and is read without an account; the amount and name are in the kept terms.
- **Currency**: as F4.

### F10. It is in their name: the confirmation

- **Reached by**: F7, or F4's `Put $25 in their name`.
- **On screen**:
  - `$25.00 is in ama_learns's name.` [spec, with the Duolingo name in place of "Ana"] [open 4]; when no name was
    given: `$25.00 is in their name.`
  - `$25.00 over 7 days, about $3.57 a day, first day counted the day after they connect.` [spec, reworded so the
    parts do not read as a sum]
  - `Made 17 Sep 2026 at 23:41. Reference: gift 3.` [proposed; the gift's number exists]
  - The link, shown whole, with `Copy the link` [existing] and `Share` [spec], the latter only where the device
    offers sharing.
  - `Whoever opens this link takes the gift, so send it only to the person it is for.` [existing, shortened]
  - `What happens next` [spec], three lines [proposed]: `1. They open the link and connect their Duolingo.` /
    `2. From the day after, each day with a lesson puts $3.57 in their name.` / `3. Each day they miss comes back
    to your account the next morning at about 09:00 your time. If nobody opens it within 14 days, it all comes
    back.` [open 5]
  - `See this gift` (to its page) and `Back to my gifts`.
- **Then**: home, or the gift page.
- **Below**: `createGift` returns the id and the link. `navigator.share` for `Share`. The 09:00 is the settling
  pass, 07:00 UTC in `vercel.json`, in the reader's time; the hour must live in one named constant beside the
  schedule [open 12].
- **Currency**: `about 21.67 EUR (rate of 16 Sep)` after `$25.00` for a euro account; the dollar stays first,
  because this is a confirmation (rule 7).

### F11. Refusals, each under the element in cause

| Where | Refusal | Sentence | Below |
|---|---|---|---|
| F3 amount | not an amount | `Enter an amount like 20 or 20.50` [existing] | `AmountError` |
| F3 amount | under a dollar | `The smallest gift is $1.00` [existing] | `AmountError` |
| F3 days | under seven | `7 days at least.` [proposed] | screen |
| F3 XP | zero | `At least 1 XP.` [proposed] | screen |
| F2 name | not a Duolingo name shape | `A Duolingo name has letters, figures, dots or underscores, like ama_learns.` [proposed] | `isValidDuolingoUsername` |
| F2 name | no such profile | `No public Duolingo profile is called that. Check the spelling, or leave it empty.` [proposed] | [open 10] |
| F7 | the change refused (`RATE_MOVED`, `FAILED`) | `The price changed and nothing was changed. Viky will try again in a moment.` [proposed] and the page keeps watching | existing codes |
| F7 | making the gift refused | the route's own typed message [existing], never the catch-all | `GiftApiError` |
| any | signed out | F8 | existing |
| sign-in | rate limit | as W10 | [open 12] |

### What the funder journey needs from below

| Need | Today | Change |
|---|---|---|
| Thirty minutes on `/fund`, exact resume | ten minutes; resume exists (D74) | permitted change 2 |
| Display currency on F3, F4, F7, F10 | none | permitted change 3 |
| The fourteen-day return actually happening | contract ready, pass skips unconnected gifts | [open 5] |
| The Duolingo name checked to exist | shape only | [open 10] |
| A named constant for the two pass hours | `vercel.json` only | [open 12] |
| "wallet" on the Mercuryo list | forbidden by the word check | [open 2] |
| A first name for "Ana's name" | none collected | [open 4] |

---

## Journey 3: recipient

Nine states today, twelve after the rebuild, on the gift's page `/g/[id]?t=...`, plus the donor's reading of
the same page.

### R1. The link opened, no account on this device

- **Reached by**: the link, nobody signed in, no credential on the device.
- **On screen**:
  - `$7.00 is in your name.` [existing]
  - `Someone put it there for your Duolingo. It becomes yours as you go: $1.00 for each day with your lesson,
    for 7 days.` [existing] [open 4: no name of the funder exists to print]
  - `$1.00 goes back to them for each day without it, the morning after. Nobody else ever profits from a missed
    day.` [existing, with "the morning after"]
  - `Open it by 1 Oct 2026: after 14 days unopened, it goes back to them.` [proposed, from `fundedAt` plus
    fourteen days] [open 5]
  - `Create your account to open it. Nothing to install.` [existing], the panel with `Create my account` and
    `I already have an account`.
  - No `Back to my gifts`: this person has none. `About Viky` [proposed] in its place, to the signed-out home.
- **Then**: an account opens R2.
- **Below**: the gift is read without a session (`GET /api/gift/[id]`). `createdAtChain` is `fundedAt`.
- **Currency**: no account yet, so no display currency exists; the device's country proposes one and the
  figures may already read `about 3 980 CFA francs` under `$7.00` when the source answered. [proposed]

### R2. Signed in, before opening

- **Reached by**: R1 after the account, or the link opened with a session.
- **On screen**: the recipient's sentences of R1, never the funder's [spec], and the button `Open my gift`
  [existing]. When the person signed in is the funder: the donor's page (R11).
- **Then**: `Open my gift` opens R3. A refused link opens R12.
- **Below**: before the gift is opened `recipient` is null and the route can only say `youAreTheRecipient:
  false`, which is also what it says to the funder. The route must add `youAreTheFunder` (session account
  against `gift.funder`) so this state can tell them apart. A route change inside the screen layer's own API,
  not a change under it [open 13].
- **Currency**: as R1.

### R3. Opened: name your Duolingo

- **Reached by**: R2, `Open my gift`, once the claim is final.
- **On screen**:
  - `The gift is in your name. It still needs your Duolingo to start counting.` [proposed, in place of "It is
    yours."]
  - Field label `Your Duolingo username` [existing]; help `The name under your picture in Duolingo, like
    ama_learns. Your profile must be public.` [proposed]; placeholder in readable contrast.
  - `Continue`, shut until something is typed, with `Type your Duolingo name to continue.` under it while shut.
    [proposed]
  - `No password, no sign-in: your lessons are read from your public profile. Next, a short code proves the
    profile is yours.` [existing]
  - `I do not have Duolingo yet` [proposed], opening one line: `The money stays in your name. Nothing counts
    until you connect, and after 14 days unconnected it goes back to them.` [open 5]
- **Then**: `Continue` opens R4. When the funder named the account, R5 instead of this state.
- **Below**: `nameGoalAccount` issues a code with `expiresAt` (sixty minutes, `BINDING_CODE_TTL_SECONDS`).
- **Currency**: none.

### R4. Prove it is yours: the code

- **Reached by**: R3.
- **On screen**:
  - `Prove ama_learns is yours` [existing]
  - `In Duolingo, open Profile, then Settings, then Name, and add this code to your name:` [existing, "for a
    minute" removed]
  - The code, with `Copy the code` and `Copied` [proposed]
  - `Valid until 00:41 your time. After that, ask for a new one here.` [proposed, from `codeExpiresAt`]
  - `I added it` [existing]
  - `Duolingo can take a minute to show a new name. If Viky cannot see the code yet, wait a minute and press
    again.` [proposed]
  - `You can take the code out of your name as soon as this screen says it is done.` [existing, with the moment
    named]
  - `That is not my Duolingo name` [existing]
  - When expired: `This code has expired.` and `Get a new code` [proposed]
- **Then**: `I added it` opens R6 on success; a refusal stays here (R12). `Get a new code` issues one and
  redraws this state.
- **Below**: `bindGoalAccount` exists; `codeExpiresAt` is already in the payload for the recipient.
- **Currency**: none.

### R5. The funder named it

- **Reached by**: R2 when the gift carries a Duolingo name from the funder.
- **On screen**: `Your Duolingo: ama_learns. Named by the person who sent this. Nothing to sign in to, nothing to
  install: your lessons are read from your public profile.` [existing] / `Start counting` [existing] / `That is
  not my Duolingo name` [proposed: an exit that says what to do, leading to a line `Ask the person who sent it
  to check the name. Nothing counts until it is right.`].
- **Then**: `Start counting` opens R6.
- **Below**: the funder's name cannot be changed by the recipient (the route accepts a new name only when none
  is bound and the source is the recipient). The exit line is honest about that.
- **Currency**: none.

### R6. Connected: counting starts tomorrow

- **Reached by**: R4 or R5 on success.
- **On screen**:
  - `Done. From tomorrow, 18 Sep, every day with your lesson is yours, counted by itself.` [existing, dated]
    plus `You can take the code out of your name now.` when a code was used [existing].
  - `Counting: 18 to 24 Sep 2026.` [proposed, from `startDay` and `endDay`]
  - `Next reading: tomorrow at 02:30 your time. Viky reads your Duolingo every day at that time and counts the
    day before.` [proposed; the counting pass is 00:30 UTC]
  - The day row, seven cells, each with its word beneath: today all `to come` except the first, `tomorrow`.
    [proposed words]
  - `Yours so far: $0.00` / `Back to them: $0.00` [existing labels, "Gone back" renamed to match the row].
  - No `Count now` before the first day exists.
- **Then**: R7 from the next day.
- **Below**: the two hours (00:30 and 07:00 UTC) in a named constant [open 12]. Dates from the UTC day numbers,
  printed in the reader's time.
- **Currency**: `about 3 980 CFA francs` under `$7.00` in the header for a CFA account; the two totals carry
  no conversion while they are zero.

### R7. Counting: the days

- **Reached by**: the gift page from the first counted day on.
- **On screen**:
  - Header: `$7.00 is in your name.` and the two sentences of R1.
  - The row, seven cells, a word under each [spec words]: `earned` / `back to them` / `catch up until Fri 08:00`
    / `not judged yet` / `today` / `to come` [the last is proposed].
  - `Day 6 of 7, 18 to 24 Sep 2026.` [existing, dated]
  - `Next reading: tomorrow at 02:30 your time.` [proposed]
  - `Yours so far: $2.00, 2 days` / `Already taken: $0.00` / `Back to them: $1.00, 1 day` [existing labels plus
    the new third line]
  - The catch-up sentence when a day is open: `Yesterday is not counted yet, and not lost either. Do a lesson
    before Friday at 08:00 and it still counts.` [existing, the deadline in the reader's time with the weekday]
  - `Take $2.00` [existing], in the first card at 390 px, before the explanation, so it is on the first screen.
  - `Count now` [existing], secondary, beneath.
- **Then**: `Take $2.00` opens R8. `Count now` reads the profile and says one of the existing outcome sentences.
- **Below**: `earned` against `back to them` per cell is not derivable today: the contract publishes the two
  counts and settles days in order, so two earned and one missed reads the same whichever day was missed
  (`src/day-states.ts`). The row can say `finished` per cell honestly, or the pass must write a per-day record
  when it credits and drains [open 3]. `Already taken` is derivable: `creditedDays x perDay` minus
  `earnedBalance`. The deadline and `not judged yet` (window closed, not yet drained) exist in
  `giftDays`.
- **Currency**: `about 1 137 CFA francs` after `$2.00` on `Yours so far` for a CFA account, with the rate date
  once on the card. [proposed]

### R8. Take: the review

- **Reached by**: R7, `Take $2.00`.
- **On screen**:
  - `Take $2.00 into your account. It stays yours: from your account you can send it to your bank. Nothing to
    pay.` [proposed]
  - Small: `about 1 137 CFA francs (rate of 16 Sep)` [rule 7]
  - `Take $2.00` and `Not now` [proposed]
- **Then**: `Take $2.00` opens R9.
- **Below**: `withdrawEarned` signs a `Withdraw` intent; the route refuses `NOT_YOURS` and `NOT_ENOUGH_EARNED`
  with typed sentences. Existing.
- **Currency**: as above.

### R9. Taken: the confirmation

- **Reached by**: R8 once the withdraw is final.
- **On screen**:
  - `$2.00 is in your account, 17 Sep 2026 at 23:41. Reference: gift 3, take 1.` [proposed; the withdraw
    nonce counts the takes]
  - `Still in the gift: $0.00 earned and not taken. 1 day to come.` [spec: what is taken against what stays]
  - `Send it to my bank` [proposed], to the way out (W1's card is now on the home page too).
  - The row and the totals redrawn: `Already taken: $2.00`.
- **Then**: the way out, or home.
- **Below**: the route answers `{sent, amount, hash}`; the reference is built from the gift number and the nonce,
  so no row is needed. `alreadyTheirs` minus `earnedBalance` gives the taken total.
- **Currency**: `about 1 137 CFA francs` after the amount, the dollar first (rule 7).

### R10. Finished

- **Reached by**: the gift page once `finished`.
- **On screen**: `This gift is finished. 18 to 24 Sep 2026.` / `6 of 7 days were yours: $6.00.` / `1 day went
  back to them: $1.00.` [existing sentences, dated and split into one fact per line] / `Already taken: $4.00.
  Take $2.00` when something is left.
- **Below**: the missed count survives the end because `missedDays` is read from the contract, not from the
  home card. Existing.
- **Currency**: as R7.

### R11. The donor's reading of the same page

- **Reached by**: the funder signed in on their own gift's page.
- **On screen**:
  - `You put $7.00 in ama_learns's name.` [existing, with the Duolingo name when known] [open 4]
  - `It becomes theirs as they go: $1.00 for each day with their lesson, 18 to 24 Sep 2026.` [existing, dated]
  - The same row and words as R7, with `back to you` in place of `back to them`.
  - `Theirs so far: $2.00, 2 days` / `Came back to you: $1.00 on Tue 15 Sep at 09:02, 1 day. It is in your
    account.` [spec] / `Next reading: tomorrow at 02:30 your time.`
  - `Made 11 Sep 2026. Reference: gift 3.` [proposed] and `Copy the link again` [proposed: the funder may need
    to resend it].
- **Below**: the date and time of a return is a settling-pass transaction recorded in `viky_relayed` (`kind:
  "refund"`, block number); the route must return its time. The row's `back to you` per cell is [open 3].
- **Currency**: as F10.

### R12. Refusals, each under the element in cause

| Where | Refusal | Sentence | Below |
|---|---|---|---|
| R2 | the link has no key | `This link is missing its key. Ask for the link again.` [existing] | screen |
| R2 | the link invalid or used | `This link is not valid or was already used.` [existing] | `CLAIM_LINK_INVALID` |
| R3 field | empty | `Type your Duolingo name to continue.` [proposed] | screen |
| R3 field | not a Duolingo name shape | `That does not look like a Duolingo username.` [existing] | `INVALID_USERNAME` |
| R3 field | no such public profile | `No public Duolingo profile is called that.` [proposed] | the naming route checks the shape only; an unknown profile is found at R4's read. Refusing it here is [open 10] |
| R4 | the code not seen in the name | the reading's own message [existing], plus `Wait a minute and press again, or get a new code.` [proposed] | `refused` outcome |
| R4 | the profile private | `Your Duolingo profile is private, so Viky cannot read it. Make it public in Duolingo's settings, then press again.` [proposed] | `refused` outcome |
| R7 `Count now` | already read today | `Viky already read your Duolingo today. Come back tomorrow.` [existing] | `already` |
| R8 | more than earned | `That is more than what is yours so far.` [existing] | `NOT_ENOUGH_EARNED` |
| R8 | not the recipient | `Only the person the gift is for can take it.` [existing] | `NOT_YOURS` |
| any | signed out mid-way | `Your session closed while you were away. Nothing moved and nothing was taken.` then `Sign in` | as W11; today `SIGN_IN_REQUIRED` reaches the gift page as the route's sign-in sentence in the problem box, with no closed-session state around it |
| sign-in | rate limit | as W10 | [open 12] |

### What the recipient journey needs from below

| Need | Today | Change |
|---|---|---|
| Thirty minutes on the gift page, exact resume | ten minutes; the page derives everything from the gift read | permitted change 2 |
| Display currency on R1, R7, R8, R9 | none | permitted change 3 |
| `earned` against `back to them` per day | counts only | [open 3] |
| `youAreTheFunder` before the gift is opened | not returned | [open 13] |
| The time of each return | block number recorded, time not returned | route change with [open 13] |
| The fourteen-day return for an unconnected gift | contract ready, pass skips it | [open 5] |
| The pass hours as constants | `vercel.json` only | [open 12] |

---

## Open points for the founder

1. **Fees and delays on the way out.** The specification puts Ramp's fee and delay on the card (W2), in the
   review (W4) and in the confirmation (W9). The instruction of 16 Sep says no sentence about fees or delays
   until the euros have arrived in a bank, and the arrival has not been reported. Proposal: the sentences are
   drawn as the specification writes them, and the first one shipped is the one that states what happened, with
   the measured figures, on the day the arrival is reported (`9.99 became 6.71 EUR on 16 Sep 2026, in the bank
   on ...`). Until then the card says only where it pays.
2. **The Mercuryo list.** `Whose wallet: your own.` carries a word the product forbids on every screen, and
   `pnpm check:words` refuses it. The list is in Mercuryo's own words on purpose. Either that line carries the
   allowance comment the check accepts, or it reads `Whose it is: your own.`, which is what the person picks
   without the word.
3. **A day earned against a day returned.** The row cannot say which settled day was which: the contract gives
   two counts and settles in order. Two ways: the keeper writes a per-day record when it credits and drains (it
   already records each relayed transaction), which is a fourth change under the screens; or the row says
   `finished` per cell with the two totals beside it, and the specification's `earned` and `back to them` per
   cell wait for the event index. Recommendation: the per-day record, because it costs one column and makes
   R7, R10 and R11 say what the specification asks.
4. **"Ana".** No first name is collected from anybody, on either side. The Duolingo name is the only name
   Viky holds, and only when the funder gave one. Proposal: `in ama_learns's name` when known, `in their name`
   otherwise, and no first-name field for the event.
5. **The fourteen days.** `refundUnearned` is ready and anybody may call it, but the settling pass skips every
   gift that has not started, so nothing calls it. The sentence `If nobody opens it within 14 days, it comes back
   to you.` needs the pass to include unopened and unconnected gifts older than fourteen days. Small, and it is
   under the screens.
6. **The rate source.** Read on 17 Sep 2026: the ECB's daily reference rates, `eurofxref-daily.xml`, carry USD
   against EUR (1.1537 on 16 Sep), are published around 16:00 CET on TARGET working days, and do not carry the
   CFA franc. The CFA franc has a fixed parity with the euro, 655.957 per euro, guaranteed by the French
   Treasury and in force since 1 January 1999. So one daily read gives both currencies, dated by the ECB's own
   `time` attribute. Sources: the ECB's reference-rate page, the BCEAO's exchange-rate page and Council
   Decision 98/683/EC, listed at the end. Proposal: name it in `src/rails.ts` as `RATE_SOURCE` with its URL, the
   date of the read, and the fixed CFA parity beside it; when the read fails or is older than three days, the
   dollar shows alone and the screen says so.
7. **References.** A send (W9, W13) has no stored row and no id today; the take (R9) can build one from the gift
   number and the withdraw count; the gift (F10) has its number. A `viky_sends` row with an id a person can
   read out is needed for W9 and W13, or the confirmation prints no reference there.
8. **Typing dollars.** The amount fields (W3, F3) stay in dollars with the display currency beside as `about`.
   The alternative, typing euros or CFA francs and deriving the dollars, gives a gift of $23.07 for 20 EUR and a
   rounding on every screen after. Recommendation: dollars typed, display currency read.
9. **The code shown whole.** W6 and F6 show the account's code whole and wrapping so it can be compared with
   what was pasted on the third party's page, and copy it in one gesture. The specification says copyable in
   one gesture and, for F6, `starts with 0xe9 and ends with 1E9b`; showing it whole satisfies both.
10. **The Duolingo name checked.** F2 and R3 accept any well-formed name. The audits ask that a name that does
    not exist be refused before money moves. `src/duolingo-public.ts` can read a public profile; one read at F2
    asks for no signature and moves nothing. Also: `10 XP is about one short lesson` must be read on Duolingo's
    own pages before it is printed, or left out.
11. **The account's own code on the account page.** W13 and F6 both need the person to find an account's code;
    today it is on the judges page only, which decision 4 takes off the path. The account page shows it under
    `Your code`, with one line saying what it is for.
12. **Two small route facts.** The account routes answer a 429 that the screen turns into `Something went wrong
    on our side`; they must answer a typed `RATE_LIMITED` for the specification's sentence. And the two pass
    hours live only in `vercel.json`; a named constant beside the schedule is needed for every `Next reading`
    line.
13. **The gift route.** `youAreTheFunder`, and the time of each return, are two fields added to
    `GET /api/gift/[id]`. They are the screen layer's own API rather than the contract or the store, but they are
    listed here so nothing is changed quietly.

## Where the display currency intervenes, in one table

| State | Converted figure | Not converted, and why |
|---|---|---|
| W1, W2 | `Your money` | the Ramp card's fees (Ramp's own), the ready number (typed at Ramp) |
| W3 | the maximum in the help line | the field (dollars leave) |
| W4 | none | Ramp's euro figure is Ramp's, one figure per fact |
| W8, W9 | none, or one small `about` on W8 | the amount sent is the number Ramp expects |
| F3, F4 | `Goes in their name`, `Arrives in your account` | `You pay` is the rail's euros |
| F7, F10 | the arrived and the given amounts, dollar first | the shortfall in euros is the rail's |
| R1, R6, R7 | the header and the totals | the day words, the dates |
| R8, R9 | the review and the confirmation, dollar first | |
| R11 | as F10 | |

The rule under the table: a converted figure is a value of the person's money and says so with `about` and a
date; a third party's figure is that party's and keeps its own currency; the number a person types on a third
party's page is unitless and never converted.

## Sources read for this document, 17 Sep 2026

- ECB, euro foreign exchange reference rates: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
  and the daily file https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml (read 17 Sep 2026: rates
  of 16 Sep, USD 1.1537, no XOF entry).
- The West African CFA franc's parity, 655.957 per euro, buying and selling, on the BCEAO's manual
  exchange-rate page of 16 Sep 2026: https://www.bceao.int/fr/content/cours-de-change (read 17 Sep 2026).
- The fixed parity itself, guaranteed by a budgetary commitment of the French Treasury and applying from
  1 January 1999: Council Decision 98/683/EC of 23 November 1998,
  https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:31998D0683 (read 17 Sep 2026; the figure is
  not in its text).
- Ramp's payout methods, fees and delays: `src/rails.ts` names the articles and the date they were read.
- The product's own code, for every "today" in the tables: `src/account/mera.ts` (ten-minute idle),
  `vercel.json` (00:30 and 07:00 UTC), `contracts/GiftEscrow.sol` (`UNCLAIMED_REFUND_DELAY = 14 days`,
  `refundUnearned`), `src/daily-pass.ts` (the pass skips `startDay === 0`), `src/day-states.ts` (counts, not
  order), `src/duolingo-public-terms.ts` (sixty-minute code), `src/pending-gift.ts` (72 hours),
  `src/funding-step.ts` (the reserve), `app/api/gift/[id]/route.ts` (the fields a gift screen receives),
  `app/api/send/route.ts` (no stored row).
