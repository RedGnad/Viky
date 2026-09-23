# Our Bac Digital provider: the baccalauréat passed, Morocco, shown (D176)

The Ministry of National Education's Bac Digital service, `https://bac.t3.technology/verify` ("Diplômes et Relevés
Digitalisés du Baccalauréat", read 23 Sep 2026): the candidate types their CNE and CIN and the service shows their
digitalised diploma and transcript. There is no account. The service sits behind Cloudflare, which answered 403 to a
reader that is not a browser the same day: this line is **shown by the candidate** in their own browser and never
read by Viky, which is what the founder asked for it.

## The page, and who types what

- `https://bac.t3.technology/verify`: two fields, CNE (the candidate's national number) and CIN (their identity card
  number), then "Rechercher". Both are typed in the verification tab, in the candidate's own browser; neither reaches
  Viky. Whoever holds the two numbers can open the page, and the four answers say so.
- The page after the search: the diploma and the transcript, with the decision (passed), the average and the mention;
  unverified, since no page opens without a candidate's numbers. The Ministry's other service prints the same
  verdict by Code Massar: `bac.men.gov.ma` ("Résultats du BAC", the Ministry's page, and every guide of it read
  23 Sep 2026): the candidate types their Code Massar, passes "Je ne suis pas un robot", and the page prints one of
  "Admis avec mention", "Admis", "Rattrapage", "Non admis", with the average; the marks by subject are on
  `massar.men.gov.ma` behind the Massar account. Those four words are the stable labels the pattern sits on: "Admis"
  and "Admis avec mention" pass, "Rattrapage" and "Non admis" do not, the pattern being anchored on the first word.

## What is extracted

| field, as the row names it | what it is | to confirm |
|---|---|---|
| `decision` | passed or not, matched by `^admis` whatever the case (`readBacPassed`): "Admis", "Admise", "Admis avec mention" pass; "Rattrapage", "Non admis" do not | the request the search makes and the field's name; unverified |
| `average` | the average out of 20 | not read tonight; the university rail's grade reading is the model when it is |
| `mention` | the mention | not read tonight |
| `session` | the year | not read tonight; the gift's window is the year's own |

## The definition to register (to confirm on a real candidate's session)

```json
{
  "name": "Bac Digital Maroc, decision (Viky)",
  "loginUrl": "https://bac.t3.technology/verify",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "to confirm: the request the search makes with the CNE and the CIN",
      "method": "to confirm (GET or POST)",
      "responseMatches": [{ "type": "contains", "value": "to confirm: the decision as the answer prints it, {{decision}}" }],
      "responseRedactions": [{ "jsonPath": "to confirm", "regex": "to confirm" }]
    }
  ]
}
```

Once published: the provider id, its version and the hash of its one request go into `EXAM_PROVIDERS["bac-morocco-shown"]`.


## When the page does not carry it

A page that carries no field the pattern names, or a word the pattern refuses, fails by its name before anything is
signed (`NOT_PASSED`): the person is told what was not found and that nothing is lost, the gift staying theirs to earn
until its deadline; the journal of the gift carries the event as a reading refused by that name, with no number and
no proof; the founder reads the session's fields with `pnpm verify:day` and corrects the pattern in one commit.
Nothing is ever guessed from a selector: every pattern below sits on a label the page prints for the person.

## The terms, as read on 23 Sep 2026

The page shows no terms of use, no legal notice and no text about programs: "Vos documents digitalisés sont sécurisés
et authentifiés" is all it says of itself. Nothing is claimed about what the Ministry allows, and the judges' page
says so. The Cloudflare wall is a fact about readers, not a term.
