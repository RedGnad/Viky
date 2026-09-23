import type { Metadata } from "next";
import { Shell } from "../kit/Shell";
import { JudgesAccount } from "../components/JudgesAccount";
import { MilestoneJudges } from "../components/MilestoneJudges";
import { DISPLAY, TITLE } from "../components/ui";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, monadRpcUrl } from "@/src/monad/chain";
import { JudgesConditions } from "./JudgesConditions";
import { JudgesContracts } from "./JudgesContracts";
import { JudgesEarlyGifts } from "./JudgesEarlyGifts";
import { JudgesReliability } from "./JudgesReliability";
import { JudgesVerify } from "./JudgesVerify";

export const metadata: Metadata = {
  title: "For judges",
};

// Read while it is served: the owner of each contract, the pauses, the reliability figures and the example to
// re-verify all come from the chain and from the journal at that moment, never from something written down here.
export const dynamic = "force-dynamic";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

// The only page where contract addresses appear. Consumer screens never show them. They are set in the text face
// like every other word: a monospace face would be the system's, and hex has no letter a text face confuses.
export default function JudgesPage() {
  const escrow = process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim();
  // Gifts created before the D30 corrections keep running on the contract that holds them, and every
  // gift record names its own contract, so both are listed here for as long as the older one holds one.
  const earlierEscrow = process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS?.trim();
  return (
    <Shell kind="document" back="/me">
      <header className="space-y-[var(--space-lg)]">
        <h1 className={DISPLAY}>For judges</h1>
        <p className={MUTED}>
          Everything verifiable about Viky in one screen, and everything that is not, written as it is. Nothing here is
          shown to funders or recipients.
        </p>
      </header>

      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>Network</h2>
        {/* On a phone each label sits above its value: two columns there left a value 198 pixels, and breaking
            anywhere to fit an address broke every sentence beside it mid-word. Only an unbreakable string breaks now. */}
        <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] text-[length:var(--type-help)] [@media(min-width:600px)]:grid-cols-[10rem_1fr]">
          <dt className="text-[var(--muted)]">Chain</dt>
          <dd>Monad mainnet, chain id {MONAD_CHAIN_ID}</dd>
          <dt className="text-[var(--muted)]">RPC</dt>
          <dd className="[overflow-wrap:anywhere]">{monadRpcUrl()}</dd>
          <dt className="text-[var(--muted)]">AUSD</dt>
          <dd className="[overflow-wrap:anywhere]">{AUSD_ADDRESS}</dd>
          <dt className="text-[var(--muted)]">Gift contract</dt>
          <dd className="[overflow-wrap:anywhere]">
            {escrow ? (
              <>
                {escrow}{" "}
                (<a className="underline" href={`https://monadvision.com/address/${escrow}`}>MonadVision</a>, source verified through Sourcify)
              </>
            ) : (
              "Not deployed yet."
            )}{" "}
            Nothing is claimed as working until the first gift has run end to end on mainnet; the record is in
            docs/spikes/KT1.md.
          </dd>
          <dt className="text-[var(--muted)]">Who owns the contracts</dt>
          <dd className="[overflow-wrap:anywhere]">
            One wallet owns all four (gifts, the earlier gift contract that still runs the first gifts, milestone gifts, the way
            out): 0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64, the founder&apos;s, not the key that deployed them. The gift contract
            was handed over on 18 Sep 2026 in{" "}
            <a className="underline" href="https://monadvision.com/tx/0xa01ae787c52409157ec83aa95cc2ca2a4dca4a2caaab3caef8ea8c5650dfa009">
              0xa01ae787…a009
            </a>{" "}
            and the earlier one the same day in{" "}
            <a className="underline" href="https://monadvision.com/tx/0xe6f5b531d9c6dd981b72f2be7dc7e2e2d0adca071e59fd78e532dae804043840">
              0xe6f5b531…3840
            </a>
            , so registering a goal, replacing the evidence signer or pausing now needs that wallet&apos;s own signature on any of
            them, and no second key can. Each owner is read again from the chain further down, with what that owner can and cannot
            do. Handing ownership over moves no money: the earlier contract still holds the 8.571432 AUSD of its first gift, as it
            did before.
          </dd>
          {earlierEscrow ? (
            <>
              <dt className="text-[var(--muted)]">Earlier gift contract</dt>
              <dd className="[overflow-wrap:anywhere]">
                {earlierEscrow}{" "}
                (<a className="underline" href={`https://monadvision.com/address/${earlierEscrow}`}>MonadVision</a>, source verified through Sourcify).
                It holds the gifts created before the day-counting corrections of DECISIONS.md D30 and keeps running
                them to the end. Gift ids never restart: the newer contract continues the sequence, and every gift
                record names the contract that holds it.
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      {/* First, because it is the one thing on this page a stranger can do instead of believing us. */}
      <JudgesVerify />

      <JudgesConditions />

      <JudgesReliability />

      <JudgesContracts />

      <JudgesEarlyGifts />

      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>How a day is read</h2>
        <p className={HELP}>
          Duolingo runs in public mode: once a day, Viky&apos;s keeper reads the recipient&apos;s public profile through
          an attested fetch (Reclaim zkFetch through Reclaim&apos;s TEE client). The attestor signs Duolingo&apos;s
          response; Viky verifies that signature, pins the attestor&apos;s address (the same one the on-chain Duolingo
          verifier pins) and checks the proof is about the right URL and username; the evidence signer then turns the
          signed reading into an EIP-712 check-in, and the contract credits or refuses it. What is not verified: the
          attestor&apos;s own TEE attestation, which zk-fetch 1.1.0 does not put in the proof. The person signs in to
          nothing and installs nothing; account ownership is proved once, either by the funder naming the account or by
          a short code the recipient places in their Duolingo display name.
        </p>
        <p className={HELP}>
          Hardened on 18 Sep 2026, from Duolingo&apos;s own public profile (U1): a gift can be counted on one course rather
          than on the experience total. The funder picks the course from that profile&apos;s own courses, the daily reading is
          anchored on that course&apos;s id, and experience won in another course is not in the reading at all. Measured that
          day over 19 public profiles and 74 courses: every course carries its id, its title and its experience, and the sum
          of the courses is exactly the total the profile prints. A course gift is its own goal on the contract (goal 5,
          provider id keccak256(&quot;viky:provider:duolingo-course-zkfetch:v1&quot;), registered in{" "}
          <a className="underline" href="https://monadvision.com/tx/0xcaadaca7d0d3d362eb1112b3e45f66a1116d4335166283bf837053cf5fee8a69">
            0xcaadaca7…8a69
          </a>
          ) and its identity is the person and the course together, pinned by the contract at the first reading. So a reading
          of another course, or of the whole profile, cannot settle it, and gifts made before this keep counting the total
          exactly as they did. What this does not cover: a gift whose funder did not name the account has no course to choose
          from, so it counts the whole profile; and the course a gift counts is recorded by Viky, like the account name, not
          signed into the terms on the chain.
        </p>
        <p className={HELP}>
          What a reading costs, written here on purpose: each attested read is paid on Reclaim&apos;s side (their public
          price starts at $0.10 per verification; one read per recipient per day, never per gift). Private sources keep
          the user-proof path through the Reclaim verifier app.
        </p>
      </section>

      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>Risks and holes, written as they are</h2>
        <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
          <li>
            <strong>Duolingo&apos;s terms.</strong> The profile Viky reads is a public endpoint Duolingo does not
            document, and Duolingo&apos;s terms say &quot;You may not use any data mining, robots, scraping, or similar
            data gathering or extraction methods&quot;. Viky reads one profile per recipient per day. The risk is
            accepted and spread by having several conditions rather than one; the shape of that endpoint is pinned by
            the tests, like any other source that could drift, and if it changes or closes, the reading fails on our
            side, which holds the day open rather than taking it away from anybody.
          </li>
          <li>
            <strong>University portals&apos; terms.</strong> A proof of enrolment is shown by the person from their own
            student portal, in a verification tab where they sign in themselves (D165). What each portal&apos;s terms of
            use say about a program reading its pages once a student has signed in is not read portal by portal:
            Reclaim, whose attestor proves the page, treats those terms as its own question and does not answer it
            for us. The risk is the same kind as Duolingo&apos;s above, spread one portal at a time, and each portal is
            named in the gift the funder signs, so a portal that changes its page stops proving until it is proved
            again with a student present. The year passed and a grade reached (D174) are shown the same way from the
            same portal&apos;s results page, a second page proved with a student and pinned on the same row, under the
            same unread terms; the grade is read on the scale the row declares and compared in hundredths, and a page of
            another year pays nothing where the portal dates its page.
          </li>
          <li>
            <strong>Exam results services&apos; terms.</strong> Five examination results are shown by the person from
            their own account with the examining body (D176), the way the TOEFL score is: Cambridge English&apos;s
            Results Service for Candidates, the British Council&apos;s IELTS Test Taker Portal, and the baccalauréat
            services of Morocco (Bac Digital), Cameroon (Epim-Exam) and France (Cyclades). Each provider is ours,
            registered from a real candidate&apos;s session, and none exists yet; the definitions in docs/reclaim say
            the page, the sign-in the candidate types in their own browser, and the fields. The terms read on 23 Sep
            2026: Cambridge&apos;s website terms forbid scraping or storing the site&apos;s content on a server and
            building a database from it; the British Council&apos;s forbid copying its content, misusing data on its
            services and sharing a password, and name no automated access; Bac Digital and Epim-Exam show no terms on
            their public pages, and Cyclades&apos;s legal notice opens only inside the application. Whether a candidate
            showing their own result once falls under any of these is a question these lines do not answer: it is the
            founder&apos;s call before each line opens, and nothing is shown until then.
          </li>
          <li>
            <strong>Udemy&apos;s terms.</strong> A Udemy course finished is shown by the person from their own account
            (D178), and nothing is read for them: Udemy&apos;s Terms of Use (section 7, read 23 Sep 2026) forbid scraping,
            robots and &quot;other automated means of any kind to access the Services&quot;, and section 1 forbids sharing
            login credentials. So the certificate page Udemy publishes is not read by Viky either. The person opens their
            own account in their own browser, a witness in a TEE attests the one response, and Viky keeps that the course
            is finished. Whether a verification tab the person opens is &quot;automated means&quot; in Udemy&apos;s sense is
            written here rather than decided: the founder&apos;s call before the line opens.
          </li>
          <li>
            <strong>Coursera, when it comes.</strong> Nothing published says a certificate was earned under supervision:
            Coursera verifies identity once per account, and says some programmes require it while others only check a
            name. That condition is not open yet, and this is what it will prove when it is.
          </li>
          <li>
            <strong>The homonym.</strong> A gift is bound to an account on the source, not to a person. Two people can
            share a display name, and the funder can name the wrong account when they offer the gift. The code in the
            display name proves that whoever put it there controls that account; it does not prove they are the person
            the funder had in mind. A gift sent to the wrong account with the right name would count that account&apos;s
            work.
          </li>
          <li>
            <strong>The milestone, two limits.</strong> A target reached before the account is connected pays nothing:
            the first reading is recorded as the starting point whatever it says, so the climb is measured from there.
            And a rating that drops back before the reading that would have paid it does not pay either, because the
            contract judges the reading, not the game: it reads twice a day, and a rating reached and lost between two
            readings never settles.
          </li>
          <li>
            <strong>The way out.</strong> Viky can say that the payout service reports the payment as completed. It can
            never say the money arrived in a bank: the bank leg is outside anything Viky can read, and no screen claims
            otherwise.
          </li>
          <li>
            <strong>Our own key.</strong> A reading counts because Viky&apos;s evidence signer signed it. That key can
            credit a day; it cannot move money, change a gift&apos;s terms, or take anything back. The journal on this
            page is what makes a signature without a real reading behind it detectable.
          </li>
        </ul>
      </section>

      <MilestoneJudges />

      <JudgesAccount />
    </Shell>
  );
}
