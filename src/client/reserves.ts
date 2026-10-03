"use client";
import { useEffect, useState } from "react";
import type { Reserves } from "../reserves";
import { loadOfferedConditions } from "./milestone";

/**
 * Which of the month's two reserves are used up, for the card a gift is filled in on and for the sheet that chooses
 * what they will do (the founder, 3 Oct 2026). Asked once when the screen opens. Nothing while it is not known, and
 * nothing when the answer could not be read: a condition is then offered as it always was, and the gift's own page
 * says the limit when it meets it.
 */
export function useReserves(): Reserves | null {
  const [reserves, setReserves] = useState<Reserves | null>(null);
  useEffect(() => {
    let live = true;
    loadOfferedConditions().then(
      (answer) => {
        if (live) setReserves(answer.reserves ?? null);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return reserves;
}
