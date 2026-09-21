import { Home } from "./kit/Home";
import { heldBy } from "@/src/reader-holdings";
import { giftsOf } from "@/src/my-gifts";
import { signedInAccount } from "@/src/who-is-reading";

/**
 * The one destination a person opens Viky on, whatever they are here for (structure of 17 Sep 2026, section 4).
 *
 * Signed in, the money and the gifts are read here, while the page renders (D160). Home used to draw three dots
 * where the amount goes and "One moment" where the gifts go, and fill both in once the browser had asked: two
 * placeholders replaced by two different trees, which is the page appearing to load a second time. Either read can
 * come back as nothing, and then the screen asks the browser exactly as it did before.
 */
export default async function Page() {
  const account = await signedInAccount();
  if (!account) return <Home />;
  const [held, gifts] = await Promise.all([heldBy(account), giftsOf(account).catch(() => null)]);
  return <Home initialHoldings={held} initialGifts={gifts} />;
}
