# The two font files in this folder

They are here because a picture drawn on the server has no stylesheet and no `next/font`: the link preview image
(app/api/gift/[id]/preview-image) and the app's icon are drawn from these files directly.

- `Fredoka-SemiBold.ttf`: Fredoka, weight 600, the display face of the look.
- `DMSans-Bold.ttf`: DM Sans, weight 700, which sets every amount, wherever it appears.

Both were taken from Google Fonts on 17 Sep 2026, through `https://fonts.googleapis.com/css?family=Fredoka:600|DM+Sans:700`
read with an old user agent, which is what answers with TrueType rather than woff2. Both are published under the SIL Open
Font License 1.1, which allows redistributing them inside a product like this one. The screens themselves do not read
these files: they load the same two faces through `next/font` (app/fonts.ts).
