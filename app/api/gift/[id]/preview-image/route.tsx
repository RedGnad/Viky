import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { COLOURS } from "@/src/design-tokens";
import { giftPreview } from "@/src/gift-preview";

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

/** Read from the file itself: a file is not something this runtime will fetch, and the build traces these paths. */
const beside = (path: string) => fileURLToPath(new URL(path, import.meta.url));

async function face(file: string): Promise<Buffer> {
  return readFile(beside(`../../../../fonts/${file}`));
}

/**
 * The gift character, written into a file by `pnpm make:icon` from the one component that draws it (app/kit/Character.tsx),
 * because a route may not import react-dom/server. A test fails if the file and the component ever disagree.
 */
async function giftDrawing(): Promise<string> {
  const svg = await readFile(beside("../../../../kit/gift-hero.svg"));
  return `data:image/svg+xml;base64,${svg.toString("base64")}`;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{1,78}$/.test(id)) return new Response("Not found", { status: 404 });
  const preview = await giftPreview(id, key(new URL(request.url).searchParams.get("t")));
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
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontFamily: "Fredoka", fontSize: 40 }}>Viky</div>
          <div style={{ fontFamily: "Fredoka", fontSize: 80, lineHeight: 1.05, display: "flex", flexWrap: "wrap" }}>
            <span>{before}</span>
            {amount ? <span style={{ fontFamily: "DM Sans" }}>{amount}</span> : null}
            <span>{after}</span>
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
