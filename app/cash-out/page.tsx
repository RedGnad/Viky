import type { Metadata } from "next";
import { CashOut } from "../components/CashOut";
import { Footer } from "../components/Footer";
import { Screen } from "../components/Screen";
import { CASH_OUT } from "@/src/sentences";

export const metadata: Metadata = {
  title: CASH_OUT.title,
};

/** A journey, like giving: one thing at a time, and a way back to where the money is. */
export default function CashOutPage() {
  return (
    <Screen title={CASH_OUT.title} back="/" backLabel={CASH_OUT.backHome}>
      <CashOut />
      <Footer current="/cash-out" />
    </Screen>
  );
}
