import { notFound } from "next/navigation";
import { connection } from "next/server";
import { galleryOpen, operatorIsSignedIn } from "@/src/dev-access";

/**
 * The laboratory's door: the design gallery's switch, which production never sets, or the operator's own signed-in
 * account (src/dev-access.ts; the founder, 4 Oct 2026), which is how he opens it on viky.cash. Anybody else gets the
 * page that does not exist. Read at request time, after `connection()`, so a build cannot bake a page either way.
 */
export async function requireLab(): Promise<void> {
  await connection();
  if (galleryOpen()) return;
  if (!(await operatorIsSignedIn())) notFound();
}

export type Forced = "day" | "night" | undefined;

/** `?appearance=day` or `night` shows that appearance whatever the device says; anything else follows the device. */
export function forcedAppearance(value: string | string[] | undefined): Forced {
  return value === "day" || value === "night" ? value : undefined;
}
