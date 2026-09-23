# Our Udemy provider: a course finished on the person's own account, shown (D178)

The Reclaim directory holds six providers named Udemy (searched by its API on 23 Sep 2026: "Udemy Course Name",
"Udemy Course", "Udemy Last Purchase", a course count, two more), none verified by Reclaim and none whose fields say
"this course, finished" for a course the funder names. So this one is ours, registered on the Reclaim dashboard from a
real account: nothing below has been captured yet, every field is **to confirm**, and the code reads `courseSlug` and
`completed` and nothing else (`readUdemyCourse` in `src/udemy-shown.ts`).

## The page, and who signs in

- Sign-in: Udemy's own, reached from `https://www.udemy.com/home/my-courses/learning/`, the person's "My learning"
  page. Email and password (or a social sign-in) typed in the verification tab, in the person's own browser; nothing
  reaches Viky.
- The page after sign-in lists the courses the account is enrolled in with their progress, and a finished course
  carries its certificate of completion. The request that page makes is written down by Udemy's own users (a
  verification schema for another zkTLS system, kmanish1/zkschemas `udemy_course.md`, and a captured answer on
  pastebin, both read 23 Sep 2026): `GET https://www.udemy.com/api-2.0/users/me/subscribed-courses/` with
  `ordering=-last_accessed`, `fields[course]=...completion_ratio,...published_title,...url...`, `page=1`,
  `page_size=12`, `is_archived=false`, answered with `results[]`, each course carrying `id`, `title`,
  `published_title` (the slug of its link), `url` ("/course/<slug>/") and `completion_ratio` (100 when finished).
  Udemy's affiliate API documents the same course fields. Stable names of the application's own contract, unverified
  until a real account's session.

## What is extracted

| field, as the row names it | what it is | to confirm |
|---|---|---|
| `courseSlug` | `published_title`, the course's slug, matched with the gift's | the answer lists twelve courses a page: the pattern takes the slug and the ratio of the same course, which a regex over the course's own object does; unverified |
| `completed` | `completion_ratio`, `100` when finished | the field's shape on a real account; unverified |

## The definition to register (to confirm on a real account)

```json
{
  "name": "Udemy, a course finished (Viky)",
  "loginUrl": "https://www.udemy.com/home/my-courses/learning/",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "https://www.udemy.com/api-2.0/users/me/subscribed-courses/?ordering=-last_accessed&fields[course]=completion_ratio,published_title,url&page=1&page_size=12&is_archived=false",
      "method": "GET",
      "responseMatches": [
        { "type": "regex", "value": "\"completion_ratio\":(?<completed>[0-9]{1,3}),[^}]*\"published_title\":\"(?<courseSlug>[a-z0-9-]+)\"" }
      ],
      "responseRedactions": [{ "regex": "\"completion_ratio\":(?<completed>[0-9]{1,3}),[^}]*\"published_title\":\"(?<courseSlug>[a-z0-9-]+)\"" }]
    }
  ]
}
```

A provider reads one course's row among many: the request may take the course's id as a parameter, which the session
would set from the gift's course (`setParams`, as the daily lesson sets the Duolingo profile). To confirm.

Once published: the provider id, its version and the hash of its one request go into `UDEMY_PROVIDER` (`src/udemy-shown.ts`).


## When the page does not carry it

A page that carries no field the pattern names, or a word the pattern refuses, fails by its name before anything is
signed (`OTHER_COURSE`, `NOT_FINISHED`): the person is told what was not found and that nothing is lost, the gift staying theirs to earn
until its deadline; the journal of the gift carries the event as a reading refused by that name, with no number and
no proof; the founder reads the session's fields with `pnpm verify:day` and corrects the pattern in one commit.
Nothing is ever guessed from a selector: every pattern below sits on a label the page prints for the person.

## The terms, as read on 23 Sep 2026

Udemy's Terms of Use (udemy.com/terms/terms-of-use, "last updated July 31, 2026"), section 7, "Udemy's Rights": you may
not "access or search or attempt to access or search our platform by any means (automated or otherwise) other than
through our currently available search functionalities that are provided via our website, mobile apps, or API", and
"You may not scrape, spider, use a robot, or use other automated means of any kind to access the Services"; section
1, "Accounts": "You may not share your account login credentials with anyone else." So Viky reads nothing from Udemy
by a program: not the "My learning" page, and not the certificate page Udemy publishes for a finished course, which a
reader of Viky's would reach by automated means. What Viky does: the person opens their own account in their own
browser, shares no credential, and a witness in a TEE attests the one response their browser received; Viky keeps
that the course is finished, and the day. Whether a verification tab the person opens is "automated means" in the
sense of section 7 is a question this line does not answer: it is on the judges' page as read, and it is the founder's
call before the line opens.
