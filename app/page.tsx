import type { Metadata } from "next";
import { HomeScreen } from "./components/HomeScreen";

export const metadata: Metadata = {
  title: "Viky",
};

/**
 * The one destination. Its shape and its order both depend on whether anybody is signed in, which only the
 * browser knows, so the whole screen including its frame lives in `HomeScreen`.
 */
export default function Page() {
  return <HomeScreen />;
}
