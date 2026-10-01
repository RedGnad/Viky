import { verifyTypedData, type Abi, type Hex } from "viem";
import { fromHex } from "./consent";
import { bindingOf, ed25519Verifies, noteAnchored, stopWaitingForAnchor, type ConsentRow } from "./consent-store";
import { createMonadPublicClient } from "./monad/chain";
import { relayCall, RelayerError } from "./relayer";
import { CONSENT_ANCHOR_ABI, consentAnchorAddress } from "./v2";
import { CONSENT_KIND, consentAnchorMessage, consentKeyTypedData, consentTextDigest } from "./v2-protocol";

/**
 * A recipient's yes and stop, written down in public (the audit of 1 Oct 2026, section 3.7, ConsentAnchor). Server only.
 *
 * Until the anchor the tie between an account and its consent key, and every yes and stop, were rows of Viky's
 * database: whoever wrote the database could sign a yes of their own or copy an old one back after a stop. With the
 * anchor the account binds its key itself, once, and each yes and each stop is written at its place in the gift's
 * sequence with the consent key's signature, by the relayer, with no gesture added: the browser signs the short
 * anchored message with the key it already holds, in the same breath as the agreement.
 *
 * It is off until the anchor's address is set (src/v2.ts): no offer is made, nothing is signed for it, nothing is sent.
 *
 * The agreement never waits on the chain. A row is kept first and applies at once, a stop above all; the anchor is
 * written after it, and a failure there leaves the row waiting with its signature. A yes still waiting is tried again
 * before a reading is taken (src/consent-guard.ts), which is the moment it matters: `pnpm verify:consent` holds every
 * reading that moved money against a yes anchored before it.
 */

const ZERO_KEY = `0x${"00".repeat(32)}` as Hex;

/** What the relayer's gas stays above for the two calls, from the Foundry gas report of test/ConsentAnchor.t.sol. */
export const ANCHOR_GAS = { bind: 80_000n, anchor: 100_000n } as const;

/** What the browser needs to sign for the anchor: where it is, whether the account's key is bound, and the next place. */
export type AnchorOffer = Readonly<{ contract: Hex; account: Hex; bound: boolean; sequence: number }>;

/** What comes back with a yes or a stop: the place it was signed for, the consent key's signature, and the binding when the key was not bound. */
export type AnchorSigned = Readonly<{ sequence: number; signature: Hex; binding: Hex | null }>;

export type AnchorEntry = Readonly<{ kind: number; anchoredAt: number; digest: Hex; signatureR: Hex; signatureS: Hex }>;

export type AnchorDeps = Readonly<{
  contract: () => Hex | null;
  boundKey: (contract: Hex, account: Hex) => Promise<Hex>;
  entryCount: (contract: Hex, account: Hex, giftId: string) => Promise<number>;
  entryAt: (contract: Hex, account: Hex, giftId: string, sequence: number) => Promise<AnchorEntry>;
  /** Sends one call through the relayer and answers its transaction once it is final. */
  send: (contract: Hex, functionName: "bind" | "anchor", args: readonly unknown[]) => Promise<Hex>;
  binding: (account: string) => Promise<string | null>;
  anchored: (id: number, txHash: string) => Promise<void>;
  gaveUp: (id: number) => Promise<void>;
}>;

const read = <T>(contract: Hex, functionName: string, args: readonly unknown[]) =>
  createMonadPublicClient().readContract({ address: contract, abi: CONSENT_ANCHOR_ABI as Abi, functionName, args: args as never }) as Promise<T>;

export const liveAnchorDeps: AnchorDeps = {
  contract: consentAnchorAddress,
  boundKey: (contract, account) => read<Hex>(contract, "consentKeyOf", [account]),
  entryCount: async (contract, account, giftId) => Number(await read<bigint>(contract, "entryCount", [account, BigInt(giftId)])),
  entryAt: async (contract, account, giftId, sequence) => {
    const entry = await read<{ kind: number; anchoredAt: bigint; digest: Hex; signatureR: Hex; signatureS: Hex }>(contract, "entryAt", [account, BigInt(giftId), BigInt(sequence)]);
    return { kind: Number(entry.kind), anchoredAt: Number(entry.anchoredAt), digest: entry.digest, signatureR: entry.signatureR, signatureS: entry.signatureS };
  },
  send: async (contract, functionName, args) => (await relayCall({ address: contract, abi: CONSENT_ANCHOR_ABI as Abi, floor: ANCHOR_GAS[functionName] }, functionName, args)).hash,
  binding: bindingOf,
  anchored: noteAnchored,
  gaveUp: stopWaitingForAnchor,
};

let configured: AnchorDeps | undefined;

/** Tests stand in for the chain and the relayer here, as they do for the store. */
export function configureConsentAnchor(custom: AnchorDeps | undefined): void {
  configured = custom;
}

const anchorDeps = (): AnchorDeps => configured ?? liveAnchorDeps;

/** Where agreements are written down in public, or nothing while that is off. */
export function anchorContract(): Hex | null {
  return anchorDeps().contract();
}

/**
 * What the person's browser is to sign for the anchor, or nothing: while the anchor is not set, and when the chain
 * cannot be read just now. An agreement signed without it is kept all the same, and is not on the anchor.
 */
export async function anchorOffer(account: string, giftId: string, deps: AnchorDeps = anchorDeps()): Promise<AnchorOffer | null> {
  const contract = deps.contract();
  if (!contract) return null;
  try {
    const [key, sequence] = await Promise.all([deps.boundKey(contract, account as Hex), deps.entryCount(contract, account as Hex, giftId)]);
    return { contract, account: account.toLowerCase() as Hex, bound: key.toLowerCase() !== ZERO_KEY, sequence };
  } catch (error) {
    console.error(`consent anchor: the offer for gift ${giftId} could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** Reads what came back with a yes or a stop. Nothing when nothing came; `false` when what came is not well formed. */
export function requestedAnchor(value: unknown): AnchorSigned | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return false;
  const { sequence, signature, binding } = value as { sequence?: unknown; signature?: unknown; binding?: unknown };
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0xffff_ffff) return false;
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{128}$/.test(signature)) return false;
  if (binding !== undefined && binding !== null && (typeof binding !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(binding))) return false;
  return { sequence, signature: signature.toLowerCase() as Hex, binding: typeof binding === "string" ? (binding.toLowerCase() as Hex) : null };
}

/** The message the consent key signs for the anchor, rebuilt from the row: the server never takes it from the browser. */
export function anchorMessageOf(contract: Hex, row: Pick<ConsentRow, "account" | "giftId" | "kind" | "text">, sequence: number): string {
  return consentAnchorMessage({ anchor: contract, account: row.account as Hex, giftId: row.giftId, kind: row.kind, sequence, digest: consentTextDigest(row.text) });
}

/** The consent key signed this row's anchored message, for this place. */
export function anchorSignatureStands(contract: Hex, row: Pick<ConsentRow, "account" | "giftId" | "kind" | "text" | "publicKey">, signed: Pick<AnchorSigned, "sequence" | "signature">): boolean {
  const key = fromHex(row.publicKey);
  const signature = fromHex(signed.signature);
  if (!key || !signature) return false;
  return ed25519Verifies(key, new TextEncoder().encode(anchorMessageOf(contract, row, signed.sequence)), signature);
}

/** The account itself signed for this consent key, as the anchor will check it. */
export async function bindingStands(contract: Hex, account: string, publicKey: string, binding: Hex): Promise<boolean> {
  try {
    return await verifyTypedData({ ...consentKeyTypedData(contract, account as Hex, publicKey as Hex), address: account as Hex, signature: binding });
  } catch {
    return false;
  }
}

export type AnchorOutcome =
  /** Written now, or found written already. */
  | "anchored"
  /** Not written, and still possible: tried again before the gift's next reading. */
  | "waiting"
  /** Its place was taken by something else, or the account's key on the anchor is another: it can never be written. */
  | "never"
  /** The anchor is not set, or the row was not signed for it. */
  | "off";

/**
 * Writes one row on the anchor: binds the account's key first when it is not bound, then anchors the row at the place
 * it was signed for. It never throws: what it could not do is its answer, and a line for the operator.
 */
export async function anchorRow(row: ConsentRow, deps: AnchorDeps = anchorDeps()): Promise<AnchorOutcome> {
  const contract = deps.contract();
  if (!contract || row.anchorTx || row.anchorSignature === null || row.anchorSequence === null) return row.anchorTx ? "anchored" : "off";
  const account = row.account as Hex;
  const say = (what: string) => console.error(`consent anchor: gift ${row.giftId}, row ${row.id}: ${what}`);
  try {
    const key = (await deps.boundKey(contract, account)).toLowerCase();
    if (key !== ZERO_KEY && key !== row.publicKey.toLowerCase()) {
      say("the account's key on the anchor is another one");
      await deps.gaveUp(row.id);
      return "never";
    }
    const count = await deps.entryCount(contract, account, row.giftId);
    if (count !== row.anchorSequence) {
      // Its place is taken. By this very row, when a transaction went through and its answer was lost: then it is
      // written, and only the transaction's hash is unknown here.
      const digest = consentTextDigest(row.text).toLowerCase();
      const there = count > row.anchorSequence ? await deps.entryAt(contract, account, row.giftId, row.anchorSequence) : null;
      const same = there !== null && there.digest.toLowerCase() === digest && `0x${there.signatureR.slice(2)}${there.signatureS.slice(2)}`.toLowerCase() === row.anchorSignature.toLowerCase();
      await deps.gaveUp(row.id);
      if (!same) say(`signed for place ${row.anchorSequence}, and the next place is ${count}`);
      return same ? "anchored" : "never";
    }
    if (key === ZERO_KEY) {
      const binding = await deps.binding(account);
      if (!binding || !(await bindingStands(contract, account, row.publicKey, binding as Hex))) {
        say("the account has not signed for its consent key yet");
        return "waiting";
      }
      await deps.send(contract, "bind", [account, row.publicKey as Hex, binding as Hex]);
    }
    const signature = row.anchorSignature as Hex;
    const hash = await deps.send(contract, "anchor", [
      account,
      BigInt(row.giftId),
      CONSENT_KIND[row.kind],
      BigInt(row.anchorSequence),
      consentTextDigest(row.text),
      `0x${signature.slice(2, 66)}` as Hex,
      `0x${signature.slice(66, 130)}` as Hex,
    ]);
    await deps.anchored(row.id, hash);
    return "anchored";
  } catch (error) {
    const reason = error instanceof RelayerError ? `${error.code}${error.contractError ? ` ${error.contractError}` : ""}` : error instanceof Error ? error.message : String(error);
    say(`not written: ${reason.slice(0, 200)}`);
    return "waiting";
  }
}
