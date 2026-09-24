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
| University of Lagos | `41bb2902-daf8-44f1-a06a-5cd6b5cc9df5` (1.0.0, 1 application) | verification type `AI`, no request listed | **closed**: an AI-witnessed proof, which Viky refuses everywhere (the TEE attestation is required), and nothing to pin |
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
