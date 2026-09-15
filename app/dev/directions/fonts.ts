import { Anton, Bagel_Fat_One, DM_Sans, Figtree, Fraunces, Manrope, Nunito, Unbounded } from "next/font/google";

/**
 * The eight typefaces of the four throwaway directions, one for titles and one for text in each. next/font
 * downloads them from Google Fonts when the page is built, and the app serves the files itself.
 */
export const anton = Anton({ weight: "400", subsets: ["latin"] });
export const dmSans = DM_Sans({ subsets: ["latin"] });
export const bagelFatOne = Bagel_Fat_One({ weight: "400", subsets: ["latin"] });
export const nunito = Nunito({ subsets: ["latin"] });
export const unbounded = Unbounded({ subsets: ["latin"] });
export const manrope = Manrope({ subsets: ["latin"] });
export const fraunces = Fraunces({ subsets: ["latin"], axes: ["SOFT", "WONK", "opsz"] });
export const figtree = Figtree({ subsets: ["latin"] });
