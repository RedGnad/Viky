import { existsSync, readFileSync } from "node:fs";
import { attestedSource, headersFor, matchesOf } from "../src/attested-sources";
import { readAccredibleCredential } from "../src/accredible-reading";
import { readChessStanding } from "../src/chess-reading";
import { readCodeforcesStanding } from "../src/codeforces-reading";
import { readCourseraCertificate } from "../src/coursera-reading";
import { readCredlyBadge } from "../src/credly-reading";
import { readDetCertificate } from "../src/det-reading";
import { resolvePublicDuolingoProfile } from "../src/duolingo-profile";
import { readEdxCertificate } from "../src/edx-reading";
import { readMarathonResult } from "../src/marathon-reading";
import { readMitxOnlineCertificate } from "../src/mitx-online-reading";
import { listWcaCompetitions, readWcaCompetition, readWcaResult } from "../src/wca-reading";

/**
 * Asks every public source Viky reads whether it still answers in the shape the readers expect (the audit of 1 Oct
 * 2026, F-24). Nothing watched the sources: a field renamed or a column moved was learnt from a person whose gift
 * was refused, in a sentence that blamed them. Run it once a day while gifts are read; a line that fails is a
 * source to look at before anybody meets it.
 *
 * Three kinds of question, a few plain GETs per source, paced:
 *   reads    the repository's own plain reader on an account that exists: it must answer.
 *   refuses  the same reader on an account that does not exist: it must refuse with the source's own "not there",
 *            never with "could not be read". This one needs no real account, so it runs for every source.
 *   patterns the page fetched with the source's own headers, and every pattern the attested read is taken with:
 *            each must still find its field. It is what the reading worker would meet.
 *
 * It moves no money, signs nothing and needs no secret. It reads public pages as the app does, naming itself.
 *
 * The accounts that exist: this file names only public profiles this repository already names. A source whose only
 * real pages are one person's own certificate takes its sample from `private-fixtures/check-sources.json`, which is
 * never committed (`{ "det": "<certificate id>", "edx": "...", "mitx": "...", "credly": "...", "accredible": "...",
 * "coursera": "...", "breizh": "<event|heat|bib>", "raceresult": "<event|contest|bib>" }`); without one, that
 * source's `reads` and `patterns` are skipped and said so, and its `refuses` still runs.
 *
 * Usage: pnpm check:sources            every source
 *        pnpm check:sources chess,wca  some of them
 * Exit code 1 when a line fails.
 */

type Line = { source: string; what: string; result: "ok" | "FAIL" | "skip"; detail: string; ms: number };
const lines: Line[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SAMPLES_FILE = "private-fixtures/check-sources.json";
const samples: Record<string, string> = existsSync(SAMPLES_FILE) ? (JSON.parse(readFileSync(SAMPLES_FILE, "utf8")) as Record<string, string>) : {};

function say(line: Line): void {
  lines.push(line);
  console.log(`${line.result.padEnd(4)} ${line.source.padEnd(12)} ${line.what}${line.detail ? `: ${line.detail}` : ""}${line.result === "skip" ? "" : ` (${line.ms} ms)`}`);
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : error instanceof Error ? error.name : "Error";
}

/** The reader must answer. What it answered is not printed: only that it did. */
async function reads(source: string, what: string, run: () => Promise<unknown>): Promise<unknown> {
  const started = Date.now();
  try {
    const value = await run();
    say({ source, what: `reads ${what}`, result: "ok", detail: "", ms: Date.now() - started });
    return value;
  } catch (error) {
    say({ source, what: `reads ${what}`, result: "FAIL", detail: `${codeOf(error)} ${error instanceof Error ? error.message.slice(0, 160) : ""}`, ms: Date.now() - started });
    return undefined;
  }
}

/** The reader must refuse, with one of the codes that mean "not there". */
async function refuses(source: string, what: string, expected: readonly string[], run: () => Promise<unknown>): Promise<void> {
  const started = Date.now();
  try {
    const value = await run();
    // A reader that answers "nothing" for an account that does not exist has refused, in its own way.
    if (value === null || value === undefined) say({ source, what: `refuses ${what}`, result: "ok", detail: "answered nothing", ms: Date.now() - started });
    else say({ source, what: `refuses ${what}`, result: "FAIL", detail: "it answered for an account that does not exist", ms: Date.now() - started });
  } catch (error) {
    const code = codeOf(error);
    say({ source, what: `refuses ${what}`, result: expected.includes(code) ? "ok" : "FAIL", detail: expected.includes(code) ? code : `${code}, expected ${expected.join(" or ")}: ${error instanceof Error ? error.message.slice(0, 160) : ""}`, ms: Date.now() - started });
  }
}

/** The page as the reading worker fetches it, and every pattern of the attested read tried on it. */
async function patterns(sourceId: string, account: string, label = "the sample"): Promise<void> {
  const source = attestedSource(sourceId);
  const started = Date.now();
  const what = `patterns of ${sourceId} on ${label}`;
  if (!source) return say({ source: sourceId, what, result: "FAIL", detail: "no such attested source", ms: 0 });
  if (!source.accepts(account)) return say({ source: sourceId, what, result: "FAIL", detail: "the source refuses the shape of the account", ms: 0 });
  try {
    const response = await fetch(source.url(account), { headers: headersFor(source), redirect: "follow", signal: AbortSignal.timeout(25_000) });
    const body = await response.text();
    const missing = matchesOf(source, account).filter((match) => !new RegExp(match.value).test(body));
    const ok = response.status === 200 && missing.length === 0;
    say({
      source: sourceId,
      what,
      result: ok ? "ok" : "FAIL",
      detail: ok ? "" : `status ${response.status}, ${missing.length} of ${matchesOf(source, account).length} patterns found nothing${missing[0] ? `, first: ${missing[0].value.slice(0, 60)}` : ""}`,
      ms: Date.now() - started,
    });
  } catch (error) {
    say({ source: sourceId, what, result: "FAIL", detail: error instanceof Error ? error.message.slice(0, 160) : String(error), ms: Date.now() - started });
  }
}

function skip(source: string, what: string): void {
  say({ source, what, result: "skip", detail: `no sample in ${SAMPLES_FILE}`, ms: 0 });
}

const asked = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2].split(",") : null;
const wants = (name: string) => !asked || asked.includes(name);

async function main() {
  if (wants("chess")) {
    // Public profiles this repository already names (src/chess-com.ts, src/chess-reading.ts).
    for (const climb of ["rapid", "blitz", "bullet", "daily", "tactics"] as const) {
      await reads("chess", `hikaru's ${climb} standing`, () => readChessStanding("hikaru", climb));
      await sleep(400);
    }
    await refuses("chess", "a player nobody is", ["PROFILE_NOT_FOUND"], () => readChessStanding("zzqxnobody12345", "rapid"));
    await patterns("chess-profile", "hikaru", "hikaru");
    await patterns("chess-player", "hikaru", "hikaru");
    for (const mode of ["rapid", "blitz", "bullet", "daily"]) await patterns(`chess-ratings-${mode}`, "hikaru", "hikaru");
    await patterns("chess-tactics", "hikaru", "hikaru");
  }
  if (wants("codeforces")) {
    await reads("codeforces", "tourist's standing", () => readCodeforcesStanding("tourist"));
    await sleep(2_200);
    await refuses("codeforces", "a handle nobody has", ["PROFILE_NOT_FOUND"], () => readCodeforcesStanding("zzqxnobody12345"));
    await sleep(2_200);
    await patterns("codeforces-user", "tourist", "tourist");
    await sleep(2_200);
    await patterns("codeforces-user-named", "tourist", "tourist");
  }
  if (wants("duolingo")) {
    await reads("duolingo", "Luis's public profile", async () => {
      const profile = await resolvePublicDuolingoProfile("Luis");
      if (!profile) throw new Error("no profile answered for a name that exists");
      return profile;
    });
    await refuses("duolingo", "a name nobody has", ["NO_SUCH_PROFILE"], () => resolvePublicDuolingoProfile("zzqx-nobody-12345"));
    await patterns("duolingo-profile", "Luis", "Luis");
  }
  if (wants("det")) {
    if (samples.det) {
      await reads("det", "a certificate", () => readDetCertificate(samples.det));
      await patterns("det-certificate", samples.det);
    } else skip("det", "reads and patterns");
    // Duolingo answers a certificate that never existed as it answers one that has run out (measured 1 Oct 2026).
    await refuses("det", "a certificate nobody holds", ["NO_CERTIFICATE", "CERTIFICATE_EXPIRED"], () => readDetCertificate("zzzzzzzzzzzzzzzz"));
  }
  if (wants("coursera")) {
    if (samples.coursera) {
      await reads("coursera", "a certificate", () => readCourseraCertificate(samples.coursera));
      await patterns("coursera-certificate", samples.coursera);
    } else skip("coursera", "reads and patterns");
    await refuses("coursera", "a certificate nobody holds", ["NO_CERTIFICATE", "INVALID_LINK"], () => readCourseraCertificate("ZZZZZZZZZZZZ"));
  }
  if (wants("edx")) {
    if (samples.edx) {
      await reads("edx", "a certificate", () => readEdxCertificate(samples.edx));
      await patterns("edx-certificate", samples.edx);
    } else skip("edx", "reads and patterns");
    await refuses("edx", "a certificate nobody holds", ["NO_CERTIFICATE", "INVALID_LINK"], () => readEdxCertificate("00000000000000000000000000000000"));
  }
  if (wants("mitx")) {
    if (samples.mitx) {
      await reads("mitx-online", "a certificate", () => readMitxOnlineCertificate(samples.mitx));
      await patterns("mitx-online-certificate", samples.mitx);
    } else skip("mitx-online", "reads and patterns");
    await refuses("mitx-online", "a certificate nobody holds", ["NO_CERTIFICATE", "INVALID_LINK"], () => readMitxOnlineCertificate("00000000-0000-4000-8000-000000000000"));
  }
  if (wants("credly")) {
    if (samples.credly) {
      await reads("credly", "a badge", () => readCredlyBadge(samples.credly));
      await patterns("credly-assertion", samples.credly);
      await patterns("credly-badge-page", samples.credly);
    } else skip("credly", "reads and patterns");
    await refuses("credly", "a badge nobody holds", ["NO_BADGE", "NO_CERTIFICATE", "INVALID_LINK"], () => readCredlyBadge("00000000-0000-4000-8000-000000000000"));
  }
  if (wants("accredible")) {
    if (samples.accredible) {
      await reads("accredible", "a credential", () => readAccredibleCredential(samples.accredible));
      await patterns("accredible-credential", samples.accredible);
    } else skip("accredible", "reads and patterns");
    await refuses("accredible", "a credential nobody holds", ["NO_CERTIFICATE", "INVALID_LINK"], () => readAccredibleCredential("00000000-0000-4000-8000-000000000000"));
  }
  if (wants("wca")) {
    // The competition and the result this repository's own source description was measured on (src/attested-sources.ts).
    await reads("wca", "a competition", () => readWcaCompetition("SaintSymphorienSpeedcubing2026"));
    await reads("wca", "a result at it", () => readWcaResult("SaintSymphorienSpeedcubing2026/333", "2019SCHO04"));
    await patterns("wca-person-results", "2019SCHO04|SaintSymphorienSpeedcubing2026|333|f", "that result");
    await reads("wca", "the competitions to come", async () => {
      const coming = await listWcaCompetitions(new Date().toISOString().slice(0, 10));
      if (coming.length === 0) throw new Error("the list of coming competitions is empty");
      return coming.length;
    });
    await refuses("wca", "a competition nobody held", ["UNKNOWN_COMPETITION", "INVALID_LINK"], () => readWcaCompetition("ZzNoSuchCompetition1999"));
  }
  if (wants("breizh")) {
    if (samples.breizh) {
      await reads("breizh-chrono", "a runner's line", () => readMarathonResult(samples.breizh));
      await patterns("breizh-chrono-runner", samples.breizh);
    } else skip("breizh-chrono", "reads and patterns");
  }
  if (wants("raceresult")) {
    if (samples.raceresult) await reads("race-result", "a runner's line", () => readMarathonResult(samples.raceresult));
    else skip("race-result", "reads");
    // The event this repository's register was measured on: a bib nobody wore must be "no result", which also
    // shows the event's page, its list and its columns still read (src/race-result.ts).
    await refuses("race-result", "a bib nobody wore", ["NO_RESULT"], () => readMarathonResult("423560|1|99999"));
    await sleep(3_500);
  }

  const failed = lines.filter((line) => line.result === "FAIL");
  const skipped = lines.filter((line) => line.result === "skip");
  console.log("");
  console.log(`${lines.length - failed.length - skipped.length} ok, ${failed.length} failed, ${skipped.length} skipped`);
  if (failed.length > 0) throw new Error(`${failed.length} line(s) failed: ${[...new Set(failed.map((line) => line.source))].join(", ")}`);
}

main().catch((error) => {
  console.error("CHECK_FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
