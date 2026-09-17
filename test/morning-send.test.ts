import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { tellAboutDays, tellAboutMilestone, type GiftFacts, type PushRefusal, type PushSent, type TellingDeps } from "../src/morning-send";
import type { SqlExecutor } from "../src/proof-session-store";
import { claimTelling, configurePushStore, ensurePushSchema, forgetEndpoint, isSubscribed, rememberSubscription, subscriptionsForGift } from "../src/push-store";

/**
 * Sending the morning message, against a real database and a push service that answers what a push service answers.
 *
 * The four things that must hold whatever happens: a credited day and a returned day both reach the two people; a day
 * is told about once however many times the record is written; a browser the service says is gone is deleted at that
 * first refusal; and nothing here can make a settled day fail.
 */

let db: PGlite;
const FUNDER = "0x000000000000000000000000000000000000A11C";
const RECIPIENT = "0x000000000000000000000000000000000000B0B0";

const FACTS: GiftFacts = {
  funder: FUNDER,
  names: { recipientName: "Léa", funderName: "Maman" },
  perDayDisplay: "$3.57",
  amountDisplay: "$25.00",
  words: { yesterday: "yesterday's lesson" },
};

type Sent = { endpoint: string; message: string };

function deps(sent: Sent[], answer: (endpoint: string) => PushSent | PushRefusal = () => ({ ok: true })): TellingDeps {
  return {
    subscriptions: subscriptionsForGift,
    claim: claimTelling,
    forgetEndpoint,
    facts: async () => FACTS,
    send: async (subscription, payload) => {
      const result = answer(subscription.endpoint);
      if (result.ok) sent.push({ endpoint: subscription.endpoint, message: (JSON.parse(payload) as { message: string }).message });
      return result;
    },
    log: () => {},
  };
}

async function bothSides(giftId: string): Promise<void> {
  await rememberSubscription({ endpoint: `https://push.example/${giftId}/funder`, giftId, account: FUNDER, p256dh: "p".repeat(40), auth: "a".repeat(20) });
  await rememberSubscription({ endpoint: `https://push.example/${giftId}/recipient`, giftId, account: RECIPIENT, p256dh: "p".repeat(40), auth: "a".repeat(20) });
}

before(async () => {
  db = new PGlite();
  const executor: SqlExecutor = async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ""}`, "");
    return (await db.query<Record<string, unknown>>(text, values)).rows;
  };
  configurePushStore(executor);
  await ensurePushSchema();
});

beforeEach(async () => {
  await db.query("DELETE FROM viky_push");
  await db.query("DELETE FROM viky_told");
});

after(async () => {
  configurePushStore(undefined);
  await db.close();
});

test("a credited day tells both sides, each in their own words", async () => {
  await bothSides("1");
  const sent: Sent[] = [];
  assert.equal(await tellAboutDays("1", [{ day: 20_709, outcome: "earned" }], deps(sent)), 2);
  assert.deepEqual(
    sent.map((entry) => entry.message).sort(),
    ["Léa did yesterday's lesson. $3.57 is theirs.", "Yesterday counted. $3.57 is yours."].sort(),
  );
});

test("a returned day tells both sides too, because that is the day nobody would otherwise know about", async () => {
  await bothSides("2");
  const sent: Sent[] = [];
  assert.equal(await tellAboutDays("2", [{ day: 20_709, outcome: "returned" }], deps(sent)), 2);
  assert.deepEqual(
    sent.map((entry) => entry.message).sort(),
    ["Yesterday came back to you: $3.57.", "Yesterday went back to Maman. Today still counts."].sort(),
  );
});

test("several days settled at once speak of the last of them, once", async () => {
  await bothSides("3");
  const sent: Sent[] = [];
  const days = [
    { day: 20_707, outcome: "returned" },
    { day: 20_709, outcome: "earned" },
    { day: 20_708, outcome: "returned" },
  ] as const;
  assert.equal(await tellAboutDays("3", days, deps(sent)), 2);
  assert.ok(sent.every((entry) => /counted|did yesterday/.test(entry.message)), sent.map((entry) => entry.message).join(" | "));
});

test("one sending per day and per gift, however many times the record is written", async () => {
  await bothSides("4");
  const sent: Sent[] = [];
  assert.equal(await tellAboutDays("4", [{ day: 20_709, outcome: "earned" }], deps(sent)), 2);
  assert.equal(await tellAboutDays("4", [{ day: 20_709, outcome: "earned" }], deps(sent)), 0, "the same day again says nothing");
  assert.equal(sent.length, 2);
  // The next day is its own subject, and it is told.
  assert.equal(await tellAboutDays("4", [{ day: 20_710, outcome: "returned" }], deps(sent)), 2);
  assert.equal(sent.length, 4);
  // Another gift's day of the same number is another gift's day.
  await bothSides("5");
  assert.equal(await tellAboutDays("5", [{ day: 20_709, outcome: "earned" }], deps(sent)), 2);
});

test("a browser the push service says is gone is deleted at that first refusal, for every gift", async () => {
  await bothSides("6");
  await rememberSubscription({ endpoint: "https://push.example/6/funder", giftId: "7", account: FUNDER, p256dh: "p".repeat(40), auth: "a".repeat(20) });
  const sent: Sent[] = [];
  const gone = (endpoint: string): PushSent | PushRefusal => (endpoint.endsWith("funder") ? { ok: false, gone: true } : { ok: true });
  assert.equal(await tellAboutDays("6", [{ day: 20_709, outcome: "earned" }], deps(sent, gone)), 1);
  assert.equal(await isSubscribed("https://push.example/6/funder", "6"), false, "gone from the gift it refused on");
  assert.equal(await isSubscribed("https://push.example/6/funder", "7"), false, "and from every other gift");
  assert.equal(await isSubscribed("https://push.example/6/recipient", "6"), true, "the other browser is untouched");
});

test("a refusal that is not the browser being gone keeps the subscription, and a throw stops nothing", async () => {
  await bothSides("8");
  const sent: Sent[] = [];
  const busy = (endpoint: string): PushSent | PushRefusal => (endpoint.endsWith("funder") ? { ok: false, gone: false } : { ok: true });
  assert.equal(await tellAboutDays("8", [{ day: 20_709, outcome: "earned" }], deps(sent, busy)), 1);
  assert.equal(await isSubscribed("https://push.example/8/funder", "8"), true, "a service having a bad minute is not a dead browser");

  await bothSides("9");
  const thrown: TellingDeps = {
    ...deps([]),
    send: async () => {
      throw new Error("the network went");
    },
  };
  assert.equal(await tellAboutDays("9", [{ day: 20_709, outcome: "earned" }], thrown), 0);
});

test("nothing is sent when nobody asked, and nothing is claimed either", async () => {
  const sent: Sent[] = [];
  assert.equal(await tellAboutDays("10", [{ day: 20_709, outcome: "earned" }], deps(sent)), 0);
  assert.equal(sent.length, 0);
  // Subscribing a minute later must still hear about that day: the subject was not burned on an empty gift.
  await bothSides("10");
  assert.equal(await tellAboutDays("10", [{ day: 20_709, outcome: "earned" }], deps(sent)), 2);
});

test("a day the record did not write is not news, so it is never told", async () => {
  await bothSides("11");
  const sent: Sent[] = [];
  assert.equal(await tellAboutDays("11", [], deps(sent)), 0);
  assert.equal(sent.length, 0);
});

test("a milestone reached and a milestone expired are told once each, with the whole amount", async () => {
  await bothSides("12");
  const sent: Sent[] = [];
  assert.equal(await tellAboutMilestone("12", "reached", deps(sent)), 2);
  assert.equal(await tellAboutMilestone("12", "reached", deps(sent)), 0);
  assert.deepEqual(sent.map((entry) => entry.message).sort(), ["Léa reached it. $25.00 is theirs.", "You reached it. $25.00 is yours."].sort());
  sent.length = 0;
  assert.equal(await tellAboutMilestone("12", "expired", deps(sent)), 2);
  assert.deepEqual(sent.map((entry) => entry.message).sort(), ["The time is up. $25.00 came back to you.", "The time is up. $25.00 went back to Maman."].sort());
});

test("a gift this deployment cannot read tells nobody, rather than telling them something untrue", async () => {
  await bothSides("13");
  const sent: Sent[] = [];
  const unreadable: TellingDeps = { ...deps(sent), facts: async () => null };
  assert.equal(await tellAboutDays("13", [{ day: 20_709, outcome: "earned" }], unreadable), 0);
  // And the day is not burned: it can be told when the gift can be read again.
  assert.equal(await tellAboutDays("13", [{ day: 20_709, outcome: "earned" }], deps(sent)), 2);
});
