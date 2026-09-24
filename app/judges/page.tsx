import type { Metadata } from "next";
import { Shell } from "../kit/Shell";
import { JudgesAccount } from "../components/JudgesAccount";
import { MilestoneJudges } from "../components/MilestoneJudges";
import { DISPLAY, TITLE } from "../components/ui";
import { readOwnership, ownershipWords } from "@/src/judges-owner";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, PUBLIC_RPC_URL } from "@/src/monad/chain";
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
export default async function JudgesPage() {
  const escrow = process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim();
  // Who owns the contracts, asked of the chain now (D187): the page said the founder's key for three days after the
  // Safe had taken them. When the chain cannot be read, the sentence says so rather than repeating a name.
  const ownership = await readOwnership().catch(() => null);
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
          {/* The public endpoint, the one every command on this page names. The server reads through its own, which
              is never printed: the one printed here for three days carried a key (the money path review, item 1). */}
          <dt className="text-[var(--muted)]">RPC</dt>
          <dd className="[overflow-wrap:anywhere]">{PUBLIC_RPC_URL}</dd>
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
            {ownership ? ownershipWords(ownership) : "The chain could not be read just now, so nothing is said here about who owns the contracts rather than something out of date."}{" "}
            The four were handed to the Safe on 20 Sep 2026, in{" "}
            <a className="underline" href="https://monadvision.com/tx/0x1aa2887ef13988fd86efffe992651e6b9b2294161e2bbdc75c5e1466051f47d3">
              0x1aa2887e…47d3
            </a>{" "}
            (gifts),{" "}
            <a className="underline" href="https://monadvision.com/tx/0x534555010acde11dd8791ad58d3ea02d485967ecf9f3045e7fb70e89bcfb6635">
              0x53455501…6635
            </a>{" "}
            (the earlier gift contract),{" "}
            <a className="underline" href="https://monadvision.com/tx/0x960a5ad8edd9f5f0909bbc1f5bc85da86d081339364699248876375981fa072b">
              0x960a5ad8…072b
            </a>{" "}
            (milestone gifts) and{" "}
            <a className="underline" href="https://monadvision.com/tx/0xcd2b1ac3ef8c334596d49d7154fb8288efb14ad268bf272a86c79367bfe67b78">
              0xcd2b1ac3…7b78
            </a>{" "}
            (the way out), from the founder&apos;s key 0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64, which had held them since 18 Sep 2026
            and never was the key that deployed them (the gift contract in{" "}
            <a className="underline" href="https://monadvision.com/tx/0xa01ae787c52409157ec83aa95cc2ca2a4dca4a2caaab3caef8ea8c5650dfa009">
              0xa01ae787…a009
            </a>
            , the earlier one in{" "}
            <a className="underline" href="https://monadvision.com/tx/0xe6f5b531d9c6dd981b72f2be7dc7e2e2d0adca071e59fd78e532dae804043840">
              0xe6f5b531…3840
            </a>
            ). Each owner is read again from the chain further down, with what that owner can and cannot do. Handing
            ownership over moves no money: the earlier contract still holds the 8.571432 AUSD of its first gift, as it did
            before.
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
            another year pays nothing where the portal dates its page. A row can be defined from a portal&apos;s public
            pages before any student has sat with us (D193): it says &quot;unverified&quot; beside the university on the
            chooser, its patterns sit on labels the page prints, and a page that does not carry them fails by its name,
            the person told nothing is lost and the miss written in the gift&apos;s journal for the founder to correct.
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
            <strong>School portals&apos; terms.</strong> An average at school is shown by the pupil, or the family,
            from their own EcoleDirecte account (D179). Aplim, its publisher and host, says (read 23 Sep 2026) that
            the holder of a password reaches only the information about themselves or those they answer for, that the
            school alone answers for the information, and that Aplim makes the site&apos;s content available to no third
            party; no clause names a program, and the school is not asked. PRONOTE was built on the founder&apos;s decision of 23 Sep 2026, its publisher&apos;s
            terms against it and the risk assumed, then parked the same night for a technical reason: every answer of a
            PRONOTE space is AES-encrypted with a key made at sign-in, and the bulletin it hands out as a PDF is itself
            encrypted with the PDF standard&apos;s own encryption (both read on the demonstration space). The family sees
            the marks because their browser decrypts them; a witness attests the bytes on the wire, which are ciphertext,
            so nothing in them could be proved. It is offered to nobody.
          </li>
          <li>
            <strong>What the number read is worth to anybody else.</strong> For a result the person shows from their
            own account (an exam, the Study rail, School, a course), the number is seen once, on their own screen, and
            by nobody else (D185): under the target nothing is relayed and they are told with the number; at or over
            it the attestation the contract receives carries the target as its value, which is the verdict. The
            readings table keeps no number and no proof for these lines, and the session row keeps the verdict alone.
            The cost, written here: nobody, us included, can re-verify such a proof from our rows afterwards; what
            remains is the contract&apos;s record of the signed attestation. A number a source publishes (a rating, the
            XP a day is counted on, a score on a certificate page the person shares) is kept as read and written into
            the program, as before; the privacy page says which rule each condition is under.
          </li>
          <li>
            <strong>Google Health&apos;s terms, and the one risk.</strong> Active minutes each day on Fitbit is connected by
            the person once, on Google&apos;s own page (D188): the legacy Fitbit Web API closes in September 2026, and the
            line reads its successor, the Google Health API, which reads Fitbit trackers and Pixel Watches. Each morning the
            keeper asks the daily roll-up of active minutes for yesterday through the attested fetch with their key as a
            secret the attestor never sees, from wearables only, judges the moderate and vigorous minutes against the target,
            and signs the verdict alone; the roll-up is dropped and no proof of it is kept. The Google Health API Developer
            Terms and its Developer and User Data Policy (24 Mar 2026, read 23 Sep 2026) ask that the data serve the feature
            the person asked for, reach a third party only to provide it and with their consent, be preceded by a disclosure
            immediately before the consent, and be deleted on request: the consent screen in Viky&apos;s words, the yes or
            no the funder learns, and the erase button that gives the key back first. The risk: the funder&apos;s daily yes
            or no is itself one bit about the person given to a third party, under the consent they gave. The client is
            published in production, so a connection does not lapse each week; past a hundred people, Google&apos;s app
            verification and its third party security review (CASA) apply.
          </li>
          <li>
            <strong>Strava&apos;s API Agreement, and the same risk.</strong> Kilometres each day on Strava is connected by
            the person once, on Strava&apos;s own page (D191), read each morning the way Fitbit is: yesterday&apos;s
            activities through the attested fetch with their key as a secret, the distances added, the verdict signed,
            the list dropped. Strava&apos;s API Agreement (read 23 Sep 2026) asks that Strava Data serve the person who
            authorised it and nobody else, that it be neither aggregated across people nor shown to others, and that it
            be deleted when they ask: the consent screen, the verdict-only reading and the erase button that gives the
            key back first are those three. Two things it also says are written here rather than settled: a new
            application is in single-player mode, so until Strava raises the athlete limit only the founder&apos;s own
            account can connect; and Strava&apos;s brand guidelines ask for &quot;Powered by Strava&quot; where Strava data
            is shown, and Viky shows none, only a yes or a no, which is the founder&apos;s call to settle with Strava.
            The risk is Fitbit&apos;s: the funder&apos;s daily yes or no is one bit about the person given to a third party
            under the consent they gave.
          </li>
          <li>
            <strong>edX&apos;s terms.</strong> An edX verified certificate is read from the public page edX publishes for
            it, once per shared link and again at each reading (D212). edX&apos;s terms (11.6, updated 3 Nov 2025) forbid
            accessing its service through &quot;spiders, robots, crawlers, and data mining tools&quot; other than its
            own. The risk is the one Duolingo&apos;s and Coursera&apos;s lines carry, written here rather than decided: a
            person shares their own certificate, and Viky reads that one page.
          </li>
          <li>
            <strong>Accredible&apos;s record.</strong> A credential issued on Accredible is read from the public record its
            page is drawn from (D213), once per shared link and again at each reading. Accredible&apos;s terms (April 2026)
            are a contract with issuers and name no automated access; nothing about a reader is claimed. The funder names
            the credential by its title and its issuer&apos;s website, because Accredible&apos;s course search is not open to a
            reader: an issuer that names its credential like another&apos;s and lists another&apos;s website would pass, which
            is written here rather than hidden.
          </li>
          <li>
            <strong>CHSI&apos;s terms.</strong> Enrolment in a Chinese university is shown by the person from their own
            CHSI report (D215), in a verification tab, because the report&apos;s page can put an image captcha in front of
            a server, and Viky does not answer captchas. CHSI&apos;s copyright statement forbids using its content and
            services &quot;用于其他用途，包含但不限于商业行为&quot; without its consent, which Viky does not have. Its own pages
            say the report is there for other organisations and people to check, free; whether that covers a gift is
            the founder&apos;s call, written here.
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
