import type { Metadata } from "next";
import { Shell } from "../kit/Shell";
import Link from "next/link";
import { DISPLAY, TITLE } from "../components/ui";

export const metadata: Metadata = {
  title: "Privacy",
};

// Written from the code, not from a template: every item below names the table, cookie or third party
// that actually holds the data. Update it whenever a store or a processor changes.
export default function PrivacyPage() {
  return (
    <Shell kind="document" back="/me">
      <header className="space-y-[var(--space-lg)]">
        <h1 className={DISPLAY}>Privacy</h1>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          What Viky keeps about you, where it goes, and for how long. This describes the current test
          version and is updated before anyone outside the team uses Viky.
        </p>
      </header>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className={TITLE}>What Viky never receives</h2>
        <ul className="list-disc space-y-[var(--space-xs)] pl-[var(--space-lg)]">
          <li>The name you give your account: it stays in your device&apos;s passkey manager (iCloud Keychain, Google Password Manager, 1Password) as a label. Viky has no copy.</li>
          <li>Your Duolingo password: you sign in to Duolingo inside Reclaim&apos;s verification page, never on Viky.</li>
          <li>Your card number or identity documents: card purchases happen on Mercuryo, which runs its own identity checks under its own privacy policy.</li>
        </ul>
      </section>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className={TITLE}>What Viky keeps, and where</h2>
        <ul className="list-disc space-y-[var(--space-xs)] pl-[var(--space-lg)]">
          <li>
            <strong>Your account&apos;s public identifier.</strong> Created on your device from your passkey. Kept in our database with each gift you fund or receive, and visible on the Monad network, a public ledger.
          </li>
          <li>
            <strong>If you fund a gift:</strong> the gift terms (amount, goal, daily target, duration). Gifts made before 15 September 2026 also hold the recipient&apos;s email or phone number as a one-way fingerprint, in the database and in the public program; the plain email or number was never stored, and gifts made since ask for neither.
          </li>
          <li>
            <strong>The two names on a gift:</strong> the first name of the person it is for and the name of the person who sends it, as the sender types them. Kept in our database with the gift&apos;s link, never in the public program. They are shown to whoever opens the link, and to the sender and the recipient when signed in, and to nobody else.
          </li>
          <li>
            <strong>If you receive a gift:</strong> your Duolingo username, profile id and display name (as read at each attested reading, including the short code you add to it once), kept in the database with each reading; a keyed pseudonym of that profile id, which is what the public program sees; your total XP as read, and the attested proof of the reading (produced with Reclaim), kept as the record of each day.
          </li>
          <li>
            <strong>If you ask Viky to tell you each morning:</strong> the private delivery link your browser creates for this device, with the two keys it gives us to encrypt what we send, kept in our database with the gift it is for and your account&apos;s identifier. It is not a phone number and it names no person: it is how your browser&apos;s notification service reaches this one browser. We send one sentence a day at most, about that gift. &quot;Stop telling me&quot;, on the gift&apos;s page, deletes it, and so does the first refusal from your notification service.
          </li>
          <li>
            <strong>If your gift is for a test result:</strong> the page of your certificate is read for three things only, the score, the day of the test, and the name printed on it. That is what Viky is given and what is kept with the gift. The page&apos;s own answer, which the verification service fetches on your behalf, also carries your date of birth and a link to the photograph taken on the day. Viky asks for none of those three, receives none of them, and stores none of them. Nothing is read at all until you paste the link of a certificate you have made public yourself, and every later reading checks it again: once you make it private, or once it passes its two years, nothing more can be read.
          </li>
          <li>
            <strong>Every visit:</strong> a session cookie (__Host-viky-session, 12 hours, signed, holds your account identifier) and a request counter keyed by the IP of your connection, held in memory for a few minutes to slow down abuse. No analytics scripts, no advertising, no tracking cookies.
          </li>
          <li>
            <strong>On your device:</strong> the technical id of your passkey, so the next sign-in can use it directly.
          </li>
        </ul>
      </section>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className={TITLE}>Who processes it</h2>
        <ul className="list-disc space-y-[var(--space-xs)] pl-[var(--space-lg)]">
          <li><strong>Vercel</strong> hosts the application (Paris region) and keeps standard request logs.</li>
          <li><strong>Neon</strong> hosts the database (Frankfurt, Germany).</li>
          <li><strong>Reclaim Protocol</strong> runs the verification of your Duolingo progress; its attestation service sees your Duolingo session in the way its protocol describes, and Viky receives only the proof.</li>
          <li><strong>Duolingo</strong> answers a public profile lookup for the username you enter.</li>
          <li><strong>Mercuryo</strong> handles card purchases, with its own account and identity checks.</li>
          <li><strong>Kuru</strong> provides the exchange used to convert between currencies; it sees your account identifier and the amount.</li>
          <li><strong>The Monad network</strong> is public and permanent: account identifiers, gift terms, the contact fingerprint of gifts made before 15 September 2026, the identity pseudonym, every check-in and every amount moved can be read by anyone and cannot be erased.</li>
        </ul>
      </section>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className={TITLE}>How long</h2>
        <ul className="list-disc space-y-[var(--space-xs)] pl-[var(--space-lg)]">
          <li>A verification session that is never completed is deleted after 24 hours.</li>
          <li>Completed verifications and gift records are kept as long as the gift exists and afterwards as its record, until you ask for their deletion.</li>
          <li>The session cookie expires after 12 hours; request counters after a few minutes.</li>
          <li>What is on the public ledger stays there.</li>
        </ul>
      </section>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className={TITLE}>Your rights</h2>
        <p>
          You can ask what Viky holds about you, have it corrected, or have the database records deleted
          (the public ledger cannot be changed). Write to the contact given on the{" "}
          <Link className="underline" href="/legal">legal notice</Link>.
        </p>
      </section>
    </Shell>
  );
}
