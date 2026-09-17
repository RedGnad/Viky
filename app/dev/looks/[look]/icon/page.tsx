import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Character } from "@/app/kit/Character";
import { requireLab } from "../../lab";
import { LAB_METADATA, LabFrame } from "../../LabFrame";
import { lookById } from "../../look-css";

export const metadata: Metadata = { ...LAB_METADATA, title: "Looks laboratory, app icon (dev)" };

/** The two sizes the boards show: 512, the size a web app manifest asks for, and 180, the one a phone's home screen uses. */
const SIZES = [512, 180] as const;

/**
 * The app's icon on a phone's home screen (brief, section 7 bis): the gift character in the hero colour, on a square
 * tile the system rounds itself. `?size=512` or `?size=180`.
 */
export default async function Page({ params, searchParams }: Readonly<{ params: Promise<{ look: string }>; searchParams: Promise<{ size?: string }> }>) {
  await requireLab();
  const look = lookById((await params).look);
  if (!look) notFound();
  const asked = (await searchParams).size;
  const size = SIZES.find((candidate) => String(candidate) === asked) ?? SIZES[0];
  return (
    <LabFrame look={look} appearance="day">
      <div data-icon className="flex items-center justify-center bg-[var(--accent)]" style={{ width: size, height: size }}>
        <span className="block" style={{ width: Math.round(size * 0.66) }}>
          <Character state="gift" tone="hero" className="block h-auto w-full" />
        </span>
      </div>
    </LabFrame>
  );
}
