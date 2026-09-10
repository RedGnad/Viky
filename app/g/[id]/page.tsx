import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GiftPage } from "../../components/GiftPage";

export const metadata: Metadata = {
  title: "Your gift",
};

/** The page a recipient lands on from the link. No install, no crypto words, one screen. */
export default async function Page(props: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await props.params;
  const { t } = await props.searchParams;
  if (!/^\d{1,78}$/.test(id)) notFound();
  return <GiftPage giftId={id} linkKey={typeof t === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null} />;
}
