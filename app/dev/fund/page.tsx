import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FundPanel } from "../../components/dev/FundPanel";

export const metadata: Metadata = {
  title: "Fund (dev)",
};

/** Dev-only funder flow for the first mainnet chain. Served only when VIKY_DEV_PAGES=1. */
export default function Page() {
  if (process.env.VIKY_DEV_PAGES !== "1") notFound();
  return <FundPanel />;
}
