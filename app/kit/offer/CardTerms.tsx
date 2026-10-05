import { countryInWords } from "@/src/rail-country";
import type { WayIn } from "@/src/rails";
import { PAY as W } from "@/src/sentences";
import { BODY, HELP } from "../../components/ui";
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

/**
 * The pay sheet's one line under its button (the founder's mockup of 3 Oct 2026): who takes the card, what that
 * service asks before taking it (`WayIn.asks`), and its terms on its own site, in one line rather than a sentence and
 * a line of terms.
 */
export function CardLine({ way }: Readonly<{ way: WayIn }>) {
  return (
    <p className={HELP}>
      {W.cardLine.before(way.name, way.asks)}
      <a href={way.terms} target="_blank" rel="noopener noreferrer" className="underline">
        {W.cardLine.link(way.name)}
      </a>
      {W.cardLine.after}
    </p>
  );
}

/** In the card's place, where its providers' terms exclude the payer's country (src/card-rail.ts). */
export function CardNotOffered({ country, whole = false }: Readonly<{ country: string | null; whole?: boolean }>) {
  // In the pay sheet it is said whole, with no fold of its own (the mockup of 3 Oct 2026: one fold on the sheet). On
  // the page of a payment that landed short, one sentence in the open and the rest folded (rule 4).
  if (whole) return <p className={BODY}>{W.cardNotOffered(countryInWords(country))}</p>;
  return <Said text={W.cardNotOffered(countryInWords(country))} />;
}
