import type { Metadata } from "next";
import { Suspense } from "react";
import { PayGift } from "../components/PayGift";

export const metadata: Metadata = {
  title: "Pay for the gift",
};

/**
 * Paying for the gift filled in on the card (the product vision of 19 Sep 2026, surface Pay). The four questions are
 * asked on Home now; what is left here is the money, the account and the link. The step is read from the address,
 * which Next.js asks to be inside a Suspense boundary so the rest of the page can still be prerendered.
 */
export default function PayPage() {
  return (
    <Suspense>
      <PayGift />
    </Suspense>
  );
}
