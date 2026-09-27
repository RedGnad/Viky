import { formatAusd } from "@/src/gift-reader";
import { judgeCreditConfig } from "@/src/judge-credit";
import { rampHostApiKey } from "@/src/rails";
import type { Metadata } from "next";
import { Shell } from "../kit/Shell";
import { JudgesAccount } from "../components/JudgesAccount";
import { MilestoneJudges } from "../components/MilestoneJudges";
import { DISPLAY, TITLE } from "../components/ui";
import { readOwnership, ownershipWords } from "@/src/judges-owner";
import { portalsListedAndRead } from "@/src/portal-store";
import { usesDelivered } from "@/src/phone-order-store";
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
  // Universities listed, and how many have been read at least once (D267): here, and never in the flow.
  const portals = await portalsListedAndRead();
  // How many times each Bitrefill use was used (D271): said here, as for the conditions, and never in the flow.
  const uses = await usesDelivered();
  const used = (count: number | undefined) => (uses === null || count === undefined ? "the count could not be read right now" : count === 0 ? "Open. Nobody has used it yet." : count === 1 ? "Open. Used once." : `Open. Used ${count} times.`);
  // Gifts created before the D30 corrections keep running on the contract that holds them, and every
  // gift record names its own contract, so both are listed here for as long as the older one holds one.
  const earlierEscrow = process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS?.trim();
  // The judge credit's amount, said on the page; its code is never read here (D291).
  const judgeCredit = judgeCreditConfig();
  return (
    <Shell kind="document" back="/me">
      <header className="space-y-[var(--space-lg)]">
        <h1 className={DISPLAY}>For judges</h1>
        <p className={MUTED}>
          Everything verifiable about Viky in one screen, and everything that is not, written as it is. Nothing here is
          shown to funders or recipients.
        </p>
      </header>

      {/* The judges' own path (D291): two gestures, no account kept by Viky, the judge keeps their passkey. The code
          itself is only in the submission portal's instructions, never on this page. */}
      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>For judges, how to try it</h2>
        <ol className={`${HELP} list-decimal space-y-[var(--space-xs)] pl-[var(--space-lg)]`}>
          <li>
            On the home page, press Sign in and create your account: your face or your fingerprint makes a passkey on
            your device. Viky keeps no account for you, and you keep the passkey.
          </li>
          <li>
            Offer a gift from the home page. On the pay sheet, press &quot;Have a code?&quot; and type the judge code from the
            submission portal&apos;s instructions. Your account receives {judgeCredit ? formatAusd(judgeCredit.units) : "a set amount"}: a judge credit from
            Viky&apos;s treasury, once per account. A real funder pays by card through Ramp, shown in the video.
          </li>
          <li>
            The sheet then pays from your account and opens no card service; if the gift is more than the credit, it
            offers to make the gift that amount.
          </li>
          <li>
            Or open the gift the founder made for you from the operator account: it is in your name, and you can take
            it out as phone credit or as a gift card from Use your money.
          </li>
          <li>
            Mera&apos;s stateless test runs on this same account: sign out, then sign in from another browser or device
            with the same passkey. The account and its money come back; nothing was kept on the first device.
          </li>
        </ol>
      </section>

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
            Nothing is claimed as working until the first gift has run end to end on mainnet; the first gifts are
            read from the chain further down this page.
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
            (the way out), from the founder&apos;s key 0x80fb079237Af2A634ba9B95263Ba0bd53d20Cd64, which had held each since its deployment or
            its hand-over, from 16 to 18 Sep 2026, and never was the key that deployed them (the gift contract in{" "}
            <a className="underline" href="https://monadvision.com/tx/0xa01ae787c52409157ec83aa95cc2ca2a4dca4a2caaab3caef8ea8c5650dfa009">
              0xa01ae787…a009
            </a>
            , the earlier one in{" "}
            <a className="underline" href="https://monadvision.com/tx/0xe6f5b531d9c6dd981b72f2be7dc7e2e2d0adca071e59fd78e532dae804043840">
              0xe6f5b531…3840
            </a>
            ). Each owner is read again from the chain further down, with what that owner can and cannot do. Handing
            ownership over moved no money: the earlier contract held the 8.571432 AUSD of its first gift before and after
            it. That gift has since ended, and its last refund went back to its funder on 23 Sep 2026.
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

      {/* How money comes in (D289): through a licensed partner, the asset named, and the next step said as it is. */}
      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>How money comes in</h2>
        <p className={HELP}>
          A funder pays by card or bank transfer on Ramp&apos;s own page, not Viky&apos;s. Ramp Swaps (Ireland) Limited is an
          authorised crypto-asset service provider under MiCA, regulated by the Central Bank of Ireland (
          <a className="underline" href="https://rampnetwork.com/licenses-and-registrations">Ramp&apos;s licences and registrations</a>
          , read 27 Sep 2026). What arrives in the funder&apos;s account is AUSD on Monad, <code>MONAD_AUSD</code> in Ramp&apos;s
          own asset list, the asset the gift contract holds, so nothing is swapped after it. Where Ramp does not serve, the
          second way is Mercuryo, which delivers MON that the account then swaps to AUSD.
        </p>
        <p className={HELP}>
          The next step is Ramp embedded with a partner key. Without one, Ramp&apos;s page answers any pre-filled
          parameter with &quot;Integration issue detected&quot; (read on its live page and in its own script, 27 Sep 2026), so
          today it opens bare and the funder copies their account from Viky&apos;s waiting screen. With the key, the page
          opens with the account, the amount in euros and AUSD already filled in.{" "}
          {rampHostApiKey() ? "The key is set on this deployment: the page opens filled in." : "The key is not set on this deployment yet."}
        </p>
      </section>

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
          price starts at $0.10 per verification). Reads are counted per gift, never per person: the morning pass reads
          each daily gift once and skips one already counted that day, so two gifts on one Duolingo account are two reads a
          day. Each attempt to connect the account is one more, and so is each count the person asks for: no daily ceiling
          bounds those, only ten asks in ten minutes from one IP address, counted in each app server&apos;s memory. A climb
          is looked at plainly, not through Reclaim, in both of the day&apos;s passes and at each ask, and read attested
          only to connect the account or when that look does not show it below its target. Private sources keep the
          user-proof path through the Reclaim verifier app.
        </p>
      </section>

      <section className="space-y-[var(--space-sm)]">
        <h2 className={TITLE}>Risks and holes, written as they are</h2>
        <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
          <li>
            <strong>Duolingo&apos;s terms.</strong> The profile Viky reads is a public endpoint Duolingo does not
            document, and Duolingo&apos;s terms say &quot;You may not use any data mining, robots, scraping, or similar
            data gathering or extraction methods&quot;. Viky reads a profile once a day for each gift made on it, and
            again each time the person connects it or asks for a count. The risk is
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
            pages, or taken from Reclaim&apos;s directory, before any student has shown it to Viky (D193): its patterns
            sit on what the page prints, and a page that does not carry them fails by its name, the person told nothing
            is lost and the miss written in the gift&apos;s journal. Whether a university has been read yet is said here
            and not in the flow (the founder, 26 Sep 2026):{" "}
            {portals ? `${portals.listed} universities listed, ${portals.read} read at least once.` : "the count could not be read right now."} What
            each portal proves is said in the flow: some show the year&apos;s enrolment status, others only that a
            student account is signed in, and the university&apos;s line and the gift say which. Portals that Reclaim&apos;s
            directory holds only as AI-witnessed providers are not listed: Viky requires the attestor&apos;s TEE
            attestation and refuses an AI-witnessed proof everywhere.
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
            <strong>MITx Online&apos;s terms.</strong> An MIT course certificate is read from the page MITx Online publishes
            for it (D222), once each time the person shares its link. Its terms forbid scraping or downloading its content
            in bulk, and allow &quot;personal, noncommercial use&quot; of the site&apos;s content; Viky reads one certificate its
            holder shares, for a gift, which is written here with the risk assumed as for edX. The line proves a course
            passed on MITx Online, never a place at MIT, and Viky is not affiliated with MIT.
          </li>
          <li>
            <strong>Breizh Chrono&apos;s terms.</strong> A marathon finished is read from the runner&apos;s own page on the
            timing company&apos;s public results site (D273), once each time the person asks after the race: the name
            and the bib in its title, the official time in its cell. The site is run by Klikego, whose terms of use
            (CGU of 26 Jun 2026) and legal notice claim the site&apos;s content and its database, forbid reproduction
            without written consent, and count the use of robots among the reasons to close a member&apos;s account;
            the same notice says results are published for everybody to consult, and that a runner can ask the
            federation to be removed from them. Viky reads one runner&apos;s page per gift and keeps three fields, written
            here with the risk assumed as for edX. The race&apos;s date is the register&apos;s; the bib entered before the
            start ties the reading to the race, and the day the result is read is the day the gift is judged by. One
            door stays open for the operator&apos;s accounts alone: a bib entered after the start, which is how the test
            gift runs on the 2023 result and how the three proofs are shown here.
          </li>
          <li>
            <strong>MikaTiming&apos;s results sites.</strong> The same line reads the marathons MikaTiming times (Chicago,
            Frankfurt, Boston) from the runner&apos;s own page on each race&apos;s results site, found from the site&apos;s
            search by bib: the name, the bib and the net finish time. Read on 26 Sep 2026: the sites&apos; legal notice
            and general terms (mika:timing GmbH, Bergisch Gladbach) say nothing about reading a page and their privacy
            statement concerns visitors&apos; data; their <code>robots.txt</code> tells every robot to stay out
            (<code>Disallow: /</code>), and they answer 403 to a bare user agent. Viky reads one runner&apos;s page per
            gift, at the person&apos;s own request, naming itself and its site in its user agent
            (<code>Viky/1.0; +https://viky.cash</code>), and keeps three fields, written here with the risk assumed as
            for edX. Open since goal 31 was signed on 26 Sep 2026.
          </li>
          <li>
            <strong>The WCA&apos;s public API.</strong> A time set at a speedcubing competition is read from the World Cube
            Association&apos;s public API: the competition&apos;s competitors list before the first day, the person&apos;s own
            list of results after it, one row (the competition, the event, the round of their best single, the name
            and the times as the WCA prints them). Read on 26 Sep 2026: the API asks for no key for public data, the
            WCA&apos;s privacy statement says competition results are not personal data, its results export may be
            re-published with a notice that the results are the WCA&apos;s, and its <code>robots.txt</code> keeps robots
            out of its search only. The API answers 403 to a bare user agent; Viky names itself and its site, as
            for MikaTiming. Open since goal 32 was signed on 26 Sep 2026.
          </li>
          <li>
            <strong>Codeforces&apos; public API.</strong> A Codeforces rating is read every day from
            <code>codeforces.com/api/user.info</code>, anonymous public data, one request every two seconds (the API
            help, read 26 Sep 2026): the handle, the rating and the best rating ever, and once, when the person binds the
            account with Viky&apos;s code, the last name of their profile. Its terms forbid commercial use of the site&apos;s
            material and any use that harms it or impacts access; Viky reads one account&apos;s line a day, at the
            person&apos;s request, naming itself. Codeforces polices itself: plagiarism is punished with a rating rollback
            and a round that fails is made unrated. Open since goal 33 was signed on 26 Sep 2026.
          </li>
          <li>
            <strong>race result&apos;s lists.</strong> The same marathon line reads the events race result times (2,126 coming
            events in 76 countries on 26 Sep 2026, Lusaka and Francistown among them) from the event&apos;s own results
            list, the bib&apos;s row alone: the name and the time at the columns the register fixed for that race, after
            checking the list still names those columns as it did. Read on 26 Sep 2026: my race result&apos;s terms of
            use say organisers publish results with the athlete&apos;s permission and nothing about reading a page; its
            <code>robots.txt</code> keeps robots out of the list endpoint. Viky reads one row per gift, at the
            person&apos;s request, naming itself, the risk assumed as for MikaTiming. Open since goal 34 was signed on
            26 Sep 2026.
          </li>
          <li>
            <strong>An incident, 26 Sep 2026: bursts are punished.</strong> Building the register of race result&apos;s races,
            a script on a developer&apos;s machine asked race result four times a second; race result answered that
            machine&apos;s address 429 &quot;too many requests&quot;, then 404 with a trap page, for hours, whatever the user
            agent. Production does not read from that machine, and reads a race only when the person asks. Each press of
            &quot;Read my result&quot; reads the platform plainly from Viky&apos;s own app servers (Vercel, Paris), once to
            show the line and, if that works, once more just before the proof: four requests to race result in all (the
            event&apos;s configuration and the bib&apos;s row, each time), three to MikaTiming (the search by bib twice, the
            runner&apos;s page once). Those plain requests keep no pace; what bounds them is how often one person may ask,
            per account and IP address: ten reads of the line and twenty proofs in ten minutes, counted in each app
            server&apos;s memory. Only the attested reading goes through the reading service (on Railway, through
            Reclaim&apos;s TEE client, so which address the platform sees for it is not verified), and since then that
            service keeps a pace with race result and MikaTiming: at least three seconds between two readings of a
            platform, four hundred a day, and after a 429, or race result&apos;s trap page, thirty minutes during which it
            takes no new reading of that platform, though one already waiting its turn still goes; a reading put off is
            told to try again later, and nothing is counted for it. The pace is held in the service&apos;s memory: a
            restart or a redeploy of the service forgets a pause and starts the day&apos;s count again.
          </li>
          <li>
            <strong>WAEC&apos;s terms.</strong> WASSCE credits are shown by the person from WAEC&apos;s own result checker
            (D217), and not read for them, because WAEC&apos;s privacy policy tells the holder of an access code it allocates
            &quot;you must not disclose it to any third party&quot;, and the result card&apos;s PIN is one. The card is typed on WAEC&apos;s page and
            never reaches Viky. waecdirect.org publishes no terms of use and no robots file. Each opening spends one of the
            card&apos;s uses, which the person bought.
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
            <strong>The relayer&apos;s one key, found by the audit of 27 Sep 2026.</strong> Every relayed step is sent by one
            key, and the servers that send them do not share a count of its transactions. Two steps sent at the same moment
            from two servers can take the same number: the network keeps one, the other is refused and its person is told
            it did not go through. Nothing moves twice, and the refused step can be sent again. Sharing that count between
            servers is not built.
          </li>
          <li>
            <strong>A step whose confirmation runs out, found by the same audit.</strong> A claim, a day counted, a
            withdrawal or a proof is written in Viky&apos;s journal once the chain has made it final. When the wait for that
            runs out, the step may still land with no line in the journal until it is read again. The contract&apos;s own
            record is then the truth, and the commands on this page read it. A gift&apos;s creation and a judge credit are
            already read back from the chain in that case, and a send says it is being confirmed rather than that it failed.
          </li>
          <li>
            <strong>A gift card or top-up whose invoice lapses, found by the same audit.</strong> Which status Bitrefill
            gives an invoice whose time to pay has run out is not in its documentation, and it could not be read without an
            account key. An order in that state is listed for an operator rather than guessed, and its money stays counted
            as held for its person until it is settled.
          </li>
          <li>
            <strong>The way out.</strong> Viky can say that the payout service reports the payment as completed. It can
            never say the money arrived in a bank: the bank leg is outside anything Viky can read, and no screen claims
            otherwise.
          </li>
          <li>
            <strong>The Bitrefill way out.</strong> What it is: Viky buys a good, a phone top-up of credit or data or a
            gift card, for the person, with the person&apos;s own money. They sign their AUSD over to Viky&apos;s treasury on Monad, and the
            treasury pays Bitrefill&apos;s invoice in USDC on Base; a failure after the money arrived sends it back by
            itself, when the order is next read and at the latest by the daily settling pass at 07:00 UTC. It is neither an
            exchange nor a bank payment, which is to be read again the day Viky is a company.
            It runs on Bitrefill&apos;s Personal API, whose documentation names the Business API for an app that sells
            its products; its terms say customers are end users and a buyer for resale may be frozen until verified
            as a company (section 18), and an Agent acts for the customer who pays (section 29). The founder chose the
            Personal API for the pilot, the risk assumed and written here, and is to ask Bitrefill for its agreement, or
            for its Business API when the time comes.
            The pilot&apos;s limits, within the account&apos;s own: five orders and 500 USD a day for everybody together, top-ups
            and gift cards alike, and 50 USD a person a day, checked when the price is given and again when the person pays. Open to everybody since its code was complete (the founder, 26 Sep 2026);
            what is missing is said at the moment it is missing, and nothing is taken. Credit: {used(uses?.phone)} Mobile
            data: {used(uses?.data)} A gift card: {used(uses?.gift_card)}
          </li>
          <li>
            <strong>Our own key.</strong> A reading counts because Viky&apos;s evidence signer signed it, and so does the
            opening of a gift: that key is what tells the contract which account opened it. So whoever holds it, and the
            owner can put another key in its place, could open a gift still waiting for its recipient into an account of
            their own, sign readings for it and take it: the whole amount at once on a milestone, a day at a time on a
            daily gift. On a gift someone has already opened, money leaves only at that person&apos;s own signed request or
            to the refund address the funder signed, and the key can still tip it either way: it could sign readings
            nobody made, which pays the recipient what the funder should have had back, or a reading after which no real
            one counts, which sends what was not yet earned back to the funder. It cannot change the terms a funder
            signed or take back what was already credited. The journal on this page is what makes a signature without a
            real reading behind it detectable, for the readings whose proof is kept.
          </li>
        </ul>
      </section>

      <MilestoneJudges />

      <JudgesAccount />
    </Shell>
  );
}
