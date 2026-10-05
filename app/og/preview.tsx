import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The picture a messaging app shows under a link (D265, the founder's direction B of four, 26 Sep 2026): the app's own
 * day, the lavender ground, the paper card, the figure standing on its edge, the words on the card, and the name. One
 * layout for a gift's link and for the site's, so the two read as one product wherever they are pasted.
 *
 * Everything a person reads is in one column, 560 wide, in the middle of the picture (the founder's mockup of 1 Oct
 * 2026, link-preview.html). A small preview keeps only the central square, 630 by 630: Instagram on a computer does,
 * and the card used to run the picture's whole width, so its sentence was cut on both sides. The column sits inside
 * that square with 35 pixels of air; the sides carry decoration only, which a square crop loses at no cost.
 *
 * Drawn on the server with no stylesheet, so the colours are the day look's own values, read from the same stylesheet
 * `pnpm make:icon` writes the figure with, and the faces come from their files.
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

/** The decoration of the sides, as the mockup draws it: a sun, two hills, three dots. Nothing a person reads. */
export const PREVIEW_DECOR = {
  sun: "#FFC83D",
  hill: "#CFC5E3",
  dots: ["#FF8C98", "#6DBDFB", "#BBA3FA"],
} as const;

/** The column everything read lives in, and the central square a small preview keeps. */
export const PREVIEW_COLUMN = { left: 320, width: 560, bottom: 40 } as const;
export const PREVIEW_SQUARE = { left: (PREVIEW_SIZE.width - PREVIEW_SIZE.height) / 2, width: PREVIEW_SIZE.height } as const;

/** Read from the project's own root: next.config.mjs keeps these files beside the function once deployed. */
const inProject = (path: string) => join(process.cwd(), path);

const circle = (size: number, colour: string, place: Readonly<Record<string, number>>, opacity = 1) => (
  <div style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, background: colour, opacity, display: "flex", ...place }} />
);

/**
 * `amount` is the figure inside the title, as the title writes it ("€21.67", "15 086 FCFA", "$25.00"), in whatever
 * currency: it is handed to the text face, as every amount in the product is, and kept on one line. It used to be
 * found by looking for a dollar sign, so an amount in any other currency was set in the display face.
 *
 * Four faces: the look's two, and under them Noto Sans for what they do not carry, the signs of every currency
 * offered (the won, the peso, the lira, the rupee) and names written in Cyrillic or Greek, with the baht's own sign
 * from Noto Sans Thai. A name in a script none of the four carries is drawn in the face the image library fetches
 * for it, where it can.
 */
export async function previewImage({ title, under, amount, cacheSeconds }: Readonly<{ title: string; under: string; amount?: string | null; cacheSeconds: number }>): Promise<ImageResponse> {
  const [display, text, wide, baht, figure] = await Promise.all([
    readFile(inProject("app/fonts/Fredoka-SemiBold.ttf")),
    readFile(inProject("app/fonts/DMSans-Bold.ttf")),
    readFile(inProject("app/fonts/NotoSans-Bold.ttf")),
    readFile(inProject("app/fonts/NotoSansThai-Baht.ttf")),
    readFile(inProject("app/kit/figure-day.svg")),
  ]);
  const drawing = `data:image/svg+xml;base64,${figure.toString("base64")}`;
  const at = amount ? title.indexOf(amount) : -1;
  const [before, after] = at >= 0 && amount ? [title.slice(0, at), title.slice(at + amount.length)] : [title, ""];
  const words = (part: string, key: string) =>
    part
      .split(" ")
      .filter(Boolean)
      .map((word, index) => (
        <span key={`${key}-${index}`} style={{ marginRight: 12 }}>
          {word}
        </span>
      ));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: PREVIEW_LOOK.ground }}>
        {/* The sides: decoration only. A square crop cuts them and loses nothing a person reads. */}
        {circle(420, PREVIEW_DECOR.hill, { left: -120, bottom: -190 })}
        {circle(480, PREVIEW_DECOR.hill, { right: -140, bottom: -230 })}
        {circle(120, PREVIEW_DECOR.sun, { left: 92, top: 96 }, 0.9)}
        {circle(22, PREVIEW_DECOR.dots[0], { right: 150, top: 120 })}
        {circle(14, PREVIEW_DECOR.dots[1], { right: 96, top: 196 })}
        {circle(14, PREVIEW_DECOR.dots[2], { left: 232, top: 250 })}
        {/* The column: the figure and the name over the card, from the foot, so the card grows with what it says and
            the figure always stands on its top edge (D266). Its feet stand on the edge, whole (the founder, 28 Sep
            2026): the feet's stroke ends about 2 pixels above the drawing's foot, so only those 2 overlap the card. */}
        <div style={{ position: "absolute", left: PREVIEW_COLUMN.left, width: PREVIEW_COLUMN.width, bottom: PREVIEW_COLUMN.bottom, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={drawing} width={236} height={195} alt="" style={{ marginLeft: 20, marginBottom: -2 }} />
            <div style={{ alignSelf: "flex-start", marginTop: 40, marginRight: 8, fontFamily: "Fredoka", fontSize: 40, color: PREVIEW_LOOK.ink }}>Viky</div>
          </div>
          {/* The card whole, its four corners inside the square, with the ground's air under it. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "30px 36px 32px",
              background: PREVIEW_LOOK.paper,
              color: PREVIEW_LOOK.onPaper,
              border: `2px solid ${PREVIEW_LOOK.edge}`,
              borderRadius: 36,
            }}
          >
            <div style={{ fontFamily: "Fredoka", fontSize: 50, lineHeight: 1.1, letterSpacing: -0.3, display: "flex", flexWrap: "wrap", alignItems: "baseline" }}>
              {words(before, "before")}
              {at >= 0 && amount ? <span style={{ fontFamily: "DM Sans", fontSize: 48, letterSpacing: -1, marginRight: 12, whiteSpace: "nowrap" }}>{amount}</span> : null}
              {words(after, "after")}
            </div>
            <div style={{ fontFamily: "DM Sans", fontSize: 22, lineHeight: 1.3, marginTop: 12, color: PREVIEW_LOOK.quiet }}>{under}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...PREVIEW_SIZE,
      fonts: [
        { name: "Fredoka", data: display, weight: 600, style: "normal" },
        { name: "DM Sans", data: text, weight: 700, style: "normal" },
        // Under the two faces of the look: what they do not carry is drawn from these, in the order given.
        { name: "Noto Sans", data: wide, weight: 700, style: "normal" },
        { name: "Noto Sans Thai", data: baht, weight: 700, style: "normal" },
      ],
      headers: { "cache-control": `public, max-age=${cacheSeconds}` },
    },
  );
}
