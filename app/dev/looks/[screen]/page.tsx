import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { screenById } from "../example";
import { forcedAppearance, requireLab } from "../lab";
import { LAB_METADATA, LabFrame } from "../LabFrame";
import { ReplayArrival } from "../ReplayArrival";
import { FundAmount } from "../screens/FundAmount";
import { GiftScreen } from "../screens/GiftScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { Review } from "../screens/Review";
import { Welcome } from "../screens/Welcome";

export const metadata: Metadata = { ...LAB_METADATA, title: "Looks laboratory (dev)" };

type Props = Readonly<{ params: Promise<{ screen: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;

/**
 * One of the six screens (brief, section 9), on example data. `?appearance=day|night` overrides the device, which is
 * how a board holds both. The two screens that have an arrival carry the laboratory's "Replay arrival", which pictures
 * of the screens leave out.
 */
export default async function Page({ params, searchParams }: Props) {
  await requireLab();
  const screen = screenById((await params).screen);
  if (!screen) notFound();
  const appearance = forcedAppearance((await searchParams).appearance);
  return (
    <LabFrame appearance={appearance} signedIn={screen.id !== "welcome"}>
      {screen.id === "welcome" ? <Welcome /> : null}
      {screen.id === "home" ? <HomeScreen /> : null}
      {screen.id === "gift" ? <GiftScreen /> : null}
      {screen.id === "amount" ? <FundAmount /> : null}
      {screen.id === "review" ? <Review /> : null}
      {screen.id === "home" || screen.id === "gift" ? <ReplayArrival /> : null}
    </LabFrame>
  );
}
