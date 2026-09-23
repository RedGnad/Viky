# Security review of the money path, 23 Sep 2026

What this is: a read-only review of everything money passes through. That covers the three gift contracts and the
router, the on-chain verifier, the evidence signer and its EIP-712 attestations, the routes that create gifts and pay
them out, the way out (ExitRouter, Ramp, Mercuryo), and the passkey sessions. Nothing was fixed. Each finding gives
what was seen, how serious it is, the proof (a file and line, or a command anybody can repeat) and the fix proposed.
The founder decides what is done.

Read against `main` at `ee85f6e`, which is also what production serves (`curl -s https://viky.cash/serwist/sw.js`).
Chain figures were read on Monad mainnet at block 107,254,273 (23 Sep 2026, 06:51 UTC) with `cast` against
`https://rpc.monad.xyz`.

**Before the repository goes public.** This report describes weaknesses that are still open, two of them with enough
detail to act on. Either they are closed first, or this file waits until they are.

## Summary

| # | finding | severity |
|---|---|---|
| 1 | The Alchemy RPC key is public on `/judges` and in the browser bundle | high, fix now |
| 2 | Any signed-in account can burn the relayer down to its reserve, and then every relayed action and the daily pass stop | high (availability) |
| 3 | The evidence signer is one hot key; whoever holds it can take every gift nobody has opened yet | high (disclosed trust assumption) |
| 4 | The live readings are not checked for a TEE attestation, and the daily Duolingo reading does not pin its patterns or its age | medium |
| 5 | `/api/proof/session` takes the phase, the profile and the condition from the browser | medium (latent) |
| 6 | The funder's MON is sent wherever the exchange's API says | medium |
| 7 | The floor of a way out comes only from the exchange's own quote | medium |
| 8 | The session cookie alone can re-issue a gift's link | medium |
| 8 bis | A finished gift's last refund is never sent by the passes; 2.857148 AUSD of gift 1 wait in the contract | medium (money path) |
| 9 | The way out can say "Nothing was taken" after money was taken | low, and an honesty rule |
| 10 | The judges page names the wrong owner of the contracts | low, and an honesty rule |
| 11 | Smaller items (claim key in URLs, claim not reconciled, cron compare, sessions not revocable, origin check, errors, headers, stale exits) | low |
| 12 | What the owner can do, and what the contracts leave to trust | info |

## What holds

- **One signature says everything, on all four contracts.** The EIP-3009 nonce of a funding is the hash of the gift's
  terms (`GiftEscrow.sol:264-266`, `MilestoneGift.sol:325-327`), and that of an exit the hash of its terms, the exchange
  calldata included (`ExitRouter.sol:158-167, 204`). The three tags differ, so a signature spends on one contract only.
  `receiveWithAuthorization` requires the caller to be the recipient, so nobody can front-run the pull, and its typehash
  differs from `transferWithAuthorization`.
- **No attestation replays across contracts.** EIP-712 domains are `Viky Gift` and `Viky Milestone`, chain 143, with the
  contract address (`GiftEscrow.sol:234`, `MilestoneGift.sol:291`); the two `GiftEscrow` deployments differ by address.
  The server signs for the contract the gift record names (`src/relayer.ts:90-96`).
- **Money only goes where it belongs.** Earned money goes to the bound recipient or to a destination the recipient
  signed (`GiftEscrow.sol:421-439`); unearned money only to `refundTo`, fixed in the signed terms (`:444-462`); exit
  proceeds only to the payer who signed (`ExitRouter.sol:250-259`). Every push is checked by balance
  (`GiftEscrow.sol:590-594`, `ExitRouter.sol:215, 259`). The day arithmetic keeps credited plus drained plus dust equal
  to the amount (`GiftEscrow.sol:496`).
- **Guards.** Attestation freshness ten minutes and skew one minute (`GiftEscrow.sol:581-588`), nullifiers,
  identity binding, provider pinned per goal, shape pinned per goal (`MilestoneGift.sol:342`), pauses that never
  take a milestone reached in time (`MilestoneGift.sol:689-691`, D89), `nonReentrant` on every function that moves money.
- **The router.** Allowlist plus pin of the forwarding target (`ExitRouter.sol:193-201`); the allowance reset to zero
  whatever happened (`:217-220`); `minOut` checked on the balance (`:223-224`); exchange never the token, the router or
  the output coin (`:183-190`); ownership cannot be renounced (`:308-310`). It holds 0 AUSD today.
- **Owners.** All four contracts answer `owner() = 0xE08D926c148A5065F4Df2892702785a183de86F9`, a Safe with threshold 2
  and three owners (`getThreshold`, `getOwners`, read 23 Sep).
- **Sessions.** `__Host-` cookie, `Secure; HttpOnly; SameSite=Lax`, HMAC with the purpose in the signed string and a
  timing-safe compare, origin bound, secret refused under 32 characters (`src/account-auth-server.ts:15, 68-74, 96-125,
  225, 287, 343`). The account always comes from the cookie, never the body (create `app/api/gift/create/route.ts:122`,
  send `app/api/send/route.ts:92`, withdraw `app/api/gift/withdraw/route.ts:70`, exit `app/api/exit/prepare/route.ts:34`,
  claim `app/api/gift/claim/route.ts:40`). The passkey's PRF output is zeroed after the key is derived
  (`src/account/mera.ts:128`).
- **Claim keys.** 24 random bytes, only a tagged hash stored, timing-safe compare, single use (`src/gift-store.ts:141-155,
  279-307`). Exit tickets are HMAC-signed, bound to the account and short-lived (`src/exit-ticket.ts:31-76`).
- **The on-chain verifier.** `VikyReclaimVerifier` is not deployed and fails closed
  (`LIVE_SCHEMA_CONFIRMED = false`, `contracts/verifiers/VikyReclaimVerifier.sol:21, 100`).
- **Dev routes.** 404 unless `VIKY_DEV_PAGES=1` and the account is an operator (`src/dev-access.ts:21-42`).

## 1. The Alchemy RPC key is public (high, fix now)

- **Seen.** `https://viky.cash/judges` prints the whole RPC URL, key included (`app/judges/page.tsx:49`, from
  `src/monad/chain.ts:25-26`, which reads `NEXT_PUBLIC_MONAD_RPC_URL`). Being `NEXT_PUBLIC_`, it is also in one served
  JavaScript chunk. Not in git. Details in `docs/reports/2026-09-23-secrets-history.md`, section 4.
- **Why it matters here.** The relayer and the gift readers use the same URL (`src/relayer.ts:60`,
  `src/gift-reader.ts:42`), so exhausting the quota stops relaying.
- **Fix.** Regenerate the key. Give the server a server-only variable. If the browser needs Alchemy, give it a separate
  key restricted to `viky.cash`. Print the public endpoint on the judges page.

## 2. The relayer can be burned down to its reserve (high, availability)

- **Seen, on the chain.** The relayer `0x150d3066F615FC012a40E7779dB748D53F7CCFE4` held 13.4333 MON, and it refuses to
  relay below 12 (`src/relayer.ts:30, 99-107`): about 1.43 MON of headroom. Monad charges the declared limit. The exit
  of 16 Sep used 666,789 gas at 102 gwei, 0.068 MON; a claim declares 107,500 gas, 0.011 MON (`docs/spikes/KT1.md`).
- **Seen, in the code.** Nothing bounds how often one account makes the relayer pay:
  - `/api/send` relays any EIP-3009 transfer of at least one unit, to any address, the sender's own included
    (`app/api/send/route.ts:59, 92-114`);
  - `/api/gift/withdraw` relays any amount above zero (`:73`), and so does the milestone path (`src/milestone-routes.ts:131`);
  - `/api/exit/relay` checks `alreadySpent`, then broadcasts, with no claim on the row in between, so parallel calls for
    one signed exit all pass the simulation and all but one revert at full declared gas (`app/api/exit/relay/route.ts:55-80`);
  - `/api/gift/[id]/cancel` sends the funder up to 0.05 MON whenever their balance is below the cost, with no memory
    that it already did for that gift (`app/api/gift/[id]/cancel/route.ts:70-81`).
  - The only brake is an in-memory limiter per warm instance, keyed on address and account (`src/rate-limit.ts:26-32`,
    `relay: 20 per 10 minutes`, `:58`), which new accounts (free: a passkey) and new addresses step around.
- **Consequence.** Below 12 MON every relayed step answers `RESERVE_TOO_LOW`: claims, check-ins, withdrawals, exits, and
  the daily pass, which uses the same relayer (`src/daily-pass.ts`). Nobody's money is taken, but nobody can be paid and
  no day is counted until the relayer is topped up. Not demonstrated against production, on purpose.
- **Fix.** Claim the row before broadcasting (`UPDATE … SET state = 'sending' WHERE state = 'signed' RETURNING`) and
  store the hash on submission. A minimum for relayed sends and withdrawals (a dollar, or the whole balance when
  smaller). Record the cancel top-up per gift and pay it once. A daily MON budget per account and a global one, held in
  the database rather than in memory. An alert well above 12 MON.

## 3. The evidence signer is one hot key (high, disclosed trust assumption)

- **Seen.** `EVIDENCE_SIGNER_PRIVATE_KEY` is a Vercel variable (`src/gift-attestation.ts:29-33`,
  `src/milestone-attestation.ts:11-15`). The contracts accept any claim attestation it signs for a gift nobody has
  opened (`GiftEscrow.sol:324-338`, `MilestoneGift.sol:404-420`) and any progress it signs after that (`GiftEscrow.sol:348-399`,
  `MilestoneGift.sol:431-509`).
- **Consequence.** Whoever holds the key can open every unopened gift in an account of theirs, sign progress, and
  withdraw it. For a gift already opened, the money still only goes to the real recipient, so the loss is the funder's
  refund. At block 107,254,273 the four contracts held 7.428580 AUSD in total. The judges page already says the key is
  ours and replaceable; this sizes what it can do.
- **Fix.** The enclave route of `docs/reports/2026-09-18-enclave-signer.md`. Meanwhile, a smaller one: a separate key for
  claims, and a ceiling on what one opening can carry while the key is hot.

## 4. The live readings: no TEE attestation checked, and the daily one not pinned (medium)

- **Seen.** Every reading that settles money today is an attested fetch (zkFetch): the Duolingo day, the Duolingo
  course, Chess.com, DET, Coursera, Credly. The code says itself that no attestor TEE attestation is verified on that
  path (`src/duolingo-public.ts:229-234`); the verifier runs with `dangerouslyDisableContentValidation`
  (`src/attested-read.ts:228-244`) and checks the attestor's signature and address. The TEE is required, and AI proofs
  refused, on the shown-proof path only (`src/shown-verification.ts:120`, `src/reclaim-proof-set.ts:137, 178`), which is
  not configured in production (`RECLAIM_APP_ID` empty, OPERATIONS, 22 Sep).
- **Seen, the daily Duolingo reading.** `profileFromProof` checks the URL and the method (`src/duolingo-public.ts:122-128`)
  but neither the patterns the proof was read with nor its age. The newer reader checks the patterns
  (`src/attested-read.ts:75-81, 92`). The comment at `src/duolingo-public.ts:187` says the worker cannot forge a reading.
- **Consequence.** A compromised or wrong worker could hand back a genuine, signed reading made with a looser pattern, or
  an old one, and the evidence signer would sign it. And the sentence "every Reclaim proof is verified server side with
  the TEE attestation required" (CLAUDE.md, README "Verification path") is true of a path production does not run, not
  of the one it does. That matters for what the judges are told.
- **Fix.** In `profileFromProof`, the same `sameMatches` as `attested-read.ts`, and a refusal past ten minutes or in the
  future. Either verify the attestor attestation and pin its image digest on the zkFetch path, or narrow the sentence to
  what is checked. Refuse to start with `PROOF_VERIFIER=local` and no pinned digest (`src/proof-verification.ts:18-20`).

## 5. `/api/proof/session` trusts the browser (medium, latent)

- **Seen.** The route takes `conditionId`, `phase`, `dayIndex`, `giftId` and `username` from the body
  (`app/api/proof/session/route.ts:43-66`). It never checks the caller is the gift's recipient, never compares the
  username with the account the funder named, and skips the refusal `NAMED_BY_FUNDER` that
  `app/api/gift/[id]/account/route.ts:36` applies.
- **Consequence.** Once `RECLAIM_APP_ID` is set in production (planned for the shown proofs, D162), a recipient could
  open a baseline on a Duolingo account the funder never named, and the contract binds whichever identity arrives
  first (`GiftEscrow.sol:364-372`). Today the route answers "not configured", and no gift is at risk; the Duolingo
  session provider id is not registered on either contract, so a wrong-condition proof is refused on chain.
- **Fix.** Load the gift, require the caller to be its recipient, take the condition from the gift record, the profile
  from the gift's bound or named account, and the phase and day from the gift's state.

## 6. The funder's MON goes wherever the exchange's API says (medium)

- **Seen.** `/api/fund/quote` returns Kuru's answer untouched (`app/api/fund/quote/route.ts:31-32`), and the funder's
  account sends it as is: `sendWithExplicitGas(account, { to: quote.to, data: quote.data, value: BigInt(quote.value) })`
  (`app/components/PayGift.tsx:336-337`). The exit path, by contrast, checks the quote's target against the configured
  exchange (`app/api/exit/quote/route.ts:63`).
- **Consequence.** A compromised or wrong Kuru answer sends the funder's MON to any contract, for any amount.
- **Fix.** On the server and again in the browser: the target equals the pinned exchange, the value equals the amount
  asked, the selector is a known swap.

## 7. The floor of a way out is the exchange's own number (medium)

- **Seen.** The signed minimum is Kuru's `minOut` (`src/kuru.ts:44-50`, `app/api/exit/quote/route.ts:65`), refused only
  when zero. D55 item 4 already records it.
- **Fix.** A bound of our own before the ticket: stablecoin to stablecoin at least the amount less 0.5 %; to MON, within a
  stated distance of a second price already fetched.

## 8. The cookie alone re-issues a gift's link (medium)

- **Seen.** `POST /api/gift/[id]/link` rotates the claim key with the session cookie only
  (`app/api/gift/[id]/link/route.ts:28, 37, 44-47`). The cookie lasts twelve hours (`src/account-auth-server.ts:14`),
  longer than the signing session. Every other route that decides where money goes needs a fresh signature.
- **Consequence.** Anyone with a funder's unlocked browser, or a script on the page, can take a new link and open the
  gift in their own account; the funder's link stops working.
- **Fix.** A short signature from the passkey naming the gift and the rotation, checked by the route.

## 8 bis. A finished gift's last refund is never sent (medium, money path)

- **Seen, on the chain.** Gift 1 on the earlier contract is finalised with 6 days drained, yet only 14.285710 of its
  17.142858 unearned AUSD went back: `cast call 0xE04CD59bB93765333200a9da01df83149D4C4d67 "refundableBalance(uint256)(uint256)" 1`
  answers 2857148 (the last drained day and the rounding dust) at block 107,254,273.
- **Seen, in the code.** The counting pass (00:30 UTC) drains and finalises but does not refund (`COUNTING_PASS`,
  `refund: false`, `src/daily-pass.ts:43`); the settling pass, the only one that refunds, skips every gift already
  finalised: `if (gift.cancelled || gift.finalised) continue;` (`src/daily-pass.ts:249`). A gift finalised by the counting
  pass is therefore never refunded again by either pass.
- **Consequence.** The funder's last day and the dust stay in the contract. Nothing is lost: `refundUnearned` can be
  called by anybody and only pays `refundTo` (`GiftEscrow.sol:444-462`). But the screens say a missed day comes back by
  itself, and for the last one of a finished gift it does not.
- **Fix.** In the settling pass, skip only gifts with nothing refundable: for a finalised gift, call `refundUnearned` when
  `refundableBalance > 0`. Then send gift 1's 2.857148 AUSD back once, from the keeper, and read the balance again.

## 9. "Nothing was taken", after money was taken (low, honesty rule)

- **Seen.** The deadline is checked before `alreadySpent` (`app/api/exit/relay/route.ts:50-58`). An exit broadcast whose
  function timed out before finality leaves the row `signed` with no hash; a retry after the deadline reads "This took
  too long. Nothing was taken." although the exchange ran. `retireExpiredExits` retires such a row without asking the
  token (`src/exit-store.ts:215-221`). A `stale` row can still be relayed (`relay/route.ts:37`), and a signature is
  attached after a shape check only (`:39-47`).
- **Fix.** Ask `alreadySpent` first. Retire a row only after `authorizationState`. Relay only `signed` rows. Recover the
  signer before attaching a signature.

## 10. The judges page names the wrong owner (low, honesty rule)

- **Seen.** `app/judges/page.tsx:62-78`, served today, says one wallet owns all four contracts,
  `0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64`, "the founder's", and that no second key can act. The chain answers the
  Safe `0xE08D926c…86F9`, two signatures of three, since 20 Sep. The same drift is in `docs/OPERATIONS.md:13` (the
  router's owner) and in the table of `docs/reports/2026-09-18-money-paths.md`, which was right on the day it was written.
- **Fix.** Read the owner from the chain on that line, as the page does further down, and say it is a Safe of three
  project keys. Not mine to change; reported to the owner of the public pages.

## 11. Smaller items (low)

| item | proof | fix |
|---|---|---|
| The claim key travels in a query string (`/g/<id>?t=`), so request logs hold it; whoever reads the logs can open an unopened gift | `app/api/gift/create/route.ts:188`, and `?t=` again on status reads (`src/milestone-routes.ts:54`) | carry it in the fragment, send it in POST bodies |
| A claim that lands on chain and fails to record locks the recipient out (`AlreadyClaimed` on retry) | `app/api/gift/claim/route.ts:40-41` | read the recipient back from the chain and reconcile, as creation does (D87) |
| The cron secret is compared with `!==` | `app/api/cron/daily/route.ts:12`, `app/api/cron/settle/route.ts:16` | `timingSafeEqual` on digests |
| A session cannot be revoked before its twelve hours; a signed challenge can make several sessions for five minutes | `app/api/account/session/route.ts:60-62`, `src/account-auth-server.ts:229-272` | a per-account "valid after", used challenge nonces kept until expiry |
| Eleven POST routes skip the same-origin check and rely on `SameSite=Lax` alone | e.g. `app/api/gift/certificate/create/route.ts:39`, `app/api/gift/[id]/notify/route.ts:52`, cancel, link, bind, count | `readJsonBody` or `assertSameOrigin` at the top of each |
| The certificate create route stores names without `giftNameProblem` | `app/api/gift/certificate/create/route.ts:129-130` | `checkedName` like the other create routes |
| Unrecognised errors are returned as raw text | `app/api/proof/session/route.ts:109`, `app/api/proof/verify/route.ts:118` | a generic sentence, the detail in the log |
| No CSP nor `frame-ancestors` in `next.config.mjs` or `vercel.json` (not checked in the dashboard) | | a strict policy; it matters because of finding 8 |
| One Kuru rate-limit identity (the router) for every user's quote | `app/api/exit/quote/route.ts:62` | a global limiter on outbound quotes |

## 12. What the owner can do, and what stays on trust (info)

- **The Safe (two of three) can** register goals, replace the evidence signer, pause creation and readings on every gift
  contract, and allow or close exchanges and sweep the router. Replacing the evidence signer is equivalent to finding 3.
- **A pause of `MilestoneGift` readings also stops `expire`** (`MilestoneGift.sol:518`), so a pause that is never lifted
  keeps every unsettled milestone gift's money in the contract. Nothing can be taken by it; nothing can come back either.
- **A pause of `GiftEscrow` check-ins does not stop `drain`**, so a pause across a day costs the recipient that day. Known
  and accepted (D49).
- **`GiftEscrow` can still be renounced** (OpenZeppelin's `Ownable` as it comes); `ExitRouter` cannot. Written in
  OPERATIONS.
- **Ceilings.** The contracts accept up to 100,000 AUSD a gift (`GiftEscrow.sol:54`); the pilot ceiling of $1,000 is held
  off chain by the three create routes (D107).
- **The router** hands any leftover input back to the payer, bounded by one exit's amount (`ExitRouter.sol:243-245`),
  and relies on the pinned Kuru target not moving other people's tokens. The pin watches the forwarder, not the internal
  state of the target (`:194-201`). Anyone may submit an exit; the payout still goes to the payer.
- **The on-chain verifier**, when it is deployed, trusts one pinned witness and reads the TEE fields as strings under
  that witness's signature (`VikyReclaimVerifier.sol:285-301`); it does not verify an enclave attestation itself.

## How this was done

The contracts and the verifier were read line by line. The routes were read in three parallel read-only passes
(sessions and authentication; the way out; creation, payout and the evidence signer). Every finding rated medium or
above was then read again at the cited lines before being written here. The relayer's balance, the gas of a real exit,
the owners, the Safe's threshold and owners, the signers and the balances are chain reads anyone can repeat with the
commands in the text.
