import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { operatorCanSeeDevPages } from "@/src/dev-access";
import { FundPanel } from "../../components/dev/FundPanel";

export const metadata: Metadata = {
  title: "Fund (dev)",
};

/** Dev-only funder flow for the first mainnet chain. Served only to the operator's signed-in browser (src/dev-access.ts). */
export default async function Page() {
  if (!(await operatorCanSeeDevPages())) notFound();
  return <FundPanel />;
}
