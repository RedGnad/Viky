import Link from "next/link";
import { HOME as W } from "@/src/sentences";
import { INLINE_BUTTON } from "../components/ui";

/**
 * The balance's own action (the founder, 29 Sep 2026, the mockup withdraw.html): small, tonal, left under the figure it
 * belongs to, as the money apps people already use set it (Venmo's "Transfer" under the wallet, PayPal's under the
 * balance). A first outside tester read the full-width "Use your money" above the gift form as a way to make a gift.
 *
 * `holding` keeps its place, unseen, while the balance is being read, so nothing under it moves when it lands.
 */
export function SpendOrWithdraw({ holding = false }: Readonly<{ holding?: boolean }>) {
  const inside = (
    <>
      <svg aria-hidden focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </svg>
      {W.takeItOut}
    </>
  );
  const look = `${INLINE_BUTTON} self-start font-bold no-underline`;
  return holding ? (
    <span aria-hidden className={`${look} invisible`}>
      {inside}
    </span>
  ) : (
    <Link href="/cash-out" className={look}>
      {inside}
    </Link>
  );
}
