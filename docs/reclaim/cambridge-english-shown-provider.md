# Our Cambridge English provider: the Statement of Results, shown (D176)

No provider of the Reclaim directory reads Cambridge English's Results Service for Candidates (the directory
searched by its API on 23 Sep 2026: "Cambridge" answers universities and colleges, nothing of Cambridge English).
So this one is ours, registered on the Reclaim dashboard ("New provider", the developer tool) from a real
candidate's session: nothing below has been captured yet, every field is **to confirm**, and nothing in the code
reads a field that the code does not name (`readCambridge` in `src/exam-shown.ts` reads `overallScore` and nothing else).

## The page, and who signs in

- Sign-in: `https://candidates.cambridgeenglish.org/Members/Login.aspx`, the Results Service for Candidates. The
  candidate registers once with the ID Number and the Secret Number printed on their Confirmation of Entry, then signs
  in with the ID Number and the password they chose (the portal's own words, read 23 Sep 2026). They type these in the
  verification tab, in their own browser; none of it reaches Viky.
- The page after sign-in: the Statement of Results, which carries "your result, the final grade you obtained for your
  exam; your overall score, your overall Cambridge English Scale score for the whole exam; your CEFR level; your
  individual component scores" and, for some exams, the test day photo (Cambridge English's support article "Cambridge
  English Exam results explained", read 23 Sep 2026). The photo is not extracted, not received, not kept.

## What is extracted

| field, as the row names it | what it is | to confirm |
|---|---|---|
| `overallScore` | the overall Cambridge English Scale score, 80 to 230, the metric the contract compares | the request the page makes and the JSON path or regex of the score |
| `cefrLevel` | the level printed beside it (B1, B2, C1, C2) | read for the words only; the code derives the level from the score (`cambridgeLevelOf`) and never trusts this field |
| `grade` | the grade (A, B, C, or a level) | not read tonight |

The scale's floors, read on Cambridge English's own results pages the same day: B2 First reports 140 to 159 as B1,
160 to 179 as B2 and 180 to 190 as C1; C1 Advanced 160 to 179 as B2, 180 to 199 as C1 and 200 to 210 as C2; C2
Proficiency 200 to 230 as C2. The same score means the same level whatever the exam, which is what lets the funder
sign a score rather than an exam.

## The definition to register (to confirm on a real account)

```json
{
  "name": "Cambridge English Statement of Results (Viky)",
  "loginUrl": "https://candidates.cambridgeenglish.org/Members/Login.aspx",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "to confirm: the request the results page makes once signed in",
      "method": "GET",
      "responseMatches": [{ "type": "contains", "value": "to confirm: the overall score as the answer prints it, {{overallScore}}" }],
      "responseRedactions": [{ "jsonPath": "to confirm", "regex": "to confirm" }]
    }
  ]
}
```

Once published: the provider id (36 characters), its version and the hash of its one request go into
`EXAM_PROVIDERS["cambridge-english-shown"]` in `src/exam-shown.ts`, in one commit, and the line can be made on by an
operator, then shown end to end by a candidate.

## The terms, as read on 23 Sep 2026

The portal's footer links "Terms of Use" to Cambridge's candidate privacy notice. Cambridge's Website Terms of Use
(cambridge.org/legal/website-terms-of-use, "any other Cambridge websites which link to this page") say, under "What
can and can't I do on this Site?", do not "'Scrape' or store content from the Site on a server or other storage
device or create an electronic database by downloading and storing the Site's content", and under "What are these
Website Terms?", of a user profile and password, "keep these safe and do not share them with others". What Viky does:
the candidate signs in themselves, in their own browser, and shares nothing; a witness in a TEE attests the one
response, and Viky keeps the score it carries with the gift. Whether keeping one candidate's own score at their own
request is the storing of the site's content those terms forbid is a question this line does not answer: it is on the
judges' page as read, and it is the founder's call before the line opens.
