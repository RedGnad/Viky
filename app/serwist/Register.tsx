"use client";
import { useSerwist } from "@serwist/turbopack/react";
import { useEffect } from "react";

/**
 * Registers the service worker, and survives a browser that will not have one (D150).
 *
 * The provider registers it by itself and does not watch what comes back: where a registration is refused, by a
 * policy, by a private window or by a test that blocks workers, the library then reads `registration.waiting` on a
 * registration that never came, and every screen of the app throws a TypeError at load. Nothing visible breaks,
 * because there is nothing left to break once the worker is refused, but an app that throws on every page is an app
 * whose real faults are impossible to see. So the registration is asked for here, where the refusal is caught.
 */
export function Register() {
  const { serwist } = useSerwist();
  useEffect(() => {
    void serwist?.register().catch(() => undefined);
  }, [serwist]);
  return null;
}
