import { countryInWords } from "@/src/rail-country";
import type { WayIn } from "@/src/rails";
import { PAY as W } from "@/src/sentences";
import { HELP } from "../../components/ui";
import { Said } from "../Said";

/**
 * The line under a button or a link that pays by card (the founder, 29 Sep 2026): who the card goes to, and its terms on
 * its own site. Shown to the payer only, and with no box to tick.
 */
export function CardTermsLine({ way }: Readonly<{ way: WayIn }>) {
  return (
    <p className={HELP}>
      {W.cardTerms.before}
      <a href={way.terms} target="_blank" rel="noopener noreferrer" className="underline">
        {W.cardTerms.link(way.name)}
      </a>
      {W.cardTerms.after}
    </p>
  );
}

/** In the card's place, where its providers' terms exclude the payer's country (src/card-rail.ts). */
export function CardNotOffered({ country }: Readonly<{ country: string | null }>) {
  // One sentence in the open, the rest folded: it also stands on the page of a payment that landed short (rule 4).
  return <Said text={W.cardNotOffered(countryInWords(country))} />;
}
