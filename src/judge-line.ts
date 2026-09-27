/**
 * Whether the pay sheet may say "Paid from your judge credit." (D295, the founder's words): the gift is paid from the
 * account's balance, and that balance is no larger than a credit nothing has left the account since, as the server
 * reads it (`untouchedJudgeCredit`). With nothing gone out, the balance is what the account held before the credit, plus
 * the credit, plus whatever came in since; at most the credit, it is the credit alone, and so is every dollar of the
 * gift. Beside any other money, or once anything has gone out since, the line is not drawn: it would name a source the
 * sheet cannot prove.
 */
export function judgeLineIsTrue(input: Readonly<{ gift: bigint | undefined; held: bigint | null; untouchedCredit: bigint | null }>): boolean {
  const { gift, held, untouchedCredit } = input;
  if (gift === undefined || held === null || untouchedCredit === null) return false;
  return gift > 0n && gift <= held && held <= untouchedCredit;
}
