"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { agreeFirst, signConsent } from "@/src/client/consent";
import { ApiError, getJson, postJson } from "@/src/client/api";
import { withTheStartSigned, type StartAsked } from "@/src/client/v2";
import { conditionById } from "@/src/conditions";
import { connectReturnInWords } from "@/src/connect-return";
import { GIFT_PAGE as W } from "@/src/sentences";
import { BODY, HELP, PRIMARY_BUTTON } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";
import { WAITS } from "@/src/sentences";
import { Button } from "./Button";

/**
 * Connecting the account a gift counts, for a condition of the third nature (D188): the one gesture, in place of a
 * name, on the model of ConnectTheSource. The consent is said first, in Viky's words from the register: what the
 * funder will be told, what they will never see, how to disconnect and erase. Then one button opens the source's own
 * page in this same tab; the source sends the person back here, connected. A second gesture starts the counting,
 * which is the first reading, as on every daily gift. Disconnect and erase stays on the page for as long as the
 * connection does.
 *
 * The screen knows nothing about the source: the words are the condition's, the routes are the source's own under
 * /api/connect/<source>, and the status is what the server says of the connection, never an id and never a key.
 */
type Status = Readonly<{ connected: boolean; since: string | null; bound: boolean; configured: boolean }>;
type Busy = "loading" | "connecting" | "starting" | "erasing" | null;

const CARD = "flex flex-col gap-[var(--space-md)]";

export function ConnectTheAccount({ giftId, conditionId, yours, onChanged }: Readonly<{ giftId: string; conditionId: string; yours: boolean; onChanged: () => Promise<void> | void }>) {
  const condition = conditionById(conditionId);
  const link = condition?.link;
  const source = link?.kind === "connect" ? condition?.source.toLowerCase() : null;
  const { ensureSigner } = useAccount();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<Busy>("loading");
  // The source sends the person back with `?connect=done`, or a reason: read once, when the screen is first drawn,
  // and said as that reason (src/connect-return.ts).
  const [refusal, setRefusal] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return connectReturnInWords(new URLSearchParams(window.location.search).get("connect"), condition?.source ?? "");
  });
  const [said, setSaid] = useState<string | null>(() => {
    if (typeof window === "undefined" || link?.kind !== "connect") return null;
    return new URLSearchParams(window.location.search).get("connect") === "done" ? link.consent.connected : null;
  });

  // The connection's state, read from the server when the screen is drawn and after each gesture: a promise's
  // answers, never a state set in the effect itself.
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (!source) return;
    let stale = false;
    getJson<Status>(`/api/connect/${source}/status?giftId=${encodeURIComponent(giftId)}`)
      .then((answer) => {
        if (!stale) setStatus(answer);
      })
      .catch((error: unknown) => {
        if (!stale) setRefusal(error instanceof ApiError ? error.message : W.connectFailed);
      })
      .finally(() => {
        if (!stale) setBusy(null);
      });
    return () => {
      stale = true;
    };
  }, [giftId, source, asked]);
  const load = useCallback(async () => setAsked((count) => count + 1), []);

  if (!yours || !link || link.kind !== "connect" || !source) return null;
  const words = link.consent;

  const connect = async () => {
    setBusy("connecting");
    setRefusal(null);
    try {
      // Connecting is the yes, signed before the source's own page opens (the founder, 29 Sep 2026).
      await agreeFirst(giftId);
      const { url } = await postJson<{ url: string }>(`/api/connect/${source}/start`, { giftId });
      window.location.assign(url);
    } catch (error) {
      setRefusal(error instanceof ApiError ? error.message : W.connectFailed);
      setBusy(null);
    }
  };

  const start = async () => {
    setBusy("starting");
    setRefusal(null);
    try {
      // On the second version the account signs the first reading too (src/client/v2.ts): the press that starts the
      // gift is the one its passkey is asked on, when the page was loaded again on the way back from the source.
      type Outcome = { kind: string; code?: string; message?: string };
      const outcome = await withTheStartSigned<Outcome>(giftId, await postJson<Outcome | StartAsked>(`/api/gift/${giftId}/bind`, {}), ensureSigner);
      if (outcome.kind === "refused") setRefusal(outcome.message ?? W.connectFailed);
      else await onChanged();
    } catch (error) {
      setRefusal(error instanceof ApiError ? error.message : W.connectFailed);
    } finally {
      setBusy(null);
    }
  };

  const erase = async () => {
    setBusy("erasing");
    setRefusal(null);
    try {
      // The stop, signed by the same key, then the connection and its ids erased (the founder, 29 Sep 2026).
      await signConsent(giftId, "stop");
      await postJson(`/api/connect/${source}/disconnect`, { giftId });
      setSaid(words.erased);
      await load();
      await onChanged();
    } catch (error) {
      setRefusal(error instanceof ApiError ? error.message : W.connectFailed);
    } finally {
      setBusy(null);
    }
  };

  const working = busy !== null;
  return (
    <div className={CARD}>
      <p className="font-medium">{words.title}</p>
      {status?.connected ? (
        <>
          <p className={BODY}>{said ?? words.connected}</p>
          {!status.bound ? (
            <>
              <Button doing={busy === "starting" ? W.reading : null} step={WAITS.connecting(condition?.source ?? "")} waiting={working && busy !== "starting"} onPress={() => void start()}>
                {words.start}
              </Button>
            </>
          ) : null}
          <p className={HELP}>{words.erase}</p>
          <Button look="secondary" doing={busy === "erasing" ? W.working : null} step={WAITS.erasing} waiting={working && busy !== "erasing"} onPress={() => void erase()}>
            {words.disconnect}
          </Button>
        </>
      ) : (
        <>
          {said ? <p className={BODY}>{said}</p> : null}
          <p className={BODY}>{words.sees}</p>
          <p className={BODY}>{words.never}</p>
          <p className={HELP}>{words.erase}</p>
          <button type="button" onClick={() => void connect()} disabled={working || status?.configured === false} className={PRIMARY_BUTTON}>
            {busy === "connecting" ? words.connecting : words.connect}
          </button>
          {status?.configured === false ? <p className={HELP}>{W.connectNotOpen}</p> : null}
        </>
      )}
      {refusal ? <FieldRefusal id="gift-connect-refused">{refusal}</FieldRefusal> : null}
    </div>
  );
}
