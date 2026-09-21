import type { ReactNode } from "react";

/**
 * What makes a page change visible: the arrival (the motion roadmap of 21 Sep 2026, step 1).
 *
 * A layout persists across routes and its elements are reused; a template is given a key of its own, so "DOM elements
 * inside the template are fully recreated" on every navigation (Next 16, `template.js`, read in
 * `node_modules/next/dist/docs` on 21 Sep 2026). A CSS animation plays when an element is built, so that recreation is
 * what makes the screen enter each time rather than only on the first load.
 *
 * It wraps nothing and adds no element of its own: what enters is decided in `app/kit/Shell.tsx` and drawn by
 * `.page-enters` in `app/globals.css`. A `<div>` here would hold the whole page, including the bar of destinations
 * that is fixed to the window, and for the 250 ms of the movement that bar would travel with it.
 */
export default function Template({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
