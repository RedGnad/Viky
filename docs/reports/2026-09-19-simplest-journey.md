# The simplest journey, measured before and after

Run on 19 Sep 2026 against a local production build of `f3682f3`, at 390x844 in day, through
`pnpm review:capture-connected` and `pnpm measure:words`. Seventy-seven states, one missed (a milestone step whose
scenario stops), and the numbers below are what those states said, not what the source says they say.

## How each number is taken

- **Words a person reads**: every word of `main` as the browser lays it out, which leaves out what anybody types (an
  input's value is never in `innerText`). Titles, labels, help and buttons are in, because a person reads them.
- **A screen**: the address, plus the step a screen names itself ("Step 2 of 5", GOV.UK's caption), because a task
  that walks steps keeps one address and a person still meets several screens. Two consequences to read with it:
  steps 2 and 3 of the way out stand on one screen and are counted as two, and eleven states of a gift's page are
  one screen, which is what the repetition rule is about.
- **A sentence**: a run of four words or more ending in a full stop, inside one line of the rendered text. A title,
  a label and a button are not sentences: they are meant to repeat, and counting them would drown the measure.

## The three numbers, before

- Screens measured: 77
- Words a person reads, all screens: 13477
- Words on the middle screen: 97
- Sentences on two screens or more: 11

| task | screens | states photographed |
| --- | --- | --- |
| offering a gift | 6 | 18 |
| opening a gift | 1 | 12 |
| taking money out | 5 | 20 |

| the heaviest screens | words |
| --- | --- |
| me: judges, signed in | 3885 |
| me: privacy | 830 |
| me: legal | 466 |
| funder: check, paying by card | 324 |
| funder milestone: check | 249 |
| me: help | 242 |
| donor: a gift being earned | 238 |

## Every sentence read on more than one screen

| a sentence read on more than one screen | where |
| --- | --- |
| $9.99 of it is ready to send to Ramp. | / · /cash-out step 2/3 · /cash-out step 3/3 |
| Counting: 2 of 7 days done, 1 missed. | / · /g/[id] · /gifts |
| No password, no code by text. | /fund · /g/[id] · /gifts |
| Your face or your fingerprint, and nothing to remember. | /fund · /g/[id] · /gifts |
| Counting: 3 of 7 days done, 0 missed. | / · /gifts |
| Finished: 6 of 7 days done, 1 missed. | / · /g/[id] |
| Less than $0.01 stays in your account. | /cash-out step 2/3 · /cash-out step 3/3 |
| No public Duolingo profile goes by that name. | /fund step 3/5 · /g/[id] |
| Nobody else ever profits from a missed day. | /g/[id] · /help |
| Once you place the order, Mercuryo gives you six hours to send it. | /cash-out · /cash-out step 2/3 |
| Up to $20.99, with two decimals at most. | /cash-out · /cash-out step 1/3 |

## What this says before anything is cut

- The middle screen is 97 words, and the ten heaviest carry a third of everything a person could read.
- Of the eleven repetitions, three are the gift card's own state line, which the structure allows (section 12,
  item 9), and three more are the same screen measured in two stages (the way out's steps 2 and 3, and its base
  before and after a rail is chosen). What is left is five sentences that genuinely say the same thing twice:
  the two sentences of the account panel, the missed-day promise on a gift and in Help, the six-hour window on the
  way out's base card and again at its second step, and a refusal the funder and the recipient both meet.
- `/judges` at 3,885 words is not on this path: it is written for judges and its length is the point.


## What was cut, and by which rule

Four cuts, each one a rule rather than a taste.

1. **The check screen, the heaviest of the journey.** What everybody must read stays in the body: the catch-up rule,
   the amounts, and the one sentence that changes what a person does next, "The link you will get opens the gift for
   whoever opens it first." What only some readers need went behind a disclosure, "What else this means" (the two
   names on the gift, and what happens if nobody opens it), and each way in has a second one, "How Ramp charges",
   holding the fee's explanation, its smallest order and the day its figures were read. GOV.UK Details: "make a page
   easier to scan when it contains information that only some users will need", and never for what the majority must
   read. **324 words to 230 on arrival, a cut of 29 %**, with nothing lost: every sentence is one press away.
2. **The account panel said the same thing twice**: "Your face or your fingerprint, and nothing to remember. No
   password, no code by text." The second sentence says what the first says, backwards. One stays (NN/g: concise
   text scored +58 %).
3. **Help repeated the promise word for word.** "Nobody else ever profits from a missed day." lives on a gift's
   page, where it is about that gift's own money; Help now ends on the sentence before it.
4. **The six-hour window was on two screens of the way out**: the base card's conditions, and again at the step
   where the six hours start running. It stays where it acts, at step 2, and its source is unchanged in the
   register's own comment.

## The three numbers, after

- Screens measured: 77 (was 77)
- Words a person reads, all screens: 13212 (was 13477)
- Words on the journey itself, without the documents: 5611 (was 5831)
- Words on the middle screen: 97 (was 97)
- Sentences on two screens or more: 8 (was 11)

| task | screens | states photographed |
| --- | --- | --- |
| offering a gift | 6 (was 6) | 18 |
| opening a gift | 1 (was 1) | 12 |
| taking money out | 5 (was 5) | 20 |

| the heaviest screens | words |
| --- | --- |
| me: judges, signed in | 3885 |
| me: privacy | 830 |
| me: legal | 466 |
| donor: a gift being earned | 238 |
| me: help | 234 |
| recipient: earned money taken | 231 |
| funder: check, paying by card | 230 |
| recipient: take, the review | 221 |
| funder milestone: check | 218 |
| funder: check, a payment arrived | 199 |

| a sentence read on more than one screen | where |
| --- | --- |
| $9.99 of it is ready to send to Ramp. | / · /cash-out step 2/3 · /cash-out step 3/3 |
| Counting: 2 of 7 days done, 1 missed. | / · /g/[id] · /gifts |
| Your face or your fingerprint, and nothing to remember. | /fund · /g/[id] · /gifts |
| Counting: 3 of 7 days done, 0 missed. | / · /gifts |
| Finished: 6 of 7 days done, 1 missed. | / · /g/[id] |
| Less than $0.01 stays in your account. | /cash-out step 2/3 · /cash-out step 3/3 |
| No public Duolingo profile goes by that name. | /fund step 3/5 · /g/[id] |
| Up to $20.99, with two decimals at most. | /cash-out · /cash-out step 1/3 |

## What is left repeated, and why it stays

Of the eight sentences still read on more than one screen:

- **Three are the gift card's own state line** ("Counting: 2 of 7 days done, 1 missed."), which the structure allows
  once, section 12 item 9, and which is the same card on Home, on Gifts and at the head of a gift.
- **Two are one screen measured in two stages**: the way out's steps 2 and 3 stand on the same page, so a sentence
  said once is counted twice by a measure that reads a caption as a screen.
- **One is a refusal the funder and the person it is for both meet**, "No public Duolingo profile goes by that
  name.", which is the source's own answer in both places rather than prose of ours.
- **One is the account panel's remaining sentence**, on the three screens where somebody may sign in. It is a second
  repeated component after the gift card, which the structure does not provide for: it is reported here rather than
  deleted, because it is the only thing on those screens that says what an account is.
- **One is the money ready to send**, said on Home and on the way out, which is the same fact about the same money.

## Not touched, and why

`/judges` (3,885 words), `/privacy` (830) and `/legal` (466) are not on this journey: they are written to be read in
full by somebody who came for them. The number of screens per task did not move, because no merge was allowed: GOV.UK
lets a related question be revealed under an option, and none of the five steps of offering is a question of that
shape.
