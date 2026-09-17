import { notFound } from "next/navigation";
import { connection } from "next/server";
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
