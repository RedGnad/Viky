import "../src/load-env";
import { keccak256, stringToHex, type Hex } from "viem";
import { attestByGoal, proveCertificate, type CertificateReadingDeps } from "../src/certificate-reading";
import { MARATHON_GOAL_TYPE, MARATHON_RACES, marathonAccount, marathonSubject } from "../src/marathon";
import { SHAPE_HAVE_OR_NOT } from "../src/milestone-protocol";

/**
 * The founder's proof (b) for "Finish a marathon" (D273): the mechanism, run on a REAL attested reading of a public
 * result, with everything else stood in for. The reading service reads the runner's page through the attested fetch,
 * exactly as production does; the gift, its state and the relay are fakes that print what they would have received.
 *
 *   NAME="Mor Fall" BIB=347 RACE=dakar-2023 pnpm tsx scripts/marathon-rehearse.ts
 *
 * Nothing moves: the "relay" prints the EIP-712 message it would have sent and returns a made-up hash, and the
 * "record" prints the reading line. Proof (c), a test payment that goes, is the same path with the real gift.
 */
async function main() {
  const name = process.env.NAME?.trim() || "Mor Fall";
  const bib = process.env.BIB?.trim() || "347";
  const raceId = process.env.RACE?.trim() || "dakar-2023";
  const race = MARATHON_RACES.find((one) => one.raceId === raceId);
  if (!race) throw new Error(`no race ${raceId}`);
  const giftId = "424242";
  const recipient = "0x1111111111111111111111111111111111111111" as Hex;
  const subject = marathonSubject(name, raceId);
  const now = Math.floor(Date.now() / 1_000);
  const sent: unknown[] = [];
  const deps: CertificateReadingDeps = {
    loadGift: async () => ({ giftId, recipient, escrow: "0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e" }) as never,
    readState: async () => ({ goalType: MARATHON_GOAL_TYPE, shape: SHAPE_HAVE_OR_NOT, subject, target: 1n, fundedAt: now - 86_400, deadline: now + 30 * 86_400, recipient, settled: false, cancelled: false, earned: 0n }) as never,
    attest: attestByGoal,
    prove: async ({ message }) => {
      sent.push(message);
      return { hash: keccak256(stringToHex(`rehearsal:${giftId}`)) };
    },
    record: async (reading) => {
      console.log(JSON.stringify({ step: "record", username: reading.username, playerId: reading.playerId, rating: reading.rating, outcome: reading.outcome }));
    },
    now: () => now,
  };
  const outcome = await proveCertificate({ giftId, link: marathonAccount(race, bib) }, deps);
  console.log(JSON.stringify({ step: "outcome", ...outcome }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log(JSON.stringify({ step: "message the relay would sign", messages: sent }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

main().catch((error) => {
  console.error("REHEARSAL_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
