# The font files in this folder

They are here because a picture drawn on the server has no stylesheet and no `next/font`: the link preview image
(app/api/gift/[id]/preview-image) and the app's icon are drawn from these files directly.

- `Fredoka-SemiBold.ttf`: Fredoka, weight 600, the display face of the look.
- `DMSans-Bold.ttf`: DM Sans, weight 700, which sets every amount, wherever it appears.

Both were taken from Google Fonts on 17 Sep 2026, through `https://fonts.googleapis.com/css?family=Fredoka:600|DM+Sans:700`
read with an old user agent, which is what answers with TrueType rather than woff2. Both are published under the SIL Open
Font License 1.1, which allows redistributing them inside a product like this one. The screens themselves do not read
these files: they load the same two faces through `next/font` (app/fonts.ts).

Two more, on 1 Oct 2026, under the look's two faces in the link preview image only (app/og/preview.tsx):

- `NotoSans-Bold.ttf`: Noto Sans, weight 700, whole (Latin, Latin Extended, Cyrillic, Greek, Vietnamese). It carries what
  the two cuts above do not: the signs of every currency a gift can be read in (the won, the peso, the lira, the rupee)
  and a funder's name written in Cyrillic or Greek. Taken through
  `https://fonts.googleapis.com/css?family=Noto+Sans:700&subset=latin,latin-ext,cyrillic,cyrillic-ext,greek,greek-ext,vietnamese`.
- `NotoSansThai-Baht.ttf`: one sign of Noto Sans Thai, weight 700, the baht's (U+0E3F), which Noto Sans does not carry.
  Taken through `https://fonts.googleapis.com/css?family=Noto+Sans+Thai:700&text=%E0%B8%BF`.

Both under the SIL Open Font License 1.1, read with the same old user agent. A name in a script none of the four files
carries (Chinese, Japanese, Korean, Thai, Hebrew, Devanagari) is drawn in the face the image library fetches for it
from Google Fonts at the moment the image is drawn. Arabic is fetched too but is drawn letter by letter: the library
does not join letters.
