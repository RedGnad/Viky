# Our Epim-Exam provider: the baccalauréat passed, Cameroon, shown (D176)

Epim-Exam, `https://epimexam.cm/`, "Centralisation des Opérations de l'Office du Baccalauréat du Cameroun", read
23 Sep 2026: three doors, "Candidat(e)s" ("effectuer une requête sur votre candidature et consulter vos résultats"),
establishments, and payment partners, each behind "Accéder", with "Connexion" at the top. The candidate's space is
behind a sign-in; its fields and the results page are **to confirm** from a real candidate's session, since the public
pages are the three doors and nothing else.

## The page, and who signs in

- `https://epimexam.cm/`, "Candidat(e)s", then the sign-in the platform asks for (to confirm: the candidate's number
  and a password, or another pair). Typed in the verification tab, in the candidate's own browser; nothing reaches Viky.
- The page after sign-in: the candidate's results, with the decision (passed) and, per the founder's brief, the
  mention; to confirm.

## What is extracted

| field, as the row names it | what it is | to confirm |
|---|---|---|
| `decision` | passed or not, matched by `^admis` whatever the case (`readBacPassed`) | the request the results page makes and the exact word it prints |
| `mention` | the mention | not read tonight |

## The definition to register (to confirm on a real candidate's session)

```json
{
  "name": "Epim-Exam, decision (Viky)",
  "loginUrl": "https://epimexam.cm/",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "to confirm: the request the results page makes once signed in",
      "method": "GET",
      "responseMatches": [{ "type": "contains", "value": "to confirm: the decision as the answer prints it, {{decision}}" }],
      "responseRedactions": [{ "jsonPath": "to confirm", "regex": "to confirm" }]
    }
  ]
}
```

Once published: the provider id, its version and the hash of its one request go into `EXAM_PROVIDERS["bac-cameroon-shown"]`.

## The terms, as read on 23 Sep 2026

The public pages show no terms of use and no legal notice ("Copyright 2021 Office du Baccalauréat du Cameroun",
"Powered By Crina Studio"). Nothing is claimed about what the Office allows a program to do, and the judges' page says
so; the candidate's space may carry terms of its own, to read from a real session before the provider is registered.
