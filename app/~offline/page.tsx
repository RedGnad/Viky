import type { Metadata } from "next";
import { Notice } from "../kit/Notice";
import { Shell } from "../kit/Shell";

export const metadata: Metadata = {
  title: "Offline",
};

export default function Page() {
  return (
    <Shell kind="task">
      <Notice title="You are offline">Viky needs a connection to show a gift. Your money is safe; nothing changes while you are away.</Notice>
    </Shell>
  );
}
