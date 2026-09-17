import type { Metadata } from "next";
import { FundGift } from "../components/FundGift";
import { Shell } from "../kit/Shell";

export const metadata: Metadata = {
  title: "Offer a gift",
};

/**
 * A task: one question per page, the mark above, no bar. Each step carries its own way back and its own heading,
 * so the shell adds neither here (it added a title above the back link once, and that defect shipped twice).
 * Rebuilt on its own line, S2, with the step "What will they do?".
 */
export default function FundPage() {
  return (
    <Shell kind="task">
      <FundGift />
    </Shell>
  );
}
