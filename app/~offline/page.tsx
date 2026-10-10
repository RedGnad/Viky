import type { Metadata } from "next";
import { LOST as W } from "@/src/sentences";
import { PRIMARY_BUTTON } from "../components/ui";
import { Notice } from "../kit/Notice";
import { Shell } from "../kit/Shell";

export const metadata: Metadata = {
  title: "Offline",
};

/**
 * The press, written in the page itself: this page is shown when nothing can be fetched, a script of its own
 * included. It loads again the address that was asked for, whole: the service worker answers a page that failed with
 * this one at that page's own address (app/sw.ts), and a gift's link keeps what follows its `#`.
 */
const TRY_AGAIN = `document.getElementById("try-again").addEventListener("click", function () { window.location.reload(); });`;

/** No connection: one sentence, and the way to ask again (the audit of 9 Oct 2026). An installed app has no reload of its own. */
export default function Page() {
  return (
    <Shell kind="task">
      <Notice>{W.offline}</Notice>
      <button type="button" id="try-again" className={PRIMARY_BUTTON}>
        {W.again}
      </button>
      <script dangerouslySetInnerHTML={{ __html: TRY_AGAIN }} />
    </Shell>
  );
}
