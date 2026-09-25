import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The picture a messaging app shows under a link (D265, the founder's direction B of four, 26 Sep 2026): the app's own
 * day, the lavender ground, the paper card along the foot as on the landing, the figure standing on its edge, the
 * words on the card, and the name in a corner. One layout for a gift's link and for the site's, so the two read as one
 * product wherever they are pasted.
 *
 * Drawn on the server with no stylesheet, so the colours are the day look's own values, read from the same stylesheet
 * `pnpm make:icon` writes the figure with, and the two faces come from their files.
 */
export const PREVIEW_SIZE = { width: 1200, height: 630 } as const;

/** The day look's values the picture draws with (app/globals.css, `:root`), checked against the stylesheet by a test. */
export const PREVIEW_LOOK = {
  ground: "#DDD6EB",
  ink: "#1E1633",
  paper: "#FFF6E2",
  onPaper: "#151026",
  quiet: "#7C6C3F",
  edge: "#C5C2CF",
} as const;

/** Read from the project's own root: next.config.mjs keeps these files beside the function once deployed. */
const inProject = (path: string) => join(process.cwd(), path);

export async function previewImage({ title, under, cacheSeconds }: Readonly<{ title: string; under: string; cacheSeconds: number }>): Promise<ImageResponse> {
  const [display, text, figure] = await Promise.all([
    readFile(inProject("app/fonts/Fredoka-SemiBold.ttf")),
    readFile(inProject("app/fonts/DMSans-Bold.ttf")),
    readFile(inProject("app/kit/figure-day.svg")),
  ]);
  const drawing = `data:image/svg+xml;base64,${figure.toString("base64")}`;
  // The amount is handed to the text face, as every amount in the product is; the rest stays in the display face.
  const amount = title.match(/\$[\d,]+\.\d{2}/)?.[0];
  const [before, after] = amount ? title.split(amount) : [title, ""];
  const words = (part: string, key: string) =>
    part
      .split(" ")
      .filter(Boolean)
      .map((word, index) => (
        <span key={`${key}-${index}`} style={{ marginRight: 16 }}>
          {word}
        </span>
      ));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative", background: PREVIEW_LOOK.ground }}>
        <div style={{ position: "absolute", top: 56, right: 96, fontFamily: "Fredoka", fontSize: 44, color: PREVIEW_LOOK.ink }}>Viky</div>
        {/* The figure stands on the card's top edge whatever the card's height (D266): the two are one column from the
            foot, and the card grows with what it says, a gift's line running to two lines where the site's is one.
            The drawing's box is 64 by 53 and its feet at 51.5, so 6 of its 248 pixels overlap the edge. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={drawing} width={300} height={248} alt="" style={{ marginLeft: 100, marginBottom: -6 }} />
        <div
          style={{
            margin: "0 100px",
            minHeight: 230,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "40px 60px 44px",
            background: PREVIEW_LOOK.paper,
            color: PREVIEW_LOOK.onPaper,
            border: `2px solid ${PREVIEW_LOOK.edge}`,
            borderBottom: "none",
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
          }}
        >
          <div style={{ fontFamily: "Fredoka", fontSize: 64, lineHeight: 1.1, display: "flex", flexWrap: "wrap", alignItems: "baseline" }}>
            {words(before, "before")}
            {amount ? <span style={{ fontFamily: "DM Sans", marginRight: 16 }}>{amount}</span> : null}
            {words(after, "after")}
          </div>
          <div style={{ fontFamily: "DM Sans", fontSize: 28, lineHeight: 1.3, marginTop: 14, color: PREVIEW_LOOK.quiet }}>{under}</div>
        </div>
      </div>
    ),
    {
      ...PREVIEW_SIZE,
      fonts: [
        { name: "Fredoka", data: display, weight: 600, style: "normal" },
        { name: "DM Sans", data: text, weight: 700, style: "normal" },
      ],
      headers: { "cache-control": `public, max-age=${cacheSeconds}` },
    },
  );
}
