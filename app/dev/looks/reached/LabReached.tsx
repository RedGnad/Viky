"use client";
import { useState } from "react";
import { ReachedMoment, reachedOfStatus, useLoaded } from "@/app/kit/ReachedMoment";
import type { MilestoneStatus } from "@/src/milestone-view";

/** The laboratory's moment: the production one, from example data, played once the page has loaded and never written. */
export function LabReached({ status, who }: Readonly<{ status: MilestoneStatus; who: "recipient" | "funder" }>) {
  const loaded = useLoaded();
  const [closed, setClosed] = useState(false);
  if (!loaded || closed) return null;
  return <ReachedMoment gift={reachedOfStatus(status, who, { recipientName: "Boo", funderName: "Maman" })} onClose={() => setClosed(true)} />;
}
