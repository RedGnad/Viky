import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckPanel } from "../../components/dev/CheckPanel";

export const metadata: Metadata = {
  title: "Device check (dev)",
};

/** Dev-only diagnostic of the browser's passkey support. Served only when VIKY_DEV_PAGES=1. */
export default function Page() {
  if (process.env.VIKY_DEV_PAGES !== "1") notFound();
  return <CheckPanel />;
}
