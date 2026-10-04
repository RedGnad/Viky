import type { Metadata } from "next";
import { RampnowJournal } from "../../components/dev/RampnowJournal";

export const metadata: Metadata = {
  title: "Rampnow's frame, on this device (dev)",
  robots: { index: false, follow: false },
};

/**
 * What Rampnow's frame said on this device, and what the screens did with it (src/client/rampnow-journal.ts): the page
 * the founder opens on demand, on the device that paid, to read what a real payment sent and how long it took.
 *
 * Unlike the other dev pages it is not held to the operator's account: it reads nothing from the server, only what
 * this browser itself wrote down, so it shows nobody anything that is not already theirs, and it has to open on a
 * device signed in with any account, or with none. Nothing on the product links to it.
 */
export default function Page() {
  return <RampnowJournal />;
}
