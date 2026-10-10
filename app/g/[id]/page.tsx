import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { giftPreview } from "@/src/gift-preview";
import { giftStatusFor, type AnyGiftStatus } from "@/src/gift-status";
import { loadOpenShownSession, type OpenShownSession } from "@/src/proof-session-store";
import { cameBackShown } from "@/src/shown-return";
import { originOfThePage, signedInAccount } from "@/src/who-is-reading";
import { GiftPage } from "../../components/GiftPage";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; shown?: string }> };

/**
 * What the link carries in `?t=` as the page accepts it, or nothing: the link's key on the first version of the
 * contracts, and on the second a preview token made from the link's secret, which names the reader as holding the link
 * and opens nothing. The secret itself is after the link's `#`: no server is sent it, and the page reads it in the
 * browser (the review of 2 Oct 2026, R-01).
 */
function keyOf(t: string | undefined): string | null {
  return typeof t === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
}

/**
 * What a messaging app shows for the link (src/gift-preview.ts): the sentence, one line under it, and the image the
 * look draws (app/api/gift/[id]/preview-image). The title is absolute, so the preview reads the sentence and not the
 * site's title template. Messaging apps fetch without JavaScript, and Next.js renders the metadata in the head for the
 * crawlers it knows (WhatsApp, facebookexternalhit, Twitterbot, Slackbot, Discordbot).
 *
 * The image carries the link's key too, so it says the funder's name exactly where the page says it, and "Someone"
 * everywhere else.
 */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params;
  const { t } = await props.searchParams;
  if (!/^\d{1,78}$/.test(id)) return {};
  const preview = await giftPreview(id, keyOf(t));
  const linkKey = keyOf(t);
  const image = { url: `${await originOfThePage()}/api/gift/${id}/preview-image${linkKey ? `?t=${encodeURIComponent(linkKey)}` : ""}`, width: 1200, height: 630, alt: preview.title };
  return {
    title: { absolute: preview.title },
    description: preview.description,
    openGraph: { type: "website", siteName: "Viky", title: { absolute: preview.title }, description: preview.description, images: [image] },
    twitter: { card: "summary_large_image", title: preview.title, description: preview.description, images: [image] },
    // A gift's page is for the person holding its link, not for a search engine.
    robots: { index: false, follow: false },
  };
}

/**
 * The gift as the server reads it while the page renders, or nothing when it cannot be read (D160).
 *
 * Nothing is not a failure: the screen then asks for it from the browser exactly as it did before, and says what
 * went wrong in its own words. What this removes is the ordinary case, where the screen used to be built twice,
 * once empty and once with the gift.
 */
async function giftOnTheServer(id: string, linkKey: string | null): Promise<AnyGiftStatus | null> {
  try {
    return await giftStatusFor(id, { account: (await signedInAccount()) ?? null, linkKey });
  } catch {
    return null;
  }
}

/**
 * The session the reader has open for this gift's one proof, read with the page (7 Oct 2026). A person brought back by
 * the verification page then sees "checking" from the first image, never the button to start over for the moment it
 * took the browser to ask. Nothing when nobody is signed in, when nothing is open, or when it cannot be read: the page
 * asks from the browser then, as before.
 */
async function openProofOnTheServer(id: string): Promise<OpenShownSession | null> {
  try {
    const account = await signedInAccount();
    return account ? await loadOpenShownSession(id, account) : null;
  } catch {
    return null;
  }
}

/** The page a recipient lands on from the link. No install, no crypto words, one screen. */
export default async function Page(props: Props) {
  const { id } = await props.params;
  const { t, shown } = await props.searchParams;
  if (!/^\d{1,78}$/.test(id)) notFound();
  const linkKey = keyOf(t);
  const [initialStatus, openProof] = await Promise.all([giftOnTheServer(id, linkKey), openProofOnTheServer(id)]);
  // Brought back by the verification page with a proof made, or not (src/shown-return.ts): read here, with the page.
  return <GiftPage giftId={id} linkKey={linkKey} initialStatus={initialStatus} openProof={openProof} cameBackShown={cameBackShown(shown)} />;
}
