import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { NOT_FINAL_YET } from "../src/gift-api";
import { milestoneErrorResponse } from "../src/milestone-api";
import { FinalityTimeout } from "../src/monad/chain";
import { RelayerError } from "../src/relayer";
import { SHOW_PROOF } from "../src/sentences";
import { REFUSALS_SAID_IN_OUR_WORDS, refusalForThePerson, saidInOurWords } from "../src/shown-refusals";

/**
 * "Show it" answered with the inside's own text (the audit of 8 Oct 2026, point 8): a person read "The proof failed
 * SDK or TEE verification" and "Transaction 0x… was not final within the wait". Every refusal keeps its type; the
 * sentence is ours where the refusal's own speaks of the inside, an error with no type says the proof could not be
 * checked, and a send that left and is not final yet is said as every other route says it.
 */

const R = SHOW_PROOF.refusals;

/** The refusals written for the person where they are raised: said as written. */
const SAID_AS_WRITTEN = new Set([
  // What the page or the result showed.
  "NOT_THERE_YET", "NOT_ENROLLED", "NO_RESULT", "NO_STATUS", "RESULT_WITHHELD", "INVALID_SCORE", "AN_EARLIER_RESULT",
  // Where the gift or the verification stands.
  "NOT_OPENED", "NOT_RECIPIENT", "ALREADY_SETTLED", "UNKNOWN_GIFT", "VERIFICATION_STOPPED", "PROOF_TOO_OLD", "WRONG_ACCOUNT", "WITNESS_OTHER_DOMAIN",
  // The daily lesson shown from an account.
  "NO_BASELINE", "DAY_EXPIRED", "ACCOUNT_NOT_OWNED", "IDENTITY_CHANGED", "XP_WENT_BACKWARDS",
  // Never printed: the page asks again while it is this.
  "NO_PROOF_YET",
]);

test("every refusal raised in the verification is either said in our words or named as written for the person", () => {
  const sources = ["src", "app/api/proof/verify", "app/api/proof/session"].flatMap((folder) =>
    readdirSync(folder, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(`${folder}/${file}`, "utf8")),
  );
  const raised = new Set<string>();
  for (const source of sources) {
    for (const found of source.matchAll(/(?:new VerificationError|new WitnessProofError|refuseShown|\breject)\("([A-Z_]+)"/g)) raised.add(found[1]);
  }
  assert.ok(raised.size > 40, `the verification's refusals were found (${raised.size})`);
  for (const code of raised) {
    const ours = saidInOurWords(code);
    assert.ok(ours !== SAID_AS_WRITTEN.has(code), `${code} is ${ours ? "both in our words and named as written" : "neither in our words nor named as written"}`);
  }
  for (const code of Object.keys(REFUSALS_SAID_IN_OUR_WORDS)) assert.ok(raised.has(code), `${code} is still raised somewhere`);
});

test("a refusal that speaks of the inside is said as one of four sentences, and one written for the person as written", () => {
  assert.equal(refusalForThePerson("TEE_NOT_VERIFIED", "The proof failed SDK or TEE verification"), "That proof could not be accepted, so nothing was counted. Show it again.");
  assert.equal(refusalForThePerson("PROOF_REJECTED", "Proof 0 has no signatures"), R.notAccepted);
  assert.equal(refusalForThePerson("WITNESS_OTHER_PATTERN", "The proof read the page with another pattern than this university's pin"), R.notAccepted);
  assert.equal(refusalForThePerson("ALREADY_RECORDED", "This proof has already been recorded"), "That proof was already counted.");
  assert.equal(refusalForThePerson("UNKNOWN_SESSION", "Invalid Reclaim session"), "That verification is over. Show it again.");
  assert.equal(refusalForThePerson("NOT_CONFIGURED", "The Reclaim application is not configured"), "Showing a proof is not open yet. Nothing was changed.");
  assert.equal(refusalForThePerson("NO_PORTAL", "This gift names no portal a proof could come from"), R.notConfigured);
  assert.deepEqual([...new Set(Object.values(REFUSALS_SAID_IN_OUR_WORDS))].sort(), [R.alreadyCounted, R.notAccepted, R.notConfigured, R.over].sort());
  // Written for the person: the result under the target with its figure, the year, the verification that stopped.
  assert.equal(refusalForThePerson("NOT_THERE_YET", SHOW_PROOF.notThereYet("11.5")), SHOW_PROOF.notThereYet("11.5"));
  assert.equal(refusalForThePerson("WRONG_TERM", "The results page shown is not this year's."), "The results page shown is not this year's.");
  assert.equal(refusalForThePerson("VERIFICATION_STOPPED", R.stopped), R.stopped);
  for (const sentence of Object.values(REFUSALS_SAID_IN_OUR_WORDS)) assert.doesNotMatch(sentence, /SDK|TEE|Reclaim|pinned|witness|nullifier|session/i);
});

test("the verify route keeps the code, logs what the refusal said, and gives an untyped error no text of its own", () => {
  const route = readFileSync("app/api/proof/verify/route.ts", "utf8");
  assert.match(route, /if \(saidInOurWords\(error\.code\)\) console\.warn\(JSON\.stringify\(\{ proofRefused: error\.code, said: error\.message\.slice\(0, 300\) \}\)\);/);
  assert.match(route, /\{ error: refusalForThePerson\(error\.code, error\.message\), code: error\.code \}, \{ status: error\.status,/);
  assert.match(route, /console\.error\("proof not verified:", error\);\n\s*return NextResponse\.json\(\{ error: SHOW_PROOF\.refusals\.unavailable, code: "REJECTED" \}, \{ status: 400,/);
  assert.doesNotMatch(route, /error instanceof Error \? error\.message/, "no library's text reaches the answer");
  assert.equal(R.unavailable, "The proof could not be checked right now. Try again in a moment.");
  // The relay's answers go through the gift routes' own response.
  assert.match(route, /if \(error instanceof RelayerError \|\| error instanceof FinalityTimeout\) return milestoneErrorResponse\(error\);/);
  assert.match(route, /error\.contractError === "IdentityMismatch"\) \{\n\s*return NextResponse\.json\(\{ error: SHOW_PROOF\.refusals\.otherSubject, code: "OTHER_SUBJECT"/, "never the sentence that names a chess account");
});

test("a send that left and is not final yet says to look again before trying once more, and a contract's refusal its own sentence", async () => {
  const notFinal = milestoneErrorResponse(new FinalityTimeout(`0x${"ab".repeat(32)}`));
  assert.equal(notFinal.status, 504);
  assert.deepEqual(await notFinal.json(), { error: NOT_FINAL_YET, code: "NOT_FINAL_YET" });
  assert.equal(NOT_FINAL_YET, "This is taking longer than usual. Give it a minute, then look again before you try once more.");
  const late = milestoneErrorResponse(new RelayerError("REVERTED", "execution reverted: DeadlinePassed()", "DeadlinePassed"));
  assert.deepEqual(await late.json(), { error: "The time for this gift is over.", code: "TIME_IS_UP", contractError: "DeadlinePassed" });
  const notReady = milestoneErrorResponse(new RelayerError("RESERVE_TOO_LOW", "the relayer holds 3 MON"));
  assert.equal(((await notReady.json()) as { error: string }).error, "Viky is not ready for this yet. Nothing was changed.");
});

test("the session route says its own refusals as written, and anything else as a verification that could not be opened", () => {
  const route = readFileSync("app/api/proof/session/route.ts", "utf8");
  assert.match(route, /class SessionRefusal extends Error \{\}/);
  assert.doesNotMatch(route, /throw new Error\(/, "every refusal of the route is one written for the person");
  assert.match(route, /const ours = error instanceof SessionRefusal \|\| error instanceof DuolingoProfileError \|\| error instanceof RequestError;\n\s*if \(!ours\) console\.error\("proof session not opened:", error\);/);
  assert.match(route, /\{ error: ours \? error\.message : SHOW_PROOF\.refusals\.notOpened \}/);
  assert.equal(R.notOpened, "The verification could not be opened right now. Try again in a moment.");
  assert.match(route, /if \(!appId \|\| !appSecret\) throw new SessionRefusal\(SHOW_PROOF\.refusals\.notConfigured\);/);
});
