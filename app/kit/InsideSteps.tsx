"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { pageShown } from "@/src/client/inside-steps";

/**
 * Tells src/client/inside-steps.ts of each page Viky shows, so the back key knows whether a step back stays inside
 * Viky. It draws nothing. The query is part of the page: a task's steps are told apart by it (`?step=2`).
 */
export function InsideSteps() {
  const path = usePathname() ?? "/";
  const query = useSearchParams()?.toString() ?? "";
  useEffect(() => {
    pageShown(query ? `${path}?${query}` : path);
  }, [path, query]);
  return null;
}
