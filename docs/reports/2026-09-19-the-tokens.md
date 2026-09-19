# One scale, one rhyme, a third voice: K's tokens, measured

Run on 19 Sep 2026 against a local production build of the branch `v1-tokens`, from `8bf8350`. Line V1 of the
validated vision. The tokens of K's references (rules 5, 6, 10, 13, 14, and Ramp section 2) are in
`src/design-tokens.ts` and `app/globals.css`, every screen of the product was photographed again at both sizes in day
and in night, each one also blurred, and the contrast of every control was read off the live page rather than off the
palette.

Nothing about the vision's five surfaces is in this line: the screens are the ones that exist today, wearing the new
tokens. The gift page is rebuilt in V4.

The captures, rebased onto the card of D110 and taken again from the merged code:

- `review-captures/2026-09-19T04-26-10Z-connected`, 220 states, both sizes, day and night, each one also blurred.
  **28 states were not reached**, and none of them for a reason of this line: six funder scenarios and one way-out
  scenario walk the eight step assistant, which D110 deleted in the same hours. They stop on Home, at a button that
  is not there any more. Rewriting them belongs to the line that removed the screens, not to this one.
- `review-captures/card-2026-09-19T04-24-23Z`, the card and its four sheets through `pnpm review:capture-card`,
  which is that line's own script: 32 pictures, both sizes, day and night. That is where the new surface wearing
  these tokens can be read.
- Before, with the old tokens: `review-captures/2026-09-18T20-47-13Z-connected`, commit `bbee532`.

## What changed

| | before | after | why |
| --- | --- | --- | --- |
| type scale | 14, 16, 22, 32 | 13, 16, 20, 25, 31 | four jumps of 1.14, 1.37, 1.45 and 1.5 became one ratio, 1.25 on a base of 16 (rule 6) |
| display | 48 and 88 | 49 and 76 | the same scale's compact and expanded steps, so the largest sizes are on it too |
| the mark | 28 | 25 | as above |
| letter spacing | none, anywhere | display −1px and −2px, body 0, labels +0.5px, meta +1px | one value per role (rule 5), tight where it is big and open where it is small |
| a third voice | none | 13, capitals, +1px, medium | the small line that says where you are (Ramp section 2), in the text face: three voices from three roles, not three fonts |
| the second button | outline on nothing | filled with a surface tone, outline kept | no ghost buttons (rule 10), Material 3's filled tonal; the outline stays because it is what identifies a control (WCAG 1.4.11) |
| corners | 16 for a control, 28 for a card, 48 for a sheet | 28 for all three, capsules on buttons and characters | one rhyme (rule 14) |

The third voice speaks one line today, the step caption of a task ("STEP 4 OF 5"), which is on every step of offering
a gift and of taking money out. A token nobody speaks in is not a voice, so it is used or it is not written.

## Contrast, read off the live page

`pnpm measure:contrast http://localhost:PORT` opens the built site at 390x844 and 1440x900, in day and in night, walks
`/`, `/fund`, `/cash-out` and `/legal`, and reads the computed colours of every visible button and link that carries a
fill or an outline. It computes the words against the fill they sit on (WCAG 1.4.3, 4.5:1) and the outline against the
ground behind it (WCAG 1.4.11, 3:1), and it fails the run on a ratio below its floor rather than printing it.

The palette is also measured pair by pair in `test/design-tokens.test.ts`; that is the right place for it and it cannot
see what a screen renders. A fill from a variable that never resolved, or an outline a rule overrode, passes there and
fails in front of a person.

Read on 19 Sep 2026 against a local production build, four combinations, 24 pairs, **none below its floor**. The
tonal button is the pair this line added; it is on every screen, and the two rows below are it.

| where | pair | colours | measured |
| --- | --- | --- | --- |
| 390x844 day, "Sign in or create account" | words on the tonal fill | #1e1633 on #e8e3f4 | 13.73:1 |
| 390x844 day, "Sign in or create account" | outline on the ground | #1e1633 on #f6f4fb | 15.81:1 |
| 390x844 night, "Sign in or create account" | words on the tonal fill | #f3f0fa on #332a5e | 11.42:1 |
| 390x844 night, "Sign in or create account" | outline on the ground | #f3f0fa on #151026 | 16.45:1 |
| 390x844 day, "Offer a gift" | words on the accent | #1e1633 on #ffc531 | 10.91:1 |
| 390x844 night, "Offer a gift" | words on the accent | #151026 on #ffc531 | 11.71:1 |
| 390x844 day, /cash-out "I already have an account" | outline on the card | #1e1633 on #ffffff | 17.24:1 |
| 390x844 night, /cash-out "I already have an account" | outline on the card | #f3f0fa on #211a38 | 14.69:1 |

The wide size measures the same colours to the same ratios, so its eight rows are not repeated here. The floors are
4.5:1 for words (WCAG 1.4.3) and 3:1 for an outline (1.4.11); the lowest reading anywhere is 10.91:1.

The tonal fill itself is quiet on purpose: 1.15:1 against the day ground and 1.44:1 against the night one, measured in
`test/design-tokens.test.ts`. That is why the outline stays. A fill that quiet cannot identify a control, and the
outline can.

## The squint test

`pnpm review:capture-connected` now takes a second picture of every state with the page blurred by 6 pixels
(`--squint.png` beside each `.png`). What survives a blur is what a person sees before reading anything.

Three examples, at 390 in day:

- **Home, signed in, with gifts counting.** What survives: the amount, the yellow action, the tonal action under it,
  two cards and the day characters. The help line under the amount goes, which is right: it is help.
- **A gift being earned, the recipient's view.** What survives: the sentence naming the money, the gift's card, the
  yellow action, and the row of day characters. The three paragraphs explaining the rule go.
- **A milestone gift's page, before the deadline.** What survives: the sentence naming the money, the character and the
  track it climbs, and the two actions at the foot. Everything between them, four quiet lines, goes.

Nothing automatic reads these. They are there so a person can see, in one look, whether a screen still has a shape
when the words are gone.

## What this line found, and what it did with it

**The amount on the home page was photographed in the middle of its count, in every run we have.** The account holds
$2.00; the captures of 18 Sep show $0.38, those of this morning $1.15, and the blurred picture taken 120 milliseconds
later $1.83. The squint pass is how it was seen: two pictures of the same screen, a fifth of a second apart, with two
different amounts on them.

The run does wait for `data-count-settled`, and the signal was answering too early. Before the first frame the figure
already equals its value, so the amount said "arrived" about a count that had not begun. Now the arrival says when it
has read what this device last saw, the count says when it is over, and its last frame lands on the value itself
rather than on what the easing computes of it.

That was still not enough. Alone, a screen then read $2.00; under four browsers and four servers at once, one
combination waited out its eight seconds and kept $0.11. So the run no longer swallows that wait: it waits fifteen
seconds for the count, refuses to take the picture if the amount is still moving, and checks again after the shutter,
in case a count started while it was open. A state that cannot be photographed settled is now a miss in the manifest,
with its reason. In the run this report is written from, sixteen states name an amount and all sixteen name the one
their scenario put there: $0.00, $2.00, $6.00, $20.99.

**The chooser offered the same condition twice.** "Reach a chess rating on Chess.com" was drawn as two radios with the
same words and the same help, because the condition turned live on 19 Sep (D109) while the screen still added it a
second time from the preview door. Found on the assistant, which no longer exists; the sheet that replaced it already
drops what is live from that door. What this line leaves behind is the test, now reading the sheet, so the next
condition to turn live cannot be offered twice.

**The sentence that tells a person to take the code back out of their name is never read.** On a milestone gift,
pressing "I added it" answers "Done. You start at 1455. Reach 1500 and all of it is yours. You can take the code out of
your name now." That sentence is written into a section drawn only while the gift is "opened", and the reading that
starts the climb ends that phase, so the section and the sentence go together. Not repaired: that page is replaced in
V4, and the moment belongs in the rebuilt card.

## What the review of the pictures said

The `ui-reviewer` agent read 58 images of the two runs, before and after, and judged four items and the blurred
pictures. The scale, the single radius and the meta voice pass at both sizes in both appearances. Two failures, and
one of them was this line's own.

**A filled button made a dead control look alive.** "Check now" and "Tell me each morning" on a milestone gift were
two capsules of the same size and the same fill at half opacity; blurred, they are one pair of identical pills. A fill
at half strength is still a fill. So a control that cannot be pressed now gives its fill back entirely and stands off
the ground, the same answer the one action already gave. Fixed here, with a test on all three buttons.

**Two actions of equal weight, on a screen with no one action.** On the funder's view of a gift nobody opened, "Copy
the link again" and "Get the link again" are the same shape, and the second one kills the link the first one copied.
This is not the tokens: both were hollow before and they are both filled now. It is the screen having no answer to
"what is the one thing to do here", and it belongs to the page V4 rebuilds.

Three more, none of them this line's, recorded so they are not found twice:

- **A gift link is built from two different origins in one journey.** The screen that creates a gift printed
  `http://localhost:3101/g/3?t=…` while the screen that takes it back printed the same token as
  `https://viky.cash/g/3?t=…`. One reads the host it is on, the other a fixed one. On the second host, those two
  screens would hand out links bound to different domains, and an account is bound to the domain it was made on.
- **The way in that is emphasised is the costlier one.** For the same 25 EUR, the yellow choice says "Arrives in your
  account about $25" and the quiet choice "about $28", with "Stays yours about $3".
- **On the review before sending, the largest figure is the wrong one**: the whole balance, $20.99, on the screen that
  confirms sending $9.99, which is said only inside a sentence.

## What is not verified

- The measurement covers the four screens a person meets without an account. A control that only exists behind a sign-in
  is measured by the palette tests, not by this script.
- The squint pictures are evidence, not a pass mark: nothing automatic reads them.
- Nothing here ran on mainnet. The tokens do not touch money.
- The funder's journey through the card is photographed by `review:capture-card`, signed out, which does not reach the
  paying screen. Until the connected run's funder scenarios are rewritten for the card, no picture of these tokens on
  the paying screen exists.
