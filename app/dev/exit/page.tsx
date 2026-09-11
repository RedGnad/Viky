import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { operatorCanSeeDevPages } from "@/src/dev-access";
import { ExitPanel } from "../../components/dev/ExitPanel";

export const metadata: Metadata = {
  title: "Exit (dev)",
};

/** Dev-only exit leg for the first mainnet chain. Served only to the operator's signed-in browser (src/dev-access.ts). */
export default async function Page() {
  if (!(await operatorCanSeeDevPages())) notFound();
  return <ExitPanel />;
}
