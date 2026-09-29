import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { MilestoneStatus } from "@/src/milestone-view";
import { exampleById } from "../gift-moments/examples";
import { forcedAppearance, requireLab } from "../lab";
import { LAB_METADATA, LabFrame } from "../LabFrame";
import { HomeScreen } from "../screens/HomeScreen";
import { LabReached } from "./LabReached";

export const metadata: Metadata = { ...LAB_METADATA, title: "A gift reached, its moment (dev)" };

type Props = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

/**
 * The moment a gift is reached, played over Home as the person arriving sees it (the founder, 29 Sep 2026), for the
 * person it is for (`?who=recipient`, the default) or the funder (`?who=funder`), from the gift pages' own example of a
 * climb reached. Example data: nothing here is anybody's gift, and nothing is written.
 */
export default async function Page({ searchParams }: Props) {
  await requireLab();
  const asked = await searchParams;
  const who = asked.who === "funder" ? "funder" : "recipient";
  const example = exampleById(`climb-won-${who}`);
  if (!example) notFound();
  return (
    <LabFrame appearance={forcedAppearance(asked.appearance)} signedIn>
      <HomeScreen />
      <LabReached status={example.status as MilestoneStatus} who={who} />
    </LabFrame>
  );
}
