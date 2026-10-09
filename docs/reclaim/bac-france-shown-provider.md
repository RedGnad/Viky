# Our Cyclades provider: the baccalauréat passed, France, shown (D176)

> Closed since 4 Oct 2026: Viky is for adults on both sides, and this condition is offered on no page. The note is kept as it was written, for the code it describes, which is kept closed.

Cyclades, the Ministry's examination service, candidate space at
`https://candidat.examens-concours.gouv.fr/cyccandidat/portal/login` (the older `cyclades.education.gouv.fr` address
redirects there, read 23 Sep 2026). The candidate signs in with their Cyclades identifier and password, or through
FranceConnect. The same page links a public publication of results ("Consulter les résultats des examens et concours,
accès public", `https://resultats.examens-concours.gouv.fr/`), which would be the other reading, by name; this line is
the one the candidate shows.

## The page, and who signs in

- Sign-in: identifier and password (twelve to thirty characters, the page says), or FranceConnect. Typed in the
  verification tab, in the candidate's own browser; nothing reaches Viky. A FranceConnect sign-in goes through the
  state's identity provider inside the same tab; whether the verification follows it is to confirm on a real session.
- The page after sign-in, from Cyclades's own help ("Foire aux questions", candidat.examens-concours.gouv.fr/cyccandidat/aide,
  read 23 Sep 2026): "connectez-vous à votre compte Cyclades, allez dans « Mes inscriptions », sélectionnez votre
  inscription, puis cliquez sur « Mes notes »" for the grade report; the results themselves are published on the
  public site (resultats.examens-concours.gouv.fr) by name, and inside the space under the same inscription. The
  words the space prints for a decision, as every guide of the service repeats them and the public site prints them:
  "Admis", "Refusé", "Admis au second groupe" (the oral), and the mention beside "Admis". The rubric names are the
  stable labels; the request behind "Mes notes" is what the provider pins, unverified until a candidate's session.

## What is extracted

| field, as the row names it | what it is | to confirm |
|---|---|---|
| `decision` | passed or not, matched by `^admis` whatever the case (`readBacPassed`): "Admis" and "Admis avec mention" pass, "Refusé" and "Admis au second groupe" (the oral still to sit) do not, since the pattern is anchored on the word alone and the second-group line is read before the oral | the request behind "Mes notes" and the exact casing; unverified |
| `mention` | the mention | not read tonight |

## The definition to register (to confirm on a real candidate's session)

```json
{
  "name": "Cyclades, decision (Viky)",
  "loginUrl": "https://candidat.examens-concours.gouv.fr/cyccandidat/portal/login",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "unverified: the request « Mes notes » makes under « Mes inscriptions », once signed in",
      "method": "GET",
      "responseMatches": [{ "type": "contains", "value": "to confirm: the decision as the answer prints it, {{decision}}" }],
      "responseRedactions": [{ "jsonPath": "to confirm", "regex": "to confirm" }]
    }
  ]
}
```

Once published: the provider id, its version and the hash of its one request go into `EXAM_PROVIDERS["bac-france-shown"]`.


## When the page does not carry it

A page that carries no field the pattern names, or a word the pattern refuses, fails by its name before anything is
signed (`NOT_PASSED`): the person is told what was not found and that nothing is lost, the gift staying theirs to earn
until its deadline; the journal of the gift carries the event as a reading refused by that name, with no number and
no proof; the founder reads the session's fields with `pnpm verify:day` and corrects the pattern in one commit.
Nothing is ever guessed from a selector: every pattern below sits on a label the page prints for the person.

## The terms, as read on 23 Sep 2026

The sign-in page's footer carries "Mentions légales" and "Accessibilité : partiellement conforme" as buttons that open
inside the application; their text could not be read from outside a session tonight, and nothing is claimed about
what it says of programs. It is read from the real session before the provider is registered, and the judges' page
says where the question stands.
