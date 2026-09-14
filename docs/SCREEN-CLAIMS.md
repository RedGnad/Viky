# What each screen promises, and what makes it true

Every sentence Viky shows about money or about the state of a gift, next to what must be true for it and
the code path that makes it true. The rule and the reason are in `CLAUDE.md`.

Why this file exists. Our tests check that the code does what the code says. Nothing checked that the code
does what the screen says, and three real defects lived in that gap in two days: the screen promised that a
missed day comes back while nothing ever sent it (D38); the account was announced before the server had
accepted it, so the gift list asked with no session and kept the refusal on screen; and a message told
someone to take a code out of their name when the sender had named the account and no code ever existed.
None of the three needed cleverness to find. They needed somebody to read the sentence against the code.

A test in the last column means a test that fails if the promise stops being kept. Where there is none, it
says so, and that is the work queue.

## The gift list, on the home page

`app/components/MyGifts.tsx`, fed by `app/api/gifts/mine/route.ts`.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| "No gift yet." | the signed-in account is neither funder nor recipient of any gift | `loadGiftsOf` matches on both roles | `test/gift-store.test.ts` |
| "Counting: X of Y days done, Z missed." | X is the days credited on chain, Z the days drained | `readGift` reads `creditedDays` and `drainedDays` from the contract | `test/GiftEscrow.t.sol` crediting, draining and the accounting fuzz |
| "Theirs so far: $A." | A is what the recipient has earned, whether or not they have taken it | `theirsSoFar`, which is `creditedDays * perDay`, never the withdrawable balance, which drops when they take it | `test/screen-claims.test.ts` |
| "Came back to you: $B." | B has actually left the contract and reached the funder | `refundedToFunder` on chain, raised only by `refundUnearned`, which the settling pass calls | `test/daily-pass.test.ts` (this is D38) |
| "Not opened yet." | nobody has claimed it | `gift.recipient` is unset on chain | `test/GiftEscrow.t.sol` claim |
| "Opened. Name the Duolingo account to start counting." | claimed, but no account bound | `record.boundAt` is null | `test/gift-store.test.ts` binding |
| "Taken back before it was opened." | the funder cancelled before any claim | `gift.cancelled`; the contract refuses `cancel` after a claim | `test/GiftEscrow.t.sol` cancel |
| "Finished: X of Y days done." | the gift is finalised on chain | `gift.finalised` | `test/GiftEscrow.t.sol` finalise |

## The funder screen

`app/components/FundGift.tsx`, `app/api/fund/quote/route.ts`, `app/api/gift/create/route.ts`.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| "the smallest payment they take is 25 EUR, whatever you decide to put behind the goal" | it is said before the form, not after it | shown above the form whenever the person will need to add money, so a smaller gift is never decided in ignorance of the rail's floor | **none yet** |
| "Whatever is left over stays in your account" | the leftover really is theirs and reachable | it sits in their own account, and the home page offers to take it out whenever it holds anything | **none yet** |
| the balance under "Your money" | it is this account's spendable balance now | `readAusdBalance` reads the chain on every refresh | **none yet** |
| the amount typed into "How much" | exactly that amount is taken, never more | `dollarsToUnits` reads the text and refuses anything it would have to guess at; it never goes through a number | `test/screen-claims.test.ts` |
| "their smallest purchase is 25 EUR and they keep about 3.8%" | Mercuryo's own terms today | measured by hand (D20) | **not testable by us**: a third party's terms, to be re-read before the freeze |
| "Waiting for your payment. Keep this page open." | the page is really watching, converts what arrived and never what did not | `nextFundingStep` decides from the two balances alone, so the branch can be tested without a chain | `test/screen-claims.test.ts`, checked by making it convert dust and watching it fail |
| "Your deposit line is copied." | the clipboard actually took it | the copy is awaited and its failure is caught and said | **none yet**, and the failure path matters: the button used to say nothing either way |
| "Putting it in their name" then "It is in their name." | the gift exists on chain and the money is in it | `relayCreateGift` waits for finality before returning, and the funder's single signature is both the payment and the consent to these exact terms | `test/GiftEscrow.t.sol` create and fund, `test/gift-routes.test.ts` |
| the claim link | it opens this gift and nobody else's | the link carries a token whose hash alone is stored | `test/gift-store.test.ts` claim token |

## The recipient screen

`app/components/GiftPage.tsx`, fed by `app/api/gift/[id]/route.ts`.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| "$X is in your name." | X is held by the contract for this gift, not by us | the contract holds the AUSD; Viky never takes custody | `test/GiftEscrowFork.t.sol` against real AUSD |
| "$P for each day with your lesson, for N days" | P is the amount divided by the number of days | `perDay = amount / durationDays`, with the rounding dust settled at the end | `test/GiftEscrow.t.sol` finalise and dust |
| "$P goes back to them for each day without it." | a missed day really reaches the funder | `drain` frees it and `refundUnearned` sends it, both in the settling pass | `test/daily-pass.test.ts` (D38) |
| "Nobody else ever profits from a missed day." | every unit ends with the recipient or the funder | the accounting invariant | `test/GiftEscrow.t.sol` accounting fuzz |
| "Counting starts tomorrow." | the window opens the day after the first reading | the baseline sets `startDay` to the next UTC day | `test/GiftEscrow.t.sol` baseline |
| "Each morning Viky reads your Duolingo and counts the day before." | a reading happens daily without the person, and settles only finished days | the cron at 00:30 UTC, and `checkIn` credits up to the day before the reading | `test/GiftEscrow.t.sol` (D30 tests) and the settled prediction in `docs/spikes/KT1.md` |
| "One more day is yours." | a day was credited by that reading | `creditedDays` rose by that many | `test/GiftEscrow.t.sol` crediting |
| "$R has gone back so far, for N days without a lesson." | R has reached the funder and N days were drained | `refundedToFunder` and `drainedDays` | `test/daily-pass.test.ts` for the sending |
| "This gift is finished." | finalised on chain, nothing more can change | `gift.finalised` | `test/GiftEscrow.t.sol` finalise |
| "Take $X" | X is theirs, can be moved now, **and the person reading is the one who may move it** | `earnedBalance`, and the contract refuses more; the button is offered only when the server says this account is the recipient, computed from the chain and never from anything the browser sends | `test/GiftEscrow.t.sol` withdraw, `test/relay-gas.test.ts`; **run for the first time on 14 Sep 2026**, $2.857142 to the recipient, `0x46c0410f71ff5fbda94d74be15da930f80bd3051a1c065fcbb13b3292ac9bb56`, block 104,636,947. The role gate has no test yet |
| every refusal sentence | it names the real reason, and never asks for a step that no longer exists | `CONTRACT_REFUSALS` maps each typed contract error to one sentence | `test/gift-reader.test.ts`, which also fails on a forbidden word or a sentence that still says "check in" |

## The way out

`app/components/CashOut.tsx`, `app/api/exit/quote/route.ts`, `app/api/exit/gas/route.ts`.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| "Yours to take out" | it is what the person holds now, after everything already credited | their own balance read from the chain | **none yet** |
| "This is too small to pay out yet." and "It stays yours either way" | the payout service would refuse it, and nothing is lost by waiting | a floor above the refusal measured in D20; the balance is the person's own and no deadline touches it | **none yet** |
| "Above about $40.00 that is less than a tenth of what you get" | their flat fee really is under a tenth from there | 3 EUR is under a tenth of 30 EUR, and 40 dollars is above 30 euros at any rate worth planning for, so the figure is never more flattering than the truth | **none yet** |
| "They keep a flat 3 EUR whatever the amount" | that is the payout service's own fee | measured in D20, 10 Sep 2026 | **not testable by us**, and to be re-read before the freeze |
| "Getting it ready" then "ready to be paid out" | the money is in a form the payout service takes | Viky pays for the two steps, then the person's own account converts it | **not yet run end to end**: no payout has ever been made |
| "Viky sends your money to them" | it goes where the payout service asked, and nowhere else | the person pastes the line and their own account sends it | **none yet** |

**Nothing on this screen has been run end to end.** No payout has ever left Viky. Until one has, this
screen is a path we believe in, not a path we have walked, and nothing anywhere may claim otherwise. The
run that settles each line, and the leg that settles it, is `docs/spikes/KT1-part-2.md`; each line above
changes from "none yet" to the date it ran, on the day it runs.

## The account, on every screen

`app/components/AccountPanel.tsx`, `src/account/provider.tsx`, `src/account/mera.ts`.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| "You are signed in." | the passkey session is open **and** the server has accepted this browser | `announcedAccount` gates it on both naming the same account | `test/screen-claims.test.ts` |
| "Your account is protected by your passkey. Nothing to remember, nothing to write down." | no secret is stored anywhere we hold | the key is derived from the passkey and lives in memory only | `test/mera-derivation.test.ts` |
| each account failure sentence | it is the real cause and offers a way out | typed `AccountError` with its guidance | `test/account-errors.test.ts` |
| "What this device can do for you right now" | that list is what the open session can actually sign | the session signs the person's own account only | **none yet** |
| "Closing in m:ss" | the session really closes then, and the number is never negative or stale | `sessionRemaining` clamps at zero, read again every second because every signature pushes the deadline back | `test/screen-claims.test.ts` |

## What the milestone contract promises

Not a screen, the same discipline one level down (D45). The sentences are in D45; here is what exercises
each. A reviewer checks the contract against the sentences, never against the tests.

| the promise | exercised by |
|---|---|
| The first reading is always the start | `testARecipientCannotRetryUntilAReadingSuitsThem`, `testTheFirstProofRecordsWhereTheyStoodAndStartsTheClock` |
| A start above what the funder accepted never pays | `testARecipientCannotRetryUntilAReadingSuitsThem`, checked by putting the flaw back and watching it fail |
| A milestone already reached is not a milestone | the same test, on a measure that falls |
| The deadline judges the reading, not the transaction | `testAReadingTakenInTimeSurvivesHoursOfOurOwnLateness`, `testProveAndExpireAreNeverBothShut`, `testTheKeeperCannotExpireWhileSuchAReadingCouldStillArrive`, checked by putting the defect back |
| An old reading is never a start | `testTheFirstReadingCannotBeAnOldOne`, `testTheGraceDoesNotLetAnOldReadingStartAGift` |
| The wait runs from the day it was opened | `testTheWaitForAFirstReadingRunsFromTheDayItWasOpened` |
| All or nothing, once | `testReachingTheTargetGivesTheWholeAmountAtOnce`, `testAReachedMilestoneCannotBeExpired`, `testExpiringTwiceIsRefused` |
| Every unit ends with somebody | `testFuzzEveryUnitEndsWithSomebody` |
| A gift that is over cannot be reopened, or closed twice | `testAGiftThatIsOverCannotBeOpened`, `testTheFunderTakesItBackOnlyBeforeItIsOpened`, `testAGiftReturnedAtItsDeadlineCannotBeClosedAgain` |
| An identifier means one gift | `testMilestoneIdsCannotCollideWithTheDailyContract` |
| The funder answers one question, and the ceiling is computed | `test/milestone-terms.test.ts` |

### The certificate shape

| the promise | exercised by |
|---|---|
| No starting point, the granting day is what pays | `testACertificateEarnedInsideTheGiftPays` |
| Only something granted inside the gift pays | `testACertificateEarnedBeforeTheGiftNeverPays`, `testACertificateEarnedAfterTheDeadlineNeverPays` |
| The deadline is a date the funder sees | `testTheDeadlineOfACertificateIsADateTheFunderSees` |
| Only the person and the thing the funder named | `testAnotherPersonsCertificateNeverPays` |
| Our lateness is ours | `testACertificateReadingSurvivesHoursOfOurOwnLateness` |
| It comes back at its date, and sooner if nobody opens it | `testACertificateNotObtainedComesBackAtItsDate`, `testACertificateGiftNobodyOpensComesBackWithoutWaitingForItsDate` |
| The two shapes cannot borrow each other's terms | `testTheTwoShapesCannotBorrowEachOthersTerms` |
| The page really carries what the proof needs | `test/attested-sources.test.ts`, from six real certificates |

## Found by watching someone use it

Not promises broken, but places the product misled or lost the person. Recorded when they happen, because
this is where the two worst defects of 11 and 12 September came from.

| what happened | when | state |
|---|---|---|
| The gift list told a funder what had come back and never what had been earned, which is the half that says the gift works | 12 Sep | fixed the same day |
| A wrong Duolingo name trapped the recipient on the code step for ever, while the text told them to reload, which did nothing | 12 Sep | fixed the same day |
| "Nothing to do right now" said nothing, in seven different situations | 12 Sep | each says the real reason now |
| The way out could only be reached from a gift that had already earned something, so a funder paying out their own leftover had no path at all | 12 Sep | the home page offers it whenever the account holds anything |
| The card minimum was under the form, so the gift amount was chosen before knowing 25 EUR had to be paid | 12 Sep | said above the form now |
| **The same address serves both roles and only the passkey differs, so the funder could not find where the recipient signs in.** Twice. | 13 Sep | partly fixed: the gift page now speaks to whichever side is reading, but the home page still does not say which account you are in |
| **The gift page showed the recipient's words and the recipient's buttons to whoever was signed in.** A funder read "$20.00 is in your name", was offered "Take $2.85", and the contract refused it: the screen promised something the code forbids | 13 Sep | fixed the same evening |

| **No withdrawal had ever worked.** The declared gas came from a suite running against a mock token, so the transaction was mined and failed, and a mined failure carries no reason at all. Five attempts read "This could not be recorded" and I chased three wrong causes before measuring | 14 Sep | fixed and **proven**: the gas is estimated against the chain now, and the first withdrawal landed |
| **There was no way to sign in as another account.** Sign-in always reused the passkey the device remembered, so someone holding both a funder and a recipient account could never reach the second one | 13 Sep | fixed the same evening: "Use another account", signed in or out |

What is left: the home page still does not say which of your accounts you are signed in as, which is the
question when you hold both. Worth an hour before the first real recipients, not a redesign.

## Known gaps, in the order they matter

1. The balance shown on the funder screen and on the way out: both are a chain read with nothing to decide,
   and testing them needs a browser with a signed-in account, which the browser tests cannot reach yet.
2. "What this device can do for you right now": the list of what the open session may sign. The list is
   words, not a rule the code enforces, so what it needs is a reader checking it against the routes, not a
   test. Worth doing once before the freeze.
3. The clipboard, whose failure path is the one a person meets when the browser refuses the copy. Both
   branches say something now, which is what was missing; proving it needs a browser that refuses.

Closed so far: "You are signed in", which is where the sign-in race lived; "Theirs so far", which
would have shown a funder that their gift had earned nothing the moment the recipient took the money; the
amount typed, which took a dollar more than written for any figure like 20.999 and read 1e3 as a thousand
dollars; and the session countdown. Each test was checked by breaking the rule and watching it fail.
