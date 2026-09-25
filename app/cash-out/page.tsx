import type { Metadata } from "next";
import { CashOut } from "../components/CashOut";
import { HeadCharacter } from "../kit/HeadCharacter";
import { Shell } from "../kit/Shell";
import { CASH_OUT } from "@/src/sentences";

export const metadata: Metadata = {
  title: CASH_OUT.title,
};

/** A task: the mark, one way back at the same place on every step, the title, a narrow column, no bar. */
export default function CashOutPage() {
  return (
    // The title is drawn by the screen itself, under the balance on its first step (D270).
    <Shell kind="task" back="/" character={<HeadCharacter />}>
      <CashOut />
    </Shell>
  );
}
