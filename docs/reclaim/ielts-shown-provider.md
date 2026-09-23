# Our IELTS provider: the overall band on the British Council's Test Taker Portal, shown (D176)

No provider of the Reclaim directory reads an IELTS result (the directory searched by its API on 23 Sep 2026: "IELTS"
answers nothing, "British Council" nothing, "IDP" only identity providers of universities). So this one is ours,
registered on the Reclaim dashboard from a real test taker's session: nothing below has been captured yet, every field
is **to confirm**, and the code reads `overallBand` and nothing else (`readIelts` in `src/exam-shown.ts`).

## Two portals, one provider tonight

IELTS results are shown by the centre the test was booked through. The British Council's Test Taker Portal,
`https://ieltsregistration.britishcouncil.org/ttp`, signs the test taker in through the British Council's identity
service (`eamidentity.britishcouncil.org`, "Enter your email address to create an account or log in", read 23 Sep 2026)
and, its own page says, lets them "view and download your IELTS results online as soon as they are available"
(takeielts.britishcouncil.org, "Test Taker Portal", read the same day). This line's provider is that portal.

IDP's results page (`https://ielts.idp.com/results/check-your-result`) asks no account: given name, surname, date of
birth and passport or ID number, then "Get results", and says "Your results available online are not official. They
are provisional only until you receive your official Test Report Form (TRF)". It is a provider of its own, to register
the same way from a real IDP test taker's session; the register takes one provider per condition today, so a test
taker who booked through IDP is not served yet, and the four answers say so. The day both exist, the choice between
the two is the person's, on their gift's page, which is a screen of the other developer's.

## The band

Bands run from 1 to 9 in whole and half bands (British Council, "IELTS band scores", read 23 Sep 2026): 6.5 is the
band most universities ask for. A band is carried to the contract in tenths, 6.5 as 65, and the funder's target is
signed the same way, so `NotThereYet` compares like with like.

## What is extracted

| field, as the row names it | what it is | to confirm |
|---|---|---|
| `overallBand` | the overall band, "6.5", the metric the contract compares in tenths | the request the results page makes and the JSON path or regex of the band |
| `listening`, `reading`, `writing`, `speaking` | the four component bands | not read tonight |
| `testDate` | the day of the test | not read tonight; the day it is shown is the event, as for the TOEFL, until a date comes out |

## The definition to register (to confirm on a real account)

```json
{
  "name": "IELTS result, British Council Test Taker Portal (Viky)",
  "loginUrl": "https://ieltsregistration.britishcouncil.org/ttp",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "to confirm: the request the results page of the portal makes once signed in",
      "method": "GET",
      "responseMatches": [{ "type": "contains", "value": "to confirm: the overall band as the answer prints it, {{overallBand}}" }],
      "responseRedactions": [{ "jsonPath": "to confirm", "regex": "to confirm" }]
    }
  ]
}
```

Once published: the provider id, its version and the hash of its one request go into `EXAM_PROVIDERS["ielts-shown"]`.


## When the page does not carry it

A page that carries no field the pattern names, or a word the pattern refuses, fails by its name before anything is
signed (`INVALID_BAND`): the person is told what was not found and that nothing is lost, the gift staying theirs to earn
until its deadline; the journal of the gift carries the event as a reading refused by that name, with no number and
no proof; the founder reads the session's fields with `pnpm verify:day` and corrects the pattern in one commit.
Nothing is ever guessed from a selector: every pattern below sits on a label the page prints for the person.

## The terms, as read on 23 Sep 2026

The British Council's Terms of Use (britishcouncil.org/terms, "apply when you use any British Council Digital
Services", last updated 29 May 2020), section 5, "What are my obligations": you must not "copy British Council Content
unless permitted under these Terms of Use", "modify, delete, interfere with or misuse data contained on British
Council Digital Services", "attempt to hack into British Council Digital Services"; and, once registered, "keep secret
your login details (including your password)". No clause names automated access, robots or scraping. What Viky does:
the test taker signs in themselves, in their own browser, and their password reaches nobody; a witness in a TEE
attests the one response, and Viky keeps the band it carries with the gift. A person reading their own result is not
the copying of British Council Content those terms forbid, and it modifies nothing; that reading is written on the
judges' page, and it is the founder's call before the line opens.
