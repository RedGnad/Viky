import type { Metadata } from "next";
import { CashOut } from "../components/CashOut";
import { Footer } from "../components/Footer";

export const metadata: Metadata = {
  title: "Take your money out",
};

export default function CashOutPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Take your money out</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          What you have earned is already yours. This sends it to your card or your bank.
        </p>
      </header>
      <CashOut />
      <Footer current="/cash-out" />
    </main>
  );
}
