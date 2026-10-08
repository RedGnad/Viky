# Pages and routes

| page | what |
|---|---|
| `/` | the landing with the card a gift is prepared on; Home once signed in |
| `/fund` | paying for the gift prepared on the card, and its link |
| `/g/<id>?t=...` | a gift's own page, for the person it is for, its funder, or a reader of the link |
| `/gifts` | everything given and received |
| `/me` | the account: the currency, the appearance, what Viky reads, signing out (`/account` leads here) |
| `/cash-out` | "Spend or withdraw": a gift card, phone credit, or a transfer to a bank or a card |
| `/what-viky-can-check` | the catalogue: every condition and its state |
| `/add-your-university` | how a student adds their university's portal |
| `/help`, `/privacy`, `/legal` | five questions; what is kept and who processes it; who publishes and hosts the site |
| `/judges` | the only page with contract addresses |
| `/dev/*` | dev pages, answered only with `VIKY_DEV_PAGES=1` to an operator's account; a 404 in production |

Every route is a file under `app/api` (`find app/api -name "route.ts*"` lists them), grouped by what they serve:
`account` (the passkey session and preferences), `gift` and `gifts` (create, claim, connect, count, withdraw, consent,
the journal), `proof` (a proof shown from the person's own account), `connect` (a source connected with the person's
key), one folder per source read (`duolingo`, `chess`, `codeforces`, `coursera`, `edx`, `mitx-online`, `credly`,
`accredible`, `det`, `marathon`, `wca`, `portals`), `conditions` (what may be offered), `fund`, `exit`, `send`,
`phone`, `giftcards` and `mobile-money` (money in and out; mobile money is offered where its one setting is on, as
it is in production since 3 Oct 2026),
`rails` and `rates` (which partner serves where, and the day's rate),
`cron` (the passes and the watch), `health`, `judge` and `judges`, and `dev`.

Operator commands: `pnpm keeper` (the same passes from a terminal), `pnpm zkfetch:worker [port]` (the attested-fetch
worker, deployed from `Dockerfile`), `pnpm portal:pin` (reviewing a first proof from a university), `pnpm pilot:report`
(the pilot gift by gift, read only), `pnpm relayer:fees`, `pnpm check:signer` (the evidence key of the environment
against the signer the contracts name, before a deployment), `pnpm check:sources` (every public source Viky reads,
asked whether it still answers in the shape the readers expect: a few plain GETs each, no secret, to run once a day
while gifts are read).
