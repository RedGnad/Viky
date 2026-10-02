import { dateOfDay } from "@/src/day-record";
import { earlyGifts, EARLIER_HOST } from "@/src/judges-gifts";
import { Fold } from "./Fold";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

/**
 * The two first gifts, which this app will not show anybody, and why (D99).
 *
 * A judge reading the contract finds gifts this site never mentions, and would fairly read an inconsistency. There is
 * none: those two belong to an account created on another hostname, and a passkey is bound to the hostname it was made
 * on. So the money, the days and the transactions are all here, read from the chain as this page is served, and the
 * one thing missing is the ability to sign that person in here.
 */
export async function JudgesEarlyGifts() {
  const gifts = await earlyGifts();
  if (gifts.length === 0) return null;
  return (
    <Fold id="first-gifts" title="The first two gifts, and why this app does not show them" space="md">
      <p className={HELP}>
        Gifts {gifts.map((gift) => gift.giftId).join(" and ")} were made and opened on {EARLIER_HOST}, before{" "}
        viky.cash served the app. An account here is a passkey, and a passkey is bound to the hostname it was created
        on, for ever and by design: the browser will not offer it to another host, and no server can move it. So that
        account cannot sign in here, and this app cannot show you its gifts. Nothing was lost and nothing is hidden:
        everything those gifts did is on the chain, and every figure below is read from it while this page is served.
      </p>
      {gifts.map((gift) => (
        <div key={gift.giftId} className="space-y-[var(--space-xs)] border-t border-[var(--divider)] pt-[var(--space-md)]">
          <h3 className="font-medium">
            Gift {gift.giftId}, {gift.amountDisplay} over {gift.durationDays} days
          </h3>
          <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[14rem_1fr]">
            <dt className={MUTED}>Days earned</dt>
            <dd className={HELP}>
              {gift.earnedDays}, worth {gift.earnedDisplay}, of which {gift.withdrawnDisplay} has been taken out by the
              person the gift is for.
            </dd>
            <dt className={MUTED}>Days gone back</dt>
            <dd className={HELP}>
              {gift.returnedDays}, worth {gift.returnedDisplay} sent back to the funder.
            </dd>
            <dt className={MUTED}>Days not settled yet</dt>
            <dd className={HELP}>
              {gift.waitingDays}. {gift.finished ? "The gift is finished on the contract." : "The gift is still running on the contract."} Marked to go back
              and not sent yet: {gift.refundableDisplay}, which is what the contract has taken out of the gift for missed days and not yet paid to the funder.
            </dd>
            <dt className={MUTED}>Where it is held</dt>
            <dd className="[overflow-wrap:anywhere] text-[length:var(--type-help)]">
              <a className="underline" href={`https://monadvision.com/address/${gift.escrow}`}>
                {gift.escrow}
              </a>
            </dd>
            {gift.days.length > 0 ? (
              <>
                <dt className={MUTED}>Each day, as it settled</dt>
                <dd className={HELP}>
                  {gift.days.map((day) => `${dateOfDay(day.day)}: ${day.outcome === "earned" ? "earned" : "gone back"}`).join(" · ")}. The transaction
                  that settled each one is at <code>/api/gift/{gift.giftId}/journal</code>.
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      ))}
      <p className={MUTED}>
        What this costs us, said plainly: those two gifts can never be read inside the app, on any device, because the
        passkey that holds them answers only to {EARLIER_HOST}. Gifts made here are bound to viky.cash and stay
        readable here.
      </p>
    </Fold>
  );
}
