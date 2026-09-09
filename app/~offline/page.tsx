import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
};

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">You are offline</h1>
      <p>Viky needs a connection to show a gift. Your money is safe; nothing changes while you are away.</p>
    </main>
  );
}
