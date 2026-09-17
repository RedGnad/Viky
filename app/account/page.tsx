import { redirect } from "next/navigation";

/** The account page moved to Me on 17 Sep 2026; a link kept from before lands there. */
export default function Page() {
  redirect("/me");
}
