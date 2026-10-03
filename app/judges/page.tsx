import { BEFORE_THE_JOURNAL, cycleInWords, cycleUse, dailyCeilings, limitsOf, RECLAIM_ALLOWANCE } from "@/src/attested-calls";
import { contactEmail } from "@/src/contact";
import { LIMIT } from "@/src/sentences";
import { PROOF_EVERY_SECONDS } from "@/src/milestone-reading";
import { formatAusd } from "@/src/gift-reader";
import { judgeCreditConfig, judgeCreditsStanding, standingInWords } from "@/src/judge-credit";
import { rampHostApiKey, rampnowWayIn } from "@/src/rails";
import { rampnowFrameOn } from "@/src/rampnow-frame";
import { usdcRouterAddress } from "@/src/usdc-router";
import { USDC_ROUTER } from "@/src/viky-contracts";
import { conversionsSent } from "@/src/exit-store";
import { payoutsArrived } from "@/src/mobile-money-store";
import { conversionUse, mobileMoneyUse, type FirstUse } from "@/src/judges-first-use";
import type { Metadata } from "next";
import { Shell } from "../kit/Shell";
import { JudgesAccount } from "../components/JudgesAccount";
import { MilestoneJudges } from "../components/MilestoneJudges";
import { DISPLAY } from "../components/ui";
import { readOwnership, ownershipWords } from "@/src/judges-owner";
import { portalsListedAndRead, providerCounts, witnessProviders } from "@/src/portal-store";
import { countryInWords } from "@/src/university-shown";
import { usesDelivered } from "@/src/phone-order-store";
import { consentAnchorAddress, giftEscrowV2Address, giftEscrowV3Address, milestoneGiftV2Address } from "@/src/v2";
import { AUSD_ADDRESS, MONAD_CHAIN_ID, PUBLIC_RPC_URL } from "@/src/monad/chain";
import { readIndex } from "@/src/envio-index";
import { MOBILE_CEILINGS, mobileMoneyOn } from "@/src/mobile-money";
import { JudgesAgora } from "./JudgesAgora";
import { JudgesConditions } from "./JudgesConditions";
import { JudgesContents } from "./JudgesContents";
import { JudgesContracts } from "./JudgesContracts";
import { JudgesEarlyGifts } from "./JudgesEarlyGifts";
import { JudgesIndex } from "./JudgesIndex";
import { JudgesMera } from "./JudgesMera";
import { JudgesMinute } from "./JudgesMinute";
import { JudgesReliability } from "./JudgesReliability";
import { JudgesVerify } from "./JudgesVerify";
import { JudgesWhoUsed } from "./JudgesWhoUsed";
import { Fold } from "./Fold";

export const metadata: Metadata = {
  title: "For judges",
};

// Read while it is served: the owner of each contract, the pauses, the reliability figures and the example to
// re-verify all come from the chain and from the journal at that moment, never from something written down here.
export const dynamic = "force-dynamic";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

/** A transaction as this page links one: its head and its tail, on the explorer. */
function Tx({ hash }: Readonly<{ hash: string }>) {
  return (
    <a className="underline" href={`https://monadvision.com/tx/${hash}`}>
      {hash.slice(0, 10)}…{hash.slice(-4)}
    </a>
  );
}

/** The mobile money ceilings in words, from the constants the routes check (src/mobile-money.ts). */
const MOBILE_CEILINGS_WORDS = `$${MOBILE_CEILINGS.usdPerPayout}.00 at most per payout and $${MOBILE_CEILINGS.usdPerAccountPerDay}.00 a day per account`;

/** A way's state and its first use, with each transaction a judge can open (src/judges-first-use.ts). */
function UseLine({ use, name }: Readonly<{ use: FirstUse; name: string }>) {
  return (
    <span data-first-use={name}>
      {use.words}
      {use.transactions.map((transaction) => (
        <span key={transaction.hash}>
          {" "}
          {transaction.label[0].toUpperCase() + transaction.label.slice(1)}:{" "}
          <a className="underline" href={`https://monadvision.com/tx/${transaction.hash}`}>
            {`${transaction.hash.slice(0, 10)}…${transaction.hash.slice(-4)}`}
          </a>
          .
        </span>
      ))}
    </span>
  );
}

// The only page where contract addresses appear. Consumer screens never show them. They are set in the text face
// like every other word: a monospace face would be the system's, and hex has no letter a text face confuses.
export default async function JudgesPage() {
  const escrow = process.env.NEXT_PUBLIC_GIFT_ESCROW_ADDRESS?.trim();
  // Who owns the contracts, asked of the chain now (D187): the page said the founder's key for three days after the
  // Safe had taken them. When the chain cannot be read, the sentence says so rather than repeating a name.
  const ownership = await readOwnership().catch(() => null);
  // Universities listed, and how many have been read at least once (D267): here, and never in the flow.
  const portals = await portalsListedAndRead();
  // The providers by sense, the requests open, and the providers read through a witness and no enclave (D312), each
  // by its university, with how many carry a pin.
  const counts = await providerCounts();
  const witnessLines = await witnessProviders();
  // How many times each Bitrefill use was used (D271): said here, as for the conditions, and never in the flow.
  const uses = await usesDelivered();
  // Mobile money and Rampnow, said as Bitrefill is (the founder, 3 Oct 2026): open and unused, then their first use.
  const mobileOn = mobileMoneyOn();
  const mobileUse = mobileMoneyUse(mobileOn, mobileOn ? await payoutsArrived() : null, countryInWords);
  const converter = usdcRouterAddress();
  const rampnowOn = rampnowWayIn();
  const conversion = conversionUse(rampnowOn, rampnowOn ? await conversionsSent() : null);
  // What the second version changes for our own key is said only once its contracts are set (src/v2.ts): until then no
  // gift is on them, and this page says nothing it cannot show.
  const escrowV2 = giftEscrowV2Address();
  const milestoneV2 = milestoneGiftV2Address();
  const anchor = consentAnchorAddress();
  const secondVersionSet = escrowV2 !== null && milestoneV2 !== null;
  // The third daily contract, where a day is paid the day it is read: said only once it is set, like the second.
  const thirdVersionSet = giftEscrowV3Address() !== null;
  // The index of the contracts' events, read once for the two blocks that show it. It answers nothing rather than an
  // error (src/envio-index.ts), and each block then says so in a sentence.
  const index = await readIndex();
  const used = (count: number | undefined) => (uses === null || count === undefined ? "the count could not be read right now" : count === 0 ? "Open. Nobody has used it yet." : count === 1 ? "Open. Used once." : `Open. Used ${count} times.`);
  // Gifts created before the D30 corrections keep running on the contract that holds them, and every
  // gift record names its own contract, so both are listed here for as long as the older one holds one.
  const earlierEscrow = process.env.NEXT_PUBLIC_EARLIER_GIFT_ESCROW_ADDRESS?.trim();
  // What the month has used of Reclaim's allowance, counted from the journal of attested fetches as the page is served.
  const reclaimUse = await cycleUse().catch(() => null);
  const reclaimLimits = reclaimUse ? limitsOf(reclaimUse) : null;
  // The judge credit's amount, said on the page; its code is never read here (D291).
  const judgeCredit = judgeCreditConfig();
  // How many were given and how many the ceiling still allows, counted from the journal at each reading of the page.
  const judgeStanding = judgeCredit ? await judgeCreditsStanding(judgeCredit).catch(() => null) : null;
  return (
    <Shell kind="document" back="/me">
      <header className="space-y-[var(--space-lg)]">
        <h1 className={DISPLAY}>For judges</h1>
        <p className={MUTED}>
          Everything verifiable about Viky on one page, and everything that is not, written as it is. Nothing here is
          shown to funders or recipients. The first block is the page in one minute; every section under it opens
          when its title is pressed.
        </p>
      </header>

      {/* For a judge in a hurry (the audit of 1 Oct 2026, D-11): the page in one minute, then its contents. */}
      <JudgesMinute
        index={index}
        contracts={secondVersionSet ? { daily: escrowV2, milestone: milestoneV2, anchor, version: 2 } : { daily: escrow ?? null, milestone: process.env.NEXT_PUBLIC_MILESTONE_GIFT_ADDRESS?.trim() ?? null, anchor: null, version: 1 }}
      />

      <JudgesContents />

      {/* The judges' own path (D291): two gestures, no account kept by Viky, the judge keeps their passkey. The code
          itself is only in the submission portal's instructions, never on this page. */}
      <Fold id="try" title="For judges, how to try it" open>
        <ol className={`${HELP} list-decimal space-y-[var(--space-xs)] pl-[var(--space-lg)]`}>
          <li>
            On the home page, press Sign in and create your account: your face or your fingerprint makes a passkey on
            your device. Viky keeps no account for you, and you keep the passkey.
          </li>
          <li>
            Offer a gift from the home page. On the pay sheet, press &quot;Have a code?&quot; and type the judge code from the
            submission portal&apos;s instructions. Your account receives {judgeCredit ? formatAusd(judgeCredit.units) : "a set amount"}: a judge credit from
            Viky&apos;s treasury, once per account. A real funder pays by card instead, on the page of the card service
            their country is served by (&quot;How money comes in&quot;, below).
            {judgeCredit ? <span data-judge-standing> {standingInWords(judgeStanding)}</span> : null}
          </li>
          <li>
            The sheet then pays from your account and opens no card service; if the gift is more than the credit, it
            offers to make the gift that amount.
          </li>
          <li>
            To see the other side on this device: copy the link, press Me, then Use another account, open the link and
            press Create my account. Press Open my gift, then connect the source. With one account you only ever see
            the funder&apos;s side of your own gift.
          </li>
          <li>
            What you will see, and when:{" "}
            {thirdVersionSet
              ? "on a gift made now, a day counts the day its lesson is done, when the gift's page is opened or within a quarter of an hour; on a gift made on the second version, the morning after it ends (the readings pass of 00:30 UTC). Either way a "
              : "a day counts the morning after it ends (the readings pass of 00:30 UTC); a "}
            missed day comes back to the funder 31 hours after it ends (the settling pass of 07:00 UTC, two mornings
            later). To see a settlement in one sitting, offer a Chess.com rating one point above the account&apos;s
            own: the first reading is the start, and a reading at the target, asked from the gift&apos;s page, settles
            it at once.
          </li>
          <li>
            If the portal&apos;s instructions give you the link of a gift made for you, open it instead of making one. Money
            leaves a gift only once a reading has credited it: an opened gift with nothing credited has nothing to take
            out yet.
          </li>
          <li>
            Mera&apos;s stateless test runs on this same account: sign out, then sign in from another browser or device
            with the same passkey. The account and its money come back; nothing was kept on the first device.
          </li>
          <li>
            One Passkey, Many Keys: the same sign-in asks the passkey&apos;s PRF for a second salt,
            sha256(&quot;viky:consent:v1&quot;), and its output is an Ed25519 key held in memory. It signs the recipient&apos;s yes
            to what a gift reads, and their stop, and nothing else: it cannot move money. In six gestures:
            <ol className="list-decimal space-y-[var(--space-xs)] pl-[var(--space-lg)] pt-[var(--space-xs)]">
              <li>Sign in on this device. The one prompt asks the passkey for both salts.</li>
              <li>
                Read &quot;Your agreement key&quot; at the foot of this page: the public half of that Ed25519 key, from this
                page&apos;s memory.
              </li>
              <li>
                Open a gift made for you and press Agree on the line under its card: that yes is signed by this key.
              </li>
              <li>On a second device, sign in with the same passkey.</li>
              <li>Read &quot;Your agreement key&quot; there: it is the same key.</li>
              <li>
                Press Stop on the gift from the second device. Back on the first, the gift says Viky stopped reading:
                every reading that could move money checks the latest signed yes first (src/consent-guard.ts).
              </li>
            </ol>
          </li>
        </ol>
      </Fold>

      <JudgesWhoUsed index={index} />

      <Fold id="network" title="Network">
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
          {escrowV2 && milestoneV2 && anchor ? (
            <>
              <dt className="text-[var(--muted)]">Where a gift is made today</dt>
              <dd className="[overflow-wrap:anywhere]" data-second-version>
                The second version of the contracts, deployed on 2 Oct 2026. A habit, day by day: {escrowV2} (<a className="underline" href={`https://monadvision.com/address/${escrowV2}`}>MonadVision</a>, deployed in{" "}
                <Tx hash="0x8be062b29a506c17b581587f2ba0b2f8d1460cd5fc2705e0aa191a2f9c8ac409" />). One thing reached: {milestoneV2} (
                <a className="underline" href={`https://monadvision.com/address/${milestoneV2}`}>MonadVision</a>, deployed in{" "}
                <Tx hash="0x15c355472e145a6d70e3d25af7bcee2bcc1c1560e80e0940e3a460bd7678bd4c" />). The anchor of agreements, which holds no
                money: {anchor} (<a className="underline" href={`https://monadvision.com/address/${anchor}`}>MonadVision</a>, deployed in{" "}
                <Tx hash="0xe0a2b4127067d5c24282254886a8e32da9667e835c24dd98461e4e4a3c90d412" />). The source of the three is verified through
                Sourcify, an exact match. They were deployed by a key made for that day alone,
                0xEFc6820AA6EFafb824f6e9c102079c8f81845840, which handed each to the Safe; the Safe accepted them in{" "}
                <Tx hash="0x5a8dca52982b71dba715feb187e33f0494f4412c3cbb984147d97d4bf63aeae9" />,{" "}
                <Tx hash="0xb5b8b17b735fffb5a0323ee52b3eccbe0ee58c24ecf2703bdf6bee0c1222921e" /> and{" "}
                <Tx hash="0x4125aef710d8017a09fcc8c842ce9808d2b7def366dfc0befaa61f05413b171b" />, and that key owns nothing. The same day the
                Safe closed new gifts on the three first-version contracts, in{" "}
                <Tx hash="0x0c2e70edd97c91d010527ef930d60c2e12fd25578109a3e4cd94e0f57cec5397" />,{" "}
                <Tx hash="0x10e8d50ec6c88d9492cbcc7d826b6afc5b7753cb046c033ae4898411131457b5" /> and{" "}
                <Tx hash="0x32ec292bd099897081bac962f95efacc40fdfbb87e0092cd58f8d75537ab181a" />: they go on running the gifts they hold, to
                the end. Whether a gift has run on the second version yet is counted from the index under &quot;Who has used
                Viky&quot;: nothing is claimed as working on it before one has, end to end, with real amounts.
              </dd>
            </>
          ) : null}
          <dt className="text-[var(--muted)]">{secondVersionSet ? "Gift contract, first version" : "Gift contract"}</dt>
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
            The four of the first version were handed to the Safe on 20 Sep 2026, in{" "}
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
            {converter === USDC_ROUTER ? (
              <>
                {" "}The converter of card payments was born owned by a key made for its deployment alone, which handed it
                to the Safe in its third transaction on 3 Oct 2026, in{" "}
                <a className="underline" href="https://monadvision.com/tx/0x87d44ed94b31fa7c8ba18872b5225415dc8a2651f62ff83794bcc38e85177103">
                  0x87d44ed9…7103
                </a>
                .
              </>
            ) : null}
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
      </Fold>

      {/* First, because it is the one thing on this page a stranger can do instead of believing us. */}
      <JudgesVerify />

      <JudgesConditions />

      <JudgesReliability />

      <JudgesContracts />

      <JudgesEarlyGifts />

      <JudgesIndex index={index} />

      <JudgesAgora />

      <JudgesMera index={index} />

      {/* How money comes in (D289): through a licensed partner, the asset named, and the next step said as it is. */}
      <Fold id="money-in" title="How money comes in">
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
        <p className={HELP} data-rampnow-way>
          A third way is Rampnow, by card: the funder pays on Rampnow&apos;s page, which delivers USDC on Monad to their
          account, and the converter changes it into AUSD on one signature, though the account holds none of the
          chain&apos;s coin. The converter is a second copy of the way out&apos;s contract, ExitRouter, set on USDC
          {converter ? (
            <>
              {" "}at{" "}
              <a className="underline" href={`https://monadvision.com/address/${converter}`}>
                <code>{converter}</code>
              </a>
              , its source verified through Sourcify on 3 Oct 2026, and its owner read with the others&apos; under Network
            </>
          ) : null}
          . A conversion promises at least ninety-nine for a hundred, or nothing moves.{" "}
          {rampnowOn ? (rampnowFrameOn() ? "Rampnow's page opens in a frame inside Viky. " : "Rampnow's page opens in a tab of its own. ") : null}
          <UseLine use={conversion} name="rampnow" />
        </p>
      </Fold>

      <Fold id="reading" title="How a day is read">
        {thirdVersionSet ? (
          <p className={HELP} data-third-version-rule>
            On the third daily contract, where a daily gift is made now, a day is paid the day it is read. The first day
            is the day the account is connected. The gift&apos;s page looks at the public profile as it opens, a pass looks
            every quarter of an hour, and an attested read is taken only for a lesson a look saw. A reading pays the
            oldest open day first, and never a day that has not begun. A lesson taken after the day was paid is counted
            by the first reading of the next day; taken before, it is not kept. So one lesson never pays two days, no more
            days are paid than lessons were taken, and a day can be paid on which no lesson was taken: the one after a day
            with a second lesson that came after that day&apos;s pay. A gift made on the second version stays there, under
            the rule the next paragraph says.
          </p>
        ) : null}
        <p className={HELP}>
          Duolingo runs in public mode: once a day, Viky&apos;s keeper looks at the recipient&apos;s public profile
          plainly, and when that look shows a day the contract can credit, reads it through an attested fetch (Reclaim
          zkFetch through Reclaim&apos;s TEE client). The look is never evidence: it is not signed and not sent, and it
          can only spare a reading the contract would refuse (<code>src/daily-look.ts</code>). The attestor signs
          Duolingo&apos;s response; Viky verifies that signature, pins the attestor&apos;s address (the one in <code>src/reclaim-proof-set.ts</code>)
          and checks the proof is about the right URL and username; the evidence signer then turns the
          signed reading into an EIP-712 check-in, and the contract credits or refuses it. What is not verified: the
          attestor&apos;s own TEE attestation, which zk-fetch 1.1.0 does not put in the proof. The person signs in to
          nothing and installs nothing. The account is tied to the gift once: by the funder naming it, which proves
          nothing about whose it is, or, when the recipient names it themselves, by a short code they place in their
          Duolingo display name.
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
          price starts at $0.10 per verification). Reads are counted per gift, never per person: the morning pass looks
          at each daily gift once, takes an attested read only for one whose look shows a day to credit, and skips one
          already counted that day, so two gifts on one Duolingo account are two reads on a morning both earned a day. A
          look that failed takes no read: the gift is looked at again at 03:30 UTC, and only then, if a day of it closes
          at 06:00 that morning, is one read taken without a look, once. And a breaker holds every paid read
          (<code>src/attested-calls.ts</code>): {dailyCeilings().perGift} for one gift in a UTC day and {dailyCeilings().all} for
          all gifts, counted on the proofs given. Past it nothing is asked of Reclaim until the next day, nothing is
          settled against the gift, and its page says when reading resumes. A certificate&apos;s link is looked at plainly
          before its proof, and a climb at its target is given three proofs a day at most. Connecting the account is one more, and a connection by code takes it only once a plain look
          has found the code in the name; a count the person asks for looks first in the same way. No daily ceiling bounds
          those asks, only ten in ten minutes from one IP address, counted in each app server&apos;s memory. A gift on
          Strava or Fitbit has no plain look yet: it is read attested each morning that has a day to credit, earned or not. A climb
          is looked at plainly, not through Reclaim, in both of the day&apos;s passes and at each ask, and read attested
          only to connect the account or when that look does not show it below its target. Private sources keep the
          user-proof path through the Reclaim verifier app.
        </p>
        <p className={HELP} data-reclaim-cycle>
          The month&apos;s count, kept here because Reclaim&apos;s dashboard shows no count of the fetches: its free tier
          allows up to {RECLAIM_ALLOWANCE.fetches} attested fetches and {RECLAIM_ALLOWANCE.verifications} verifications a
          month, and gives more on request only. {cycleInWords(reclaimUse)}
          {reclaimUse && (reclaimUse.fetches.allowed !== RECLAIM_ALLOWANCE.fetches || reclaimUse.verifications.allowed !== RECLAIM_ALLOWANCE.verifications)
            ? " Reclaim has granted more than the free tier, and the limits in force are the ones counted against."
            : ""}
          {reclaimLimits?.readings
            ? ` The limit of readings is reached: Viky sends no attested reading to Reclaim until the next cycle or until more is granted, nothing is settled against a reading that was not taken, and a person whose gift waits for one reads this on its page, with the hour their day can still be counted until: "${LIMIT.reading(null, contactEmail())}"`
            : ""}
          {reclaimLimits?.proofs
            ? ` The limit of proofs is reached: Viky opens no new proof at Reclaim, and a person reads this before starting one: "${LIMIT.proof(contactEmail())}"`
            : ""}{" "}
          The limit Viky holds itself to goes by the readings that gave a proof and by the proofs that came back, not by
          what was started or asked: what Reclaim counts is not published, and on 3 Oct 2026 fetches still passed at 126
          started and 68 proofs.
          {reclaimUse?.from === BEFORE_THE_JOURNAL.cycleFrom
            ? ` Of this cycle's fetches, ${BEFORE_THE_JOURNAL.started} started and ${BEFORE_THE_JOURNAL.proved} proofs were counted on 3 Oct 2026 from the reading service's logs, which start on 28 Sep, and from the gifts' journal, so the figures are a floor. 114 of those fetches went in five hours on 30 Sep 2026, on one gift whose plain look kept failing, half of them without a proof: the pass of every five minutes tried a proof at each failed look. It stops at a failed look since 1 Oct 2026.`
            : ""}{" "}
          Since 3 Oct 2026 every fetch is written down as it leaves, proof or not, and a proof is claimed before it is
          paid for: for one gift, once in {PROOF_EVERY_SECONDS.unseen / 3_600} hours after a look that failed or showed no
          rating, once an hour in the gift&apos;s last day, and every {PROOF_EVERY_SECONDS.atTheTarget / 60} minutes at the
          target until one settles it. The operator is told by email at half of an allowance, at four fifths, and at the
          limit, with the days then waiting for a reading. What is not closed: each attempt to connect an account by a
          code in its name is still a proof, whether the code is there yet or not.
        </p>
      </Fold>

      <Fold id="risks" title="Risks and holes, written as they are">
        <ul className={`${MUTED} list-disc pl-[var(--space-lg)]`}>
          <li>
            <strong>Duolingo&apos;s terms.</strong> The profile Viky reads is a public endpoint Duolingo does not
            document, and Duolingo&apos;s terms say &quot;You may not use any data mining, robots, scraping, or similar
            data gathering or extraction methods&quot;. Viky reads a profile once a day for each gift made on it, a
            second time that day when the first shows a day to credit, and again each time the person connects it or
            asks for a count. The risk is
            accepted and spread by having several conditions rather than one; the shape of that endpoint is pinned by
            the tests, like any other source that could drift, and if it changes or closes, the reading fails on our
            side. The day then stays open until its catch-up window closes, 30 hours after it ends, and goes back to
            the funder like a missed day: a failure of ours does not hold it longer. Only a pause of readings by the
            owner holds the open days, and on the second version of the daily contract alone.
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
            {portals ? `${portals.listed} universities listed, ${portals.read} read at least once.` : "the count could not be read right now."}
          </li>
          <li>
            <strong>The world&apos;s universities, a provider per sense.</strong> Since D313 the list is every university of
            Reclaim&apos;s directory whose student portal answered a plain request on 28 Sep 2026, wherever it is, placed in
            its country by the world universities list and, failing that, by its domain&apos;s country code. What reads a
            portal is a provider per sense: one for enrolment, one for the results page, each with its own domain, since a
            university&apos;s results can live on another site than its enrolment. A funder can choose a university that
            has neither: the operator is asked, with the exact instruction for Reclaim&apos;s agent, and builds the
            provider within two days, and the person reads that it is set up within two days, the money held by the
            contract meanwhile, and the operator is emailed about each request. A grade is signed on a scale: the
            university&apos;s own where its results page is pinned; before, the one the funder chooses (out of 20, 4 or
            100, or letters, ranked in one order), which the first results page the operator reviews confirms, or
            refuses the gift, the person told why and the money left where it is. &quot;A student account&quot; is no
            longer something a gift can be made on.{" "}
            {counts
              ? `${counts.listed} universities listed; ${counts.enrolment} with an enrolment provider, ${counts.results} with a results provider; ${counts.requested} ${counts.requested === 1 ? "provider" : "providers"} asked for and not built yet.`
              : "The counts could not be read right now."}
          </li>
          <li>
            <strong>Providers read through a witness, no enclave.</strong> An AI provider (D311, D312) carries no enclave
            attestation. Viky verifies its proof the way it verifies its own readings: the claim must be signed by
            Viky&apos;s pinned witness and by nobody else, and must have read the provider&apos;s own domain. An AI provider
            names no request until Reclaim&apos;s agent writes one at the first real run, so it has no pattern until a
            student shows a first proof. That first proof is held, never paid on its own: the operator reads what the
            pattern read, then pins the provider (the version, the request, the match, the redaction and the fields) and
            the held gift is settled, or refuses it and the person reads why, the money left where it is. After the pin,
            a proof from another domain, another request or another pattern is refused.{" "}
            {counts ? `${counts.witness} such ${counts.witness === 1 ? "provider" : "providers"}, ${counts.pinned} pinned.` : "The count could not be read right now."}
            {witnessLines && witnessLines.length > 0 ? (
              <ul className="mt-[var(--space-sm)] flex flex-col gap-[var(--space-xs)]">
                {witnessLines.map((line) => (
                  <li key={`${line.portalId}-${line.sense}`}>
                    {line.university}, {countryInWords(line.country)}, {line.sense}: witness signature, no enclave; {line.domain};{" "}
                    {line.pin ? "pinned" : "first proof awaited"}.
                  </li>
                ))}
              </ul>
            ) : null}
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
            no the funder learns, and the erase button that gives the key back first. The same erasing runs by itself
            once a gift is over, finished, cancelled or ended by its person: the key given back, its row deleted, and
            with it the account&apos;s id and the rows of the morning readings (<code>src/gift-end-erasure.ts</code>);
            the journal of the days and the signed yes and stop are kept. The risk: the funder&apos;s daily yes
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
            key back first are those three, and the erasing runs by itself once a gift is over, as for Fitbit. Two things it also says are written here rather than settled: a new
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
            door stays open for the operator&apos;s accounts alone: a bib entered after the start, which is how a test
            gift can run on the 2023 result. No proof of this line is shown on this page.
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
            takes no new reading of that platform, and one already waiting its turn is put off too; a reading put off is
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
            <strong>Coursera.</strong> Nothing published says a certificate was earned under supervision: Coursera
            verifies identity once per account, and says some programmes require it while others only check a name.
            The condition is open, and that is all it proves: a certificate with that course and that day, on the page
            the person shares.
          </li>
          <li>
            <strong>The homonym.</strong> A gift is bound to an account on the source, not to a person. Two people can
            share a display name, and the funder can name the wrong account when they offer the gift. When the funder names
            the account, on Duolingo, Chess.com or Codeforces, that naming is the whole tie: no code is asked, so whoever
            opens the link is paid when that account gets there, and a recipient who gave the funder the name of an
            active player who is not them would be paid for that player&apos;s games. The code in the display name is
            asked only of an account the recipient names themselves; it proves that whoever put it there controls that
            account, not that they are the person the funder had in mind. A gift sent to the wrong account with the right
            name would count that account&apos;s work.
          </li>
          <li>
            <strong>The milestone, two limits.</strong> A target reached before the account is connected pays nothing:
            the first reading is recorded as the starting point whatever it says, so the climb is measured from there.
            And a rating that drops back before the reading that would have paid it does not pay either, because the
            contract judges the reading, not the game: Viky looks at each climb every five minutes, when an outside
            scheduler calls its pass, and whenever the recipient asks from the gift&apos;s page, and a rating reached and
            lost between two readings never settles.
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
            <strong>Mobile money.</strong> A payout to a mobile money number through Switch Labs. The person types the
            amount in their own money, francs in Senegal, and Switch&apos;s quote for exactly that amount gives the dollars
            it takes. Its ceilings are the gift cards&apos; rule: {MOBILE_CEILINGS_WORDS}, checked when the payout is
            priced and again when it is sent, and said in place of the form when the day&apos;s is met. Switch refused
            every quote to Viky&apos;s key until 2 Oct 2026, 23:23 UTC, and has answered them since.{" "}
            {mobileOn
              ? "Offered to everybody since 3 Oct 2026, by the founder's rule that a way whose code is complete is open at its deployment; the one setting that opens it also closes it, should Switch stop answering well. "
              : null}
            <UseLine use={mobileUse} name="mobile-money" />
          </li>
          <li>
            <strong>The Bitrefill way out.</strong> What it is: Viky buys a good, a phone top-up of credit or data or a
            gift card, for the person, with the person&apos;s own money. They sign their AUSD over to Viky&apos;s treasury on Monad, and the
            treasury passes it to Relay (relay.link), which pays Bitrefill&apos;s invoice in USDC on Base: the person pays the
            invoice and Relay&apos;s fee, shown with the price, and no float is used. A failure after the money arrived sends it back by
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
            <strong>Our own key.</strong> A reading counts because Viky&apos;s evidence signer signed it. On the first
            version of the contracts so does the opening of a gift: that key is what tells the contract which account
            opened it. So whoever holds it, and the owner can put another key in its place, could open a gift still
            waiting for its recipient into an account of their own, sign readings for it and take it: the whole amount at
            once, on a milestone and on a daily gift alike.
            {secondVersionSet
              ? " That stays true of a gift made on the first version and never opened. On the second version, where every gift is made since 2 Oct 2026, that key opens nothing: a gift is opened by the key its link carries, made in the funder's browser and never sent to Viky, so only somebody who holds the link can open it. And a new evidence key stands 24 hours after the owner announces it, never at once."
              : null}{" "}
            On a gift someone has already opened, money leaves only at that person&apos;s own signed request or
            to the refund address the funder signed, and the key can still tip it either way. It could sign readings
            nobody made, which pays the recipient what the funder should have had back: there the funder loses. Or it
            could sign one reading far above the truth, after which no real reading counts, under this key or any later
            one: there the recipient loses. On a daily gift the days they go on doing are counted as missed and their
            money goes back to the funder as each day passes; on a milestone the whole amount goes back at the
            deadline.
            {secondVersionSet
              ? " On the second version of the contracts the first reading of a gift is signed by the recipient too, so the key alone cannot do this to a milestone, and the recipient can end a daily gift it was done to: what was counted stays theirs and the rest goes back at once."
              : null}
            {thirdVersionSet
              ? " On the third daily contract this key alone can have a day paid from the moment a gift is connected, without the day's delay the second version left between the connection and the first money a reading could move. The money still goes only to the recipient or to the funder, and the pause is still the only brake."
              : null}{" "}
            It cannot change the terms a funder signed or take back what was already credited. The journal on this page
            is what makes a signature without a real reading behind it detectable, for the readings whose proof is kept.
          </li>
        </ul>
      </Fold>

      <MilestoneJudges />

      <JudgesAccount />
    </Shell>
  );
}
