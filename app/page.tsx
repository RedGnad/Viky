import type { Metadata } from "next";
import { AccountPanel } from "./components/AccountPanel";

export const metadata: Metadata = {
  title: "Viky",
};

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-10 px-6 py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Viky</h1>
        <p className="text-lg leading-snug">
          The money is already in their name. Every day they miss, a piece comes back to you.
        </p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Put money behind someone&apos;s goal. It becomes theirs as they make verified progress,
          and whatever they do not earn comes back to you.
        </p>
      </header>
      <AccountPanel />
    </main>
  );
}
