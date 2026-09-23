import { writeFileSync } from "node:fs";
import { charactersFile, charactersVersion } from "../app/kit/character-sprite";

/**
 * Writes `public/characters.svg`, the drawings every named character is read from, and `app/kit/character-file.ts`,
 * the address the screens name it by, versioned by its content so a phone never keeps an old drawing (D206).
 */
const file = charactersFile();
const version = charactersVersion(file);
writeFileSync("public/characters.svg", file);
writeFileSync(
  "app/kit/character-file.ts",
  `/** Written by \`pnpm make:characters\` (D206): where the named characters are drawn from, versioned by the file's content. */\nexport const CHARACTERS_FILE = "/characters.svg?v=${version}";\n`,
);
console.log(JSON.stringify({ bytes: file.length, symbols: (file.match(/<symbol /g) ?? []).length, version }));
