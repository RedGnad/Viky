import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Character } from "@/app/kit/Character";
import { AMOUNT_IN_TITLE, DISPLAY, MARK } from "@/app/components/ui";
import { NAV } from "@/src/sentences";
import { LINK_PREVIEW } from "../../example";
import { requireLab } from "../../lab";
import { LAB_METADATA, LabFrame } from "../../LabFrame";
import { lookById } from "../../look-css";
import { PREVIEW } from "../../words";

export const metadata: Metadata = { ...LAB_METADATA, title: "Looks laboratory, link preview (dev)" };

/**
 * The image a messaging app shows under a gift's link (brief, section 7 bis), in one look, at the 1200 by 630 of a
 * link preview: the gift character, and who put how much in the person's name. Where Viky is met most, since the
 * person opens the app as little as possible. Drawn by day: a preview image has no night.
 */
export default async function Page({ params }: Readonly<{ params: Promise<{ look: string }> }>) {
  await requireLab();
  const look = lookById((await params).look);
  if (!look) notFound();
  const type = { "--type-display": "80px", "--type-display-leading": "84px", "--type-mark": "40px", "--type-mark-leading": "44px" } as CSSProperties;
  return (
    <LabFrame look={look} appearance="day">
      <div data-preview className="flex h-[630px] w-[1200px] items-center gap-[64px] overflow-hidden bg-[var(--background)] px-[96px]" style={type}>
        <Character state="gift" className="h-auto w-[340px] shrink-0" />
        <div className="flex flex-col gap-[28px]">
          <span className={MARK}>{NAV.mark}</span>
          <p className={DISPLAY}>
            {PREVIEW.before(LINK_PREVIEW.funder)}
            <span className={AMOUNT_IN_TITLE}>{LINK_PREVIEW.amount}</span>
            {PREVIEW.after}
          </p>
        </div>
      </div>
    </LabFrame>
  );
}
