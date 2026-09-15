import type { Metadata } from "next";
import { Screen } from "../components/Screen";
import { Moment } from "../components/Moment";

export const metadata: Metadata = {
  title: "Offline",
};

export default function Page() {
  return (
    <Screen>
      <Moment mood="resting" headline="You are offline">Viky needs a connection to show a gift. Your money is safe; nothing changes while you are away.</Moment>
    </Screen>
  );
}
