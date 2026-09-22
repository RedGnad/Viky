import { readFileSync } from "node:fs";
import { contrastRatio } from "../src/contrast";
/** The contrast of a colour on a ground, both read from the stylesheet by their token names. */
const css = readFileSync("app/globals.css", "utf8");
const value = (token: string) => css.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`))?.[1] ?? "";
const [ink, ground] = [process.argv[2], process.argv[3]];
console.log(`${ink} ${value(ink)} on ${ground} ${value(ground)}: ${contrastRatio(value(ink), value(ground)).toFixed(2)}:1`);
