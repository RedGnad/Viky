import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { FundGift } from "../components/FundGift";
import { Screen } from "../components/Screen";
import { PROSE } from "../components/ui";

export const metadata: Metadata = {
  title: "Offer a gift",
};

/** A journey: one thing at a time, one way back, a narrow column at every size. */
export default function FundPage() {
  return (
    <Screen title="Offer a gift" back="/" backLabel="Back">
      <p className={PROSE}>
        It goes into their name straight away. They earn it day by day, and whatever they do not earn comes
        back to you.
      </p>
      <FundGift />
      <Footer current="/fund" />
    </Screen>
  );
}
