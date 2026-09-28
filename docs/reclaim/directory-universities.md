# Seven university providers of the Reclaim directory, read (D199)

**Querying the directory** (read 24 Sep 2026): `GET https://devapi.reclaimprotocol.org/api/providers/explore/paginated`
with `searchQuery=<words>`, `pageSize=<n>` and `pageKey=0` (a page number from 0), all three required; `search`,
`query` and `name` are ignored and return the whole directory (24,869 active providers that day). The search matches
the provider's name only, not its sign-in address, so a source is looked for by name and then by reading the
configurations (`https://api.reclaimprotocol.org/api/providers/<id>/configs`) of the providers the name returns.

The founder's list of 23 Sep 2026: seven public university providers used by other applications. Each was read on
23 Sep 2026 by the directory's own API (`https://devapi.reclaimprotocol.org/api/providers/explore/paginated`, by name)
and by the configuration the SDK fetches (`https://api.reclaimprotocol.org/api/providers/<id>/configs`): its fields
(`responseVariables`), its version, its one request and that request's hash. Kept only when a field any student has
proves enrolment: a current term, a status, an active year, a degree being taken. A name alone proves an account, not
enrolment.

| university | provider (version, used by) | request and fields | verdict |
|---|---|---|---|
| The American University of Rome | `8a769077-53f8-4bbb-b75f-d2afe3eb6a42` ("Student Status", 1.0.0, 3 applications) | `GET https://my.aur.edu/ICS/Student/`, sign-in `https://my.aur.edu/ics`, WITNESS, hash `0xe7543349…f18c`: `Student_name`, `Intended_major`, `Status`, `Current_semester` ("<term> - All Divisions", the term of the student's own course schedule) | **kept**: the current term proves enrolment now; pinned in `src/directory-portals.ts`, row `aur-it`, field `Current_semester` against a term of 2026-2027 |
| The Hebrew University of Jerusalem | `70075b76-f0bb-4e19-938b-ef1656c7d8ee` ("HUJI university", 1.0.0, 3 applications) | `GET https://www.huji.ac.il/dataj/controller/!484EAB…/stu/STU-STUZIYUNIM`, fields `last_active_year`, `degree`, `faculty`, name and mail | **closed**: the fields would prove it, but the patterns carry one student's own name and number written into them ("Evgeniya", "Dozortseva", "8851621"), so the provider matches that one student's page and nobody else's; it needs to be registered again without them |
| American University of Sharjah | `3f649818-87a2-4199-bef6-8b234a2fd9d9` (1.0.0, verified by Reclaim, 1 application) | `GET https://ilearn.aus.edu/learn/api/…/users/me`: `givenName`, `familyName`, `emailAddress`, `department`, `uuid`, `userName` | **closed**: an account on the learning platform and a department, no term, status or year; an account stays after a student leaves |
| Innopolis University | `3dd89a4f-49d7-4800-a926-db3c8b247270` ("RU Student Verification", 2.2.0, verified, 1 application); older ones `337a2461…` (`studentName` only) and others | the 2.2.0 one builds its request in a script at proof time (`isScriptRequestingClaim`), with no request listed and no field named | **closed**: there is no request hash to pin and no field to read, so a proof could not be checked against anything; the older ones prove a name |
| Indira Gandhi National Open University | `d504a779-f6af-42b5-acc0-6c776b4ad348` (2.4.0, 7 applications), `5a293416…` (3.4.0) | `GET https://ignou.samarth.edu.in/index.php/vidhyarthi/profile/index`: `fullname` | **closed**: a name only |
| University of Lagos | `41bb2902-daf8-44f1-a06a-5cd6b5cc9df5` (1.0.0, 1 application) | verification type `AI`, no request listed | **closed** on 24 Sep 2026: an AI-witnessed proof and nothing to pin; **listed** since 28 Sep 2026 as a witness portal (D311, below) |
| University of Dhaka | `68cb338a-b0ee-4f63-a306-c768deae461f` (3.0.0, 1 application) | `GET https://bk.eco.du.ac.bd/student/me`: `fullName` | **closed**: a name only |

## The American University of Rome, the row

```
PROVEN_BY=<the operator account> VIKY_ALLOW_PRODUCTION_DATABASE=1 DATABASE_URL=<production, from the Neon console> pnpm portal:directory
```

The row is marked unverified (D193): no student has shown a proof from it to Viky, so the chooser says
"(unverified)" beside the university and the funder reads, before paying, that nobody has shown a proof from it yet
(D195). The pattern sits on the label the page prints for the student, "<term> - All Divisions"; the terms' exact
wording ("Fall 2026" or "2026 Fall") is not known, so both orders are accepted, and the years are this academic year's.
A page that does not carry it fails by its name (`NOT_ENROLLED`), nothing lost, the journal carrying the event. What the
proof also carries (the name, the major) is read by the attestor and dropped by Viky, the verdict rule (D185).

The terms: the portal is AUR's own Jenzabar sign-in; nothing is claimed about what AUR allows a program to do, as for
every portal (the judges' page).

## 26 Sep 2026: every provider of the founder's list, read again (D267)

The founder asked for a line per university provider of the 24 Sep census, with what each portal reads noted on its
line. The directory was queried by name for every university and city of the list (`searchQuery`, as above), and
the configuration of each of the 402 providers returned was read. What decides is the verification type:

| verdict | providers |
|---|---|
| **listed, proves enrolment** | American University of Rome (`8a769077`, a current term), as before |
| **listed, proves a student account** | American University of Sharjah (`3f649818`, iLearn's record of the signed-in user), Innopolis University (`337a2461`, the student's name on the profile's education tab), IGNOU (`5a293416` 3.4.0, the name in the profile's heading; 2.4.0 matches the whole page), University of Dhaka (`68cb338a`, the signed-in student's record, whose one pattern carries the whole answer) |
| **out: one student's patterns** | HUJI (`70075b76`): the patterns carry one student's own name and number, so no other student's page matches |
| **out: witnessed by AI** | 363 of the 402, among them every provider found for UCAD (1), Gaston Berger (1), BEM (5), UADB (2), IUA (2), Houphouët-Boigny (1), Hassan II (1), Mohammed V (3), UIR (4), UIC (2), Supdeco Marrakech (3), Tunis (14), IAM Bamako (1), ESC Ouagadougou (1), Niamey (1), Kinshasa (2), the French cities (149), London (36), Montréal (9), Brussels (9), Lausanne (6), Madrid (13), and the University of Lagos (`41bb2902`, D199). Out on 26 Sep 2026; the corridor's are listed since 28 Sep 2026 as witness portals (D311, below) |
| **out: nothing to pin** | Innopolis `3dd89a4f` 2.2.0 (its request is made by a script, no hash) and a demonstration provider with no request |
| **not found by name** | Supdeco Dakar and EISMV: no provider answers those names |

The four account lines say "(student account)" beside the university, and the gift's sentence says the portal shows
an active student account, not the year's enrolment.

## The corridor's AI providers, listed as witness portals (D311)

On the founder's decision of 28 Sep 2026, a university whose only provider is an AI one is listed and verified without
an enclave: the claim must be signed by Viky's pinned witness (`0x244897572368Eadf65bfBc5aec98D8e5443a9072`) and by
nobody else, and must have read the university's own domain. An AI provider's configuration names no request
(`requestData: []`): Reclaim's agent writes one at the first real run, as a version of its own (`1.0.0-ai.1`). So a
row has no pattern until a student shows a first proof. That proof is held, never paid alone; the operator reads what
the pattern read and runs `pnpm portal:pin`, which fixes the version, the URL, the match, the redaction, the spec hash
and the field, and settles the held gift (or refuses it, and the person reads why). After the pin a proof on another
domain, request or pattern is refused.

The twenty rows are in `src/directory-portals.ts` (`WITNESS_PORTALS`), written by `pnpm portal:directory`: UCAD,
Gaston Berger, UADB, Université Dakar Bourguiba, BEM (Senegal); Félix Houphouët-Boigny (Côte d'Ivoire); Hassan II,
Mohammed V, UIR, Mines Rabat, UPM, Sup de Co Marrakech (Morocco); IAM Bamako (Mali); Abdou Moumouni (Niger); ESC
Ouagadougou (Burkina Faso); UNIKIN and ISS Kinshasa (DR Congo); IHET and the Mediterranean polytechnic (Tunisia);
University of Lagos (Nigeria). The domain is the university's own; where its portal sits on a shared platform
(`campusniger.com`, `optsolution.net`, `unikinrdc.com`, `ens.tn`, `vmit.cloud`), the portal's host alone. Two notes:
the provider called "Dakar Bourguiba University" (`cf828716`) signs in on `uadb.edu.sn`, Alioune Diop University of
Bambey's, and is listed under that name; Mohammed V's provider gives an http sign-in, and the row names the https one,
since a proof of an http page cannot be verified.
