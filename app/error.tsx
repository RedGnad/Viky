"use client";
import { useEffect } from "react";
import { LOST as W } from "@/src/sentences";
import { PRIMARY_BUTTON } from "./components/ui";
import { Notice } from "./kit/Notice";
import { Shell } from "./kit/Shell";

/**
 * A page that failed while it was drawn: one sentence and the way back (the audit of 1 Oct 2026). A document load on
 * purpose, not a client navigation: whatever failed is left behind with the page that carried it.
 */
export default function PageError({ error }: Readonly<{ error: Error & { digest?: string } }>) {
  useEffect(() => {
    // For whoever reads the browser's own log; nothing of it is shown to the person.
    console.error(error);
  }, [error]);
  return (
    <Shell kind="task">
      <Notice role="alert">{W.failed}</Notice>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className={`${PRIMARY_BUTTON} block text-center no-underline`}>
        {W.home}
      </a>
    </Shell>
  );
}
