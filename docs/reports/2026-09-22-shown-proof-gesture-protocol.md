# The gesture of a shown proof, measured on real phones (protocol, 22 Sep 2026)

Point 4 of the shown-proof plan (D162). D25 recorded that on Android a connected check-in costs an app install per
device and that the iPhone App Clip was never tested. Nothing in this repository can measure a phone: this page is
the protocol, and the numbers come from whoever holds the phones. A number that is not in a box below has not been
measured, and nothing in the product may claim it.

## Before anybody measures

Every box stays empty until all three are true.

- [ ] Production holds the **Viky** application's `RECLAIM_APP_ID` and `RECLAIM_APP_SECRET` (OPERATIONS, "The
      Reclaim account"): today both are empty, so `/api/proof/session` answers "The Reclaim application is not
      configured" and there is nothing to measure.
- [ ] A gift exists on a shown condition (PR 2, the TOEFL score) and its link is on the phone being measured.
- [ ] The person measuring holds the ETS account the gift is for, and signs in to it themselves. Nobody else types
      that password, and it is written nowhere.

## What one run is

One run is the whole gesture, timed from the press on **Show it** to the moment the gift's page says **Shown: …**,
with the phone held as a person would hold it and nothing prepared in advance. Two runs per phone: the **first**,
on a phone that has never done it (this is the install cost), and the **second**, right after, on the same phone
(this is whether the sign-in persisted). Count a gesture as one tap, one typed field, one system prompt answered,
or one app switch; the count is what a person feels, not what the code does.

## Android (the corridor's phone)

| | first run | second run |
|---|---|---|
| phone, Android version, browser | | |
| the gift's link opened from (message app, browser) | | |
| gestures, from "Show it" to "Shown" | | |
| of which: the Play Store install of the Reclaim Verifier | | |
| of which: the ETS sign-in (fields typed, prompts answered) | | |
| time, seconds, from "Show it" to "Shown" | | |
| did the deferred link bring the person back to the flow by itself after the install (yes / no / what happened) | | |
| did the ETS sign-in persist in the verifier between the two runs (yes / no) | | |
| what the consent screen named as the application asking ("Viky", or another name) | | |
| where the run stopped, if it did, in the screen's own words | | |

## iPhone (App Clip, never tested)

| | first run | second run |
|---|---|---|
| phone, iOS version, browser | | |
| the gift's link opened from (message app, browser) | | |
| did the App Clip open, or the App Store, or nothing (what happened) | | |
| gestures, from "Show it" to "Shown" | | |
| of which: the ETS sign-in (fields typed, prompts answered) | | |
| time, seconds, from "Show it" to "Shown" | | |
| did the ETS sign-in persist between the two runs (yes / no) | | |
| what the consent screen named as the application asking | | |
| where the run stopped, if it did, in the screen's own words | | |

## What is written back

- The two tables, filled, copied into `docs/DECISIONS.md` as the decision that follows D163, with the day and the
  phones. The numbers replace D25's "to be tested" and nothing else does.
- If a run stopped: the screen's sentence and the server's typed code (`code` in the answer of `/api/proof/verify`,
  or the session route's `error`), so the refusal is demonstrable and not remembered.
- The application's name on the consent screen, as read: if it is not "Viky", the wrong application's keys are in
  production (OPERATIONS, "The Reclaim account").

## What this protocol does not measure

Whether the proof is worth anything: that is the verify route, the TEE attestation and the contract, and they are
tested without a phone. Whether a person would do this twice a month: that is a question for the five real users,
not for a stopwatch.
