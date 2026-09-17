import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { RATE_SOURCE } from "../src/rails";
import { currentRates, forgetRates, parseEcbRates, ratesUsable } from "../src/rates";

/**
 * The one exchange rate Viky reads. The sample is the head of the ECB's own file as read on 17 Sep 2026, which
 * carried the rates of 16 Sep.
 */
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<Cube>
		<Cube time='2026-09-16'>
			<Cube currency='USD' rate='1.1537'/>
			<Cube currency='JPY' rate='178.88'/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;

const DAY = 86_400_000;

beforeEach(() => forgetRates());

test("the file gives one dated dollar rate, and the CFA franc follows through the fixed parity", () => {
  const rates = parseEcbRates(SAMPLE, 1_000);
  assert.equal(rates.date, "2026-09-16");
  assert.equal(rates.usdPerEur, 1.1537);
  assert.ok(Math.abs(rates.eurPerUsd - 1 / 1.1537) < 1e-12);
  assert.ok(Math.abs(rates.xofPerUsd - (655.957 / 1.1537)) < 1e-9, "CFA francs per dollar, through 655.957 per euro");
  assert.equal(RATE_SOURCE.cfaFrancsPerEuro, 655.957);
  assert.equal(rates.readAtMs, 1_000);
});

test("a file without a dated dollar line is refused, never guessed at", () => {
  assert.throws(() => parseEcbRates("<Cube time='2026-09-16'></Cube>", 0), /no dated USD line/);
  assert.throws(() => parseEcbRates("<Cube currency='USD' rate='1.1537'/>", 0), /no dated USD line/);
  assert.throws(() => parseEcbRates("<Cube time='2026-09-16'><Cube currency='USD' rate='abc'/></Cube>", 0), /no dated USD line/, "a rate that is not a number is no line at all");
  assert.throws(() => parseEcbRates("<Cube time='2026-09-16'><Cube currency='USD' rate='0'/></Cube>", 0), /not a number/, "and zero is not a rate");
});

test("a read is usable for three days and not a moment longer", () => {
  const rates = parseEcbRates(SAMPLE, 0);
  assert.equal(ratesUsable(rates, 3 * DAY), true);
  assert.equal(ratesUsable(rates, 3 * DAY + 1), false);
  assert.equal(ratesUsable(undefined, 0), false);
  assert.equal(RATE_SOURCE.staleAfterDays, 3);
});

test("the source is asked once an hour, a failure keeps the last good read, and nothing outlives three days", async () => {
  let calls = 0;
  let answer: () => Promise<string> = async () => {
    calls += 1;
    return SAMPLE;
  };
  const fetchFile = () => answer();

  assert.equal((await currentRates(fetchFile, 0))?.date, "2026-09-16");
  assert.equal(calls, 1);
  await currentRates(fetchFile, 30 * 60_000);
  assert.equal(calls, 1, "half an hour later the same read is served");
  await currentRates(fetchFile, 61 * 60_000);
  assert.equal(calls, 2, "an hour later the source is asked again");

  answer = async () => {
    calls += 1;
    throw new Error("down");
  };
  assert.equal((await currentRates(fetchFile, 2 * DAY))?.date, "2026-09-16", "a failed read keeps the last good one");
  assert.equal(await currentRates(fetchFile, 4 * DAY), undefined, "and after three days without an answer, the dollar stands alone");
});
