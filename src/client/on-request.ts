"use client";
import { useEffect, useState } from "react";
import { liveConditions } from "../conditions";
import { loadOfferedConditions } from "./milestone";

/** The lines the register offers on request: what is said until the server has answered which are opened. */
const inTheRegister: ReadonlySet<string> = new Set(liveConditions().filter((condition) => condition.state === "on-request").map((condition) => condition.id));

/**
 * The lines offered on request that are not open yet, for the sheet that chooses what they will do and for the card a
 * gift is filled in on (the founder, 12 Oct 2026). Asked once when the screen opens. Until the answer, and when it
 * could not be read, the register's own state stands: a line on request says so. A line the operator has opened is
 * not in the answer, and then says nothing.
 */
export function useOnRequest(): ReadonlySet<string> {
  const [waiting, setWaiting] = useState<ReadonlySet<string>>(inTheRegister);
  useEffect(() => {
    let live = true;
    loadOfferedConditions().then(
      (answer) => {
        if (live && answer.onRequest) setWaiting(new Set(answer.onRequest));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return waiting;
}
