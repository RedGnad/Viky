import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { giftPreview } from "@/src/gift-preview";
import { GiftPage } from "../../components/GiftPage";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> };

/** The link's key as the page accepts it, or nothing. */
function keyOf(t: string | undefined): string | null {
  return typeof t === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
}

/**
 * What a messaging app shows for the link (src/gift-preview.ts). The title is absolute, so the preview reads the
 * sentence and not the site's title template. Messaging apps fetch without JavaScript, and Next.js renders the
 * metadata in the head for the crawlers it knows (WhatsApp, facebookexternalhit, Twitterbot, Slackbot, Discordbot).
 */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params;
  const { t } = await props.searchParams;
  if (!/^\d{1,78}$/.test(id)) return {};
  const preview = await giftPreview(id, keyOf(t));
  return {
    title: { absolute: preview.title },
    description: preview.description,
    openGraph: { type: "website", siteName: "Viky", title: { absolute: preview.title }, description: preview.description },
    twitter: { card: "summary", title: preview.title, description: preview.description },
    // A gift's page is for the person holding its link, not for a search engine.
    robots: { index: false, follow: false },
  };
}

/** The page a recipient lands on from the link. No install, no crypto words, one screen. */
export default async function Page(props: Props) {
  const { id } = await props.params;
  const { t } = await props.searchParams;
  if (!/^\d{1,78}$/.test(id)) notFound();
  return <GiftPage giftId={id} linkKey={keyOf(t)} />;
}
