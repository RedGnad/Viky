import { assertDatabaseAllowed, ProductionDatabaseRefused } from "./database-guard";

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
