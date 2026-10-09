import Link from "next/link";
import { HOME as W } from "@/src/sentences";
import { SMALL_BUTTON } from "../components/ui";

/**
 * The balance's own action (the founder, 29 Sep 2026, the mockup withdraw.html): small, tonal, left under the figure it
 * belongs to, as the money apps people already use set it (Venmo's "Transfer" under the wallet, PayPal's under the
 * balance). A first outside tester read the full-width "Use your money" above the gift form as a way to make a gift.
 *
 * While the balance is read, Home draws it at once on a device that saw money here last time (app/kit/Home.tsx): the
 * button itself, where an unseen copy of it used to keep the room and give way to it.
 */
export function SpendOrWithdraw() {
  return (
    <Link href="/cash-out" className={`${SMALL_BUTTON} self-start font-bold no-underline`}>
      <svg aria-hidden focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </svg>
      {W.takeItOut}
    </Link>
  );
}
