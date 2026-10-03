import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NAV } from "../src/sentences";

// The way back (the founder, 3 Oct 2026): a round key of 44 with an arrow alone, at the head of every task and every
// document, of the round controls' family. It prints no word, so a screen reader is told where it leads.

const link = readFileSync("app/kit/BackLink.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("the way back is a round key of 44 in a target of 48, with a small key's relief", () => {
  assert.match(css, /--back-disc: 44px;/);
  assert.match(css, /\.back-round \{\n  display: inline-flex;\n  width: var\(--tap-target\);\n  height: var\(--tap-target\);/);
  assert.match(css, /\.back-round-disc \{[^}]*width: var\(--back-disc\);[^}]*border-radius: 50%;[^}]*box-shadow: 0 3px 0 var\(--control-relief-colour\);/);
  // Pressed, it goes down by its own relief, as every key does; a finger's tap is given the same movement.
  assert.match(css, /\.back-round:active \.back-round-disc,\n\.back-round\[data-pressed\] \.back-round-disc \{\n  transform: translateY\(3px\);\n  box-shadow: none;/);
  assert.match(readFileSync("app/kit/Pressed.tsx", "utf8"), /closest\("\.control-relief, \.action-relief, \.back-round"\)/);
  // Nothing moves for somebody who asked for less motion.
  assert.match(css, /\.back-round:is\(:active, :hover\) \.back-round-disc,\n  \.back-round\[data-pressed\] \.back-round-disc \{\n    transform: none;/);
});

test("it prints an arrow alone, and its name says where it leads", () => {
  assert.match(link, /<a\n\s+href=\{href\}\n\s+aria-label=\{name\}\n\s+title=\{name\}\n\s+className="back-round"/);
  assert.match(link, /<svg aria-hidden focusable="false"/);
  assert.doesNotMatch(link, /\{(label|name)\}\n\s+<\/a>|className="[^"]*underline/, "no word and no underline");
  assert.match(link, /const name = label \?\? \(href in NAV\.backTo \? NAV\.backTo\[href as keyof typeof NAV\.backTo\] : NAV\.back\);/);
  assert.deepEqual(NAV.backTo, { "/": "Back to Home", "/gifts": "Back to my gifts", "/me": "Back to Me" });
  // One drawing for every screen: the shell draws it, for a task and for a document alike.
  const shell = readFileSync("app/kit/Shell.tsx", "utf8");
  assert.equal((shell.match(/<BackLink /g) ?? []).length, 4);
  assert.doesNotMatch(readFileSync("app/components/ui.ts", "utf8"), /BACK_LINK/, "the underlined way back is gone");
});
