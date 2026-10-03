/**
 * Where a person writes to Viky: the address the legal notice gives (`NEXT_PUBLIC_CONTACT_EMAIL`), or nothing when
 * none is set, in which case a sentence that would name it is left out. Browser safe: the setting is public, and Next
 * writes it into the browser's code where it is read by its whole name, as here.
 */
export function contactEmail(): string | null {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
