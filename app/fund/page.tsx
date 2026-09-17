import type { Metadata } from "next";
import { Suspense } from "react";
import { FundGift } from "../components/FundGift";

export const metadata: Metadata = {
  title: "Offer a gift",
};

/**
 * A task: one question per page, the mark above, no bar. Each step is its own address (`?step=`) and draws its own
 * shell, so the back link and the step's title sit at the same place on every step. The step is read from the
 * address, which Next.js asks to be inside a Suspense boundary so the rest of the page can still be prerendered.
 */
export default function FundPage() {
  return (
    <Suspense>
      <FundGift />
    </Suspense>
  );
}
