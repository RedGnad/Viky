import "../src/load-env";
import { ensurePortalSchema, loadPortal, saveResults } from "../src/portal-store";
import { need, resultsFromEnv } from "./portal-env";

/**
 * Writes the results page of a portal already proved for enrolment (D174): its own provider and request, the field
 * that says passed, the field that carries the grade and its scale, and the year's field when the page dates itself.
 * Run by an operator once a proof has come back from that page with a student present; OPERATIONS, "A university's
 * portal, in thirty minutes", step 1 bis.
 *
 *   PORTAL_ID=ucad-sn RESULTS_PROVIDER_ID=<uuid> RESULTS_PROVIDER_VERSION=1.0.0 RESULTS_REQUEST_HASH=0x… \
 *   RESULTS_ADMITTED_FIELD=decision RESULTS_ADMITTED_MATCHES="^(Admis|Passed)" \
 *   RESULTS_GRADE_FIELD=average RESULTS_GRADE_SCALE=20 pnpm portal:results
 *
 * Against production, the operator command of "The test database" applies (`VIKY_ALLOW_PRODUCTION_DATABASE=1`).
 * `DRY_RUN=1` prints what would be written and writes nothing.
 */
async function main() {
  const portalId = need("PORTAL_ID");
  const results = resultsFromEnv();
  console.log(JSON.stringify({ step: process.env.DRY_RUN === "1" ? "would write" : "writing", portalId, results }, null, 2));
  if (process.env.DRY_RUN === "1") return;
  await ensurePortalSchema();
  if (!(await saveResults(portalId, results))) throw new Error(`no portal ${portalId}: prove it for enrolment first, with pnpm portal:add`);
  const back = await loadPortal(portalId);
  if (!back?.results) throw new Error("the results page did not read back");
  console.log(JSON.stringify({ step: "read back", portalId: back.portalId, university: back.university, scale: back.results.extract?.grade.scale ?? null, year: back.results.extract?.year ?? "the day of the proof" }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
