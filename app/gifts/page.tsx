import type { Metadata } from "next";
import { Gifts } from "../kit/Gifts";
import { giftsOf } from "@/src/my-gifts";
import { signedInAccount } from "@/src/who-is-reading";

export const metadata: Metadata = { title: "Gifts" };

/** Every gift of the account, read while the page renders (D160), so the screen is not built once empty and once full. */
export default async function Page() {
  const account = await signedInAccount();
  return <Gifts initialGifts={account ? await giftsOf(account).catch(() => null) : null} />;
}
