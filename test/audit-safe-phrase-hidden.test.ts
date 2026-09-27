import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import test from "node:test";
import { getAddress, recoverAddress, type Hex } from "viem";
import { readHidden, SafePhraseError, signWithHiddenPhrase, type HiddenInput } from "../src/safe-phrase";

/**
 * A Safe owner on paper signs at a hidden prompt, never on a command line (audit: paper-phrase-on-command-line).
 *
 * The procedure used to print `cast wallet sign --no-hash <hash> --mnemonic "<the twelve words>"`, which puts an
 * owner's words in the shell's history file, on the machine that also holds the encrypted file of a second owner.
 * Every phrase below is the public test phrase of Foundry and Hardhat, and every hash a public Safe hash of
 * docs/OPERATIONS.md: no real key or phrase is used or printed here.
 */
const PUBLIC_TEST_PHRASE = "test test test test test test test test test test test junk";
const PUBLIC_TEST_OWNER = getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
/** Two public owners of the Safe (docs/OPERATIONS.md), neither the test phrase's. */
const OTHER_OWNERS = [getAddress("0x19d48126D78df48ac011f4145FA2226365e5b794"), getAddress("0xED4c39120Ef1d67780B9Bd63d648bd3Df6ab67B3")];
const HASH = "0x8b90a99b778fe7b46119e2eaa5443d2300879f614fe22d83edf754d5fa222d99" as Hex;
/** What `cast wallet sign --no-hash <HASH> --mnemonic <the public test phrase>` returns (cast 1.8.1, 27 Sep 2026). */
const CAST_SIGNATURE = "0x684c67666058afe0c7ff1b49b8ebada6d25fe00c0a6a5370cbe05ed31cacfc836d278fd8eedbd2a4e5ffcde4d2998122f40522b6a975ea77629a551dc79ffb851b";

/** A terminal as the script sees it: raw mode switched on and off, keys arriving as data, and what it shows. */
function terminal(isTTY = true) {
  const input = new PassThrough() as PassThrough & HiddenInput;
  const rawModes: boolean[] = [];
  input.isTTY = isTTY;
  input.setRawMode = (mode: boolean) => {
    rawModes.push(mode);
    return input;
  };
  const output = new PassThrough();
  let shown = "";
  output.on("data", (chunk) => {
    shown += String(chunk);
  });
  const type = (keys: string) => setImmediate(() => input.write(keys));
  return { input, output, rawModes, type, shown: () => shown };
}

test("the words are read with the terminal's echo off and never written back", async () => {
  const screen = terminal();
  screen.type(`${PUBLIC_TEST_PHRASE}\r`);
  const typed = await readHidden("The twelve words: ", screen.input, screen.output);
  assert.equal(typed, PUBLIC_TEST_PHRASE);
  assert.deepEqual(screen.rawModes, [true, false], "raw mode (no echo) while typing, the terminal given back after");
  assert.equal(screen.shown(), "The twelve words: \n", "the question and a new line, nothing of what was typed");
});

test("backspace takes the last key back, and stopping signs nothing", async () => {
  const screen = terminal();
  screen.type("test tesx\u007ft\n");
  assert.equal(await readHidden("? ", screen.input, screen.output), "test test");

  const stopped = terminal();
  stopped.type("test te\u0003");
  await assert.rejects(readHidden("? ", stopped.input, stopped.output), (error: unknown) => error instanceof SafePhraseError && error.code === "stopped");
  assert.deepEqual(stopped.rawModes, [true, false], "the terminal is given back even when stopped");
});

test("without a terminal there is no prompt: the words cannot be piped in from a command line", async () => {
  const pipe = terminal(false);
  await assert.rejects(readHidden("? ", pipe.input, pipe.output), (error: unknown) => error instanceof SafePhraseError && error.code === "not-a-terminal");
  assert.equal(pipe.shown(), "");
  assert.deepEqual(pipe.rawModes, []);
});

test("a phrase typed at the prompt signs the Safe hash exactly as cast does, and the words never reach the screen", async () => {
  const screen = terminal();
  screen.type(`  ${PUBLIC_TEST_PHRASE.toUpperCase()}  \r`);
  const signed = await signWithHiddenPhrase({ hash: HASH, owners: [PUBLIC_TEST_OWNER, ...OTHER_OWNERS], input: screen.input, output: screen.output });
  assert.equal(signed.owner, PUBLIC_TEST_OWNER);
  assert.equal(signed.signature, CAST_SIGNATURE, "the same 65 bytes as cast wallet sign --no-hash --mnemonic");
  assert.equal(getAddress(await recoverAddress({ hash: HASH, signature: signed.signature })), PUBLIC_TEST_OWNER);
  assert.doesNotMatch(screen.shown().toLowerCase(), /test|junk/, "no word of the phrase is shown");
});

test("words that are not an owner's, or not a phrase at all, sign nothing", async () => {
  const stranger = terminal();
  stranger.type(`${PUBLIC_TEST_PHRASE}\r`);
  await assert.rejects(
    signWithHiddenPhrase({ hash: HASH, owners: OTHER_OWNERS, input: stranger.input, output: stranger.output }),
    (error: unknown) => error instanceof SafePhraseError && error.code === "not-an-owner",
  );

  const misspelt = terminal();
  misspelt.type("test test test test test test test test test test test test\r");
  await assert.rejects(
    signWithHiddenPhrase({ hash: HASH, owners: [PUBLIC_TEST_OWNER], input: misspelt.input, output: misspelt.output }),
    (error: unknown) => error instanceof SafePhraseError && error.code === "not-a-phrase",
    "the last word does not check: refused before anything is derived",
  );
});

test("no Safe script puts a phrase on the command line any more", () => {
  const onCommandLine = /cast wallet sign[^\n]*--mnemonic(?![-\w])/;
  for (const file of ["scripts/safe-session.ts", "scripts/safe-action.ts"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), onCommandLine, `${file} prints a signing command that carries the words`);
    assert.match(readFileSync(file, "utf8"), /signWithHiddenPhrase\(/, `${file} asks for a paper phrase at the hidden prompt`);
  }
});
