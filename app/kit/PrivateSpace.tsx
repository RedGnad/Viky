"use client";
import { useEffect, useRef, useState } from "react";
import * as mera from "@/src/account/mera";
import { isAccountError } from "@/src/account/errors";
import { ApiError, getJson, putJson } from "@/src/client/api";
import { EMPTY_SPACE, NOTES_MAX_LENGTH, NICKNAME_MAX_LENGTH, parseSealedSpace, peopleOf, spaceFrom } from "@/src/private-space";
import { deriveSpaceKey, openSpace, privateSpaceSalt, sealSpace, SpaceOpenError } from "@/src/private-space-crypto";
import { PRIVATE as W } from "@/src/sentences";
import { CARD, FIELD, HELP, INLINE_BUTTON, SECONDARY_BUTTON } from "../components/ui";
import { useMyGifts } from "./my-gifts";

/**
 * The funder's private space, on You (D202, Mera's "One Passkey, Many Keys").
 *
 * Opening it asks the passkey once, under the space's own salt (`viky:private:v1`): the answer becomes an AES key that
 * lives in this card's memory only, is never written anywhere, and is dropped when the card closes, when the screen is
 * left, or after the same ten idle minutes as a signing session. What the server is given is the sealed envelope; it
 * has no way to open it. The same passkey, synced to another device, gives the same key there, so the same names come
 * back.
 *
 * The people are the first names of the gifts this account funded, which stay in clear on each gift where the person
 * reads them; what is private is the name the funder gives them, and the funder's own notes.
 */
type Stage = "locked" | "opening" | "open" | "keeping";

export function PrivateSpace({ address }: Readonly<{ address: string }>) {
  const { gifts } = useMyGifts(address);
  const key = useRef<CryptoKey | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [stage, setStage] = useState<Stage>("locked");
  const [revision, setRevision] = useState(0);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const funded = (gifts ?? []).filter((gift) => gift.role === "funder").map((gift) => gift.recipientName ?? null);
  // Drawn from the gifts as they are now and the names as they are typed, so a list that arrives after opening joins it.
  const rows = peopleOf(funded, { version: 1, notes, people: Object.fromEntries(Object.entries(nicknames).map(([person, nickname]) => [person, { nickname }])) });

  const close = () => {
    key.current = null;
    if (idle.current) clearTimeout(idle.current);
    setNicknames({});
    setNotes("");
    setStage("locked");
  };
  const touched = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(close, mera.DEFAULT_IDLE_MINUTES * 60_000);
  };

  // The key goes with the card: leaving You, or another account, leaves nothing behind in memory.
  useEffect(
    () => () => {
      key.current = null;
      if (idle.current) clearTimeout(idle.current);
    },
    [address],
  );

  const open = async () => {
    setProblem(null);
    setSaid(null);
    setStage("opening");
    try {
      const kept = await getJson<{ sealed: unknown; revision: number }>("/api/account/private");
      const derived = await deriveSpaceKey(await mera.passkeyOutputFor(await privateSpaceSalt()));
      const sealed = kept.sealed ? parseSealedSpace(kept.sealed) : undefined;
      if (kept.sealed && !sealed) throw new SpaceOpenError("NOT_A_SPACE");
      const space = sealed ? await openSpace(derived, address, sealed) : EMPTY_SPACE;
      key.current = derived;
      setRevision(kept.revision);
      setNicknames(Object.fromEntries(Object.entries(space.people).map(([person, { nickname }]) => [person, nickname])));
      setNotes(space.notes);
      setStage("open");
      touched();
    } catch (error) {
      close();
      setProblem(sentenceFor(error));
    }
  };

  const keep = async () => {
    const sealer = key.current;
    if (!sealer) return close();
    touched();
    setProblem(null);
    setSaid(null);
    setStage("keeping");
    try {
      const sealed = await sealSpace(sealer, address, spaceFrom(rows, notes));
      const answer = await putJson<{ revision: number }>("/api/account/private", { sealed, revision });
      setRevision(answer.revision);
      setStage("open");
      setSaid(W.kept);
    } catch (error) {
      if (error instanceof ApiError && error.code === "CHANGED_ELSEWHERE") {
        close();
        setProblem(W.changedElsewhere);
        return;
      }
      setStage("open");
      setProblem(sentenceFor(error));
    }
  };

  const editing = stage === "open" || stage === "keeping";
  return (
    <section className={CARD} aria-labelledby="private-space-title">
      <h2 id="private-space-title" className="font-medium">
        {W.title}
      </h2>
      <p className={HELP}>{W.what}</p>
      {editing ? (
        <>
          {rows.length === 0 ? <p className={HELP}>{W.nobodyYet}</p> : null}
          {rows.map((row, index) => (
            <div key={row.key} className="flex flex-col gap-[var(--space-xs)]">
              <label htmlFor={`private-person-${index}`} className="font-medium">
                {W.nickname(row.firstName)}
              </label>
              <input
                id={`private-person-${index}`}
                value={row.nickname}
                maxLength={NICKNAME_MAX_LENGTH}
                autoComplete="off"
                onChange={(event) => {
                  touched();
                  const nickname = event.target.value;
                  setNicknames((all) => ({ ...all, [row.key]: nickname }));
                }}
                className={FIELD}
              />
            </div>
          ))}
          {rows.length > 0 ? <p className={HELP}>{W.firstNameStays}</p> : null}
          <div className="flex flex-col gap-[var(--space-xs)]">
            <label htmlFor="private-notes" className="font-medium">
              {W.notes}
            </label>
            <textarea
              id="private-notes"
              value={notes}
              maxLength={NOTES_MAX_LENGTH}
              rows={4}
              onChange={(event) => {
                touched();
                setNotes(event.target.value);
              }}
              className={`${FIELD} min-h-[calc(var(--tap-target)*2)] resize-y`}
            />
          </div>
          <button type="button" onClick={() => void keep()} disabled={stage === "keeping"} className={SECONDARY_BUTTON}>
            {stage === "keeping" ? W.keeping : W.keep}
          </button>
          <div>
            <button type="button" onClick={close} className={INLINE_BUTTON}>
              {W.close}
            </button>
          </div>
        </>
      ) : (
        <div>
          <button type="button" onClick={() => void open()} disabled={stage === "opening"} className={INLINE_BUTTON}>
            {stage === "opening" ? W.opening : W.open}
          </button>
        </div>
      )}
      {said ? (
        <p className={HELP} role="status">
          {said}
        </p>
      ) : null}
      {problem ? (
        <p className={HELP} role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

function sentenceFor(error: unknown): string {
  if (error instanceof SpaceOpenError) return error.code === "NOT_THIS_PASSKEY" ? W.notThisPasskey : W.notASpace;
  if (isAccountError(error)) return error.message;
  return W.failed;
}
