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
| the balance under "Your money" | it is this account's spendable balance now | `readAusdBalance` reads the chain on every refresh | **none yet** |
| the amount typed into "How much" | exactly that amount is taken, never more | `dollarsToUnits` reads the text and refuses anything it would have to guess at; it never goes through a number | `test/screen-claims.test.ts` |
| "their smallest purchase is 25 EUR and they keep about 3.8%" | Mercuryo's own terms today | measured by hand (D20) | **not testable by us**: a third party's terms, to be re-read before the freeze |
| "Waiting for your payment. Keep this page open." | the page is really watching | a poll every eight seconds while the step is open | **none yet** |
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
| "Take $X" | X is theirs and can be moved now | `earnedBalance`, and the contract refuses more | `test/GiftEscrow.t.sol` withdraw |
| every refusal sentence | it names the real reason, and never asks for a step that no longer exists | `CONTRACT_REFUSALS` maps each typed contract error to one sentence | `test/gift-reader.test.ts`, which also fails on a forbidden word or a sentence that still says "check in" |

## The account, on every screen

`app/components/AccountPanel.tsx`, `src/account/provider.tsx`, `src/account/mera.ts`.

| the screen says | what must be true | what makes it true | exercised by |
|---|---|---|---|
| "You are signed in." | the passkey session is open **and** the server has accepted this browser | `announcedAccount` gates it on both naming the same account | `test/screen-claims.test.ts` |
| "Your account is protected by your passkey. Nothing to remember, nothing to write down." | no secret is stored anywhere we hold | the key is derived from the passkey and lives in memory only | `test/mera-derivation.test.ts` |
| each account failure sentence | it is the real cause and offers a way out | typed `AccountError` with its guidance | `test/account-errors.test.ts` |
| "What this device can do for you right now" | that list is what the open session can actually sign | the session signs the person's own account only | **none yet** |
| "Closing in m:ss" | the session really closes then, and the number is never negative or stale | `sessionRemaining` clamps at zero, read again every second because every signature pushes the deadline back | `test/screen-claims.test.ts` |

## Known gaps, in the order they matter

1. The balance shown on the funder screen, and the waiting state that watches for a card payment. Both
   need a browser and a signed-in account, which is the next thing the browser tests have to reach.
2. "What this device can do for you right now": the list of what the open session may sign.
3. The clipboard, whose failure path is the one a person meets when the browser refuses the copy.

Closed so far: "You are signed in", which is where the sign-in race lived; "Theirs so far", which
would have shown a funder that their gift had earned nothing the moment the recipient took the money; the
amount typed, which took a dollar more than written for any figure like 20.999 and read 1e3 as a thousand
dollars; and the session countdown. Each test was checked by breaking the rule and watching it fail.
