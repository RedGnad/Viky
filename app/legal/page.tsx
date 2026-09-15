import type { Metadata } from "next";
import { Screen } from "../components/Screen";
import Link from "next/link";
import { Footer } from "../components/Footer";

export const metadata: Metadata = {
  title: "Legal notice",
};

// Legal notice (mentions legales). The publisher is a private individual acting on a non-professional
// basis and has given their identity to the host, as French law allows for non-professional
// publishers (LCEN, article 6-III-2). Until a company exists, only the host and a contact are public.
export default function LegalPage() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return (
    <Screen layout="destination" back="/account" backLabel="Back to my account">
      <header className="space-y-[var(--space-sm)]">
        <h1 className="text-[length:var(--type-money)] font-semibold">Legal notice</h1>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Viky is an early product being tested with a handful of people. This notice covers viky.cash
          and says who runs it and who hosts it.
        </p>
      </header>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className="font-medium">Publisher</h2>
        <p>
          Viky is published by a private individual on a non-professional basis. As French law allows
          for non-professional publishers (loi pour la confiance dans l&apos;economie numerique, article
          6-III-2), their identity is held by the host named below rather than published here.
        </p>
        <p>
          Contact:{" "}
          {contact ? (
            <a className="underline" href={`mailto:${contact}`}>
              {contact}
            </a>
          ) : (
            "a way to reach the publisher will be published here before the first person outside the team uses Viky."
          )}
        </p>
      </section>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className="font-medium">Host</h2>
        <p>Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States. The application runs in Vercel&apos;s Paris region.</p>
        <p>The database is provided by Neon and runs in Frankfurt, Germany.</p>
      </section>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className="font-medium">What Viky is not</h2>
        <p>
          Viky is not a bank, a payment institution or an investment service, and nothing on it is
          financial advice. Money placed behind a goal is held by a published program on the Monad
          network under rules both people can read on the <Link className="underline" href="/judges">judges page</Link>.
          Buying and selling with a card is done by Mercuryo under Mercuryo&apos;s own terms.
        </p>
      </section>

      <Footer current="/legal" />
    </Screen>
  );
}
