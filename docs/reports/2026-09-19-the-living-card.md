# A gift's page, rebuilt as the card alive

Line V4. Two pages of 566 and 352 lines are gone, replaced by one that draws the moment a gift is in. The content
comes from document J's table of moments, the form from the rendered mockup `gift.html`, and neither decides the
other's half. Written as D116.

## The three numbers

Measured at 390x844 in day, over the twenty-three states of a gift's page that the capture run reaches, with every
fold shut, which is how a person meets the screen.

| | before | after |
| --- | --- | --- |
| words on the middle state | 143 | 76 |
| words on the heaviest state | 238 | 173 |
| states saying one figure twice | 23 of 23 | 12 of 23 |

Before: `review-captures/2026-09-19T16-23-49Z-connected`. After: `review-captures/2026-09-19T20-10-17Z-connected`.

**What the after column does not include.** Four of the twelve causes were fixed after that run, in the sentences
below, and the run that would measure them has not been taken: three attempts died on a machine short of memory, and
the founder cut the line loose from them (19 Sep 2026). They are expected to leave five, and **five is a figure
nobody has measured yet**. The captures come in a follow-up, taken on a quiet machine.

**The five expected to remain are one pattern, and it is the mockup's own**: the figure that counts now, and the
action that moves it. "$4.00 HIS SO FAR" over a button reading "Take out $4.00" is what the image draws, and D104
asks an action to name the money it moves. The four causes that were not that pattern are fixed:

- the agreement printed the daily amount in both of its sentences; the second now says "The same goes back to Maman
  for each day without it…";
- a milestone's fold printed its target and its amount again under them; it now says "Reach it by 19 Oct 2026 and it
  is yours";
- the review before taking named the amount a third time, after the figure and the button that opened it;
- and a gift whose source had closed the account said so twice.

## What the page does now

Four things, in this order, and one of them dominates (document J, section 2):

1. **the state in one sentence**, which is the answer to this moment's question;
2. **the figure that counts now**, with a label saying what it is, and what has gone back to the funder beside it;
3. **the next moment, dated**, in the reader's own clock;
4. **one action, or none.** Most moments have none: they are pages a person looks at.

Then, folded under their own names, **What was agreed** and **How this is checked**. The agreement stands open at
exactly one moment, the one where a person has just opened the gift and has not connected the source yet, because
that is where they are discovering it. Everywhere else they have read it already.

**Nine moments** (J's table), **three shapes** (the row of days, the climb, the stamp) and **three readers**. Which
moment a gift is in, and what this reader may do there, is answered once in `src/gift-moment.ts`; the three sentences
are composed once in `src/gift-live.ts`. The page draws what they answer. The two pages it replaces each decided it
in ten places of their own, which is how one of them lost the way out for somebody who is not the account it names.

## The row of days

One size, never wrapped and never shrunk (the founder, 19 Sep 2026): 48 pixels on a gift's page, 42 on a card in a
list. It scrolls sideways with no bar of its own, carries a 56 pixel fade to the paper at its right edge, and says
underneath which day is in view: "DAY 4 OF 7 · SCROLL FOR THE REST". It opens on today, not on the first day.

"Scroll for the rest" is said only when there really is more of the row than the card shows, measured once the row is
drawn: seven days fit on a wide screen and not on a narrow one, and the number of days does not tell.

What a screen reader gets is unchanged: each day still carries its date and its state in words as its accessible
name. Colour never carries a state alone either, because the shapes differ: a circle, a triangle, a resting capsule.

## Two defects the rebuild found

**A gift that had just been connected read as unconnected.** The card's summary spells "it has started" as
`counting`, the page's own read of the same gift spells it `connected`, and reading one through the other's name made
the page ask a person to connect a source they had connected a second earlier. Fixed where the two meet.

**Taking money mid-gift had been dropped.** Document J gives the counting moment no action, which is true of a page
that has nothing to offer; a habit counted halfway has days that are already theirs. Money that can be taken is now
the moment's one action, whatever else the gift is doing, and it takes the place of that moment's own action rather
than standing beside it.

## What is not verified

- **No picture of this page is in this line.** The tests and the contrast measurement carry it; the images are a
  follow-up. Three capture runs were lost to a machine with about 36 MB free: two had a local server killed under
  them, the third had Chromium itself killed.
- The six funder scenarios of the capture run still walk the eight step assistant that D110 deleted, so they miss.
  They belong to the line that removed those screens.
- No milestone gift has run its whole life on mainnet, so the moments after "reached" are photographed from replaced
  answers, as the manifest says state by state.
- Nothing here touched a contract, a route, a reading or the register.
