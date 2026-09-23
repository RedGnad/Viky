import { Character } from "./Character";

/**
 * The stamp of a gift that is had or not (V4, document J): a certificate, a badge, a score shown. Something granted
 * once has no slope and no days, so what is drawn is the place the proof goes, a round stamp waiting empty and dashed
 * beside the gift's character, and the same stamp inked in the sun colour with its tick once the proof is taken.
 *
 * The stamp is not a character and carries no face: it is the mark the proof leaves, which is why it is the one shape
 * here drawn with a line. What it says is said in words beside it, so it is hidden from a screen reader.
 *
 * It does not move while it waits: a page that is waiting for somebody's gesture has nothing to answer yet. The
 * stamping itself belongs to the moment the proof is taken ("Atteint"), not to this drawing.
 */
export type StampState = "waiting" | "stamped" | "void";

export function Stamp({ state, asleep = false }: Readonly<{ state: StampState; asleep?: boolean }>) {
  // Asleep until somebody opens the gift, as every character of a gift nobody has opened is (the brief, section 5).
  const character = state === "stamped" ? "earned" : state === "void" ? "returned" : asleep ? "toCome" : "today";
  return (
    <span aria-hidden className="stamp-row">
      <span className="stamp-character">
        <Character state={character} standing={false} className="h-auto w-full" />
      </span>
      <svg className={`stamp stamp-${state}`} width="84" height="84" viewBox="0 0 84 84" focusable="false">
        <circle cx="42" cy="42" r="38" className="stamp-ring" />
        {state === "stamped" ? (
          <>
            <circle cx="42" cy="42" r="30" className="stamp-ink" />
            <path d="M29 43 L38 52 L56 33" className="stamp-tick" />
          </>
        ) : null}
      </svg>
    </span>
  );
}
