"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDoor, usePageOrigin } from "@/src/account/door";
import type { EmbeddedApp, Handset } from "@/src/account/errors";
import { ACCOUNT_HOST, wayOut, type OwnBrowser } from "@/src/account/passkey-support";
import { ACCOUNT_DOOR as W } from "@/src/sentences";
import { CARD, FIELD, HELP, INLINE_BUTTON, PRIMARY_BUTTON } from "../components/ui";

/**
 * Where an account cannot be made on this page (src/account/passkey-support.ts, the founder, 1 Oct 2026).
 *
 * Inside another app's page the one action is leaving for the phone's own browser with the same link, its key
 * included: a real link the person presses, never a jump the page makes. No app promises to follow it, so a press
 * that opened nothing is answered: the page is still here a moment later, and says where the app's own menu is. The
 * link to copy is under it from the start, because that always works.
 */

/** How long after a press the page is taken to have stayed, if it is still in front. */
const STAYED_AFTER_MS = 1_500;

/** This page's own link, key included, the same on the server and in the browser so the first image already carries it. */
function usePageLink(): string {
  const origin = usePageOrigin();
  const path = usePathname() ?? "/";
  const query = useSearchParams()?.toString() ?? "";
  return `${origin}${path}${query ? `?${query}` : ""}`;
}

/** Whether the page being read is a gift's, whose link is the thing to carry elsewhere. */
function useOnGift(): boolean {
  return (usePathname() ?? "").startsWith("/g/");
}

export function Elsewhere({ handset, app }: Readonly<{ handset: Handset; app: EmbeddedApp | null }>) {
  const gift = useOnGift();
  const link = usePageLink();
  const way = wayOut(link, handset, app);
  const [stayed, setStayed] = useState(false);
  const pressed = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(pressed.current), []);
  return (
    <section className={CARD} data-account-door="elsewhere">
      <p className={HELP}>{app ? W.insideApp(app) : W.browserCannot}</p>
      {way ? (
        <a
          href={way.href}
          className={`${PRIMARY_BUTTON} block text-center no-underline`}
          onClick={() => {
            clearTimeout(pressed.current);
            pressed.current = setTimeout(() => {
              if (document.visibilityState === "visible") setStayed(true);
            }, STAYED_AFTER_MS);
          }}
        >
          {W.openIn(way.browser)}
        </a>
      ) : (
        <p className={HELP}>{W.openItIn(gift)}</p>
      )}
      {stayed && app && handset !== "other" ? (
        <p role="status" className={HELP}>
          {W.stayed[handset]}
        </p>
      ) : null}
      <CopyThisLink browser={way?.browser ?? null} />
    </section>
  );
}

/**
 * Where accounts are made, said on any other address this app answers on (the audit of 1 Oct 2026): the same page on
 * Viky's own address, its key included, as a link the person presses. Signing in to an account made here stays beside it.
 */
export function MadeOnTheMainSite() {
  const path = usePathname() ?? "/";
  const query = useSearchParams()?.toString() ?? "";
  return (
    <div className="flex flex-col gap-[var(--space-sm)]" data-account-door="main-site">
      <p className={HELP}>{W.madeOnTheMainSite}</p>
      <a href={`https://${ACCOUNT_HOST}${path}${query ? `?${query}` : ""}`} className={`${PRIMARY_BUTTON} block text-center no-underline`}>
        {W.createThere}
      </a>
    </div>
  );
}

/** An iPhone below iOS 18: nothing to press, and what to do. */
export function Outdated() {
  return (
    <section className={CARD} data-account-door="outdated">
      <p className="font-medium">{W.outdated}</p>
    </section>
  );
}

/** The page's own link, copied; and shown to be copied by hand where the browser will not copy it. */
export function CopyThisLink({ browser }: Readonly<{ browser: OwnBrowser | null }>) {
  const gift = useOnGift();
  const link = usePageLink();
  const [copied, setCopied] = useState<"no" | "yes" | "refused">("no");
  const copy = () => {
    const refused = () => setCopied("refused");
    if (!navigator.clipboard) return refused();
    navigator.clipboard.writeText(link).then(() => setCopied("yes"), refused);
  };
  return (
    <>
      <button type="button" onClick={copy} className={`${INLINE_BUTTON} self-start`}>
        {W.copy(gift)}
      </button>
      {copied === "yes" ? (
        <p role="status" className={HELP}>
          {W.copied(browser)}
        </p>
      ) : null}
      {copied === "refused" ? (
        <>
          <p role="status" className={HELP}>
            {W.copyRefused}
          </p>
          <input readOnly aria-label={W.linkLabel} value={link} onFocus={(event) => event.target.select()} className={FIELD} />
        </>
      ) : null}
    </>
  );
}

/**
 * The same door, said before anything is filled in: at the top of Home and over the card a gift is prepared on. Draws
 * nothing wherever an account can be made, and nothing for somebody already signed in.
 */
export function DoorNotice() {
  const door = useDoor();
  if (door.kind === "outdated") return <Outdated />;
  if (door.kind === "elsewhere") return <Elsewhere handset={door.handset} app={door.app} />;
  return null;
}
