import type { Metadata } from "next";
import { Gifts } from "../kit/Gifts";

export const metadata: Metadata = { title: "Gifts" };

export default function Page() {
  return <Gifts />;
}
