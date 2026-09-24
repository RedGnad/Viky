import { UNIVERSITIES } from "../src/universities";

/**
 * Every school named on the landing still has its page on the platform Viky reads (D225): fetched as a browser
 * would, it answers 200 and stays on its own page. edX answers 200 for a school it no longer lists by sending the
 * visitor to its generic partners page, which is how MIT was found gone; that counts as missing here.
 *
 * Usage: `pnpm check:universities`. Exits 1 when any page is missing, so the sentence is taken down before it lies.
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

async function main() {
  let missing = 0;
  for (const school of UNIVERSITIES) {
    let said: string;
    try {
      const answer = await fetch(school.page, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
      const stayed = new URL(answer.url).pathname === new URL(school.page).pathname;
      const ok = answer.status === 200 && stayed;
      if (!ok) missing += 1;
      said = `${ok ? "ok " : "MISSING"} ${answer.status} ${stayed ? "" : `-> ${answer.url}`}`;
    } catch (error) {
      missing += 1;
      said = `MISSING ${error instanceof Error ? error.message : String(error)}`;
    }
    console.log(`${school.name.padEnd(12)} ${school.platform.padEnd(9)} ${said}`);
  }
  console.log(missing === 0 ? `all ${UNIVERSITIES.length} pages found` : `${missing} missing: take the name off src/universities.ts`);
  process.exit(missing === 0 ? 0 : 1);
}

void main();
