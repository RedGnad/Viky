import { validateMnemonic } from "@scure/bip39";
// @scure/bip39 2.x exports the wordlists with their extension only.
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { getAddress, type Address, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";

/**
 * A Safe owner kept on paper signs here, at a prompt of the script itself, and never on a command line: a phrase
 * written after `--mnemonic` lands in the shell's history file, in the list of running processes and in the
 * terminal's scrollback, on the machine that also holds another owner's encrypted file. Typed here, the words go
 * with the terminal's echo off into this process alone, give one signature over the one hash, and are not written
 * anywhere. The derivation is cast's default (`m/44'/60'/0'/0/0`, no passphrase), so the signature is the one
 * `cast wallet sign --no-hash` gives for the same words (`test/audit-safe-phrase-hidden.test.ts`).
 *
 * Only an operator script imports this: a person using Viky never sees a phrase (src/account/mera.ts).
 */

export type SafePhraseRefusal = "not-a-terminal" | "stopped" | "not-a-phrase" | "not-an-owner";

export class SafePhraseError extends Error {
  constructor(
    readonly code: SafePhraseRefusal,
    message: string,
  ) {
    super(message);
    this.name = "SafePhraseError";
  }
}

/** A terminal's input as Node gives it (`process.stdin` when it is a TTY). */
export type HiddenInput = NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown };

const ENTER = new Set(["\r", "\n"]);
const STOP = new Set(["\u0003", "\u0004"]);
const BACK = new Set(["\u007f", "\b"]);

/**
 * One line typed with the terminal's echo off (raw mode), the way a password prompt reads it. Refused without a
 * terminal, so the words cannot come from a pipe written on a command line either. Ctrl-C or Ctrl-D stops it.
 */
export function readHidden(question: string, input: HiddenInput, output: NodeJS.WritableStream): Promise<string> {
  const setRawMode = input.setRawMode?.bind(input);
  if (!input.isTTY || !setRawMode) {
    return Promise.reject(new SafePhraseError("not-a-terminal", "The words are typed at a hidden prompt, and there is no terminal here: run it in one, with nothing piped in"));
  }
  output.write(question);
  setRawMode(true);
  input.setEncoding("utf8");
  input.resume();
  return new Promise((resolve, reject) => {
    let typed = "";
    const finish = () => {
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      setRawMode(false);
      input.pause();
      output.write("\n");
    };
    const stop = () => {
      finish();
      reject(new SafePhraseError("stopped", "Stopped: nothing was signed"));
    };
    const onEnd = () => stop();
    const onData = (chunk: string | Buffer) => {
      for (const key of String(chunk)) {
        if (ENTER.has(key)) {
          finish();
          resolve(typed);
          return;
        }
        if (STOP.has(key)) {
          stop();
          return;
        }
        if (BACK.has(key)) typed = typed.slice(0, -1);
        else if (key >= " ") typed += key;
      }
    };
    input.on("data", onData);
    input.on("end", onEnd);
  });
}

/**
 * Asks for an owner's words at the hidden prompt and signs the Safe transaction hash with them, as it is (no second
 * hashing, as `cast wallet sign --no-hash`). Refused, before anything is signed: words that are not a phrase of the
 * list whose last word checks, and words that give an address that is not an owner of this Safe.
 */
export async function signWithHiddenPhrase(input: {
  hash: Hex;
  owners: readonly Address[];
  input: HiddenInput;
  output: NodeJS.WritableStream;
  question?: string;
}): Promise<{ owner: Address; signature: Hex }> {
  const typed = await readHidden(input.question ?? "The twelve words on paper (not shown as you type, Enter to sign): ", input.input, input.output);
  const words = typed.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(words, wordlist)) throw new SafePhraseError("not-a-phrase", "Those are not words of the list in an order whose last word checks: nothing was signed");
  const account = mnemonicToAccount(words);
  const owner = getAddress(account.address);
  if (!input.owners.map((address) => getAddress(address)).includes(owner)) {
    throw new SafePhraseError("not-an-owner", `Those words give ${owner}, which is not an owner of this Safe: nothing was signed`);
  }
  return { owner, signature: await account.sign({ hash: input.hash }) };
}
