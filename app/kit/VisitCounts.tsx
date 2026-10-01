"use client";
import { Analytics } from "@vercel/analytics/react";
import { usePathname } from "next/navigation";
import { countedAddress, countedPath } from "@/src/visit-counts";

/**
 * Anonymous visit counts by Vercel, with no cookie (the founder, 1 Oct 2026; he turns them on in Vercel's dashboard).
 * Nothing leaves with the key of a gift's link or a gift's number.
 *
 * The package's own Next component works the route out from the router's parameters, and sends the bare path, number
 * included, as the route whenever it finds none (measured 1 Oct 2026 with Vercel's script: `dp: "/g/424242"`). So the
 * route and the path are given here, already cleaned (`countedPath`), and the address is cleaned again as it leaves
 * (`countedAddress`): two locks on the same door. The two settings read below are the ones that component reads
 * (`@vercel/analytics/next`), which Vercel writes at build.
 */
export function VisitCounts() {
  const counted = countedPath(usePathname() ?? "/");
  return (
    <Analytics
      framework="next"
      route={counted}
      path={counted}
      basePath={process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH}
      configString={process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG}
      beforeSend={(event) => ({ ...event, url: countedAddress(event.url) })}
    />
  );
}
