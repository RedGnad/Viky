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
 * Every step of giving is this one page, and it wears the poster look like every screen (D70, D71).
 *
 * No title is passed to `Screen`, on purpose, and the reason is a defect I made twice. Each step carries its
 * own heading and its own way back, and `Screen` renders a title above its children, so passing one put the
 * title above the back link. I removed the title, then decided the page had no heading and put it back, which
 * recreated the same defect and shipped it to both hosts before anybody looked. The heading is the step's.
 */
export default function FundPage() {
  return (
    <Screen>
      <FundGift />
      <Footer current="/fund" />
    </Screen>
  );
}
