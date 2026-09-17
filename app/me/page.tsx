import type { Metadata } from "next";
import { Me } from "../kit/Me";

export const metadata: Metadata = { title: "You" };

export default function Page() {
  return <Me />;
}
