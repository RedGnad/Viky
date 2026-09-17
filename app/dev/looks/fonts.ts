import { Bricolage_Grotesque, Fredoka } from "next/font/google";

/**
 * The title faces of the looks (art direction brief, section 4): Bricolage Grotesque for looks 1 and 3, Fredoka for
 * look 2. Loaded here and nowhere else, so only the laboratory's pages carry them; DM Sans stays the text face of every
 * look, from the document (app/fonts.ts). Each defines a variable that a look's stylesheet names as its title face.
 */
export const bricolage = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-bricolage" });
export const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka" });
