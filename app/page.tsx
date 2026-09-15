import type { Metadata } from "next";
import { HomeScreen } from "./components/HomeScreen";
import { Screen } from "./components/Screen";

export const metadata: Metadata = {
  title: "Viky",
};

/**
 * The one destination. What it contains and in what order is decided by whether anybody is signed in, which
 * only the browser knows, so the ordering lives in `HomeScreen` and this is the shape around it.
 */
export default function Page() {
  return (
    <Screen>
      <HomeScreen />
    </Screen>
  );
}
