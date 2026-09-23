# The two videos

Two scripts, screen by screen: the technical video (3 minutes, the live product on screen) and the pitch (2 minutes).
Every sentence spoken or shown was checked against production and the chain on 23 Sep 2026. Where a line depends on
something not yet true, it is marked **[only if]** with the condition, and it is cut if the condition is not met on the
day of filming. Figures in brackets are the ones read that day; read them again before filming.

Rules that hold for both: no word from the list the user never sees on a consumer screen (wallet, gas, chain, seed,
token, transaction hash, address), except on the judges page and in a terminal; no "cheaper than a bank transfer", no
"lasting habit", no "no licence needed", no "nobody does this"; nothing called working that has not run once on mainnet
with real money.

## Technical video, 3 minutes, the product running

Recorded on `viky.cash` in production, a phone at 390 by 844 on the left of the frame, a terminal on the right for the
chain. One take per scene; no mock-up, no local build.

| time | on screen | said | true because |
|---|---|---|---|
| 0:00 to 0:15 | Home, signed out: the card, "Offer a gift" | "Viky is a conditional gift. You put money in someone's name for a goal. Each day they do it, a part becomes theirs. Each day they miss, that part comes back to you." | the gift contract's `checkIn`, `drain` and `refundUnearned` (`contracts/GiftEscrow.sol`) |
| 0:15 to 0:40 | The card filled in: a first name, "A Duolingo lesson each day", an amount, 7 days. Then "Pay", and the passkey sheet: Face ID | "No account until you pay. Pressing pay makes one: Face ID, nothing to write down. Behind it, a passkey derives the account's key, and the key never leaves the phone." | `ensureSigner()` inside the press (SCREEN-CLAIMS, "Your face or your fingerprint…"); `src/account/mera.ts:125-138` |
| 0:40 to 1:00 | "It comes from your account, which holds $…", "Put $… in …'s name", then "$… is in …'s name. Reference: gift N." | "One signature pays and agrees to these exact terms: the payment's authorization carries the hash of the terms. Our relayer submits it, so the funder pays no fee. It says done only once the network has finalised it." | `fundingNonce` (`GiftEscrow.sol:264`); `relayCreateGift` waits for finality. **[only if]** the funder account holds AUSD that day; otherwise film this scene from gift 3's receipt page and say "made on 17 Sep" |
| 1:00 to 1:20 | Terminal: `cast call $GIFT "getGift(uint256)(…)" N`, the funder, the amount, the per-day share | "The same gift, read straight from the contract on Monad." | `docs/submission/for-judges.md` commands |
| 1:20 to 1:45 | Second phone: the link opened, the passkey created, "A gift from …", the full amount shown as theirs, "It becomes yours as you go" | "The person it is for taps the link, makes an account the same way, and sees the whole amount in their name from the first second. Opening it is a transaction too, and they pay nothing for it." | claim relayed (`app/api/gift/claim/route.ts`); the recipient screen sentences in SCREEN-CLAIMS, "A gift's page". **[only if]** a gift is made for this video, or the claim is shown from gift 1's claim receipt with the date said |
| 1:45 to 2:10 | Gift 1's page, finished: "1 of 7 days done, 6 missed", then terminal: `pnpm verify:day`, five "yes" | "Every morning Viky reads Duolingo's own servers through an attested fetch: the reading is signed, and we check the signature and who signed it before a day counts. Anybody can check a credited day without us. That is gift 1, day of 12 September, re-verified from the public repository in fifteen seconds." | `pnpm verify:day`, measured 15.2 s on 23 Sep; gift 1 `creditedDays = 1`, `drainedDays = 6` |
| 2:10 to 2:30 | Terminal: `cast call $GIFT "drain(uint256)" 2`, "execution reverted, data: 0x26b7f2fe", then `cast sig "AlreadyFinalised()"` | "Refusals are typed. Here the contract refuses to drain a gift that is already finished, and says why." | `for-judges.md`, "One refusal" |
| 2:30 to 2:50 | Gift 3's page as its funder: days going back. Then the judges page, the owner line | "A missed day is not parked: the contract moves it to the funder's side, and the settling pass sends it back. Registering a condition or replacing the signing key needs two of three project keys." | `drain` then `refundUnearned` in the daily pass; owner = Safe, threshold 2 (`for-judges.md`). **[only if]** the refund of the day filmed has landed: on 23 Sep gift 1 still held 2.857148 AUSD refundable after it was finalised (`refundableBalance(1)` on the earlier contract), so film a day whose refund is on the chain. **[only if]** the judges page's owner line has been corrected; today it names a single wallet and must not be filmed |
| 2:50 to 3:00 | The one sentence of trust, on the judges page | "What is on trust: our key signs the readings we verified. Everything else is on the chain." | `for-judges.md`, "The trust assumption" |

Not in this video, because not true yet: a card payment that arrives and a euro payout that lands in a bank account (the
euro leg converted once on 16 Sep; the arrival is unrecorded, `docs/OPERATIONS.md`); a gift between two countries; a
gift from somebody outside the team; any count of users.

## Pitch, 2 minutes

| time | on screen | said |
|---|---|---|
| 0:00 to 0:15 | A phone, a message arriving: a link, "Maman" | "Money sent with no strings vanishes without a trace. People who want to back someone's goal from far away have two choices: send it and hope, or not send it." |
| 0:15 to 0:35 | Home, the card, "Offer a gift" | "Viky is a third choice. You put the money in their name, for a goal you both agree on. It becomes theirs as they do it, a day at a time. What they don't do comes back to you. Nobody else ever profits from a missed day." |
| 0:35 to 0:55 | The recipient's first screen: the whole amount, theirs, draining | "They see the whole amount as theirs from the first second, and they see it leave. In a randomised trial, that framing, money allocated up front and removed per missed day, was the only one that did better than no money at all." (Patel, Volpp et al., Annals of Internal Medicine, 2016, n = 281; say the citation on screen) |
| 0:55 to 1:15 | The chooser: the conditions offered | "It only pays for what a source can prove: a Duolingo lesson each day, a Chess.com rating reached. Viky reads the source's own servers, and anybody can re-check a credited day." **[only if]** say only the conditions that have carried a gift on the day; on 23 Sep that is Duolingo and the Chess.com rating |
| 1:15 to 1:35 | Face ID, then "$… is in …'s name" | "No app to install, no password, nothing to write down: a passkey. The person it is for never meets a wallet or a fee." |
| 1:35 to 1:50 | The judges page | "It runs on Monad mainnet, in AUSD, today: our first six gifts are made, and one has run from start to finish, a day earned and taken, the missed days going back to the funder." (the six are the team's own) |
| 1:50 to 2:00 | The card, empty, "Offer a gift" | "Viky. The money is already in their name." |

The pitch says nothing about fees, about bank transfers, about lasting change, or about numbers of users. If five real
gifts between people outside the team exist by filming day, 1:35 says so, with the count read from the chain that day.
