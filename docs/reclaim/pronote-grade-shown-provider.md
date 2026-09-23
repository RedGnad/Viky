# Our PRONOTE provider: the overall average in the family's own space, shown (D203)

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

## Where the average comes from, and the one technical limit

- The application talks to its space by `POST https://<space>.index-education.net/pronote/appelfonction/<a>/<h>/<n>`,
  `n` being the request's number encrypted with the session's key, so the URL is matched as a pattern. The grades
  are the function `DernieresNotes` (page 198), answered with `dataSec.data.moyGenerale.V`, the overall average as
  the family reads it, "14,50" (pronotepy, `Period.overall_average`, read 23 Sep 2026).
- The answer is clear JSON unless the establishment switches on PRONOTE's own AES encryption or compression of the
  exchanged data: `CrA` and `CoA` in the start parameters of the space's page (pronotepy's `_Communication.initialise`,
  `self.attributes.get("CrA", False)`). The demonstration space's page starts with `{"h":…,"d":true,"a":2}`, neither
  set. A space that sets one of them sends `dataSec` as hexadecimal ciphertext: a proof of it carries no average, and
  the reading is refused `NO_GRADE`, nothing lost. How many spaces do so is not known.

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

Once published: the provider id, its version and the hash of its request go into `PRONOTE_PROVIDER`
(`src/pronote-shown.ts`), and goal 24 is signed (OPERATIONS).

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
