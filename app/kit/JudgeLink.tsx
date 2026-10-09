"use client";
import { useEffect } from "react";
import { keepJudgeCodeFromTheAddress } from "@/src/client/judge-link";

/**
 * Keeps the judge code a link carried (src/client/judge-link.ts), on whichever page the link opens. It draws nothing,
 * and reads the address once, when the page arrives.
 */
export function JudgeLink() {
  useEffect(() => {
    keepJudgeCodeFromTheAddress();
  }, []);
  return null;
}
