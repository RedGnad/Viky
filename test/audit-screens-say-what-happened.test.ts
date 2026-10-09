import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { connectReturnInWords } from "../src/connect-return";
import { CONNECT_STATE_TTL_SECONDS, ConnectStateError, openConnectState, sealConnectState } from "../src/connect-state";
import { certificateById, datedTheDayItIsRead } from "../src/milestone-conditions";
import { GIFT_PAGE } from "../src/sentences";

/**
 * Three screens that said something else than what happened (the audit of 8 Oct 2026, point 8): a race or a
 * competition past its last day, a source that sent the person back without connecting, and "Count now" offered to
 * the person who paid.
 */

process.env.SESSION_SIGNING_SECRET = "test-account-session-secret-that-is-longer-than-32-bytes";

test("a race and a competition past their last day stand with what is shown: no reading is offered, and the refusal is theirs", () => {
  assert.equal(datedTheDayItIsRead("marathon-finish"), true);
  assert.equal(datedTheDayItIsRead("wca-time"), true);
  for (const dated of ["coursera-certificate", "duolingo-english-test", "credly-badge", "university-enrollment-shown"]) assert.equal(datedTheDayItIsRead(dated), false, dated);
  // True of the reading: a result is judged by the day it is read.
  const reading = readFileSync("src/certificate-reading.ts", "utf8");
  assert.match(reading, /Judged by the day the result is read \(D273\), which for a look is now\.\n\s*return \{ subject: reading\.subject, score: reading\.metric, testDay: nowSeconds \};/);
  assert.match(reading, /const reading = await readWcaResult\([^\n]+\n\s*return \{ subject: reading\.subject, score: reading\.metric, testDay: nowSeconds \};/);
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /pastTheLastDay \? \(condition\?\.nature === "shown" \|\| datedTheDayItIsRead\(hadOrNot\.conditionId\) \? "ended" : "late"\) : null/);
  assert.ok(page.indexOf('if (proofStands === "ended"') < page.indexOf('if (milestone.conditionId === "marathon-finish") return <MarathonProof'), "the last day passed: no bib, no reading");
  for (const id of ["marathon-finish", "wca-time"]) {
    const said = certificateById(id)?.words.refusals.afterTheDeadline;
    assert.equal(said, "This gift's last day has passed, and a result read after it cannot pay.", id);
    assert.doesNotMatch(String(said), /certificate|granted/);
  }
});

test("a source that sent the person back without connecting is said by its reason", () => {
  assert.equal(connectReturnInWords(null, "Strava"), null);
  assert.equal(connectReturnInWords("done", "Strava"), null);
  assert.equal(connectReturnInWords("refused_at_strava", "Strava"), "Strava did not accept the connection. Nothing was changed.");
  assert.equal(connectReturnInWords("refused_at_fitbit", "Fitbit"), "Fitbit did not accept the connection. Nothing was changed.");
  assert.equal(connectReturnInWords("scope_missing", "Strava"), "Strava was not allowed to read your activities. Connect again and allow it.");
  assert.equal(connectReturnInWords("other_account", "Strava"), "You are signed in to Viky under another account than this gift's. Nothing was changed.");
  assert.equal(connectReturnInWords("not_recipient", "Fitbit"), GIFT_PAGE.connectOtherAccount);
  assert.equal(connectReturnInWords("expired", "Fitbit"), "That took too long, so nothing was changed. Connect again.");
  // Anything else, the exchange failing for one, keeps the sentence that names no cause.
  assert.equal(connectReturnInWords("exchange_failed", "Strava"), "That did not go through, and nothing was changed. Try again.");
  assert.equal(connectReturnInWords("state_mismatch", "Strava"), GIFT_PAGE.connectFailed);
  // The codes are the callbacks' own, lowered into the address.
  for (const source of ["strava", "fitbit"]) {
    const finish = readFileSync(`src/connect-${source}.ts`, "utf8");
    for (const code of [`REFUSED_AT_${source.toUpperCase()}`, "OTHER_ACCOUNT", "NOT_RECIPIENT"]) assert.match(finish, new RegExp(`code: "${code}"`), `${source} ${code}`);
    assert.match(readFileSync(`app/api/connect/${source}/callback/route.ts`, "utf8"), /encodeURIComponent\(outcome\.code\.toLowerCase\(\)\)/);
  }
  assert.match(readFileSync("src/connect-strava.ts", "utf8"), /code: "SCOPE_MISSING"/);
  const screen = readFileSync("app/kit/ConnectTheAccount.tsx", "utf8");
  assert.match(screen, /return connectReturnInWords\(new URLSearchParams\(window\.location\.search\)\.get\("connect"\), condition\?\.source \?\? ""\);/);
});

test("a round trip that took too long still lands on its gift, where the person reads why", () => {
  const issuedAt = 1_790_000_000;
  const sealed = sealConnectState({ giftId: "1000042", account: "0x00000000000000000000000000000000000000aa", source: "strava", verifier: "", nonce: "nonce-of-the-round-trip", issuedAt });
  assert.equal(openConnectState(sealed, issuedAt + CONNECT_STATE_TTL_SECONDS).giftId, "1000042", "inside the ten minutes it opens");
  assert.throws(
    () => openConnectState(sealed, issuedAt + CONNECT_STATE_TTL_SECONDS + 1),
    (error: unknown) => error instanceof ConnectStateError && error.code === "EXPIRED" && error.giftId === "1000042",
  );
  // A state that is not ours names no gift: nothing of it is believed.
  assert.throws(
    () => openConnectState(`${sealed.split(".")[0]}.forged`, issuedAt + 1),
    (error: unknown) => error instanceof ConnectStateError && error.code === "INVALID" && error.giftId === null,
  );
  for (const source of ["strava", "fitbit"]) {
    const finish = readFileSync(`src/connect-${source}.ts`, "utf8");
    assert.match(finish, /giftId: error instanceof ConnectStateError \? error\.giftId : null, ok: false, code: error instanceof ConnectStateError \? error\.code : "INVALID"/);
    assert.match(finish, /connectCookie\(state, 2 \* CONNECT_STATE_TTL_SECONDS\)/, "the cookie outlives the state, so a late return is still read");
  }
});

test("'Count now' is offered to the person the gift is for, and to nobody else", () => {
  const page = readFileSync("app/components/GiftPage.tsx", "utf8");
  assert.match(page, /\{mine && !milestone && !gift\.finished && gift\.connected && !gift\.sourceClosed && !readingsStopped && !asItGoes \? \(/);
  assert.doesNotMatch(page, /\(mine \|\| readerIsFunder\) && !milestone && !gift\.finished && gift\.connected/);
});
