# Three corrections on the way out, and one in the captures

The founder's three points of 19 Sep 2026, after the reading of the pictures. Run against a local production build of
`v2-the-way-out`, captures in `review-captures/2026-09-19T16-23-49Z-connected` and the four screens below re-taken
after each change.

## 1. The link that seemed to come from two origins

**It was the capture, not the routes.** The four routes that build a claim link build it the same way, from the host
they answer on, and `NEXT_PUBLIC_APP_URL` does not exist in production, so the origin is always `viky.cash`. What
disagreed was `scripts/capture-scenarios.ts`, which stubbed the link route with `https://viky.cash` written by hand
while the walk was on `localhost`. The two other link stubs already answered with the origin of the walk, which is why
one journey printed two origins.

The stub now answers `${s.base}`. A picture of a link that the run could not have produced is a picture that lies, and
that is worse than one that is missing.

## 2. The two ways out: no accent, and the net in evidence

The accent sat on `index === 0`, so it marked **the order**, which is the country's (D96), and a person reads an
emphasised card as the recommended one. The screen has no opinion about which service is better for somebody.

- Both cards now carry the same neutral button. The order is untouched.
- Each card leads with what would reach the person: **about 16.21 EUR** on one, **about 14.20 EUR** on the other, for
  the same $20.99. That is the comparison the screen exists to let somebody make.

The figure is an estimate and says so twice: "If you sent all $20.99, at the rate of 16 Sep 2026" above it, and "about"
on the figure itself. It applies the service's published fee to the balance converted at the rate Viky read that day
(`netOfEverything` in `src/exit-steps.ts`). It does not know the swap's own price, which is asked only once an amount
is chosen, and it prints **nothing at all** when no rate was read or the account holds nothing, rather than naming a
figure nobody read.

## 3. The review before sending

The star is what the gesture moves. The screen used to put the whole balance, $20.99, at the size of an amount, and
the $9.99 being sent inside a sentence; blurred, a reader saw $20.99 as the subject.

- The amount sent is the figure, at display size, formed by `exitAmount` exactly as D104 forms it everywhere else.
- The balance is one line in the meta voice above it: "YOUR MONEY: $20.99".
- D104's sentence is split so the amount is said once: the figure carries it, and "To Ramp. This cannot be undone."
  carries the rest. The money still leads what a person decides on, as a figure rather than inside the sentence.
- "Ready: $9.99" and the line about the dust now belong to the step that places the order, where they are read. On the
  review they were the amount a second time.

## Two things in the harness, found doing this

The connected capture run signs in through the product itself, and it waited on Home's "Offer a gift" link, which D110
replaced with a card filled in place. Two waits still named it: the one that makes an account for a single scenario,
and the race inside `signIn()` that lets a scenario land either on You or on Home. The first made every single-scenario
run impossible; the second made any scenario that creates a new account wait forty seconds out and miss. Both now wait
on something the new Home draws for an account and for nobody else.

With both repaired, the run keeps 224 states and misses 24: the six funder scenarios that walk the deleted assistant,
at the four combinations. They still belong to the line that removed those screens.

## What is not verified

- The net on each card is an estimate by construction, and the report says so where it is printed. Only the review,
  once a price has answered, states what a service really offers for a given amount.
- Nothing here ran on mainnet.
