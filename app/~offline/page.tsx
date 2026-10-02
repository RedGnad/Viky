import type { Metadata } from "next";
import { Notice } from "../kit/Notice";
import { Shell } from "../kit/Shell";

export const metadata: Metadata = {
  title: "Offline",
};

export default function Page() {
  return (
    <Shell kind="task">
      <Notice title="You are offline">
        <span className="block">Viky needs a connection to show a gift.</span>
        <span className="block">Your money is safe; nothing changes while you are away.</span>
      </Notice>
    </Shell>
  );
}
