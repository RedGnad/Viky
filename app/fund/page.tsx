import type { Metadata } from "next";
import Link from "next/link";
import { FundGift } from "../components/FundGift";

export const metadata: Metadata = {
  title: "Put money behind a goal",
};

export default function FundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Put money behind a goal</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          It goes into their name straight away. They earn it day by day, and whatever they do not earn comes
          back to you.
        </p>
      </header>
      <FundGift />
      <footer className="flex gap-4 text-xs" style={{ color: "var(--muted)" }}>
        <Link href="/" className="underline">
          Home
        </Link>
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
        <Link href="/legal" className="underline">
          Legal
        </Link>
      </footer>
    </main>
  );
}
