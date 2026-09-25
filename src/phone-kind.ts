/**
 * Credit or data (D271): Bitrefill sells mobile data for the same number as separate products, named by Bitrefill with
 * the word ("Orange Data Senegal", "Tigo Free Data Senegal", "Orange Senegal Bundles"). Which a product is is read from
 * Bitrefill's own name, since its documented product has no category. Browser safe, and the server's too.
 */
export type PhoneKind = "credit" | "data";

export function phoneKindOf(operator: Readonly<{ id: string; name: string }>): PhoneKind {
  return /\b(data|internet|bundles?)\b/i.test(`${operator.name} ${operator.id.replace(/-/g, " ")}`) ? "data" : "credit";
}
