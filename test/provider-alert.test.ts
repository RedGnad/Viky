import assert from "node:assert/strict";
import test from "node:test";
import { attemptFor } from "../src/gift-attempt";
import { ALERT_TO, providerAlert, sendProviderAlert } from "../src/provider-alert";
import { providerInstruction } from "../src/provider-instruction";

/**
 * The operator's email for a provider request (the founder, 28 Sep 2026): to founder@viky.cash, with the university, the
 * sense and the command to run. Without Resend's key nothing leaves, and the gift is made all the same.
 */
const UCAD = { portalId: "ucad-sn", university: "Université Cheikh Anta Diop", country: "SN", loginUrl: "https://studentcenter.ucad.sn/login" };

test("the email names the university, the sense, the gift, the instruction and the command that registers the provider", () => {
  assert.equal(ALERT_TO, "founder@viky.cash");
  const { subject, text } = providerAlert(UCAD, { sense: "results", instruction: providerInstruction(UCAD, "results"), firstGiftId: "1000042" });
  assert.equal(subject, "Provider to build: Université Cheikh Anta Diop (Senegal), results");
  assert.match(text, /Sign-in page: https:\/\/studentcenter\.ucad\.sn\/login/);
  assert.match(text, /Gift: 1000042/);
  assert.match(text, /The person reads that it is set up within two days\./);
  assert.match(text, /pnpm provider:add ucad-sn results <the provider's id> --domain ucad\.sn/);
  assert.match(text, /pnpm provider:requests/);
  assert.doesNotMatch(text, /\n\n\n/, "no empty lines stacked");
});

test("without Resend's key the email is not sent, and nothing throws", async () => {
  assert.equal(await sendProviderAlert(UCAD, { sense: "enrolment", instruction: "x", firstGiftId: null }, {}), "not configured");
});

test("a request kept for one university, scale or target is never sent again for another", () => {
  const terms = { account: "0xabc", username: "", recipientName: "Ama", funderName: "", goalType: 16, dailyTarget: 0, durationDays: 180, amount: "20000000", target: 14.5, course: "ucad-sn", scale: "20" };
  const kept = { terms, request: { authorization: { nonce: "0x1" } } };
  assert.ok(attemptFor(kept, terms));
  assert.equal(attemptFor(kept, { ...terms, course: "ugb-sn" }), undefined);
  assert.equal(attemptFor(kept, { ...terms, scale: "4" }), undefined);
  assert.equal(attemptFor(kept, { ...terms, target: 15 }), undefined);
});
