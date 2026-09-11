import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
};

// Written from the code, not from a template: every item below names the table, cookie or third party
// that actually holds the data. Update it whenever a store or a processor changes.
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Privacy</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          What Viky keeps about you, where it goes, and for how long. This describes the current test
          version and is updated before anyone outside the team uses Viky.
        </p>
      </header>

      <section className="space-y-2 text-sm">
        <h2 className="font-medium">What Viky never receives</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>The name you give your account: it stays in your device&apos;s passkey manager (iCloud Keychain, Google Password Manager, 1Password) as a label. Viky has no copy.</li>
          <li>Your Duolingo password: you sign in to Duolingo inside Reclaim&apos;s verification page, never on Viky.</li>
          <li>Your card number or identity documents: card purchases and sales happen on Mercuryo, which runs its own identity checks under its own privacy policy.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-medium">What Viky keeps, and where</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Your account&apos;s public identifier.</strong> Created on your device from your passkey. Kept in our database with each gift you fund or receive, and visible on the Monad network, a public ledger.
          </li>
          <li>
            <strong>If you fund a gift:</strong> the gift terms (amount, goal, daily target, duration) and the recipient&apos;s email or phone number as a one-way fingerprint only. The fingerprint is what the database and the public program hold; the plain email or number is never stored.
          </li>
          <li>
            <strong>If you receive a gift:</strong> your Duolingo username, profile id and display name (as read at each attested reading, including the short code you add to it once), kept in the database with each reading; a keyed pseudonym of that profile id, which is what the public program sees; your total XP as read, and the attested proof of the reading (produced with Reclaim), kept as the record of each day.
          </li>
          <li>
            <strong>Every visit:</strong> a session cookie (<span className="font-mono">__Host-viky-session</span>, 12 hours, signed, holds your account identifier) and a request counter keyed by the IP of your connection, held in memory for a few minutes to slow down abuse. No analytics scripts, no advertising, no tracking cookies.
          </li>
          <li>
            <strong>On your device:</strong> the technical id of your passkey, so the next sign-in can use it directly.
          </li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-medium">Who processes it</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Vercel</strong> hosts the application (Paris region) and keeps standard request logs.</li>
          <li><strong>Neon</strong> hosts the database (Frankfurt, Germany).</li>
          <li><strong>Reclaim Protocol</strong> runs the verification of your Duolingo progress; its attestation service sees your Duolingo session in the way its protocol describes, and Viky receives only the proof.</li>
          <li><strong>Duolingo</strong> answers a public profile lookup for the username you enter.</li>
          <li><strong>Mercuryo</strong> handles card purchases and sales, with its own account and identity checks.</li>
          <li><strong>Kuru</strong> provides the exchange used to convert between currencies; it sees your account identifier and the amount.</li>
          <li><strong>The Monad network</strong> is public and permanent: account identifiers, gift terms, the contact fingerprint, the identity pseudonym, every check-in and every amount moved can be read by anyone and cannot be erased.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-medium">How long</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>A verification session that is never completed is deleted after 24 hours.</li>
          <li>Completed verifications and gift records are kept as long as the gift exists and afterwards as its record, until you ask for their deletion.</li>
          <li>The session cookie expires after 12 hours; request counters after a few minutes.</li>
          <li>What is on the public ledger stays there.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-medium">Your rights</h2>
        <p>
          You can ask what Viky holds about you, have it corrected, or have the database records deleted
          (the public ledger cannot be changed). Write to the contact given on the{" "}
          <Link className="underline" href="/legal">legal notice</Link>.
        </p>
      </section>

      <footer className="text-xs" style={{ color: "var(--muted)" }}>
        <Link className="underline" href="/legal">Legal notice</Link> · <Link className="underline" href="/">Home</Link>
      </footer>
    </main>
  );
}
