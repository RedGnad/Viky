import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExitPanel } from "../../components/dev/ExitPanel";

export const metadata: Metadata = {
  title: "Exit (dev)",
};

/** Dev-only exit leg for the first mainnet chain. Served only when VIKY_DEV_PAGES=1. */
export default function Page() {
  if (process.env.VIKY_DEV_PAGES !== "1") notFound();
  return <ExitPanel />;
}
