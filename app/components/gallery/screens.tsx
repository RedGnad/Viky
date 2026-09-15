import Link from "next/link";
import { DayRow } from "../DayRow";
import { Drop } from "../Drop";
import { Moment } from "../Moment";
import { BODY, CARD, FIELD, HELP, INLINE_BUTTON, MONEY, PRIMARY_BUTTON, PROSE, SECONDARY_BUTTON, TITLE } from "../ui";

/**
 * Every screen that matters, drawn from example data, so a design pass can be looked at rather than
 * described.
 *
 * Why this exists at all: the real screens live behind a passkey, and a passkey cannot be replayed by a
 * script, so six signed-out pages were the only thing anybody could photograph. That is not a product, and
 * the funder was right that the captures showed nothing.
 *
 * Why it is not a lie: every sentence below is quoted from the component that really shows it, and
 * `test/gallery.test.ts` fails if one of them stops existing there. The blocks are the real ones too, the
 * same `Screen`, `CARD`, `DayRow`, `Moment` and type levels the product uses, so a spacing changed here is a
 * spacing changed everywhere. What is invented is the data: a name, an amount, a number of days. Nothing
 * here reaches a person using Viky, and the page that renders it says so at the top.
 */

export type ExampleScreen = Readonly<{
  slug: string;
  who: "funder" | "recipient";
  title: string;
  /** What comes first, second, third, and the research that decides it. */
  hierarchy: string;
  /**
   * The component this screen's wording really comes from, or null when the screen does not exist yet. A
   * gallery that cannot tell a built screen from a proposed one is a gallery that quietly promises things.
   */
  builtFrom: string | null;
  /** The sentences taken verbatim from that component. A test fails if one of them stops being there. */
  quotes: readonly string[];
  render: () => React.ReactNode;
}>;

const ROW = "flex items-baseline justify-between gap-[var(--space-md)]";

export const EXAMPLE_SCREENS: readonly ExampleScreen[] = [
  {
    slug: "funder-who",
    who: "funder",
    title: "Who it is for",
    hierarchy:
      "The question, then the two fields, then why naming the goal account matters. One thing per screen, one field per row: forms that follow that get 78 % first-try submissions against 42 % (NN/g, Seckler et al.).",
    builtFrom: "app/components/FundGift.tsx",
    quotes: ["Who is it for, and for what", "Their email or phone", "Their Duolingo name, if you know it"],
    render: () => (
      <>
        <section className={CARD}>
          <h2 className={TITLE}>Who is it for, and for what</h2>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>Their email or phone</span>
            <input readOnly value="ama@example.com" className={FIELD} />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>Their Duolingo name, if you know it</span>
            <input readOnly value="ama_learns" className={FIELD} />
          </label>
          <p className={HELP}>
            Naming it is the surest thing you can do: only that Duolingo can then earn this gift, whoever opens
            the link. Leave it empty and they name their own.
          </p>
        </section>
        <span className={PRIMARY_BUTTON}>Continue</span>
      </>
    ),
  },
  {
    slug: "funder-amount",
    who: "funder",
    title: "How much, and for how long",
    hierarchy:
      "The three fields, then the money one day is worth, which is the number that makes it feel like a gift. The per-day figure is the second thing on purpose: it is the answer to the question they just typed.",
    builtFrom: "app/components/FundGift.tsx",
    quotes: ["How much, and for how long", "How much, in dollars", "Each day they reach it, this becomes theirs", "And each day they miss, the same comes back to you."],
    render: () => (
      <>
        <section className={CARD}>
          <h2 className={TITLE}>How much, and for how long</h2>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>How much, in dollars</span>
            <input readOnly value="50" className={FIELD} />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>For how many days, seven at least</span>
            <input readOnly value="7" className={FIELD} />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)]">
            <span className={HELP}>XP a day to earn one day</span>
            <input readOnly value="10" className={FIELD} />
          </label>
        </section>
        <section className={CARD}>
          <p className={HELP}>Each day they reach it, this becomes theirs</p>
          <p className={MONEY}>$7.14</p>
          <p className={HELP}>And each day they miss, the same comes back to you.</p>
        </section>
        <span className={PRIMARY_BUTTON}>Continue</span>
      </>
    ),
  },
  {
    slug: "funder-check",
    who: "funder",
    title: "Checking it over",
    hierarchy:
      "The four facts, then the missed-day rule, then what they can do with it, then the cost. The cost is last and it is on the screen before anything is paid: Baymard measures 12 % abandonment when a cost first appears at payment.",
    builtFrom: "app/components/FundGift.tsx",
    quotes: ["Check this over", "In their name", "Theirs for each day earned", "First day counted", "What they can do with it"],
    render: () => (
      <>
        <section className={CARD}>
          <h2 className={TITLE}>Check this over</h2>
          <dl className="flex flex-col gap-[var(--space-sm)]">
            <div className={ROW}>
              <dt className={HELP}>In their name</dt>
              <dd className={BODY}>$50.00</dd>
            </div>
            <div className={ROW}>
              <dt className={HELP}>Theirs for each day earned</dt>
              <dd className={BODY}>$7.14</dd>
            </div>
            <div className={ROW}>
              <dt className={HELP}>Over</dt>
              <dd className={BODY}>7 days, 10 XP a day</dd>
            </div>
            <div className={ROW}>
              <dt className={HELP}>First day counted</dt>
              <dd className={BODY}>the day after they connect Duolingo</dd>
            </div>
          </dl>
          <p className={HELP}>
            A day they miss comes back to you by itself, the morning after. Nothing of this is kept by anyone if
            they stop.
          </p>
        </section>
        <section className={CARD}>
          <h2 className={TITLE}>What they can do with it</h2>
          <p className={HELP}>
            What they earn is theirs straight away. To send it to their card they need about $21, and earnings
            add up from one gift to the next, so a small gift is waiting rather than gone.
          </p>
        </section>
        <span className={PRIMARY_BUTTON}>Continue</span>
      </>
    ),
  },
  {
    slug: "funder-rail",
    who: "funder",
    title: "Paying by card",
    hierarchy:
      "The five steps in the order the other page asks for them, then the check on what was pasted, then the two ways back. Their page cannot be pre-filled, so every one of these is a thing a person does by hand and the screen has to carry it.",
    builtFrom: "app/components/FundGift.tsx",
    quotes: ["Waiting for your payment. Keep this page open.", "Choose Buy, not sell.", "Choose the Monad network.", "Copy my identifier again"],
    render: () => (
      <>
        <section className={CARD}>
          <h2 className={TITLE}>Your money</h2>
          <p className={MONEY}>$0.00</p>
          <div className="flex flex-col gap-[var(--space-md)]">
            <p className="font-medium">Waiting for your payment. Keep this page open.</p>
            <p className={HELP}>Mercuryo&apos;s page opens on something else by default, so set each of these yourself:</p>
            <ol className={`list-decimal pl-5 ${HELP}`}>
              <li>Choose Buy, not sell.</li>
              <li>Pay in EUR, and type how much.</li>
              <li>Choose to receive MON.</li>
              <li>Choose the Monad network.</li>
              <li>Paste your identifier where they ask where to send it.</li>
            </ol>
            <div className="rounded-[var(--radius-control)] border border-[var(--divider)] bg-[var(--surface)] p-[var(--space-md)]">
              <p className={HELP}>Before you pay, check what you pasted starts and ends like this:</p>
              <p className="font-mono text-[length:var(--type-body)]">
                0x350aF8<span style={{ color: "var(--muted)" }}> ... </span>7761
              </p>
            </div>
            <p className={HELP}>Copied and ready to paste.</p>
            <div className="flex flex-wrap gap-[var(--tap-gap)]">
              <span className={INLINE_BUTTON}>Copy my identifier again</span>
              <span className={INLINE_BUTTON}>Open Mercuryo again</span>
            </div>
          </div>
        </section>
      </>
    ),
  },
  {
    slug: "funder-ready",
    who: "funder",
    title: "The gift is ready",
    hierarchy:
      "The moment first, then the warning that the link is bearer, then the link, then the one action. This is one of the four screens that wear the colour: a gift being ready is the thing the whole product is for.",
    builtFrom: "app/components/FundGift.tsx",
    quotes: ["It is in their name.", "Copy the link"],
    render: () => (
      <>
        <Moment mood="cheering" headline="It is in their name." amount="$50.00">
          Ama opens the link, and the money becomes theirs day by day. Whatever they do not earn comes back to
          you by itself.
        </Moment>
        <section className={CARD}>
          <p className={HELP}>
            Whoever opens this link takes the gift, so send it only to ama@example.com and to nobody else.
          </p>
          <p className="select-all break-all rounded-[var(--radius-control)] border border-[var(--divider)] p-[var(--space-md)] text-[length:var(--type-help)]">
            https://viky.cash/g/3?k=example
          </p>
        </section>
        <span className={PRIMARY_BUTTON}>Copy the link</span>
      </>
    ),
  },
  {
    slug: "recipient-card",
    who: "recipient",
    title: "The gift, before any account",
    hierarchy:
      "The gift itself, then what it takes to earn it, then the one action. No account is asked for on this screen at all: identity is asked when money is taken out, not when a link is opened (Wise, GOV.UK, Apple).",
    builtFrom: null,
    quotes: [],
    render: () => (
      <>
        <Moment mood="happy" headline="Someone put this in your name" amount="$50.00">
          $7.14 becomes yours for every day you do 10 XP on Duolingo, for 7 days. Whatever you do not earn goes
          back to them. Nobody else ever profits from a missed day.
        </Moment>
        <span className={PRIMARY_BUTTON}>Take the gift</span>
        <p className={HELP}>
          Your face or your fingerprint makes the account. No password, no code by text, nothing to remember.
        </p>
      </>
    ),
  },
  {
    slug: "recipient-duolingo",
    who: "recipient",
    title: "Connecting Duolingo",
    hierarchy:
      "The field, then why no password is needed, then the code and where to put it. The reassurance comes second because the question it answers is the one asked by the field above it.",
    builtFrom: "app/components/GiftPage.tsx",
    quotes: ["Your Duolingo username", "You can remove the code right after."],
    render: () => (
      <>
        <section className={CARD}>
          <h2 className={TITLE}>Your Duolingo username</h2>
          <input readOnly value="ama_learns" className={FIELD} />
          <p className={HELP}>
            No password, no sign-in: your lessons are read from your public profile. Next, a short code proves
            the profile is yours.
          </p>
        </section>
        <section className={CARD}>
          <p className={BODY}>
            In Duolingo, open Profile, then Settings, then Name, and add this code to your name for a minute:
          </p>
          <p className={MONEY}>VK-4821</p>
          <p className={HELP}>You can remove the code right after.</p>
        </section>
        <span className={PRIMARY_BUTTON}>Check my name</span>
      </>
    ),
  },
  {
    slug: "recipient-days",
    who: "recipient",
    title: "The gift, day by day",
    hierarchy:
      "The row of days, then the two amounts, then what to do today. The days come first because they are what a person opens Viky to see, and 42 % of the time spent on a page is in its top fifth (NN/g).",
    builtFrom: "app/components/GiftPage.tsx",
    quotes: ["Count now"],
    render: () => (
      <>
        <DayRow
          gift={{ startDay: 20708, endDay: 20714, durationDays: 7, creditedDays: 3, missedDays: 1 }}
          catchUpSeconds={30 * 3600}
          nowMs={20712 * 86_400_000 + 12 * 3_600_000}
          readerIsRecipient
          earnedDisplay="$21.42"
          returnedDisplay="$7.14"
        />
        <section className={CARD}>
          <p className={BODY}>Do your lesson; nothing else. Each morning Viky reads your Duolingo and counts the day before.</p>
          <p className="font-medium">
            Yesterday is not counted yet, and not lost either: a lesson before tomorrow at 8:00 still earns that
            day.
          </p>
          <span className={SECONDARY_BUTTON}>Count now</span>
        </section>
      </>
    ),
  },
  {
    slug: "recipient-earned",
    who: "recipient",
    title: "A day earned",
    hierarchy:
      "The moment, then the amount, then nothing else. One of the four screens that wear the colour, and the only thing it has to do is be unmistakable.",
    builtFrom: "app/components/GiftPage.tsx",
    quotes: ["One more day is yours."],
    render: () => (
      <>
        <Moment mood="cheering" headline="One more day is yours." amount="$7.14">
          That is 4 of 7 days. Come back tomorrow and do it again.
        </Moment>
      </>
    ),
  },
  {
    slug: "recipient-returned",
    who: "recipient",
    title: "A day gone back",
    hierarchy:
      "What happened, then what is left, then what can still be done. It is calm on purpose: a missed day is not a celebration and it is not a punishment either, and the words say where the money went rather than that it was lost.",
    builtFrom: "app/components/DayRow.tsx",
    quotes: ["Gone back"],
    render: () => (
      <>
        <section className={CARD}>
          <div className="flex items-center gap-[var(--space-md)]">
            <Drop mood="sorry" size={56} />
            <div>
              <p className={HELP}>Gone back to the person who sent it</p>
              <p className={MONEY}>$7.14</p>
            </div>
          </div>
          <p className={PROSE}>
            One day without a lesson, so that day went back this morning. The days ahead are still yours to
            take.
          </p>
        </section>
        <DayRow
          gift={{ startDay: 20708, endDay: 20714, durationDays: 7, creditedDays: 3, missedDays: 1 }}
          catchUpSeconds={30 * 3600}
          nowMs={20712 * 86_400_000 + 12 * 3_600_000}
          readerIsRecipient
          earnedDisplay="$21.42"
          returnedDisplay="$7.14"
        />
      </>
    ),
  },
  {
    slug: "recipient-money",
    who: "recipient",
    title: "Taking it out",
    hierarchy:
      "What they hold, then the two things they can do with it, then what the card payout needs. The conditions are on this screen and not at the end of it: a floor discovered after a journey is a journey wasted.",
    builtFrom: "app/components/YourMoney.tsx",
    quotes: ["In your account", "Earnings add up here from one gift to the next, so a small gift is waiting rather than gone."],
    render: () => (
      <>
        <section className={CARD}>
          <p className={HELP}>In your account</p>
          <p className={MONEY}>$28.56</p>
          <p className={HELP}>
            Earnings add up here from one gift to the next, so a small gift is waiting rather than gone.
          </p>
        </section>
        <span className={PRIMARY_BUTTON}>Send it to my card</span>
        <span className={SECONDARY_BUTTON}>Send it to another account of mine</span>
        <section className={CARD}>
          <h2 className="font-medium">What a card payout needs</h2>
          <ul className={`list-disc pl-5 ${HELP}`}>
            <li>About $21, and you have $28.56.</li>
            <li>A bank card in your name, in euros or dollars.</li>
            <li>One identity check at the partner, the first time only.</li>
          </ul>
        </section>
      </>
    ),
  },
  {
    slug: "recipient-finished",
    who: "recipient",
    title: "The gift is over",
    hierarchy:
      "What they earned, then what it was out of, then what to do next. The last of the four coloured screens, and the one that has to feel like an ending rather than a balance.",
    builtFrom: "app/components/GiftPage.tsx",
    quotes: ["This gift is finished."],
    render: () => (
      <>
        <Moment mood="happy" headline="Finished: 6 of 7 days done." amount="$42.85">
          That is yours to keep, with no deadline on it. $7.14 went back to the person who sent it.
        </Moment>
        <Link href="/" className={PRIMARY_BUTTON}>
          Take it out
        </Link>
      </>
    ),
  },
];
