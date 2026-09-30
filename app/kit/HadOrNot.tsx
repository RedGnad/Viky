import { Character } from "./Character";

/**
 * The drawing of a gift that is had or not, a certificate, a badge, an enrolment, a score shown (the founder, 29 Sep
 * 2026, direction A): the gift's character alone, centred, as the rest of the app draws one. Its own state says where
 * the gift stands: asleep until the gift is opened, awake while it waits for its proof, happy once it is reached, gone
 * back when the time ran out without it. The words beside it say the rest, so it is hidden from a screen reader.
 *
 * It replaces the stamp of V4 (document J), a dashed ring beside the character that filled once the proof was taken:
 * no reader understood the empty ring, the founder first among them.
 */
export type HadOrNotState = "waiting" | "reached" | "void";

export function HadOrNot({ state, asleep = false }: Readonly<{ state: HadOrNotState; asleep?: boolean }>) {
  // Asleep until somebody opens the gift, as every character of a gift nobody has opened is (the brief, section 5).
  const character = state === "reached" ? "earned" : state === "void" ? "returned" : asleep ? "toCome" : "today";
  return (
    <span aria-hidden className="had-or-not">
      <span className="had-or-not-character">
        <Character state={character} standing={false} className="h-auto w-full" />
      </span>
    </span>
  );
}
