"use client";
import { useRouter } from "next/navigation";
import { pageBeforeIsOurs } from "@/src/client/inside-steps";
import { NAV } from "@/src/sentences";

/**
 * The one way back out of a task, at the same place on every step (GOV.UK: "back link, page heading, continue
 * button"). It goes back through the browser's own history when the page before is one of Viky's, so a person who
 * came from Gifts returns to Gifts and one who came from Home returns to Home. Otherwise it goes where the task says
 * it belongs: a link opened cold, and a page a person was brought to from elsewhere (7 Oct 2026: the verification
 * page brings a person back to their gift, and a step back from there led to that page again, so the key seemed
 * dead). src/client/inside-steps.ts says which it is.
 *
 * Drawn as a round key of 44 with an arrow alone (the founder, 3 Oct 2026), of the round controls' family (rule 6 of
 * 1 Oct 2026): it was an underlined sentence, "Back" or "Back to my gifts", at the head of every screen. It prints no
 * word, so its name is said to a screen reader, and it is where it leads: the task's own words when it gave some,
 * the destination's name otherwise.
 */
export function BackLink({ href, label, follow = false }: Readonly<{ href: string; label?: string; follow?: boolean }>) {
  const router = useRouter();
  const name = label ?? (href in NAV.backTo ? NAV.backTo[href as keyof typeof NAV.backTo] : NAV.back);
  return (
    <a
      href={href}
      aria-label={name}
      title={name}
      className="back-round"
      onClick={(event) => {
        event.preventDefault();
        // `follow` names a place rather than a step back: once a gift is paid for or made, going back a step would
        // offer to pay or to make it again, so the link goes where it says.
        if (!follow && pageBeforeIsOurs()) router.back();
        else router.push(href);
      }}
    >
      <span className="back-round-disc">
        <svg aria-hidden focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="m11 6-6 6 6 6" />
        </svg>
      </span>
    </a>
  );
}
