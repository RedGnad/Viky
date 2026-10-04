import { operatorAccounts } from "@/src/dev-access";
import type { IndexRead } from "@/src/envio-index";
import { formatAusd } from "@/src/gift-reader";
import { between, founderAccounts, shortOf, usageOf, type GiftBetween } from "@/src/pilot-accounts";
import { Fold, SubFold } from "./Fold";

const HELP = "text-[length:var(--type-help)]";
const MUTED = "text-[length:var(--type-help)] text-[var(--muted)]";

const count = (number: number, one: string, many: string) => `${number} ${number === 1 ? one : many}`;

const BETWEEN_WORDS: Readonly<Record<GiftBetween, string>> = {
  "two others": "between two people, neither of them the founder",
  "founder to another": "from the founder to somebody else",
  "another to founder": "from somebody else to the founder",
  "the founder's own try": "the founder's own try, between his test accounts",
};

function Account({ account, founders }: Readonly<{ account: string; founders: ReadonlySet<string> }>) {
  return (
    <>
      <a className="underline" href={`https://monadvision.com/address/${account}`}>
        {shortOf(account)}
      </a>{" "}
      ({founders.has(account.toLowerCase()) ? "the founder's test account" : "not the founder's"})
    </>
  );
}

/**
 * Who has used Viky (the audit of 1 Oct 2026, D-08; the founder, 2 Oct 2026): the gifts, who funded them and who
 * opened them, what was earned and what went back, counted from the index of the contracts' events as this page is
 * served. The founder's own test accounts are named as his (src/pilot-accounts.ts), so his tries are never read as
 * other people's use.
 *
 * When the index cannot be read the block says so in a sentence and shows no figure: nothing here is a number typed
 * in, and an error of the index is never printed.
 */
export function JudgesWhoUsed({ index }: Readonly<{ index: IndexRead | null }>) {
  if (!index) {
    return (
      <Fold id="who" title="Who has used Viky">
        <p className={HELP} data-who-used="unread">
          The gifts, who funded them and who opened them are counted from the index of the contracts&apos; events, and
          the index could not be read just now, or no endpoint is set for this deployment. So no count is shown here
          rather than an old one. The gifts themselves are on the contracts listed under Network, where anybody can
          read them.
        </p>
      </Fold>
    );
  }
  const founders = founderAccounts(operatorAccounts());
  const usage = usageOf(index.gifts, founders);
  const others = (side: { all: number; founders: number }) => side.all - side.founders;
  return (
    <Fold id="who" title="Who has used Viky">
      <p className={HELP}>
        Counted from the index of the contracts&apos; events as this page is served, at block{" "}
        {index.block.toLocaleString("en-US")}. The founder&apos;s own test accounts are named as his: they are the five
        listed in <code>src/pilot-accounts.ts</code>. Every other account is somebody else&apos;s, and nothing more is
        said here of whose.
      </p>
      <dl className="grid grid-cols-1 gap-x-[var(--space-md)] gap-y-[var(--space-xs)] [@media(min-width:600px)]:grid-cols-[14rem_1fr]">
        <dt className={MUTED}>Gifts</dt>
        <dd className={HELP} data-who-used="gifts">
          {count(usage.gifts, "gift", "gifts")} made, {formatAusd(usage.funded)} put into them in all, {usage.opened} opened.{" "}
          {usage.onSecondVersion === 0 && usage.onThirdVersion === 0
            ? "None of them is on the second version of the contracts yet: it was deployed on 2 Oct 2026."
            : [
                usage.onSecondVersion > 0 ? `${count(usage.onSecondVersion, "is", "are")} on the second version of the contracts` : null,
                usage.onThirdVersion > 0 ? `${count(usage.onThirdVersion, "is", "are")} on the third daily contract` : null,
              ]
                .filter(Boolean)
                .join(", and ") + "."}
        </dd>
        <dt className={MUTED}>Who funded them</dt>
        <dd className={HELP} data-who-used="funders">
          {count(usage.funders.all, "account", "accounts")}: {usage.funders.founders} the founder&apos;s test{" "}
          {usage.funders.founders === 1 ? "account" : "accounts"}, {others(usage.funders)} not his.
        </dd>
        <dt className={MUTED}>Who opened them</dt>
        <dd className={HELP} data-who-used="recipients">
          {count(usage.recipients.all, "account", "accounts")}: {usage.recipients.founders} the founder&apos;s test{" "}
          {usage.recipients.founders === 1 ? "account" : "accounts"}, {others(usage.recipients)} not his.
        </dd>
        <dt className={MUTED}>Between whom</dt>
        <dd className={HELP} data-who-used="between">
          Between two people neither of whom is the founder: {usage.between["two others"]}. From the founder to somebody
          else: {usage.between["founder to another"]}. From somebody else to the founder: {usage.between["another to founder"]}.
          The founder&apos;s own tries, between his test accounts: {usage.between["the founder's own try"]}.
        </dd>
        <dt className={MUTED}>Earned, and gone back</dt>
        <dd className={HELP} data-who-used="amounts">
          {formatAusd(usage.earned)} earned by the people the gifts were for, {formatAusd(usage.sentBack)} sent back to
          the people who funded them.
        </dd>
      </dl>
      {/* The long list, one line per gift, under its own fold: the figures above are what a hurried reader needs. */}
      <SubFold title={`Gift by gift (${usage.gifts})`}>
        <p className={HELP}>
          {index.gifts.map((gift) => (
            <span key={`${gift.contract}-${gift.giftId}`} className="block" data-who-used-gift={gift.giftId}>
              Gift {gift.giftId}, {formatAusd(gift.amount)}, {gift.status}: from <Account account={gift.funder} founders={founders} />{" "}
              {gift.recipient ? (
                <>
                  to <Account account={gift.recipient} founders={founders} />
                </>
              ) : (
                "to nobody yet, it has not been opened"
              )}
              ; {BETWEEN_WORDS[between(gift, founders)]}. {formatAusd(gift.amountEarned)} earned, {formatAusd(gift.amountRefunded)} sent back.
            </span>
          ))}
        </p>
      </SubFold>
    </Fold>
  );
}
