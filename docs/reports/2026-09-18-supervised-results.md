# A gift on a supervised result: which source we wire, and how (U3, 18 Sep 2026)

The question, as the founder put it: a result nobody can fake, so a gift can hang on it. Four candidates. Every
page below was read from this machine on 18 Sep 2026, without an account, and every line says what it was read
against. Nothing here is deployed and nothing touches production.

## The verdict, source by source

| Source | Is the result supervised | The public page, and what it shows | Read by a server, without JavaScript | Their terms on automated access | Verdict |
|---|---|---|---|---|---|
| **Duolingo English Test** | Yes, and it is the only one of the four: recorded session, valid identity document, human examiners | Only once the taker presses "Get Shareable Link": "This makes their certificate public, and it makes the URL link appear on the certificate" (help centre, read today). The page is `certs.duolingo.com/<alias>` | The page itself is a 6 KB shell with no score in it. The score comes from `certs.duolingo.com/certificates/data?alias=<alias>`, which answers an anonymous request with `overall_score`, `full_name`, `test_date`, `subscores`, and also `date_of_birth` and a photo link. Measured on two live certificates; a withdrawn one answers 403, an expired one 400 | DET terms (updated 6 Aug 2026) are supplemental to the Duolingo terms (revised 8 Sep 2025): "You may not use any data mining, robots, scraping, or similar data gathering or extraction methods to obtain Service Content." The same clause already covers the daily Duolingo reading we run today | **Wire it, first** |
| **Coursera** | Partly: one identity check per account, nothing said about supervising each assignment | `coursera.org/account/accomplishments/verify/<code>`, public, no account | Yes. Re-measured today on a real certificate: 200, and the answer carries `firstName`, `lastName`, `courseId`, `certificateCode`, `grantedAt` in the HTML itself. This is what `COURSERA_CERTIFICATE` already reads | Terms effective 1 Jan 2026: "Without prior written consent from us, you also aren't allowed to: Visit or use our Services for any form of content, data, or text scraping ... through manual, mechanical, or automated means" | **Keep it, second**, and ask for the written consent their clause names |
| **edX** | **No, not any more**, and its own certificate says otherwise | `courses.edx.org/certificates/<32 hex>` and `credentials.edx.org/credentials/<32 hex>/`, public | Yes. Two real certificates measured today with no cookies: 200, and the type, the course, the holder and the date are in the HTML | Terms updated 3 Nov 2025 forbid access "through the use of any engine, software, tool, agent, device, or mechanism (including spiders, robots, crawlers, and data mining tools) other than the software or search agents provided by edX" | **Set it aside** |
| **Lichess** | No identity at all, internal police only, exactly like Chess.com | `lichess.org/api/user/<name>`, public, documented | Yes, one answer carries everything | The API is published for this, with its own rule: "Only make one request at a time", 429 otherwise. Terms updated 1 Aug 2026 | **Wire it**, as the twin it is, not as a supervised result |

**Why edX is set aside, and it is not about the terms.** A certificate issued on 8 March 2026, read today, still
prints that the learner completed the course "as well as having their photo ID checked to verify their identity".
edX announced on 29 Nov 2021 that it "will be disabling ID verification as a requirement for certificates and
proctoring in January", replaced by the learner reaffirming the honour code. So the sentence on the page is no
longer true of the check behind it. A gift on a result nobody can fake cannot rest on a page whose own claim about
identity has stopped being true. The reading itself is sound, so edX stays available the day we want "a course
finished" rather than "a result supervised".

## What the two open questions of D49 should be

**One certificate may pay several gifts, one per funder.** A gift is one person's promise, and two aunts who
each promise money for the same graduation both mean it. Refusing the second would return money to a funder
whose condition was genuinely met and pay nothing to the recipient who met it, which is the one thing the
product says never happens. The abuse this seems to open is already shut by promise 7: the granting day must
fall on or after the day the funder paid and on or before the deadline, so an old certificate pays nothing and
"collecting" would need several people who each paid before the thing existed. *The risk of this choice*: a
recipient about to obtain a certificate can accept several gifts for one effort, and each funder may believe
they are the only one. That is worth one sentence on the check screen, not a rule in the contract. *The risk of
the opposite choice*: the second gift can never settle, its money waits for the deadline, and the recipient is
refused something they earned, for a reason no screen can explain.

**The nullifier is scoped to the reading, never to the certificate, and it carries the gift.** For the
certificate shape the attestor derives it from the provider, the gift, the certificate's own identifier, the
granting day and the proof set hash, so two gifts proving the same certificate produce two different nullifiers
and both settle. This is not a preference: `MilestoneGift` keeps `usedNullifiers` in one mapping for the whole
contract, so a nullifier derived from the certificate alone would be burned by the first gift and every later
gift for that certificate would revert as already used, permanently, with nothing on any screen able to say why.
Replay across gifts does not need the nullifier to stop it: the attestation signs the gift id and the recipient,
so it cannot be moved. What the nullifier still does is stop the same attestation being submitted twice to the
same gift, which per-reading scope does. **Both answers belong in the attestor before the certificate shape is
built, and they hold whichever source is retained.**

## The plan for C3, on the Duolingo English Test

1. **Read three fields and no more**: `overall_score`, `test_date`, `full_name`. The answer also carries a date
   of birth and a link to the person's photograph. Those are matched by nothing, kept by nobody, and named on the
   privacy page for what they are: the attestor fetches the whole answer, we attest three fields of it.
2. **The name is what binds the certificate to the person.** The DET certificate has no field its holder can
   edit, so there is no short code as on Duolingo and Chess.com. The funder names the person at creation and the
   proof matches `full_name`. That leaves promise 9's gap exactly where D49 left it: a namesake's certificate
   would pass, and the gift still reaches only the account that opened the funder's link.
3. **Every reading re-checks the link.** 403 means the taker has taken their certificate private again, 400 means
   it has expired; both refuse, in the recipient's words, the way a closed Chess.com account does (U1).
4. **Two things their terms say that the screens must respect.** Duolingo "may invalidate the user's test results,
   even if those results have been previously certified, and notify all third parties that have received the
   user's results of the invalidation", and after two years a certificate "will be marked expired". So a gift on a
   DET result is short-dated by nature, and the deadline the funder signs should sit well inside the two years.
5. **The terms question is the founder's to settle, not mine.** Reading the endpoint automatically is the same act
   the Duolingo terms forbid, and the same act we already perform for every daily gift. It is not new exposure in
   kind; it is bigger in degree, because this page is a person's exam result. The honest move is a written request
   to Duolingo, and to Coursera whose clause names consent explicitly, before either condition is offered.
6. **Then the usual line**: one attested source, a `DET_CERTIFICATE` entry in the register with its words, the
   certificate shape already in `MilestoneGift`, one goal type registered by the founder, and a real gift run end
   to end before anything is called live.

## Lichess, what it takes

Cheapest of the four, and the only one whose owner publishes an API for exactly this. One answer carries what
Chess.com needs two pages for, so the two-half reading of `src/chess-reading.ts` becomes one proof.

- **Goals for the founder to register on `MilestoneGift`**: one per cadence, numbered above four, since one to
  four are Chess.com's. Bullet, blitz, rapid and classical to start; each with its own provider id of the shape
  `viky:provider:lichess-<cadence>-zkfetch:v1`, registered with `registerGoal` and fixed to the climb shape.
- **The reading**: `lichess.org/api/user/<name>` gives `perfs.<cadence>.rating`, `perfs.<cadence>.rd` and
  `perfs.<cadence>.prov`, plus `profile.bio`, which is editable by its owner and is therefore where the binding
  code goes. Measured today on a real account: rating 1722, rd 45 for blitz; `prov: true` on an unsettled one.
- **The police**: `disabled` ("only appears if a user's account is closed") and `tosViolation` ("only appears if a
  user's account is marked for the violation of Lichess TOS"), both in their published schema. Measured today:
  `disabled: true` on a real closed account. `tosViolation` was not seen on any account we read, so it is
  documented and not measured, and measuring it is part of the line rather than an afterthought.
- **The words**: a `LICHESS_RATING` condition beside `CHESS_RATING`, with its cadences, its standing path and its
  refusals, so no screen names a source in its own words.
- **The one thing to settle**: Lichess ratings and Chess.com ratings are not the same number for the same person.
  A funder who knows one and reads the other will be surprised, so the screen says which house the number is from.

## What is not settled

- No DET certificate invalidated for fraud was found to read, so "a blocked account loses its link" is known from
  their terms and from a withdrawn link answering 403, not from watching a fraud case.
- The endpoint the score comes from is the one their own page uses; it is not a published API, and it can change
  without notice. A gift already funded would then wait for its deadline, which is money held for a reason the
  funder never agreed to. That is the strongest argument for asking Duolingo in writing.
