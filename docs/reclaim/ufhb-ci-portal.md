# The UFHB portal, defined from its public pages, unverified (D193)

Université Félix Houphouët-Boigny, Abidjan. Nobody with a UFHB account has sat with us, so nothing below has been
captured: the definitions are from what the university and the ministry publish, every field is **unverified**, and
the portal row is written with `UNVERIFIED=1` so the chooser says so on the line.

## Two doors, neither opened

- The student space the university names is `ufhb.mysonec.com` ("Espace Etudiant", the Scolarité Centrale's site
  scolarite-ufhb.edu.ci, read 23 Sep 2026, and the university's site, "Mon Espace"). It did not answer a reader
  from outside Côte d'Ivoire on 23 Sep 2026 (two tries, two hours apart): its sign-in fields and its pages are
  unverified, and this is the most probable results page, since the Scolarité Centrale describes it as where a student
  checks their registration and their space.
- The ministry's registration platform, `https://inscription.mesrs-ci.net/web/login` ("Login | MESRS", read the same
  day): a sign-in with `login` (placeholder "E-mail") and a password, on an Odoo site, with the path
  `/inscription/paiement` in its page. It carries a student's registration and its payment, which is the enrolment
  reading; whether a results page exists behind it is unknown.

## What is extracted (unverified)

- Enrolment, from the ministry's platform: `status`, matched by `^(Inscrit|Payé|Validé)` whatever the case, the
  words a registration record prints once the year's registration is paid and validated.
- Results, from the student space: `decision`, matched by `^(Admis|Validé)`; `average`, out of 20 ("Moyenne", the
  label an Ivorian results sheet prints), in hundredths; `academicYear`, the current year as printed.

## The definitions to register (unverified)

```json
{
  "name": "MESRS registration, enrolled at UFHB (Viky, unverified)",
  "loginUrl": "https://inscription.mesrs-ci.net/web/login",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "unverified: the request the registration page makes for the student's own record",
      "method": "GET",
      "responseMatches": [{ "type": "contains", "value": "unverified: the registration status as the answer prints it, {{status}}" }],
      "responseRedactions": [{ "jsonPath": "unverified", "regex": "unverified" }]
    }
  ]
}
```

```json
{
  "name": "UFHB student space, the year's sheet (Viky, unverified)",
  "loginUrl": "http://ufhb.mysonec.com/",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "unverified: the request the sheet makes once signed in",
      "method": "GET",
      "responseMatches": [
        { "type": "contains", "value": "unverified: the decision, {{decision}}" },
        { "type": "contains", "value": "unverified: the average, {{average}}" },
        { "type": "contains", "value": "unverified: the academic year, {{academicYear}}" }
      ],
      "responseRedactions": [{ "jsonPath": "unverified", "regex": "unverified" }]
    }
  ]
}
```

The student space answers over plain `http` as far as its public address goes; a Reclaim provider needs `https`, and
so does a portal row (`portalProblem`): until the space is reached and its secure address known, the results page
cannot be registered, and the row carries enrolment alone.

## The row, once the enrolment provider exists on the dashboard

```
PORTAL_ID=ufhb-ci NAME="UFHB, registration (MESRS)" UNIVERSITY="Université Félix Houphouët-Boigny" COUNTRY=CI \
PROVIDER_ID=<enrolment provider id> PROVIDER_VERSION=1.0.0 REQUEST_HASH=<its request hash> \
LOGIN_URL=https://inscription.mesrs-ci.net/web/login \
EXTRACT_FIELD=status EXTRACT_MATCHES="^(Inscrit|Payé|Validé)" EXTRACT_KEEPS="whether the registration says enrolled, and nothing else" \
UNVERIFIED=1 PROVEN_BY=<the founder's account> VIKY_ALLOW_PRODUCTION_DATABASE=1 pnpm portal:add
```

With the row, "Staying enrolled" opens on this portal (D184), "unverified" beside the university; the year passed and
the grade wait for the results page (`NO_RESULTS_PAGE`, by its name).

## The terms

The ministry's platform and the Scolarité Centrale's site show no terms of use on the pages read (23 Sep 2026). Nothing
is claimed about what either allows a program to do; the judges' page says so of every portal.
