import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NIGHT_SUN_TRIALS, type NightSunTrial } from "@/src/design-tokens";
import { galleryOpen } from "@/src/dev-access";

/**
 * The laboratory's door: the design gallery's, which production never opens (src/dev-access.ts). Read at request
 * time, after `connection()`, so a build without the switch cannot bake a page either way.
 */
export async function requireLab(): Promise<void> {
  await connection();
  if (!galleryOpen()) notFound();
}

export type Forced = "day" | "night" | undefined;

/** `?appearance=day` or `night` shows that appearance whatever the device says; anything else follows the device. */
export function forcedAppearance(value: string | string[] | undefined): Forced {
  return value === "day" || value === "night" ? value : undefined;
}

/** `?sun=same|amber|lighter` on look 2 tries that night sun; anything else, or another look, keeps the look's own. */
export function nightSunTrial(look: string, value: string | string[] | undefined): NightSunTrial | undefined {
  if (look !== "ink-sun") return undefined;
  return NIGHT_SUN_TRIALS.find((trial) => trial.id === value);
}
