"use client";
import { useState } from "react";
import { useMadeHere, useOnAComputer } from "@/src/account/door";
import { toAccountError } from "@/src/account/errors";
import { useAccount } from "@/src/account/provider";
import { ACCOUNT_DOOR, DOOR, ME, OTHER_ACCOUNT as W, WAITS } from "@/src/sentences";
import { HELP } from "../components/ui";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

type Way = "choose" | "make";

/**
 * "Other account", the account's door laid over Me (the founder, 9 Oct 2026).
 *
 * The press used to close the session, let go of the passkey this device remembered and load the landing with its
 * door open: somebody who only looked, or closed the passkey's prompt, was signed out of the account they had. Here
 * the sheet comes up over the page and nothing is closed by it. Another account is chosen, with the device offering
 * every one it holds for Viky, or a new one is made; the browser becomes that account's only once its passkey has
 * answered and the server has taken it (`openAnotherAccount`, src/account/provider.tsx), and Home is then loaded as
 * theirs. Closing the sheet, closing the prompt, or a server that could not be told leaves everything as it was.
 *
 * Signing in comes first and making an account second: a press by mistake on the first changes nothing, and one on
 * the second leaves a passkey on the device that nobody asked for.
 */
export function OtherAccountSheet({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const { openAnotherAccount } = useAccount();
  const madeHere = useMadeHere();
  const computer = useOnAComputer();
  /** The press still being answered. It stays set once the other account opened: this page is leaving for Home. */
  const [asking, setAsking] = useState<Way | null>(null);
  /** What the last press came to, when it did not open another account. */
  const [came, setCame] = useState<"same" | Readonly<{ way: Way; refused: string }> | null>(null);

  const ask = async (way: Way) => {
    setAsking(way);
    setCame(null);
    try {
      if ((await openAnotherAccount({ make: way === "make" })) === "other") return;
      setCame("same");
    } catch (caught) {
      setCame({ way, refused: toAccountError(caught).guidance });
    }
    setAsking(null);
  };
  const refused = (way: Way) => (came && came !== "same" && came.way === way ? came.refused : null);

  return (
    <Sheet
      open={open}
      title={ME.otherAccount}
      help={W.stays}
      onClose={() => {
        // What a press came to is said once: the sheet opened again starts with nothing said.
        setCame(null);
        onClose();
      }}
    >
      <Button doing={asking === "choose" ? DOOR.busy : null} step={WAITS.account} waiting={asking === "make"} failed={refused("choose")} failedId="other-account-refused" onPress={() => void ask("choose")} data-other-account="choose">
        {W.choose}
      </Button>
      {came === "same" ? (
        <p role="status" className={HELP} data-other-account="same">
          {W.same}
        </p>
      ) : null}
      {/* On an address that is not Viky's own no account is made (src/account/passkey-support.ts): one made there still signs in. */}
      {madeHere ? (
        <>
          <Button look="secondary" doing={asking === "make" ? DOOR.busy : null} step={WAITS.account} waiting={asking === "choose"} failed={refused("make")} failedId="new-account-refused" onPress={() => void ask("make")} data-other-account="make">
            {ACCOUNT_DOOR.newAccount}
          </Button>
          {/* On a computer, which choice of the system's sheet follows the person, before they choose (5 Oct 2026). */}
          {computer ? (
            <p className={HELP} data-on-a-computer="">
              {ACCOUNT_DOOR.onAComputer}
            </p>
          ) : null}
          <p className={HELP} data-adult="">
            {ACCOUNT_DOOR.adult}
          </p>
        </>
      ) : (
        <p className={HELP} data-account-door="main-site">
          {ACCOUNT_DOOR.madeOnTheMainSite}
        </p>
      )}
    </Sheet>
  );
}
