delete process.env.DATABASE_URL;

import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { morningSummary, morningSummaryDue, type CycleUse } from "../src/attested-calls";
import { payoutNotPaidAlert, payoutsNotFinishedAlert } from "../src/mobile-money";
import { configureMobilePayoutStore, ensureMobilePayoutSchema, payoutsNotFinished } from "../src/mobile-money-store";
import { ordersToTell } from "../src/phone-order";
import type { SqlExecutor } from "../src/proof-session-store";
import { healthAlert } from "../src/watch";

/**
 * Three weeks with nobody watching (the final audit of 9 Oct 2026, E24 to E26). What waited for somebody was written
 * in the answer of a scheduled task, or nowhere: an order for an operator, a payout Switch said had failed, a
 * university whose provider was asked for once, a relayer that fell low between two passes, the call every five
 * minutes going quiet. Each is now said in an email.
 */
const NOW = Date.UTC(2026, 9, 20, 7, 0, 0);

test("the orders the morning's pass leaves for somebody are one email, and an ordinary morning is none", () => {
  assert.equal(ordersToTell([]), null);
  assert.equal(ordersToTell([{ orderId: "a1", state: "delivered" }, { orderId: "a2", state: "on_its_way" }, { orderId: "a3", state: "refunded" }, { orderId: "a4", state: "received, the invoice could not be read" }]), null);
  const alert = ordersToTell([
    { orderId: "b1", state: "received, invoice unpaid: for an operator" },
    { orderId: "b2", state: "delivered" },
    { orderId: "b3", state: "not followed: Bitrefill did not answer" },
    { orderId: "b4", state: "refund_pending" },
  ]);
  assert.equal(alert?.subject, "3 phone or gift card orders wait for somebody");
  assert.deepEqual(alert?.text.split("\n").slice(1, 4), ["- order b1: received, invoice unpaid: for an operator", "- order b3: not followed: Bitrefill did not answer", "- order b4: refund_pending"]);
  assert.equal(ordersToTell([{ orderId: "all", state: "not followed: the store could not be read" }])?.subject, "1 phone or gift card order waits for somebody");
  const route = readFileSync("app/api/cron/settle/route.ts", "utf8");
  assert.match(route, /const waiting = ordersToTell\(phoneOrders\);\s+if \(waiting\) await sendAlert\(waiting\);/);
  assert.match(route, /return NextResponse\.json\(\{ \.\.\.report, phoneOrders \}, \{ headers: NO_STORE \}\);/, "the answer keeps its fields");
});

test("a payout Switch says did not go through is told the moment its message arrives, and only if it is ours", () => {
  for (const status of ["FAILED", "REVERSED", "BLOCKED"]) {
    const alert = payoutNotPaidAlert("3f0c2a52-6f0e-4c0a-9d53-0d1f5b2a7c11", status);
    assert.equal(alert?.subject, `Mobile money: a payout is ${status}`);
    assert.match(alert?.text ?? "", /That return is Switch's to make and has never been observed/);
  }
  for (const status of ["COMPLETED", "PROCESSING", "SCHEDULED", "AWAITING_DEPOSIT", ""]) assert.equal(payoutNotPaidAlert("3f0c2a52-6f0e-4c0a-9d53-0d1f5b2a7c11", status), null, status);
  const webhook = readFileSync("app/api/mobile-money/webhook/route.ts", "utf8");
  assert.match(webhook, /const ours = await notePayoutState\(reference, state\);\s+const notPaid = ours \? payoutNotPaidAlert\(reference, state\.status\) : null;\s+if \(notPaid\) await sendAlert\(notPaid\);/);
  // A body that is not signed by Switch is still ignored before anything is read or told.
  assert.ok(webhook.indexOf("signedBySwitch(raw") < webhook.indexOf("payoutNotPaidAlert(reference"));
});

let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureMobilePayoutStore(executor);
  await ensureMobilePayoutSchema();
});
after(async () => {
  configureMobilePayoutStore(undefined);
  await db.close();
});

test("a payout whose dollars left more than an hour ago and that has not arrived is said each morning", async () => {
  const row = (reference: string, status: string, sentMinutesAgo: number | null) =>
    db.query(
      `INSERT INTO viky_mobile_payouts (reference, account, country, network, number_end, exit_tx, units, deposit_address, deposit_units, local_amount, local_currency, rate, status, deposit_sent_at, expires_at)
       VALUES ($1, '0xa', 'sn', 'wave', '12', $2, '5000000', '0xd', '5000000', '3000', 'XOF', '600', $3, $4, $5)`,
      [reference, `0x${reference}`, status, sentMinutesAgo === null ? null : new Date(NOW - sentMinutesAgo * 60_000).toISOString(), new Date(NOW + 3_600_000).toISOString()],
    );
  await row("old-processing", "PROCESSING", 26 * 60);
  await row("old-failed", "FAILED", 3 * 60);
  await row("just-sent", "PROCESSING", 10);
  await row("arrived", "COMPLETED", 5 * 60);
  await row("never-paid", "AWAITING_DEPOSIT", null);
  const unfinished = await payoutsNotFinished(new Date(NOW));
  assert.deepEqual(unfinished.map((payout) => payout.reference), ["old-processing", "old-failed"], "the oldest first; one just sent, one arrived and one never paid for are not");
  const alert = payoutsNotFinishedAlert(unfinished, NOW);
  assert.equal(alert?.subject, "2 mobile money payouts have not arrived");
  assert.deepEqual(alert?.text.split("\n").slice(1, 3), ["- payout old-processing, SN wave: PROCESSING, $5.00 sent 26 h ago", "- payout old-failed, SN wave: FAILED, $5.00 sent 3 h ago"]);
  assert.equal(payoutsNotFinishedAlert([], NOW), null);
  assert.equal(payoutsNotFinishedAlert(unfinished.slice(0, 1), NOW)?.subject, "1 mobile money payout has not arrived");
  // Read by the settling pass's route, whose answer it never stops.
  const route = readFileSync("app/api/cron/settle/route.ts", "utf8");
  assert.match(route, /const unfinished = await payoutsNotFinished\(\)\s+\.then\(\(payouts\) => payoutsNotFinishedAlert\(payouts, Date\.now\(\)\)\)\s+\.catch\(/);
});

const USE = { from: "2026-10-01T00:00:00.000Z", until: "2026-11-01T00:00:00.000Z", fetches: { started: 20, proved: 12, allowed: 100 }, verifications: { shown: 4, allowed: 25 } } as unknown as CycleUse;

test("the morning's summary names each university that waits for its provider, with how long", async () => {
  const waiting = [
    { university: "Université de Toulouse (Paul Sabatier)", sense: "results", giftId: "1000010", since: new Date(NOW - 3 * 86_400_000 - 3_600_000) },
    { university: "The American University of Rome", sense: "enrolment", giftId: null, since: new Date(NOW - 2 * 3_600_000) },
  ];
  const summary = morningSummary(NOW - 86_400_000, [], USE, waiting, NOW);
  assert.deepEqual(summary.text.split("\n").slice(-3), ["Waiting for a provider to be built (2):", "- Université de Toulouse (Paul Sabatier), results: asked 3 days ago, gift 1000010", "- The American University of Rome, enrolment: asked today"]);
  assert.equal(morningSummary(NOW - 86_400_000, [], USE, [{ ...waiting[0], since: new Date(NOW - 86_400_000) }], NOW).text.split("\n").at(-1), "- Université de Toulouse (Paul Sabatier), results: asked 1 day ago, gift 1000010");
  // With none waiting the summary is the one it was.
  assert.doesNotMatch(morningSummary(NOW - 86_400_000, [], USE, [], NOW).text, /Waiting for a provider/);
  assert.equal(morningSummary(NOW - 86_400_000, [], USE).text, morningSummary(NOW - 86_400_000, [], USE, [], NOW).text);
  // The summary that is due carries them, and a list that cannot be read never stops it.
  const during = Date.UTC(2026, 9, 20, 6, 5, 0);
  const deps = { claim: async () => true, spent: async () => [], use: async () => USE };
  assert.match((await morningSummaryDue(during, { ...deps, waiting: async () => waiting }))?.text ?? "", /Waiting for a provider to be built \(2\):/);
  const unread = await morningSummaryDue(during, { ...deps, waiting: async () => Promise.reject(new Error("the store did not answer")) });
  assert.ok(unread && !/Waiting for a provider/.test(unread.text));
});

test("the nightly watch says the relayer under its alert, and names the five-minute call when it is late", () => {
  const holds = { database: { ok: true }, worker: { ok: true } };
  const passes = (milestones: { ok: boolean; fault?: "late" | "never ran"; last: string | null }) => ({ ok: milestones.ok, counting: { ok: true, last: null }, settling: { ok: true, last: null }, milestones }) as never;
  assert.equal(healthAlert(holds), null, "what it was given before still says nothing when both hold");
  assert.equal(healthAlert({ ...holds, relayer: { ok: true, mon: "49.70", underAlert: false }, passes: passes({ ok: true, last: "2026-10-20T01:55:00.000Z" }) }), null);
  // Under the alert line the relayer still works: it is said all the same, between two passes too.
  assert.equal(healthAlert({ ...holds, relayer: { ok: true, mon: "20.00", underAlert: true } })?.subject, "Not holding at the nightly watch: the relayer (20.00 MON, under 25.00)");
  assert.equal(healthAlert({ ...holds, relayer: { ok: false, fault: "low", mon: "9.00" } })?.subject, "Not holding at the nightly watch: the relayer (9.00 MON, under 25.00)");
  assert.equal(healthAlert({ ...holds, relayer: { ok: false, fault: "unreachable" } })?.subject, "Not holding at the nightly watch: the relayer (unreachable)");
  // The call every frequent reading and the morning summary ride on.
  assert.equal(healthAlert({ ...holds, passes: passes({ ok: false, fault: "late", last: "2026-10-19T23:40:00.000Z" }) })?.subject, "Not holding at the nightly watch: the five-minute call (late, last at 2026-10-19T23:40:00.000Z)");
  assert.equal(healthAlert({ ...holds, passes: passes({ ok: false, fault: "never ran", last: null }) })?.subject, "Not holding at the nightly watch: the five-minute call (never ran)");
  // One email for everything the reading found.
  const all = healthAlert({ database: { ok: false, fault: "unreachable" }, worker: { ok: true }, relayer: { ok: true, mon: "20.00", underAlert: true }, passes: passes({ ok: false, fault: "late", last: "2026-10-19T23:40:00.000Z" }) });
  assert.equal(all?.subject, "Not holding at the nightly watch: the database (unreachable), the relayer (20.00 MON, under 25.00), the five-minute call (late, last at 2026-10-19T23:40:00.000Z)");
});
