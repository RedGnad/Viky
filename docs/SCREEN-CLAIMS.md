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

## Home, Gifts and You: the three destinations

`app/kit/Home.tsx`, `app/kit/Gifts.tsx`, `app/kit/Me.tsx`, `app/kit/GiftCard.tsx`, `app/kit/MoneyHero.tsx`, fed by
`app/api/gifts/mine/route.ts` and `src/conditions.ts`. Rebuilt on 17 Sep 2026 on the product structure: three
destinations in a bar below 840 pixels and a rail from 840, tasks opening over them with the bar hidden.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| the bar and the rail, three destinations, nothing without an account | there are exactly three, they are hidden in a task, and nobody without an account sees them | `Nav` draws nothing without an account and only `Shell kind="destination"` mounts it; a task is `Shell kind="task"` | `test/design-tokens.test.ts` (every page through the shell) |
| "In your account", the figure, "Yours to keep, to put behind another goal, or to take out." | it is everything the account holds that is money, of all three coins, in the account's own currency | `useHoldings` reads every coin in `COINS`; `MoneyHero` adds the two dollar coins, converts with the rate of `/api/rates` and prints the dollar beneath, and leads with the ready figure when the account holds nothing but what the card service buys | `test/exit-steps.test.ts`, `test/display-currency.test.ts` |
| "Take it out" on Home | the account holds anything at all, of any coin above the reserve | `holdsAnything` | `test/exit-steps.test.ts` for the reserve |
| "Offer a gift", or "Finish the gift you set up" | a gift set up on this device for this account is not made yet | `loadPendingGift` (D74) | `test/pending-gift.test.ts` |
| "What's moving", up to three cards, newest first, then "See all gifts" | the three newest of the account's gifts, by the moment the money went in | `/api/gifts/mine` sorts by `fundedAt` read from the contract | `test/gift-store.test.ts` for the list |
| a gift card: "For ama_learns" or "For whoever opens the link" or "For you", the condition's name, "$25.00, $3.57 a day for 7 days", the state | for whom is the name the funder gave, or nobody, or the reader; for what comes from the register and never from the card; the state is the contract's | `GiftCard` reads `goalUsername` and `role` from the route, the name from `conditionOfGoal(goalType)`; the state sentences are the old ones, in `src/sentences.ts` | `test/conditions.test.ts` (no source named in the kit), `test/state-catalogue.test.ts` |
| "Counting: X of Y days done, Z missed." and "Finished: X of Y days done, Z missed." | X is the days credited on chain, Z the days drained, and the count of missed days survives the end | `readGift` reads `creditedDays` and `drainedDays`; the finished sentence keeps Z | `test/GiftEscrow.t.sol` crediting, draining and the accounting fuzz |
| "Opened. Connect Duolingo to start counting." | claimed, but no account bound, and the source is the gift's own | `record.boundAt` is null; the sentence is the register's `words.connect` | `test/gift-store.test.ts` binding, `test/conditions.test.ts` |
| "Money shown in" with US dollars, Euros, CFA francs, and "what your phone suggests" beside one | the choice is the account's, kept on the server, and the proposal is the device's | `PUT /api/account/preferences` into `viky_accounts`; `proposedDisplayCurrency(navigator.language)` | `test/send-store.test.ts`, `test/display-currency.test.ts` |
| "Signed in on this device until 14:20." | that is when the signing session closes by itself unless something is signed | `mera.sessionExpiresAtMs()`, read again every half minute | `test/screen-claims.test.ts` |
| "Need your code for a payout service?", folded, with the code and "Copy your code" | the code is this account's own | the signed-in account's identifier; the copy is awaited and its refusal said | **none yet** for the clipboard |
| "Help" leads to five questions answered in the screens' own words | every answer is a sentence some screen keeps true | `HELP.questions` in `src/sentences.ts`, each answer taken from a sentence already listed in this file | **none yet**: a reader checks the five against this file |
| no footer anywhere; Privacy and Legal notice as two text links on the promise page only | the documents stay reachable without an account, and nothing else is a footer | `Home` signed out prints the two links; no other screen prints them; `Me` holds the four | `test/design-tokens.test.ts` (no retired background), a reader for the links |

## The funder screen

`app/components/FundGift.tsx`, `app/api/fund/quote/route.ts`, `app/api/gift/create/route.ts`.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| "the smallest payment they take is 25 EUR, whatever you decide to put behind the goal" | it is said before the form, not after it | shown above the form whenever the person will need to add money, so a smaller gift is never decided in ignorance of the rail's floor | **none yet** |
| "To cover this gift, pay at least N EUR" on the check, and "Pay in EUR, at least N EUR" beside the rail | buying N on the rail covers what the account is short of for this gift | `eurosToBuy` turns the shortfall into whole euros at the rates measured on 14 Sep with a tenth added for the rate, never below 25 EUR, and the waiting screen recomputes it from the balance on every refresh (D72) | `test/gift-amount.test.ts`, including a rate 9 % worse than measured |
| "Whatever is left over stays in your account" | the leftover really is theirs and reachable | it sits in their own account, and the home page offers to take it out whenever it holds anything | **none yet** |
| the balance under "Your money" | it is this account's spendable balance now | `readAusdBalance` reads the chain on every refresh | **none yet** |
| the amount typed into "How much" | exactly that amount is taken, never more | `dollarsToUnits` reads the text and refuses anything it would have to guess at; it never goes through a number | `test/screen-claims.test.ts` |
| "their smallest purchase is 25 EUR and they keep about 3.8%" | Mercuryo's own terms today | measured by hand (D20) | **not testable by us**: a third party's terms, to be re-read before the freeze |
| "they check who you are the first time, once" | the partner really asks for identity before a card payment goes through, and it is said before the person leaves Viky rather than discovered on their page | their own availability page states that identity verification is needed to buy **or** sell, so the funder meets it at the card payment and the recipient only at the payout. Read 14 Sep 2026, updated there 2 Sep (D62) | **not testable by us**, a third party's requirement, to be re-read before the freeze. That it is said at all, and before the rail opens, is what the design pass must keep |
| "Waiting for your payment. You can leave this page: the gift is kept, and Viky picks it up when you come back." | the page is really watching, converts what arrived and never what did not, and the gift really does outlive the page | `nextFundingStep` decides from the two balances alone, so the branch can be tested without a chain; the terms are on the device, and the sentence becomes "Keep this page open" instead when the device refused to keep them (D74) | `test/screen-claims.test.ts`, checked by making it convert dust and watching it fail; `test/pending-gift.test.ts` |
| the six numbered steps: Buy, at least N EUR, MON, Monad network, paste, then "choose your own, non-custodial" | they are what the rail's page actually needs, in its order, and the last answer is the true one | measured live on 14 Sep 2026: the consumer widget opens on dollars into bitcoin and accepts nothing from us, so every choice is the person's to make and ours to say. The last step was met by the funder on 15 Sep; the key behind the destination is derived from the passkey on the device and held by nobody else (D72) | **not testable by us**, a third party's page, to be re-read before the freeze |
| "Each day they reach it, this becomes theirs", with a figure under it | that figure is what one earned day is really worth | computed live from the amount and the length the funder typed, `total / days`, never stored, so it cannot disagree with the amount above it. The contract computes `perDay` the same way | `test/GiftEscrow.t.sol` crediting, and **none yet** on the screen's own arithmetic |
| "And each day they miss, the same comes back to you." | a missed day really returns that much | `drain` moves `perDay` per missed day to the refundable bucket and the settling pass sends it | `test/daily-pass.test.ts`, and D38 is why this sentence is checked at all |
| the check screen's four rows: in their name, theirs for each day earned, over, first day counted | every one of them is what will actually happen, shown before anything is signed or paid | the amount and the per-day figure come from the same two fields; "the day after they connect Duolingo" is `startsAt`, the UTC day after the first reading | **none yet** for the rows as a set, which is the one screen GOV.UK asks for before a confirmation and Baymard measures abandonment without |
| "What they earn is theirs straight away, and it adds up in their account from one gift to the next." | both halves are true | a withdrawal lands in the recipient's own account, and nothing ever sweeps that account. The sentence it replaced promised a card payout the rail does not make in the EEA (D72) | **none yet** for the accumulation |
| "check what you pasted starts and ends like this", with six characters and four | the person can compare what is in the rail's field against what is theirs, before they pay | the first and last characters of their own identifier, taken from the signed-in account and nothing else | **none yet**, and the failure it guards against, paying into the wrong hands, is not recoverable |
| "Your deposit line is copied." | the clipboard actually took it | the copy is awaited and its failure is caught and said | **none yet**, and the failure path matters: the button used to say nothing either way |
| "Putting it in their name" then "It is in their name." | the gift exists on chain and the money is in it | `relayCreateGift` waits for finality before returning, and the funder's single signature is both the payment and the consent to these exact terms | `test/GiftEscrow.t.sol` create and fund, `test/gift-routes.test.ts` |
| "Whoever opens this link takes the gift, so send it only to them" | it is true: the link is a bearer link | the route checks the link's secret, then copies the stored contact hash into the attestation, so the contract compares our own value against itself. There is no identity check anywhere, and saying otherwise was wrong (D58) | `test/gift-store.test.ts` claim token, for the secret only |
| "only that Duolingo can then earn this gift, whoever opens the link" | naming the goal account really does lock it | the recipient cannot change a name the funder set, and every credited day is bound to that profile | `test/gift-store.test.ts` binding, `test/GiftEscrow.t.sol` identity |
| "Viky never writes to them. You send them the link yourself", with no email or phone asked | nothing about the gift depends on a contact, and Viky sends nobody anything | the claim checks the link's secret alone; a new gift carries `NO_CONTACT_HASH`, and no route sends an email or a text (D72) | `test/gift-routes.test.ts`, where a gift with no contact goes on to the terms check; `test/contact-hash.test.ts` |
| after making the account on the account step, the check comes back with its button to pay | a signed-in funder is never left on a step with nothing to press | `fundingStageShown` shows the check whenever the account step has an account (D72) | `test/screen-claims.test.ts` |
| "Your session closed while you were paying" and "Nothing is lost. The gift you set up is kept on this device, and whatever you paid stays in your account." | the gift's terms outlive the session, and the payment is the funder's | the terms are written to the device when the rail opens (`savePendingGift`), and the sentence says "while this page stays open" instead when the device refuses to keep them; the payment lands in the funder's own account, which nothing sweeps (D74) | `test/pending-gift.test.ts`, `test/screen-claims.test.ts` |
| "Welcome back. Your $X gift is still set up, and it goes ahead as soon as your payment is here." | the same account is back, with the terms it set up, and the page is watching again | `loadPendingGift` gives the terms only to the account that set them up, and for 72 hours; the page then waits, converts what arrived and gives as before (D74) | `test/pending-gift.test.ts` |
| "Use the payment that arrived", and "A card payment has already arrived in your account." | a card payment sits in the account, not yet converted | `paymentArrived`, the same test the waiting page converts on (D74) | `test/screen-claims.test.ts` |
| "Mercuryo says most payments take 30 to 60 minutes, and sometimes several hours." | their own help centre says so | "How can I check the status of my transaction?", edited there on 16 Jul 2026 and read on 16 Sep (D74) | **not testable by us**, a third party's words, to be re-read before the freeze |
| "Finish the gift you set up", on the signed-in home | a gift set up on this device for this account is not made yet | the same `loadPendingGift` (D74) | `test/pending-gift.test.ts` |
| "A gift is waiting for your payment" and "Sign in to pick it up", on the first step with nobody signed in | this device holds a gift set up and not made | `hasPendingGift` reads the same record without naming an account, which is all there is after a reload; the button opens the account step, and signing in picks the gift up (D74) | `test/pending-gift.test.ts` |
| after a closed session, "Sign in" is the action offered first, above "Create my account" | somebody coming back does not make a second account and leave the gift and the payment on the first | `AccountPanel` takes `returning`, which swaps which of the two leads, and the line beside it says why (D74) | `test/pending-gift.test.ts` |

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

`app/components/CashOut.tsx`, its sentences in `src/sentences.ts`, `src/exit-steps.ts`, `app/api/send/route.ts`,
`app/api/send/record/route.ts`, `app/api/exit/*`, `src/rails.ts`. Rebuilt on 17 Sep 2026 from
`docs/design/flows.md`, states W1 to W13.

**Two services are named, never one** (D77). Neither covers everybody: the euro one refuses Senegal and Ivory
Coast outright, which is where the pilot's cross-border gifts are aimed, and the card one makes no card payout
in France, the rest of the EEA or the United States. Each card says where it pays, what that service keeps and
how soon it pays, as that service publishes it, with the source and the date it was read. **Nobody is asked
where they live**, and no list of countries is copied into the code.

**Three numbered steps on one card.** Which step is open is read from what the account holds and never from a
flag in memory, so a reload lands on the same step. The person only ever meets numbers with two decimals, cut
down and never rounded up, because the payout service is ordered for such a number and expects it.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| "Your money", with a figure | it is everything the account holds that is money, of all three coins | `readCoinBalance` for every coin in `COINS`; the dollar figure is the two stablecoins added, and the chain's own coin counts only above the reserve, as what is ready for the card service | `test/exit-steps.test.ts` for the reserve |
| "about 9.53 EUR (rate of 16 Sept)", or "about 6,249 CFA francs" | the rate is real, dated, and never invented | `RATE_SOURCE` in `src/rails.ts` names the ECB's daily file; `parseEcbRates` refuses a file without a dated dollar line; the CFA franc is derived through its fixed parity, sourced twice in the same note; nothing is shown after three days without a read, and the screen then says "Shown in dollars: the exchange rate could not be read today." | `test/rates.test.ts`, `test/display-currency.test.ts` |
| the currency itself: euros for an account in France, CFA francs for one in Senegal | proposed from the device, never asked, and a choice made on the account page wins | `proposedDisplayCurrency` reads the region of the device's language tag against the euro area and the CFA franc area, both read at their source and dated; the choice is one row per account in `viky_accounts` | `test/display-currency.test.ts`, `test/send-store.test.ts` |
| each service's card: "To your bank account, in euros. Ramp keeps 0.99 % with a minimum of 1.99 EUR, and pays within 2 business days." and "Read from X, DATE" | every figure is that service's own, read at the source named on the date named (decision 1: their published facts, on the card) | `feeSentence` builds the words from the three published figures in `src/rails.ts`, so the card and the review can never disagree; the delay is `pays`, their own words | `test/gift-amount.test.ts` |
| "How much do you want to send to your bank?" with "Up to $20.99, with two decimals at most." | the maximum is what a gift holds, cut down, and the amount is read in dollars and cents | `twoDecimalsDown` for the maximum; `dollarsToChange` reads the text to two decimals and refuses anything finer with the figure they do have | `test/exit-steps.test.ts` |
| "You will get at least 9.99 to send." | 9.99 is the exchange's guaranteed floor, cut down, so what arrives is never under it | `/api/exit/quote` signs `minOut` into the ticket; `floorToOrder` cuts it; the contract refuses anything below the floor with `TooLittleBack`; what arrived is then read from the account, and cut down again, so "Ready" is at least what was read | `test/ExitRouter.t.sol`, `test/exit-routes.test.ts`, `test/exit-steps.test.ts` |
| "Ramp will turn that into about 8.66 EUR, minus its 1.99 EUR fee: about 6.67 EUR on your bank account." | the euro figure is Ramp's own for that amount today, the fee is the one that applies (the larger of their share and their minimum), and the net is the difference | `src/ramp.ts` reads their asset list at each quote and never caches it long; `feeApplied` takes the larger of `fee.percent` and `fee.minimum` from `src/rails.ts` and subtracts it | `test/exit-steps.test.ts` for the arithmetic; **none yet** for the live figure, a third party's endpoint re-read rather than pinned |
| "Ready to send to Mercuryo", "138.43", "about $3.24" on the card branch | the figure is what the account holds of what the card service buys, above the reserve, and its worth is the price's answer, never a guess | `readyFor` above `CONVERSION_RESERVE`; the worth is `/api/fund/quote`'s `output` for exactly that quantity, the same quote the funder screen converts with; when nothing answered the line reads "Its value in dollars will show once the price answers." | `test/exit-steps.test.ts` for the reserve; **none yet** for the quote, a live exchange |
| "Nothing leaves your account yet." and "This price holds for 4 minutes." | true of the review: nothing is signed there, and the ticket lives four minutes | the signature is asked only by "Get 9.99 ready"; `TICKET_TTL_SECONDS` in `src/exit-ticket.ts`; a ticket that died is asked again for the person, and "The price was refreshed." is said | `test/exit-routes.test.ts` |
| "Ready: 9.99" and "Less than 0.01 stays in your account." | 9.99 is the balance of the coin the service buys, cut down, and the dust is what is left above it | `readyFor` reads that coin's balance from the account, above the reserve for the chain's own coin, and `dustInWords` says the rest honestly: "Less than 0.01", the exact figure, or "About" | `test/exit-steps.test.ts` |
| "Order 9.99 on Ramp" opens Ramp | the page opened is their sell page for the coin the router handed back | `WAY_OUT_EURO.page`, which carries `swapAsset=MONAD_USDC&flow=offramp` | **not testable by us** |
| "When Ramp asks where you are sending from, give them this code", the code whole, "Copy" then "Copied" | the code is this account's own, the one the router paid, and the clipboard really took it | the signed-in account's identifier, shown whole so it can be compared with what was pasted at Ramp; the copy is awaited and its refusal is said | `test/screen-claims.test.ts` |
| "Paste the code Ramp gives you to send to", echoed whole under the field, refused with "That is not a code Ramp gives" or "That is your own code" | nothing is sent to something that is not a destination, or to the person themselves, and the code can be compared with Ramp's page | the field is checked before the review, what is pasted is printed whole beneath it, and the button stays shut until it passes, saying "Paste the code from Ramp to send it." while it does | `test/screen-claims.test.ts` |
| "Send 9.99 to Ramp. This cannot be undone." then "Send" | a review stands before the irreversible gesture, and exactly 9.99 leaves | `const leaving = ready.units`, the two-decimal number in the coin's units, on both branches: relayed for the stablecoin, sent by the person's own account for the chain's own coin | `test/screen-claims.test.ts`, `test/exit-steps.test.ts` |
| "Sent 9.99 to Ramp on 17 Sep 2026 at 23:41. Reference: 7599b203." and "Ramp pays your bank within 2 business days." | the send is final, the reference names it, the date is the one a person can quote, and the delay is Ramp's own | the route waits for finality, writes the row in `viky_sends` and answers the reference, the hash in short form (decision 7); a send the person made themselves is written by `/api/send/record`, which reads the transaction back from the chain before believing the browser; the delay is `pays` | `test/send-store.test.ts`; **none yet** for the record route against a chain |
| "Sending cost 0.02." on the card branch | the fee really came out of that coin, and the figure is the one charged | `sendMon` returns the fee it declared, computed from the same limit and cap the node charges against (D52) | **none yet**: needs a real transfer |
| "Your session closed while you were away", "Nothing moved and nothing was taken.", "You were at step 2 of 3: 9.99 is ready to send to Ramp." | the session really closed, nothing moved, and the step named is the real one | the passkey session closes itself; the screen shows this when `currentAccount()` is gone or a route answers `SIGN_IN_REQUIRED`, both before anything is signed; the step is read from the balances, so signing in lands exactly there; only "Sign in" is offered (`AccountPanel signInOnly`) | `test/screen-claims.test.ts` |
| the session lasts thirty minutes here | the length in force is the one that arms the timer | `useMoneySession` sets `MONEY_SCREEN_IDLE_MINUTES` on the three money screens and puts `DEFAULT_IDLE_MINUTES` back on leaving; the account page prints `sessionIdleMinutes()` | `test/screen-claims.test.ts` |
| "Too many sign-ins in ten minutes. Wait a few minutes, then sign in again." | it is the server's own limit, said as what it is | the two sign-in routes answer a typed `RATE_LIMITED` on 429, and `toAccountError` carries that sentence | `test/account-errors.test.ts` |
| every refusal, under the element in cause | it names the real reason, with the figure when there is one, and never as a shrug | `refusalText` branches on the typed code; the figures come from the route that measured them (`NOT_ENOUGH`, `BELOW_PAYOUT_MINIMUM`, `ABOVE_PAYOUT_MAXIMUM`); nothing on this screen reads "Something went wrong" | `test/screen-claims.test.ts` |
| "Send to another Viky account of mine", "Paste that account's code", "Send $X" | the money moves to the code pasted, exactly the two-decimal amount typed, on a signature the relayer submits | `dollarsToChange` reads the text to two decimals, as on step 1, with the maximum in the help line; the code is refused when it is the account's own; `/api/send` relays the signed authorization. What a gift holds goes this way, or the euro coin when no gift money is left; the chain's own coin never does, it goes to the card service through the steps | `test/send-amount.test.ts`, `test/screen-claims.test.ts` |

## The account panel, wherever a person signs in

`app/components/AccountPanel.tsx`, `src/account/provider.tsx`, `src/account/mera.ts`.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| "You are signed in." | the passkey session is open **and** the server has accepted this browser | `announcedAccount` gates it on both naming the same account | `test/screen-claims.test.ts` |
| "Your account is protected by your passkey. Nothing to remember, nothing to write down." | no secret is stored anywhere we hold | the key is derived from the passkey and lives in memory only | `test/mera-derivation.test.ts` |
| each account failure sentence | it is the real cause and offers a way out | typed `AccountError` with its guidance, the server's limit included | `test/account-errors.test.ts` |

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
