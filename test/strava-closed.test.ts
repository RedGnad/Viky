// Strava is closed (the founder, 12 Oct 2026). Its developer program asks the owner of every application for a paid
// subscription since June 2026; the first real reading, gift 1002, was refused; the founder does not take the
// subscription. The line leaves the choice of a gift, the public page shows it closed with its reason in one line,
// every page counts seventeen, and the one gift made on it is read for nothing and told so.

delete process.env.DATABASE_URL;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Hex } from "viem";
import { closedLineOf } from "../src/closed-line";
import { conditionById, CONDITIONS, FITBIT_DAILY, liveConditions, stateOf, STRAVA_DAILY } from "../src/conditions";
import { newVaultKey, sealSecret } from "../src/connect-vault";
import { connectedLineOf, runConnectedCheckIn, type ConnectedCheckInDeps } from "../src/connected-checkin";
import { configureConnectionStore, ensureConnectionSchema, saveConnection } from "../src/connection-store";
import { NO_CONTACT_HASH } from "../src/contact-hash";
import { UNCLAIMED_REFUND_DELAY_SECONDS } from "../src/daily-pass";
import { configureGiftStore, ensureGiftSchema, markClaimed, saveGift } from "../src/gift-store";
import { GOAL_TYPE_STRAVA_DISTANCE } from "../src/gift-terms";
import type { SqlExecutor } from "../src/proof-session-store";
import { GIFT_LIVE, GIFT_PAGE } from "../src/sentences";

const SAID = "Viky no longer reads Strava. Strava's developer program asks for a paid subscription.";

test("the line is closed in the register: out of the choice, seventeen left, and its reason in one line", () => {
  assert.equal(STRAVA_DAILY.live, false);
  assert.equal(stateOf(STRAVA_DAILY).title, "Closed");
  assert.equal(STRAVA_DAILY.beforeItOpens, "Strava's developer program asks for a paid subscription.");
  assert.equal(liveConditions().length, 17);
  assert.equal(liveConditions().some((condition) => condition.id === "strava-daily"), false);
  assert.equal(CONDITIONS.length, 18, "the line stays in the register, so the public page can say why it is closed");
  // The words a holder of a gift on it reads, and nothing for a line in any other state.
  assert.equal(closedLineOf(STRAVA_DAILY), SAID);
  assert.equal(closedLineOf(conditionById("strava-daily")), SAID);
  assert.equal(closedLineOf(FITBIT_DAILY), null);
  assert.equal(closedLineOf(undefined), null);
  // A gift opened on it and never started: it cannot start, and it goes back once fourteen days have passed since it
  // was opened, at the pass that follows, which the card says with the day ("after", never "on").
  assert.equal(GIFT_PAGE.lineClosedGift, "This gift cannot start.");
  assert.equal(GIFT_LIVE.notConnected.closedYours("Strava"), "Viky no longer reads Strava.");
  assert.equal(GIFT_LIVE.notConnected.closedTheirs("Boo", "Strava"), "Boo opened it, and Viky no longer reads Strava.");
  assert.equal(GIFT_LIVE.notConnected.goesBackAfter("26 Oct 2026", "Mom"), "It goes back to Mom after 26 Oct 2026, or now if you end it.");
  assert.equal(GIFT_LIVE.notConnected.comesBackAfter("26 Oct 2026"), "It comes back to you after 26 Oct 2026.");
  assert.match(readFileSync("src/gift-live.ts", "utf8"), /if \(input\.lineClosed\)\s+return \{\s+headline: yours \? L\.notConnected\.closedYours\(source\) : L\.notConnected\.closedTheirs\(recipientName, source\),/);
  assert.match(readFileSync("app/components/GiftPage.tsx", "utf8"), /lineClosed: condition\?\.state === "closed",/);
  assert.equal(UNCLAIMED_REFUND_DELAY_SECONDS, 14 * 86_400);
  assert.match(readFileSync("contracts/GiftEscrowV3.sol", "utf8"), /bool neverConnected = g\.recipient != address\(0\) && g\.startDay == 0\s+&& block\.timestamp >= _afterPause\(uint256\(g\.claimedAt\) \+ UNCLAIMED_REFUND_DELAY\);/);
});

test("the pages say it: closed with its reason, never waiting for an answer, and seventeen conditions", () => {
  // The public page prints the state's title and the line's own reason.
  const page = readFileSync("app/what-viky-can-check/page.tsx", "utf8");
  assert.match(page, /state\.id === "open" \? .* : \(condition\.beforeItOpens \?\? state\.meaning\)/);
  assert.notEqual(STRAVA_DAILY.state, "asked-the-source", "nothing was asked of Strava");
  // The judges page: the list of conditions says closed and why, and the fold of risks says what happened.
  const list = readFileSync("app/judges/JudgesConditions.tsx", "utf8");
  assert.match(list, /condition\.state === "closed" && condition\.beforeItOpens \? `: \$\{condition\.beforeItOpens\.replace\(\/\\\.\$\/, ""\)\}` : ""/);
  const judges = readFileSync("app/judges/page.tsx", "utf8");
  assert.match(judges, /<Row title=\{<>Strava: closed on 12 Oct 2026<\/>\}>\s+<div data-strava-closed>/);
  assert.doesNotMatch(judges, /Strava or Fitbit/, "no sentence reads Strava in the present any more");
  assert.equal((judges.match(/Strava was\s+read the same way, and is closed\./g) ?? []).length, 2);
  // The README counts what is offered.
  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /^## Seventeen conditions, three ways of reading$/m);
  assert.doesNotMatch(readme, /Eighteen conditions/);
  assert.match(readme, /An eighteenth, daily kilometres on Strava, is built\s+and closed since 12 Oct 2026: Strava's developer program asks for a paid subscription\./);
});

const ESCROW = "0x00000000000000000000000000000000000000D3" as Hex;
const FUNDER = "0x000000000000000000000000000000000000F0F0" as Hex;
const RECIPIENT = "0x000000000000000000000000000000000000b0b0" as Hex;

process.env.CONNECT_TOKEN_KEY = newVaultKey();
let db: PGlite;
before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configureGiftStore(executor);
  configureConnectionStore(executor);
  await ensureGiftSchema();
  await ensureConnectionSchema();
  // Gift 1002 as it stands: opened, Strava connected, never started.
  await saveGift({ giftId: "1002", funder: FUNDER, contactHash: NO_CONTACT_HASH, claimToken: "a-link-key-0123456789abcdef", goalType: GOAL_TYPE_STRAVA_DISTANCE, dailyTarget: 1, durationDays: 7, amount: 1_120_000n, createdTx: `0x${"a2".repeat(32)}`, escrow: ESCROW });
  await markClaimed("1002", RECIPIENT, null);
  await saveConnection({ giftId: "1002", source: "strava", externalId: "4242", accessToken: sealSecret("an access key"), refreshToken: sealSecret("a refresh key"), expiresAt: new Date(Date.now() + 3_600_000), scope: "read,activity:read" });
});
after(async () => {
  configureGiftStore(undefined);
  configureConnectionStore(undefined);
  delete process.env.CONNECT_TOKEN_KEY;
  await db.close();
});

test("gift 1002 is read for nothing: no key opened, nothing asked of Strava or of Reclaim, and it is told why", async () => {
  const reached: string[] = [];
  const never = (what: string) => async () => {
    reached.push(what);
    throw new Error(`${what} was reached`);
  };
  const line = connectedLineOf(GOAL_TYPE_STRAVA_DISTANCE)!;
  const deps: ConnectedCheckInDeps = {
    now: () => Math.floor(Date.now() / 1_000),
    configured: () => true,
    gift: never("the chain") as never,
    refresh: never("the refresh") as never,
    look: never("the look") as never,
    read: never("the proof") as never,
    // What production's own dependencies ask of the register.
    closed: (asked) => closedLineOf(conditionById(asked.conditionId)),
  };
  assert.equal(line.conditionId, "strava-daily");
  for (const purpose of ["bind", "count"] as const) {
    assert.deepEqual(await runConnectedCheckIn({ giftId: "1002", purpose }, deps), purpose === "bind" ? { kind: "refused", giftId: "1002", code: "CONDITION_CLOSED", message: SAID } : { kind: "already", giftId: "1002", reason: "not_bound" });
  }
  assert.deepEqual(reached, []);
  // The default dependencies ask the register, and the check comes before the connection is even loaded.
  const checkIn = readFileSync("src/connected-checkin.ts", "utf8");
  assert.match(checkIn, /closed: \(line\) => closedLineOf\(conditionById\(line\.conditionId\)\),/);
  assert.ok(checkIn.indexOf("const closed = deps.closed?.(line) ?? null;") > 0 && checkIn.indexOf("const closed = deps.closed?.(line) ?? null;") < checkIn.indexOf("const connection = await loadConnection(giftId);"));
});

test("nobody is sent to Strava's page, and the gift's page says the line is closed in place of the connection", () => {
  const start = readFileSync("app/api/connect/strava/start/route.ts", "utf8");
  assert.match(start, /const closed = closedLineOf\(STRAVA_DAILY\);\s+if \(closed\) throw new GiftApiError\("CONDITION_CLOSED", closed, 409\);/);
  assert.ok(start.indexOf("closedLineOf(STRAVA_DAILY)") < start.indexOf("startStravaConnection({"), "refused before any address of Strava's is made");
  const block = readFileSync("app/kit/ConnectTheAccount.tsx", "utf8");
  assert.match(block, /const closed = closedLineOf\(condition\);\s+if \(closed\) \{/);
  assert.match(block, /<p className="font-medium">\{condition\?\.beforeItOpens\}<\/p>\s+\{status\?\.bound \? null : <p className=\{BODY\}>\{W\.lineClosedGift\}<\/p>\}/);
  // A key already given can still be given back.
  assert.match(block, /data-line-closed=""[\s\S]*?\{words\.disconnect\}/);
});
