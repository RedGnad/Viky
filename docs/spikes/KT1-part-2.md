# KT1 part two: euros in, euros out, run by the funder alone

The half of the first chain that has never run. Part one proved everything between the two ends: a gift
funded, claimed, bound, counted by itself, on mainnet with real money. This proves the two ends, the card
in and the payout out, before any of it is shown to a friend.

A refusal is a result. If Mercuryo turns something down, for a region, a card, a document, a minimum, that
is written here with their exact words and the leg is marked refused, not broken. A refusal we can name is
worth more than a leg we skipped.

## Before starting: two numbers worth knowing

Measured, not guessed (D20, 10 Sep 2026). Mercuryo keeps a flat 3.00 EUR on a payout whatever the amount,
and refuses to sell below about 3.60 EUR.

| if the payout is | the fee takes |
|---|---|
| the whole of a 10 EUR gift, at the end of its 7 days | 30 % |
| the roughly 14 EUR left over in the funder's account after the gift | 21 % |

Two consequences for how this is run. A 10 EUR gift over 7 days earns about 1.43 EUR a day, so the
recipient cannot pay out before the third day, and paying out the whole gift costs them nearly a third of
it. And the leftover in the funder's own account is above the floor from the first minute.

**So the payout is tested twice, and the first one is what unblocks us.** Leg 7 pays out the leftover from
the funder's account on the first day, which proves the whole way out without waiting a week. Leg 11 pays
out what the recipient earned, at the end, which proves it for the person it is built for. If only one can
be run, run leg 7.

## Where to run it

On **viky.cash**, the production hostname, with a fresh account. Gifts 1 and 2 stay where they are on the
preview hostname until they finish. This run therefore also proves the production hostname end to end,
which nothing else has done.

The recipient must be a **second device that has never opened Viky**, so the account creation is the real
one and leg 8 is a true stateless test.

Leave the recipient's Duolingo name **empty** when creating the gift. That makes the recipient name it
themselves and place the short code in their display name, which is the harder path and the one a real
recipient takes. The easier path, where the sender names it, already ran on gift 2.

## The legs

Record for each: the time, what the screen said, and the transaction hash where there is one. A capture of
the screen where the column asks for one.

| # | leg | who | what to record | capture |
|---|---|---|---|---|
| 1 | Sign in on viky.cash with a new passkey, open the funder screen | funder | that the gift list says "No gift yet" and no error appears | yes |
| 2 | Fill the gift: about 10 EUR, 7 days, 10 XP a day, no Duolingo name | funder | the amount typed, and that the screen refuses anything it would have to guess at | no |
| 3 | Tap "Add money and give": the deposit line is copied and Mercuryo opens | funder | that the line was copied, and the exact wording of the waiting state | yes |
| 4 | On Mercuryo: buy 25 EUR of MON on Monad, paste the line, pay by card | funder | euros charged, fee shown, every document asked for, minutes from payment to arrival. **If refused, their exact words** | yes |
| 5 | The page notices the money and converts it by itself | funder | minutes from payment to the screen changing, the conversion hash, and how much the 25 EUR finally became | yes |
| 6 | The gift is created and the link appears | funder | the gift id, the creation hash, seconds from conversion to "It is in their name", and that the copy button says "Copied" | yes |
| 7 | **Pay out the leftover** from the funder's account: /cash-out, get it ready, open Mercuryo, paste their line, send | funder | the top-up, approval, conversion and sending hashes; what Mercuryo asked for; **euros actually arrived, and when**. If refused, their exact words | yes |
| 8 | Open the link on a device that has never seen Viky, create a passkey, open the gift | recipient | **seconds from opening the link to "is in your name"**, taps, anything that made them hesitate. This is KT5 | yes |
| 9 | Name the Duolingo account, place the code in the display name, start counting | recipient | seconds to place the code, whether the first read found it, and the words shown when it succeeded | yes |
| 10 | The next morning, a day is counted with nobody touching anything | nobody | the check-in hash, the day credited, the amount now theirs | yes |
| 11 | At the end, the recipient takes the money and pays it out | recipient | the withdrawal hash, then the same as leg 7, and the euros that arrived | yes |
| 12 | A day skipped on purpose, then the settling pass sends it back | nobody | the drain and refund hashes, and the funder's screen before and after. **This is the scene for the video** | yes |

Legs 1 to 7 can all be done in one sitting. Legs 8 to 12 follow the gift's own week.

## What each sentence of the way out is waiting for

`/cash-out` is the only screen in `docs/SCREEN-CLAIMS.md` where every line is marked as never run. Here is
the exact leg that changes each one, and each is to be dated in that file the day it happens.

| the sentence | run when | by |
|---|---|---|
| "Yours to take out" shows the right amount | the balance on the screen matches what the gift paid | leg 7 |
| "This is too small to pay out yet." | seen at least once below the floor, or noted as never seen | leg 11, early in the week |
| "They keep a flat 3 EUR whatever the amount" | the fee Mercuryo actually charged is compared with it | leg 7 |
| "Getting it ready" then "ready to be paid out" | the conversion finishes and the amount is right | leg 7 |
| "Viky sends your money to them" | the money reaches Mercuryo and they accept it | leg 7 |
| the whole screen, for the person it is built for | the recipient does it, not the funder | leg 11 |

Until leg 7 is done, nothing anywhere may say the way out works. When it is done, the line in
`docs/SCREEN-CLAIMS.md` changes from "not yet run" to "run on" with the date, and D41 gets its result.

## What would make this stop

Written before starting, so the answer is not invented afterwards.

- **Mercuryo refuses the card, the region or the documents.** Record their words, mark legs 4 and 7
  refused, and the rail question reopens. The gift itself is unaffected: it does not need euros to work.
- **The payout minimum turns out to be higher than measured.** Record the real figure, and the size of a
  first gift changes.
- **The money arrives but the page does not notice it.** That is ours, and it is a defect: record what the
  screen was showing and for how long.
- **The conversion fails for want of a route.** Record the exchange's own message; the amounts here are
  small and a thin market is a real possibility.
