# Our Epim-Exam provider: the baccalauréat passed, Cameroon, shown (D176)

> Closed since 4 Oct 2026: Viky is for adults on both sides, and this condition is offered on no page. The note is kept as it was written, for the code it describes, which is kept closed.

Epim-Exam, `https://epimexam.cm/`, "Centralisation des Opérations de l'Office du Baccalauréat du Cameroun", read
23 Sep 2026: three doors, "Candidat(e)s" ("effectuer une requête sur votre candidature et consulter vos résultats"),
establishments, and payment partners, each behind "Accéder", with "Connexion" at the top. The candidate's space is
behind a sign-in; its fields and the results page are **to confirm** from a real candidate's session, since the public
pages are the three doors and nothing else.

## The page, and who signs in

- `https://epimexam.cm/`, "Candidat(e)s", then the sign-in the platform asks for (to confirm: the candidate's number
  and a password, or another pair). Typed in the verification tab, in the candidate's own browser; nothing reaches Viky.
- The candidate's space is a React application (`https://epimexam.cm/inscriptions/candidate/home`, its bundle
  `build/assets/main-*.js`, read 23 Sep 2026). The bundle names the sign-in (`auth/login`, the fields "Matricule" and
  "Mot de passe", "Matricule unique (MINESEC) du candidat"), the results routes (`/results`,
  `results-candidates/get-candidate-info`, `/resultats-candidats/detail-candidat`) and the labels the results screens
  print: "Résultats", "Décision", "Admis", "Refusés", "Relevés de notes", "Relevé de notes (sans signature)". The Office
  also publishes results by matricule on `officedubac.cm/resultats` and by SMS to 8070 (the Office's own notices,
  read the same day), which would be the other reading, by number; this line is the one the candidate shows.
- The page after sign-in: the candidate's results, "Décision" carrying "Admis" or "Refusé", and the transcript
  ("Relevé de notes"); unverified until a candidate's session.

## What is extracted

| field, as the row names it | what it is | to confirm |
|---|---|---|
| `decision` | passed or not, matched by `^admis` whatever the case (`readBacPassed`): the value under the label "Décision", "Admis" or "Refusé" as the bundle prints them | which of `results-candidates/get-candidate-info` and `detail-candidat` the screen calls, and the field's name in the answer; unverified |
| `mention` | the mention | not read tonight |

## The definition to register (to confirm on a real candidate's session)

```json
{
  "name": "Epim-Exam, decision (Viky)",
  "loginUrl": "https://epimexam.cm/",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "unverified: https://epimexam.cm/api/results-candidates/get-candidate-info, or the detail route, as the candidate's space calls it",
      "method": "GET",
      "responseMatches": [{ "type": "contains", "value": "to confirm: the decision as the answer prints it, {{decision}}" }],
      "responseRedactions": [{ "jsonPath": "to confirm", "regex": "to confirm" }]
    }
  ]
}
```

Once published: the provider id, its version and the hash of its one request go into `EXAM_PROVIDERS["bac-cameroon-shown"]`.


## When the page does not carry it

A page that carries no field the pattern names, or a word the pattern refuses, fails by its name before anything is
signed (`NOT_PASSED`): the person is told what was not found and that nothing is lost, the gift staying theirs to earn
until its deadline; the journal of the gift carries the event as a reading refused by that name, with no number and
no proof; the founder reads the session's fields with `pnpm verify:day` and corrects the pattern in one commit.
Nothing is ever guessed from a selector: every pattern below sits on a label the page prints for the person.

## The terms, as read on 23 Sep 2026

The public pages show no terms of use and no legal notice ("Copyright 2021 Office du Baccalauréat du Cameroun",
"Powered By Crina Studio"). Nothing is claimed about what the Office allows a program to do, and the judges' page says
so; the candidate's space may carry terms of its own, to read from a real session before the provider is registered.
