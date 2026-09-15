import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { FundGift } from "../components/FundGift";
import { Screen } from "../components/Screen";

export const metadata: Metadata = {
  title: "Offer a gift",
};

/** A journey: one thing at a time, one way back, a narrow column at every size. */
export default function FundPage() {
  return (
    <Screen>
      <FundGift />
      <Footer current="/fund" />
    </Screen>
  );
}
