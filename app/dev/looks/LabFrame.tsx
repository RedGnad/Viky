import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExampleAccountProvider } from "@/src/account/provider";
import type { Forced } from "./lab";
import { appearanceStylesheet } from "./lab-css";

export const LAB_METADATA: Metadata = { robots: { index: false, follow: false } };

/**
 * The frame a screen is drawn in. The look is the product's, from app/globals.css and the document's own faces, so the
 * frame adds two things and no more: the appearance a capture asks for, and, for the screens of somebody signed in, an
 * account that exists only on screen so the bar of destinations draws.
 */
export function LabFrame({ appearance, signedIn = false, children }: Readonly<{ appearance: Forced; signedIn?: boolean; children: ReactNode }>) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: appearanceStylesheet() }} />
      <div className="viky-lab" data-lab-appearance={appearance}>
        {signedIn ? <ExampleAccountProvider>{children}</ExampleAccountProvider> : children}
      </div>
    </>
  );
}
