import { Anton, DM_Sans } from "next/font/google";

/**
 * The poster look's two typefaces (POSTER_TYPE in src/design-tokens.ts): Anton for titles, DM Sans for everything
 * else, amounts and button labels included. next/font downloads them when the app is built and the app serves the
 * files itself. Each one only defines a CSS variable on the document; app/globals.css decides which screens read it.
 */
export const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
export const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
