"use client";
import { useRouter } from "next/navigation";
import { NAV } from "@/src/sentences";
import { BACK_LINK } from "../components/ui";

/**
 * The one way back out of a task, at the same place on every step (GOV.UK: "back link, page heading, continue
 * button"). It goes back through the browser's own history when there is one, so a person who came from Gifts
 * returns to Gifts and one who came from Home returns to Home; with no history, which is a link opened cold, it
 * goes where the task says it belongs.
 */
export function BackLink({ href, label = NAV.back }: Readonly<{ href: string; label?: string }>) {
  const router = useRouter();
  return (
    <a
      href={href}
      className={BACK_LINK}
      onClick={(event) => {
        event.preventDefault();
        if (window.history.length > 1) router.back();
        else router.push(href);
      }}
    >
      {label}
    </a>
  );
}
