# Our PRONOTE provider: the overall average in the family's own space, shown (D203)

> Closed since 4 Oct 2026: Viky is for adults on both sides, and this condition is offered on no page. The note is kept as it was written, for the code it describes, which is kept closed.

The founder's decision of 23 Sep 2026: PRONOTE is built as EcoleDirecte is (D179), its publisher's terms and the risk
written on the judges' page. No provider of the Reclaim directory reads PRONOTE's grades, so this one is ours,
registered on the Reclaim dashboard from a real family's session; every field below is **unverified** until then, and
the code reads `average` and nothing else (`readSchoolAverage` in `src/school-shown.ts`).

## The space, and who signs in

- PRONOTE is served per establishment, `https://<the space>.index-education.net/pronote/`, with a parents' page
  (`parent.html`) and a pupils' page (`eleve.html`) (the public demonstration space, `demo.index-education.net`, read
  23 Sep 2026; pronotepy's clients, which open `parent.html` for a `ParentClient`). The gift carries the space, pasted
  by the funder as its address; the person signs in on that space's parents' page, in their own browser, as the
  founder prefers, or on the pupils' page. Nothing reaches Viky.
- A parents' account can answer for several pupils: the average read is the one of the pupil the session has open.

## Where the average comes from, and why no proof can read it today (corrected, D205)

- The application talks to its space by `POST https://<space>.index-education.net/pronote/appelfonction/<a>/<h>/<n>`;
  the grades are the function `DernieresNotes`, whose data carries `moyGenerale.V`, "14,50" (pronotepy,
  `Period.overall_average`).
- **The answer is encrypted and compressed by default.** Its `donneesSec` is AES ciphertext of deflated JSON, under a
  key derived at sign-in. A space skips encryption or compression only when its page's start parameters carry `sCrA`
  or `sCoA` (Pawnote, the current client library, `src/session/index.ts`: `skip_encryption: session_data.sCrA ??
  false`, `skip_compression: session_data.sCoA ?? false`; it decrypts with `aes.decrypt` then `inflateRaw`).
- Read on 23 Sep 2026: the demonstration space's parents' page starts `{"h":…,"d":true,"a":2}`; two real spaces,
  `e972000a` and `e212074o`, start `{"h":…,"a":2}`. None skips anything, and all three load the same client script
  (`parent_ext.js`, the same hash in its path). So the demonstration space is a faithful model of a real one, and in
  both the average never crosses the wire in clear: a witness attests ciphertext, and no pattern can read it.
- D203 said the answer is clear JSON unless a school switches encryption on. That came from pronotepy, whose
  `CrA`/`CoA` reading predates the current protocol, and it was wrong.

## The bulletin's PDF, the last way tried, read on the demonstration space (D207)

On 24 Sep 2026, signed in to the demonstration parents' page (the session the founder opened), "Notes", "Bulletin
de l'élève", Trimestre 3, the PDF button then "Voir le PDF": the file comes by a plain `GET` outside the encrypted
channel, `/pronote/UrlUnique/<name>.pdf?S=…&ID=…`, `application/pdf`, 36,181 bytes, `%PDF-1.4`. But the file is itself
encrypted with the PDF standard's own security handler (object 1: `/Filter/Standard /R 3 /V 2`, RC4 with a 128-bit
key): its one page stream (`/FlateDecode`, 14,444 bytes) is ciphertext, the overall average shown on screen (14,94)
appears nowhere in the bytes, raw or inflated, and no text operator can be read. A witness would attest ciphertext
here too. So PRONOTE is parked: no provider is to be registered, the line is off the register's lists, and goal 24
waits, as the founder asked.

The family sees the marks because their browser decrypts what it receives with a key made at sign-in; a zkTLS proof
attests the bytes on the wire, before any decryption.

## What is extracted

| field, as the provider names it | what it is | unverified |
|---|---|---|
| `average` | `moyGenerale.V`, "14,50", out of 20, carried in hundredths | the request pattern, the period the session shows, and whether the space encrypts |
| `space` | the space's word, from the request's host, matched with the gift's | the parameter's shape in the provider |

## The definition to register (unverified)

```json
{
  "name": "PRONOTE, the overall average (Viky)",
  "loginUrl": "https://{{space}}.index-education.net/pronote/parent.html",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "https://{{space}}.index-education.net/pronote/appelfonction/.*",
      "urlType": "REGEX",
      "method": "POST",
      "responseMatches": [{ "type": "regex", "value": "\"moyGenerale\":\\{[^}]*\"V\":\"(?<average>[0-9]{1,2},[0-9]{1,2})\"" }],
      "responseRedactions": [{ "regex": "\"moyGenerale\":\\{[^}]*\"V\":\"(?<average>[0-9]{1,2},[0-9]{1,2})\"" }]
    }
  ]
}
```

Not to register as it stands: it would attest ciphertext. Kept as the shape a provider would take the day a readable
answer exists.

## When the page does not carry it

A page that carries no average, or an encrypted one, fails by its name (`NO_GRADE`) before anything is signed: the
person is told what was not found and that nothing is lost, the gift staying theirs to earn until its deadline; the
journal of the gift carries the event with no number and no proof; the founder reads the session's fields with
`pnpm verify:day` and corrects the pattern in one commit. Nothing is guessed from a selector.

## The terms, as read on 23 Sep 2026, and the risk assumed

Index Education, "Mentions légales et Conditions Générales d'Utilisation" (index-education.com/fr/mentions-legales.php),
"Utilisation de nos sites": users commit not to "Utiliser tout dispositif manuel ou automatique permettant toute
récupération de données sans notre autorisation expresse écrite". The spaces are on its sites, and no authorisation
exists. The founder assumes the risk, as for Duolingo's terms: the person shows their own marks at their own request,
the rights of access and portability of the GDPR (articles 15 and 20), and no mark is kept, only the verdict (D185).
Written on the judges' page. If Index Education objects, the line closes.
