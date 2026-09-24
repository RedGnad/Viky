# Our WAEC provider: WASSCE credits on the person's own result, shown (D217)

Unverified on a live result: the patterns below were checked on a real result published in a public repository
(Bappa-Kamba/credly, `backend/sample_result.html`, WASSCE for school candidates 2018), and the provider is registered
from a real result of the checker as it is today.

## The page

- `https://www.waecdirect.org/`: five fields, the examination number (10 digits), the year, the type (`MAY/JUN` for
  school candidates, `NOV/DEC` for private ones), the card's serial and its PIN. No captcha (read 24 Sep 2026).
- The page's own script posts the five values as JSON to `/Result/EncryptPayload`, which answers `{ success, q }`, a new
  token each time, then opens `/Result/Display?q=<q>`. A card that does not exist lands on
  `/Result/Error?errTitle=INVALID CARDS SUPPLIED.`
- The result: `tbCandidInfo` (examination number, candidate's name, examination, centre), `tbSubjectGrades` (a subject
  and its grade per row), `tbCardInfo` (how many of the card's uses are spent), `tbWithHeld` (empty unless WAEC withholds
  something).

## What is extracted

| field | what it is | unverified |
|---|---|---|
| `examination` | "WASSCE FOR SCHOOL CANDIDATES 2018": the year, judged against the gift's year | the wording of this year's results |
| `grades` | the whole `tbSubjectGrades` table, counted in memory by `readWaecResult` | none on the 2018 page |
| `withheld` | the content of `tbWithHeld`, which must be empty | a withheld result's markup |

The name, the examination number and the centre are not extracted. Only the count of credits is kept (D185).

## The definition to register (unverified)

```json
{
  "name": "WAEC, WASSCE credits (Viky)",
  "loginUrl": "https://www.waecdirect.org/",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "https://www.waecdirect.org/Result/Display?q={{q}}",
      "method": "GET",
      "responseMatches": [
        { "type": "regex", "value": "(?<examination>WASSCE[^<]{0,80})</td>" },
        { "type": "regex", "value": "(?<grades><table id=\"tbSubjectGrades\"[\\s\\S]*?</table>)" },
        { "type": "regex", "value": "<table id=\"tbWithHeld\"[^>]*>(?<withheld>[\\s\\S]*?)</table>" }
      ],
      "responseRedactions": [
        { "regex": "(?<examination>WASSCE[^<]{0,80})</td>" },
        { "regex": "(?<grades><table id=\"tbSubjectGrades\"[\\s\\S]*?</table>)" },
        { "regex": "<table id=\"tbWithHeld\"[^>]*>(?<withheld>[\\s\\S]*?)</table>" }
      ]
    }
  ]
}
```

`q` stays a hidden parameter: it is a key to the result, derived from the card.

## When the page does not carry it

A page without a WASSCE result (`NO_RESULT`), a result WAEC withholds (`RESULT_WITHHELD`) or one of a year before the
gift's (`AN_EARLIER_RESULT`) fails by its name before anything is signed; the person is told nothing is lost.

## The terms, read 24 Sep 2026

waecdirect.org carries WAEC's data privacy policy and no terms of use; no `robots.txt` (404). The fuller policy on
waecnigeria.org tells the holder of an access code WAEC allocates to treat it as confidential: "you must not disclose it to any
third party". The card's PIN is one, so the line is shown, and the card is typed on WAEC's page by the person. Each opening
spends one of the card's uses (the 2018 card said "4 of 5").
