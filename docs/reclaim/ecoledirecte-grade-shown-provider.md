# Our EcoleDirecte provider: the overall average on the pupil's own account, shown (D179)

> Closed since 4 Oct 2026: Viky is for adults on both sides, and this condition is offered on no page. The note is kept as it was written, for the code it describes, which is kept closed.

No provider of the Reclaim directory reads EcoleDirecte (the directory searched by its API on 23 Sep 2026: nothing).
So this one is ours, registered on the Reclaim dashboard from a real pupil's or family's session: nothing below has
been captured yet, every field is **to confirm**, and the code reads `average` and nothing else (`readSchoolAverage`
in `src/school-shown.ts`).

## The page, and who signs in

- Sign-in: `https://www.ecoledirecte.com/login`, "Identifiant" and "Mot de passe" (read 23 Sep 2026; the site said
  "Ce site est actuellement fermé" that night, which its own words attribute to hours the school sets). The pupil's
  own account, or the family's, typed in the verification tab, in their own browser; nothing reaches Viky. A family
  account answers for several pupils: the one the gift is for is the one shown, to confirm from a real session.
- The page after sign-in: the grades ("Notes"), with the overall average of the period. The application talks to
  `api.ecoledirecte.com`, and its users have documented that API (EduWireApps/ecoledirecte-api-docs on GitHub,
  "documentation non officielle", read 23 Sep 2026; the same calls in SpacyXyt/EcoledirecteApi and three client
  libraries): the sign-in is `GET /v3/login.awp?gtk=1&v=<version>` for a token cookie, then `POST /v3/login.awp?v=<version>`
  with `identifiant` and `motdepasse` and the `X-Gtk` header; the grades are `POST /v3/eleves/<id>/notes.awp?verbe=get`
  with `data={"anneeScolaire":""}`, answered with `data.periodes[]`, each period carrying `idPeriode` ("A001" the first
  term, "A999Z" the year), `periode` ("1er Trimestre", "Année") and `ensembleMatieres.moyenneGenerale`, a string with a
  comma ("14,50"). The request the grades screen makes is that `notes.awp` call, and the field is
  `moyenneGenerale` of the period shown: stable names of the application's own contract, unverified until a real
  session.

## What is extracted

| field, as the row names it | what it is | to confirm |
|---|---|---|
| `average` | the overall average out of 20, "14,50" as EcoleDirecte prints it (`ensembleMatieres.moyenneGenerale`), carried in hundredths | the period read: the default applied is the last period the answer lists with an average, which is the current term until the year's line fills; to confirm |
| `period` | the term the average is for | not read tonight; the day it is shown is the event, and the funder's window bounds it |

## The definition to register (to confirm on a real account)

```json
{
  "name": "EcoleDirecte, the overall average (Viky)",
  "loginUrl": "https://www.ecoledirecte.com/login",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "https://api.ecoledirecte.com/v3/eleves/{{eleveId}}/notes.awp?verbe=get&v={{version}}",
      "method": "POST",
      "responseMatches": [{ "type": "regex", "value": "\"moyenneGenerale\":\"(?<average>[0-9]{1,2},[0-9]{1,2})\"" }],
      "responseRedactions": [{ "regex": "\"moyenneGenerale\":\"(?<average>[0-9]{1,2},[0-9]{1,2})\"" }]
    }
  ]
}
```

Once published: the provider id, its version and the hash of its one request go into `ECOLEDIRECTE_PROVIDER`
(`src/school-shown.ts`).


## When the page does not carry it

A page that carries no field the pattern names, or a word the pattern refuses, fails by its name before anything is
signed (`NO_GRADE`): the person is told what was not found and that nothing is lost, the gift staying theirs to earn
until its deadline; the journal of the gift carries the event as a reading refused by that name, with no number and
no proof; the founder reads the session's fields with `pnpm verify:day` and corrects the pattern in one commit.
Nothing is ever guessed from a selector: every pattern below sits on a label the page prints for the person.

## The terms, as read on 23 Sep 2026

Aplim, the publisher and host, "Dispositions générales applicables EcoleDirecte" (aplim.fr/Mobile) and the privacy
policy of "Mon EcoleDirecte" (aplim.fr/privacy): "EcoleDirecte ne collecte aucune donnée personnelle directement sur le
site Internet et l'application mobile", the school is "seul responsable de la tenue et de la saisie des informations
présentes", "Le détenteur d'un mot de passe ne peut accéder qu'aux seules informations le concernant lui ou les
personnes dont il est responsable juridiquement", and Aplim "s'engage dans tous les cas à ne pas utiliser, louer,
vendre, céder ou mettre à disposition d'un tiers à fin d'autres usages le contenu du présent site Internet et de
l'application mobile". No clause names automated access, robots, scraping or a program. The "Mentions légales" button
of the sign-in page opens inside the application and could not be read from outside a session. What Viky does: the
pupil, or the family, signs in themselves, in their own browser, to the information about themselves, and a witness in
a TEE attests the one response; Viky keeps the average it carries with the gift. The school, as the data controller,
is not asked: that is written on the judges' page, and it is the founder's call before the line opens.

## PRONOTE

Built beside this line since the founder's decision of 23 Sep 2026, its risk assumed: docs/reclaim/pronote-grade-shown-provider.md.
