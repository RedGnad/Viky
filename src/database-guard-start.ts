import { assertDatabaseAllowed, ProductionDatabaseRefused } from "./database-guard";
import { assertSecondVersionWhole, SecondVersionHalfSet } from "./v2";

/** At server start: stop the process when the second version of the contracts is half set (src/v2.ts; Node.js only). */
export function refuseHalfSetSecondVersion(): void {
  try {
    assertSecondVersionWhole();
  } catch (error) {
    if (!(error instanceof SecondVersionHalfSet)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

/** At server start: stop the process when the database is production's and this is not a deployment (Node.js only). */
export function refuseProductionDatabase(): void {
  try {
    assertDatabaseAllowed();
  } catch (error) {
    if (!(error instanceof ProductionDatabaseRefused)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
