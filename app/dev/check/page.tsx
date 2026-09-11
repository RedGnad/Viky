import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { operatorCanSeeDevPages } from "@/src/dev-access";
import { CheckPanel } from "../../components/dev/CheckPanel";

export const metadata: Metadata = {
  title: "Device check (dev)",
};

/** Dev-only diagnostic of the browser's passkey support. Served only to the operator's signed-in browser (src/dev-access.ts). */
export default async function Page() {
  if (!(await operatorCanSeeDevPages())) notFound();
  return <CheckPanel />;
}
