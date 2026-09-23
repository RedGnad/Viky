# Secrets in the repository and around it, 23 Sep 2026

What this is: a search for keys, tokens, URLs with credentials, `.env` files and backups in the whole history of
`RedGnad/Viky`, before the repository becomes public. No value is reproduced here: each finding is named by commit,
file, line and nature, and classified by a check that did not print it.

## Result

**Nothing secret in the git history.** Every hit in the history is a well-known test key, a placeholder or a public
value, listed below with how each was classified.

**One real secret was found outside git, in production:** the Alchemy RPC key. It is served on a public page and in the
browser's JavaScript (section 4). The answer is to regenerate the key, not to touch any history: git never held it.

## 1. What was scanned

| scope | how | size |
|---|---|---|
| every commit of every branch | `gitleaks git . --log-opts="--all" --redact=100` (8.30.1) | 428 commits, 7.18 MB |
| the same, second engine | `trufflehog git file://… --no-verification` (3.97.6), then again on a bare copy holding all 117 branches as heads | 7,466 chunks, 7.29 MB, same result both times |
| the working tree | `gitleaks dir . --redact=100` | 4.66 MB |
| added lines of every commit, patterns the two engines may miss | a local script over `git log --all -p`: URLs with a password, Neon `npg_` passwords, `postgres://`, 64-hex values assigned to a KEY/SECRET/SEED/PASSWORD/TOKEN name, Vercel, GitHub, Slack, Stripe and AWS tokens, JWTs, PEM private keys, VAPID private keys, keystore JSON, long values assigned to SECRET/API_KEY/CRON_SECRET/SESSION_SECRET, and Alchemy keys | 429 commits |
| seed phrases | twelve or more consecutive words of the BIP-39 English list (2,048 words, read from `@scure/bip39`), on every added line | 429 commits |
| sensitive file names ever added | `.env*`, `*.pem`, `*.key`, keystores, `*.bak`, `*.sql`, dumps, credentials, wallets, mnemonics | none ever added |
| stashes and unreachable objects | `git stash list`, `git fsck --unreachable --no-reflogs` | none |
| what GitHub will also make public | the bodies of 158 pull requests, 59 conversation comments, 0 review comments, 0 issues (`gh`), through `gitleaks stdin` and the same patterns | no leak |
| CI | `.github/workflows/ci.yml` | uses no repository secret; the only variable is the public RPC |

Both engines ran on this machine. `trufflehog` ran with `--no-verification`, so no value was sent to any provider to be
tested.

## 2. Findings in the history, and why none is a secret

| # | commit | file:line | nature | classification |
|---|---|---|---|---|
| 1 | `67656ba929` | `test/gift-attestation.test.ts:5` | 64-hex `EVIDENCE_SIGNER_PRIVATE_KEY` | derives to `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, the published account 0 of Anvil and Hardhat. The production evidence signer is `0x85702Eaaa6B8694A61a6FbBff2634FCd7E644d9a` (`evidenceSigner()` on all three gift contracts, read 23 Sep) |
| 2 | `67656ba929` | `test/duolingo-verification.test.ts:5` | the same | the same key |
| 3 | `82816d6096` | `test/milestone-protocol.test.ts:4` | the same | the same key |
| 4 | `c35e4e5f62` | `test/shown-verification.test.ts:2` | the same | the same key |
| 5 | `53fba54bcd` | `test/exam-shown.test.ts:2` | the same | the same key |
| 6 | `1ba27624e7` | `test/udemy-shown.test.ts:2` | the same | the same key |
| 7 | `460ee3e675` | `test/school-shown.test.ts:2` | the same | the same key |
| 8 | `a11823e916` | `test/exit-terms.test.ts:14` | 40-hex `tokenOut` | a contract address, public |
| 9 | `d2de4ce44e` | `scripts/capture-scenarios.ts:21` | `CLAIM_TOKEN` | the placeholder sequence `a1b2c3…`, a capture fixture |
| 10 | `2cbbf26d22`, `4f3590c7b1` | `test/database-guard.test.ts:11,14,15,31,44` | Postgres URLs with a password | invented hosts (`ep-cool-name-123456`, `ep-stand-in-000000`, `ep-local-branch-a1b2c3`); passwords of one character, or a dictionary word |
| 11 | 13 commits | 13 test files (`account-auth`, `conditions-route`, `connect-state`, `coursera-step`, `det-route`, `duolingo-session-route`, `exit-routes`, `fitbit`, `gift-link-route`, `gift-routes`, `milestone-routes`, `morning-route`, `proof-journal`) | `SESSION_SIGNING_SECRET` and one `FITBIT_CLIENT_SECRET` assigned a literal | test values that name themselves (`test-…`, `anot…`, a leetspeak "secret") |
| 12 | `992b284339` | `docs/OPERATIONS.md` | a run of twelve BIP-39 words | the three variable names `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_EMAIL`, split on underscores |
| 13 | PR bodies, one comment | 64-hex values | three are Monad transaction hashes (each answered `cast tx`), one a provider id labelled as such, one the `READING_FINGERPRINT` committed in `src/reading-fingerprint.ts` (`23ec95c`) |

No `.env` file, backup, keystore, seed phrase or database dump was ever committed. `.gitignore` covers `.env` and
`.env.*`, `private-fixtures/`, `sessions/`, `private-notes/` and `review-captures/`.

**The Safe keys.** `docs/OPERATIONS.md` records that three earlier owner keys were thrown away on 19 Sep 2026 because a
phrase and a password reached a conversation. None of them reached git: no BIP-39 run, no keystore JSON and no
assigned private key other than the Anvil test key appears in any commit, PR or comment.

## 3. What could not be checked from here

- The Vercel and Railway build and request logs: they are not part of the repository and were not read.
- The repository's forks, if any exist: `gh` reports the repository private, so none is public.
- Secrets that are stored as they should be (Vercel, Railway, `.env.local`) were deliberately not opened.

## 4. The one real secret: the Alchemy RPC key, public in production

- **Where.** `https://viky.cash/judges`, section "Network", line "RPC", prints the full RPC URL, key included. It is
  rendered by `app/judges/page.tsx:49` from `monadRpcUrl()` (`src/monad/chain.ts:25-26`), which reads
  `NEXT_PUBLIC_MONAD_RPC_URL`. Because the variable is `NEXT_PUBLIC_`, Next inlines it in the browser bundle as well:
  one served chunk under `/_next/static/immutable/chunks/` carries it (checked on 23 Sep 2026, production serving
  `ee85f6e`).
- **Git.** Zero occurrence in any commit of any branch, PR or comment. It lives only in the Vercel environment.
- **What it gives whoever copies it.** Calls on the Alchemy account at our expense until its quota runs out; the same
  URL is what the relayer (`src/relayer.ts:60`) and the gift readers use, so an exhausted quota stops the relayer and the
  daily pass too.
- **What to do, in this order.** Regenerate the key in the Alchemy dashboard (the only step that closes it). Give the
  relayer and the server readers a server-only variable (`MONAD_RPC_URL`, already read by the Foundry scripts). If the
  browser must keep an Alchemy URL, use a separate key restricted to the `viky.cash` origin. Print only the public
  endpoint, or no URL, on the judges page. The page itself is not mine to change (the public pages have their own
  owner); this is reported, not fixed.
