import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicDuolingoProfile } from "../src/duolingo-profile";

test("resolves the exact public username to a stable uint64 profile id", () => {
  assert.deepEqual(
    parsePublicDuolingoProfile(
      { users: [{ id: 123, username: "SomeoneElse" }, { id: 477033640, username: "Ama" }] },
      "ama",
    ),
    { id: "477033640", username: "Ama", courses: [], currentCourseId: null, totalXp: null, name: null },
  );
});

test("carries the experience and the shown name a look reads, and nothing when they are not what they should be", () => {
  const seen = parsePublicDuolingoProfile({ users: [{ id: 7, username: "Ama", totalXp: 1_250, name: "Ama K7Q2MX" }] }, "Ama");
  assert.equal(seen.totalXp, 1_250);
  assert.equal(seen.name, "Ama K7Q2MX");
  const odd = parsePublicDuolingoProfile({ users: [{ id: 7, username: "Ama", totalXp: "1250", name: 4 }] }, "Ama");
  assert.equal(odd.totalXp, null);
  assert.equal(odd.name, null);
  assert.equal(parsePublicDuolingoProfile({ users: [{ id: 7, username: "Ama", totalXp: -1 }] }, "Ama").totalXp, null);
});

test("rejects missing, malformed and oversized public profile ids", () => {
  assert.throws(() => parsePublicDuolingoProfile({ users: [] }, "Ama"));
  assert.throws(() => parsePublicDuolingoProfile({ users: [{ id: 0, username: "Ama" }] }, "Ama"));
  assert.throws(() => parsePublicDuolingoProfile({ users: [{ id: "18446744073709551616", username: "Ama" }] }, "Ama"));
  assert.throws(() => parsePublicDuolingoProfile({ users: [{ id: 1, username: "Ama" }] }, "bad username!"));
  assert.throws(() => parsePublicDuolingoProfile({}, "Ama"));
});
