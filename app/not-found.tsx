import type { Metadata } from "next";
import Link from "next/link";
import { LOST as W } from "@/src/sentences";
import { PRIMARY_BUTTON } from "./components/ui";
import { Notice } from "./kit/Notice";
import { Shell } from "./kit/Shell";

export const metadata: Metadata = {
  title: W.missing,
};

/** An address that leads nowhere: one sentence and the way back, in Viky's own page (the audit of 1 Oct 2026). */
export default function NotFound() {
  return (
    <Shell kind="task">
      <Notice>{W.missing}</Notice>
      <Link href="/" className={`${PRIMARY_BUTTON} block text-center no-underline`}>
        {W.home}
      </Link>
    </Shell>
  );
}
