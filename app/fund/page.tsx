import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { FundGift } from "../components/FundGift";
import { Screen } from "../components/Screen";

export const metadata: Metadata = {
  title: "Offer a gift",
};

/**
 * A journey: one thing at a time, one way back, a narrow column at every size.
 *
 * It wears the poster look, every step of it. A look changes by page, and every step of giving is this one page,
 * so the whole journey joins at once rather than changing its look between two steps of the same gift (D70).
 *
 * No title is passed to `Screen`, on purpose, and the reason is a defect I made twice. Each step carries its
 * own heading and its own way back, and `Screen` renders a title above its children, so passing one put the
 * title above the back link. I removed the title, then decided the page had no heading and put it back, which
 * recreated the same defect and shipped it to both hosts before anybody looked. The heading is the step's.
 */
export default function FundPage() {
  return (
    <Screen look="poster">
      <FundGift />
      <Footer current="/fund" />
    </Screen>
  );
}
