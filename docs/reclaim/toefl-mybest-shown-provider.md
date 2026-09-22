# Our own TOEFL provider: the score, and an attempt at the date and the name (D164)

The provider Viky pins today is Reclaim's "TOEFL MyBest Score" (`67ec1b13-b206-4fac-a78c-fbd5a2af55b3`, version
1.0.0), read from the directory on 22 Sep 2026. It extracts two fields and no more: the total score and a booking id.
No test date, no name. That is why the condition is a possession, "show a score of at least X", and why the day it
is shown is the event (D162, decision 2).

A provider is a configuration file: the page behind a sign-in, one request, and what to take from its answer. This
is the definition of ours, the same request with two more fields attempted. It is registered on the Reclaim
dashboard (signed in, "New provider", the developer tool), which needs a real ETS account signed in to capture the
answer's shape: nothing here has been captured yet, so the two new fields are **to confirm**, and nothing in the
code reads them.

## What is known, from the pinned provider's own configuration

```json
{
  "name": "TOEFL MyBest Score, with the date and the name (Viky)",
  "loginUrl": "https://v2.ereg.ets.org/ereg/public/jump?_p=TEL",
  "verificationType": "WITNESS",
  "injectionType": "MSWJS",
  "requestData": [
    {
      "url": "https://v2.ereg.ets.org/ereg/pbs/getPbs\\?testId=(.*)?&source=(.*)?$",
      "urlType": "REGEX",
      "method": "GET",
      "responseMatches": [
        { "type": "contains", "value": "\"scoreValue\":\"{{scoreValue}}\"" },
        { "type": "contains", "value": "\"bookingId\":{{bookingId}}" }
      ],
      "responseRedactions": [
        { "jsonPath": "$.scores.TOTAL.scoreValue", "regex": "\"scoreValue\":\"(.*)\"" },
        { "jsonPath": "$.scores.LISTENING.bookingId", "regex": "\"bookingId\":(.*)" }
      ]
    }
  ]
}
```

## What is attempted, to confirm on a real account

The endpoint carries a `testId`, and the MyBest page shows the test dates and the candidate's name, so the same
answer very likely carries both. The two matches below are guesses at the field names; the person who captures the
answer with the developer tool replaces them with what the JSON actually says, and nothing is claimed before.

```json
{
  "responseMatches": [
    { "type": "contains", "value": "\"testDate\":\"{{testDate}}\"", "toConfirm": "the field's real name and format in $.scores.TOTAL or beside it" },
    { "type": "contains", "value": "\"fullName\":\"{{fullName}}\"", "toConfirm": "whether the name is in this answer at all, or only on the page" }
  ],
  "responseRedactions": [
    { "jsonPath": "$.scores.TOTAL.testDate", "regex": "\"testDate\":\"(.*)\"" },
    { "jsonPath": "$.fullName", "regex": "\"fullName\":\"(.*)\"" }
  ]
}
```

## What changes the day the date comes out

`testDate` becomes `eventAt` in the shown register's `read`, the contract's `EarnedBeforeTheGift` applies, the
condition's words become "reach", and it takes its own goal number: `registerGoal` never overwrites, and the "show"
sense under goal 13 stays what it is for the gifts made on it. The name, if it comes out, is what the funder could
sign into the subject again, as a certificate does; that is a further decision, not this one.
