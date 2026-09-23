# The UCAD portal, defined from its public pages, unverified (D193)

Université Cheikh Anta Diop, Dakar. Nobody with a UCAD account has sat with us, so nothing below has been captured: the
two providers are defined from what the university publishes about its own portals, every field is **unverified**, and
the portal row that carries them is written with `UNVERIFIED=1` so the chooser says so on the line. The day a student
shows a proof, the extraction is confirmed or corrected from that session, and the mark goes.

## Enrolment: the Student Center

- Sign-in: `https://studentcenter.ucad.sn/login` ("Digital Services", read 23 Sep 2026). The form posts to
  `https://studentcenter.ucad.sn/login-etudiant` with `username` (placeholder "Nom d'utilisateur", the page's own
  words: "@ucad.edu.sn", so the university email) and `password` ("Mot de passe"), plus the framework's `_token`. The
  credentials "are the same ones used during online pre-registration" (the university's information portal,
  pie.ucad.sn, "Services numériques", read the same day). Typed in the verification tab, in the student's own
  browser; nothing reaches Viky.
- The page after sign-in: the student's home, which the same portal describes as where they "consult their
  provisional grade reports, request social scholarships or aid, access their institution's distance learning
  platform" (disi.ucad.sn, "Centre étudiant", as indexed on 23 Sep 2026; the page itself answered an error that day).
- What is extracted: one field, `status`, matched by `^(Inscrit|Enrolled)` whatever the case, from the request the
  home page makes for the student's own record. Which request, and the exact word it prints, are unverified: the
  label to look for is the enrolment status of the current academic year, and the pattern refuses anything else.

## Results: the grades platform

- The university's own grades service is a second site, `https://pubnotes.ucad.sn/resultats` ("Récupération de
  Notes", pie.ucad.sn, read 23 Sep 2026): "the application allows students to retrieve their grades after
  deliberation; each student only accesses their own grades; using the platform requires authentication: account
  creation, account activation, then login". The site did not answer a reader from outside Senegal on 23 Sep 2026
  (two tries), so its sign-in fields are unverified; the Student Center's "relevé de notes provisoire" is the other
  candidate page, on the same account.
- What is extracted: `decision`, matched by `^(Admis|Validé)` whatever the case (the words a Senegalese results
  sheet prints for a year or a semester passed: "Admis(e)" on a deliberation, "Validé" on a semester; unverified);
  `average`, the general average out of 20 ("Moyenne générale", the label the sheet prints; unverified), carried in
  hundredths; `academicYear`, matched by the current year as the sheet prints it ("2025-2026" or "2025/2026";
  unverified), so a sheet of another year pays nothing.

## The definitions to register (unverified)

```json
{
  "name": "UCAD Student Center, enrolled (Viky, unverified)",
  "loginUrl": "https://studentcenter.ucad.sn/login",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "unverified: the request the student's home makes for their own record",
      "method": "GET",
      "responseMatches": [{ "type": "contains", "value": "unverified: the enrolment status as the answer prints it, {{status}}" }],
      "responseRedactions": [{ "jsonPath": "unverified", "regex": "unverified" }]
    }
  ]
}
```

```json
{
  "name": "UCAD grades, the year's sheet (Viky, unverified)",
  "loginUrl": "https://pubnotes.ucad.sn/resultats",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "unverified: the request the sheet makes once signed in",
      "method": "GET",
      "responseMatches": [
        { "type": "contains", "value": "unverified: the decision, {{decision}}" },
        { "type": "contains", "value": "unverified: the general average, {{average}}" },
        { "type": "contains", "value": "unverified: the academic year, {{academicYear}}" }
      ],
      "responseRedactions": [{ "jsonPath": "unverified", "regex": "unverified" }]
    }
  ]
}
```

## The row, once the two providers exist on the dashboard

```
PORTAL_ID=ucad-sn NAME="UCAD, Student Center" UNIVERSITY="Université Cheikh Anta Diop" COUNTRY=SN \
PROVIDER_ID=<enrolment provider id> PROVIDER_VERSION=1.0.0 REQUEST_HASH=<its request hash> \
LOGIN_URL=https://studentcenter.ucad.sn/login \
EXTRACT_FIELD=status EXTRACT_MATCHES="^(Inscrit|Enrolled)" EXTRACT_KEEPS="whether the status says enrolled, and nothing else" \
RESULTS_PROVIDER_ID=<grades provider id> RESULTS_PROVIDER_VERSION=1.0.0 RESULTS_REQUEST_HASH=<its request hash> \
RESULTS_ADMITTED_FIELD=decision RESULTS_ADMITTED_MATCHES="^(Admis|Validé)" RESULTS_GRADE_FIELD=average RESULTS_GRADE_SCALE=20 \
RESULTS_YEAR_FIELD=academicYear RESULTS_YEAR_MATCHES="2025[-/]2026" \
UNVERIFIED=1 PROVEN_BY=<the founder's account> VIKY_ALLOW_PRODUCTION_DATABASE=1 pnpm portal:add
```

With the row, the three Study lines open on this portal (D184), each saying "unverified" beside the university on the
chooser until a student's session confirms the pages. A missed extraction on a real session fails by its name
(`NOT_ENROLLED`, `NOT_PASSED`, `NO_GRADE`, `WRONG_TERM`), the person is told nothing is lost, and the journal carries
the event.

## The terms

The Student Center shows no terms of use on its sign-in page (read 23 Sep 2026); the judges' page says what is and
is not read about portals' terms. Nothing is claimed about what UCAD allows a program to do.
