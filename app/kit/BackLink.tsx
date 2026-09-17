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
export function BackLink({ href, label = NAV.back, follow = false }: Readonly<{ href: string; label?: string; follow?: boolean }>) {
  const router = useRouter();
  return (
    <a
      href={href}
      className={BACK_LINK}
      onClick={(event) => {
        event.preventDefault();
        // `follow` names a place rather than a step back: once a gift is paid for or made, going back a step would
        // offer to pay or to make it again, so the link goes where it says.
        if (!follow && window.history.length > 1) router.back();
        else router.push(href);
      }}
    >
      {label}
    </a>
  );
}
