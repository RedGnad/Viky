import type { Metadata } from "next";
import { forcedAppearance, requireLab } from "../lab";
import { LAB_METADATA, LabFrame } from "../LabFrame";
import { MotionScreen } from "../MotionScreen";

export const metadata: Metadata = { ...LAB_METADATA, title: "Looks laboratory, motion (dev)" };

type Props = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

/** The motion of the brief (section 6), on one page, so it can be watched and recorded. `?appearance=day|night`. */
export default async function Page({ searchParams }: Props) {
  await requireLab();
  const appearance = forcedAppearance((await searchParams).appearance);
  return (
    <LabFrame appearance={appearance}>
      <MotionScreen />
    </LabFrame>
  );
}
