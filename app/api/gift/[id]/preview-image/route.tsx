import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { COLOURS } from "@/src/design-tokens";
import { galleryOpen } from "@/src/dev-access";
import { giftPreview } from "@/src/gift-preview";
import { LINK_PREVIEW } from "@/src/sentences";

/**
 * The image a messaging app shows under a gift's link (the art direction brief of 17 Sep 2026, section 7 bis): the gift
 * character and the sentence, drawn on the sun, both in ink, as the icon draws them. It is where Viky is met most,
 * because the product asks for no daily gesture and the person opens it as little as possible.
 *
 * It says exactly what the page's title says (src/gift-preview.ts), so the funder's name appears only when the address
 * carries the link's key: gift numbers follow each other, and a guessed one must never name anybody. The amount inside
 * the sentence is set in the text face, as every amount in the product is.
 *
 * Drawn on the server, so it reads its two faces from the files in app/fonts and its colours from the tokens: there is
 * no stylesheet here, and no CSS variable to read.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const key = (value: string | null) => (value !== null && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null);

/**
 * Read from the project's own root: a file is not something this runtime will fetch, and where the compiled chunk sits
 * is not where the files land once deployed. next.config.mjs keeps both of them beside the function.
 */
const inProject = (path: string) => join(process.cwd(), path);

async function face(file: string): Promise<Buffer> {
  return readFile(inProject(`app/fonts/${file}`));
}

/**
 * The gift character, written into a file by `pnpm make:icon` from the one component that draws it (app/kit/Character.tsx),
 * because a route may not import react-dom/server. A test fails if the file and the component ever disagree.
 */
async function giftDrawing(): Promise<string> {
  const svg = await readFile(inProject("app/kit/gift-hero.svg"));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{1,78}$/.test(id)) return new Response("Not found", { status: 404 });
  const asked = new URL(request.url).searchParams;
  // The design gallery, which production never switches on, can ask for the longest sentence this image ever draws.
  const preview =
    asked.has("demo") && galleryOpen()
      ? { title: LINK_PREVIEW.named("Maman", "$25.00"), description: LINK_PREVIEW.asYouGo }
      : await giftPreview(id, key(asked.get("t")));
  const [display, text, gift] = await Promise.all([face("Fredoka-SemiBold.ttf"), face("DMSans-Bold.ttf"), giftDrawing()]);
  const look = COLOURS.light;

  // The amount is handed to the text face, and the rest of the sentence stays in the display face.
  const amount = preview.title.match(/\$[\d,]+\.\d{2}/)?.[0];
  const [before, after] = amount ? preview.title.split(amount) : [preview.title, ""];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 64,
          padding: "0 96px",
          background: look.accent,
          color: look.onAccent,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={gift} width={340} height={340} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 620 }}>
          <div style={{ fontFamily: "Fredoka", fontSize: 40 }}>Viky</div>
          {/* The words wrap, the amount stays in the text face, and the spaces around it survive being three pieces. */}
          <div style={{ fontFamily: "Fredoka", fontSize: 64, lineHeight: 1.15, display: "flex", flexWrap: "wrap", alignItems: "baseline" }}>
            {before.split(" ").filter(Boolean).map((word, index) => (
              <span key={`${word}-${index}`} style={{ marginRight: 16 }}>
                {word}
              </span>
            ))}
            {amount ? <span style={{ fontFamily: "DM Sans", marginRight: 16 }}>{amount}</span> : null}
            {after.split(" ").filter(Boolean).map((word, index) => (
              <span key={`after-${word}-${index}`} style={{ marginRight: 16 }}>
                {word}
              </span>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Fredoka", data: display, weight: 600, style: "normal" },
        { name: "DM Sans", data: text, weight: 700, style: "normal" },
      ],
      headers: { "cache-control": "public, max-age=3600" },
    },
  );
}
