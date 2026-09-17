import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExampleAccountProvider } from "@/src/account/provider";
import type { Look } from "@/src/design-tokens";
import { bricolage, fredoka } from "./fonts";
import type { Forced } from "./lab";
import { labStylesheet, lookStylesheet } from "./look-css";

export const LAB_METADATA: Metadata = { robots: { index: false, follow: false } };

/**
 * The frame a look is drawn in: its variables, its title face, and, for the screens of somebody signed in, an account
 * that exists only on screen so the bar of destinations draws. Everything the look changes is scoped to this frame.
 */
export function LabFrame({
  look,
  appearance,
  signedIn = false,
  nightAccent,
  children,
}: Readonly<{ look: Look; appearance: Forced; signedIn?: boolean; nightAccent?: string; children: ReactNode }>) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `${labStylesheet()}\n${lookStylesheet(look, nightAccent)}` }} />
      <div
        className={`viky-lab ${bricolage.variable} ${fredoka.variable}`}
        data-lab-look={look.id}
        data-lab-appearance={appearance}
        data-lab-relief={look.reliefDepth === 0 ? "none" : "raised"}
      >
        {signedIn ? <ExampleAccountProvider>{children}</ExampleAccountProvider> : children}
      </div>
    </>
  );
}
