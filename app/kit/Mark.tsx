import Link from "next/link";
import { NAV } from "@/src/sentences";
import { MARK } from "../components/ui";

/**
 * The mark at the top of every screen: the name, in the title face, on the left, and nothing beside it on a
 * destination (Material: "App bars should only have one action, two if necessary"). It is a link home, which is
 * the one thing a mark has always done.
 */
export function Mark() {
  return (
    <Link href="/" className={`${MARK} inline-flex min-h-[var(--tap-target)] items-center self-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)]`}>
      {NAV.mark}
    </Link>
  );
}
