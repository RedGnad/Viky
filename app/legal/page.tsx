import type { Metadata } from "next";
import { Shell } from "../kit/Shell";
import Link from "next/link";
import { DISPLAY, TITLE } from "../components/ui";

export const metadata: Metadata = {
  title: "Legal notice",
};

// Legal notice (mentions legales). The publisher is a private individual acting on a non-professional
// basis and has given their identity to the host, as French law allows for non-professional
// publishers (LCEN, article 6-III-2). Until a company exists, only the host and a contact are public.
export default function LegalPage() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return (
    <Shell kind="document" back="/me">
      <header className="space-y-[var(--space-lg)]">
        <h1 className={DISPLAY}>Legal notice</h1>
        <p className="text-[length:var(--type-help)] text-[var(--muted)]" >
          Viky is an early product being tested with a handful of people. This notice covers viky.cash
          and says who runs it and who hosts it.
        </p>
      </header>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className={TITLE}>Publisher</h2>
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
        <h2 className={TITLE}>Host</h2>
        <p>Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, United States. The application runs in Vercel&apos;s Paris region.</p>
        <p>The database is provided by Neon and runs in Frankfurt, Germany.</p>
      </section>

      <section className="space-y-[var(--space-sm)] text-[length:var(--type-help)]">
        <h2 className={TITLE}>What Viky is not</h2>
        <p>
          Viky is not a bank, a payment institution or an investment service, and nothing on it is
          financial advice. Money placed behind a goal is held by a published program on the Monad
          network under rules both people can read on the <Link className="underline" href="/judges">judges page</Link>.
          Buying with a card is done by Mercuryo under Mercuryo&apos;s own terms.
        </p>
        <p>
          Viky is software, not a service that keeps your money. Everybody signs in with their own
          passkey, on their own device, and each gift sits in the published program under the terms the
          person who offered it signed. Nobody here signs for you.
        </p>
        <p>
          The people who run Viky can do four things, and the program allows them nothing else: stop new
          gifts being offered, stop the daily readings, change the key that signs what a reading found,
          and add a goal a gift can be made on. Each of those is public, and the judges page reads them
          from the program itself.
        </p>
        <p>
          They can never move money, keep it, or send it somewhere else. What is not earned goes back to
          the person who offered the gift, to the account they named when they offered it, and anyone at
          all can ask for that: the program will send it nowhere else. What is earned leaves only when
          the person the gift is for asks for it, signed by them. So the worst a pause can do is hold a
          day open. It cannot take a day away, and it cannot send a penny anywhere.
        </p>
        <p>
          Where money can leave depends on the service that pays it, and the way out names each one as it
          publishes itself. Today the bank route pays in euros and does not serve Senegal or Ivory Coast;
          the card route pays onto a Visa or Mastercard card, makes no payout in France, the rest of the
          European Economic Area or the United States, and cannot sell at all in the United Kingdom.
          Those are their own published lists, read on 16 September 2026, and neither of them is ours to
          change.
        </p>
        <p>
          What Viky does not have: no payout to mobile money such as Orange Money or Wave, and no bank transfer in
          Africa. A third route: a phone top-up, credit or data, or a gift card, bought on Bitrefill for the person
          with their own money and sent to the number they give, or shown to them as a code. It is offered wherever
          Bitrefill sells a top-up for the number&apos;s phone company, or lists a gift card that works in the
          person&apos;s country, Senegal and Ivory Coast among them: Bitrefill&apos;s own lists, read when the person
          chooses, and the gift cards of those two countries read on its site on 26 September 2026.
        </p>
        <p>
          This route is the one exception to what is said above about money, and it is bounded. For a top-up or a
          gift card, Viky holds the person&apos;s money in its treasury for the time it takes to pay the order, within
          its ceilings: five orders and $500.00 a day for everybody together, and $50.00 a person a day. If the order
          fails, the money is sent back by itself, when the order is next read and at the latest by the next daily
          pass. Every order is written down, one line each, from the money received to the top-up or card delivered
          or the money sent back. When Bitrefill or Viky&apos;s own means cannot pay for an order, the screen says so
          at that moment and nothing is taken.
        </p>
      </section>
    </Shell>
  );
}
