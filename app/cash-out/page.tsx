import type { Metadata } from "next";
import { CashOut } from "../components/CashOut";
import { Footer } from "../components/Footer";
import { Screen } from "../components/Screen";
import { PROSE } from "../components/ui";

export const metadata: Metadata = {
  title: "Take your money out",
};

/** A journey, like giving: one thing at a time, and a way back to where the money is. */
export default function CashOutPage() {
  return (
    <Screen title="Take your money out" back="/" backLabel="Back">
      <p className={PROSE}>What you have earned is already yours. This sends it somewhere you can spend it.</p>
      <CashOut />
      <Footer current="/cash-out" />
    </Screen>
  );
}
