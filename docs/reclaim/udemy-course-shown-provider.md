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
  carries its certificate of completion. The request that page makes, and the fields that carry the course's slug and
  its completion, are what the provider pins: to confirm on a real account with the developer tool.

## What is extracted

| field, as the row names it | what it is | to confirm |
|---|---|---|
| `courseSlug` | the course's slug, the word in its link (`udemy.com/course/<slug>/`), matched with the gift's | the request and the JSON path; if the answer carries the course's URL rather than its slug, the regex takes the word after `/course/` |
| `completed` | `100` (a completion ratio) or `true`: the course is finished | the field's real name and shape |

## The definition to register (to confirm on a real account)

```json
{
  "name": "Udemy, a course finished (Viky)",
  "loginUrl": "https://www.udemy.com/home/my-courses/learning/",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "to confirm: the request the My learning page makes for the enrolled courses and their completion",
      "method": "GET",
      "responseMatches": [
        { "type": "contains", "value": "to confirm: the course's slug or URL, {{courseSlug}}" },
        { "type": "contains", "value": "to confirm: the completion ratio, {{completed}}" }
      ],
      "responseRedactions": [{ "jsonPath": "to confirm", "regex": "to confirm" }]
    }
  ]
}
```

A provider reads one course's row among many: the request may take the course's id as a parameter, which the session
would set from the gift's course (`setParams`, as the daily lesson sets the Duolingo profile). To confirm.

Once published: the provider id, its version and the hash of its one request go into `UDEMY_PROVIDER` (`src/udemy-shown.ts`).

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
