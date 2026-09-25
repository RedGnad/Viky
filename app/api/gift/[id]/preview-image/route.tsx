import { CONDITIONS } from "@/src/conditions";
import { galleryOpen } from "@/src/dev-access";
import { giftPreview } from "@/src/gift-preview";
import { LINK_PREVIEW } from "@/src/sentences";
import { PREVIEW_SIZE, previewImage } from "../../../../og/preview";

/**
 * The image a messaging app shows under a gift's link: the layout every link of Viky shares (app/og/preview.tsx, D265),
 * with the gift's own sentence on the card and its line under it. It is where Viky is met most, because the product
 * asks for no daily gesture and the person opens it as little as possible.
 *
 * It says exactly what the page's title says (src/gift-preview.ts), so the funder's name appears only when the address
 * carries the link's key: gift numbers follow each other, and a guessed one must never name anybody.
 */

export const size = PREVIEW_SIZE;
export const contentType = "image/png";

const LONGEST_LINE = CONDITIONS.map((condition) => condition.words.preview ?? "").reduce((long, line) => (line.length > long.length ? line : long), LINK_PREVIEW.asYouGo);

const key = (value: string | null) => (value !== null && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{1,78}$/.test(id)) return new Response("Not found", { status: 404 });
  const asked = new URL(request.url).searchParams;
  // The design gallery, which production never switches on, can ask for the longest sentence this image ever draws,
  // under the longest line any condition of the register gives a link (D266).
  const preview =
    asked.has("demo") && galleryOpen()
      ? { title: LINK_PREVIEW.named("Mum", "$25.00"), description: LONGEST_LINE }
      : await giftPreview(id, key(asked.get("t")));
  return previewImage({ title: preview.title, under: preview.description, cacheSeconds: 3600 });
}
