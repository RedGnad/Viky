import type { Metadata } from "next";
import { Screen } from "../components/Screen";
import { PROSE } from "../components/ui";

export const metadata: Metadata = {
  title: "Offline",
};

export default function Page() {
  return (
    <Screen title="You are offline">
      <p className={PROSE}>Viky needs a connection to show a gift. Your money is safe; nothing changes while you are away.</p>
    </Screen>
  );
}
