import { DM_Sans, Fredoka } from "next/font/google";

/**
 * The look's two typefaces (DISPLAY_TYPE in src/design-tokens.ts): Fredoka for the display title and the mark, DM Sans
 * for everything else, amounts and button labels included. next/font downloads them when the app is built and the app
 * serves the files itself. Each one only defines a CSS variable on the document; app/globals.css decides which screens
 * read it.
 */
export const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka" });
export const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
