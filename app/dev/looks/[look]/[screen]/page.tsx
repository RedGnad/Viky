import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { screenById } from "../../example";
import { forcedAppearance, requireLab } from "../../lab";
import { LAB_METADATA, LabFrame } from "../../LabFrame";
import { lookById } from "../../look-css";
import { ReplayArrival } from "../../ReplayArrival";
import { FundAmount } from "../../screens/FundAmount";
import { GiftScreen } from "../../screens/GiftScreen";
import { HomeScreen } from "../../screens/HomeScreen";
import { Made } from "../../screens/Made";
import { Review } from "../../screens/Review";
import { Welcome } from "../../screens/Welcome";

export const metadata: Metadata = { ...LAB_METADATA, title: "Looks laboratory (dev)" };

type Props = Readonly<{ params: Promise<{ look: string; screen: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;

/**
 * One of the six screens (brief, section 9) in one look, on example data. `?appearance=day|night` overrides the device.
 * The two screens that have an arrival carry the laboratory's "Replay arrival", which pictures of the screens leave out.
 */
export default async function Page({ params, searchParams }: Props) {
  await requireLab();
  const { look: lookId, screen: screenId } = await params;
  const look = lookById(lookId);
  const screen = screenById(screenId);
  if (!look || !screen) notFound();
  const appearance = forcedAppearance((await searchParams).appearance);
  return (
    <LabFrame look={look} appearance={appearance} signedIn={screen.id !== "welcome"}>
      {screen.id === "welcome" ? <Welcome look={look.id} /> : null}
      {screen.id === "home" ? <HomeScreen look={look.id} /> : null}
      {screen.id === "gift" ? <GiftScreen look={look.id} /> : null}
      {screen.id === "amount" ? <FundAmount look={look.id} /> : null}
      {screen.id === "review" ? <Review look={look.id} /> : null}
      {screen.id === "made" ? <Made look={look.id} /> : null}
      {screen.id === "home" || screen.id === "gift" ? <ReplayArrival /> : null}
    </LabFrame>
  );
}
