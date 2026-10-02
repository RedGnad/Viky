import { createPublicClient, parseAbi, type Hex } from "viem";
import { AUSD_ADDRESS, monadTransport } from "./monad/chain";

/**
 * What AUSD's own contract answers about its issuer's powers, read as the judges page is served (the review of
 * 2 Oct 2026, R-12).
 *
 * What the issuer can do is written in the token's source, verified on Monad through Sourcify (partial match, read
 * 2 Oct 2026: the proxy at the token's address and its implementation 0xc1e3C7D486d6A92fBE920232E439EeC2cEb112dA).
 * A freezer role freezes an account, which can then neither send nor receive (`Erc20Core._transfer`). A pauser role
 * suspends transfers for everybody, or the signed transfers alone, which is how a gift is funded and a send relayed
 * (`AgoraDollarErc1967Proxy`, `isTransferPaused`, `isSignatureVerificationPaused`). A burner role burns from an
 * account (`Erc20Privileged.batchBurnFrom`). The proxy's admin replaces the code (`upgradeToAndCall`). The page says
 * those in words; what is read here is whether any of them is in use right now, for the token and for each contract
 * that holds gifts.
 */

const AUSD_ABI = parseAbi([
  "function isTransferPaused() view returns (bool)",
  "function isSignatureVerificationPaused() view returns (bool)",
  "function isAccountFrozen(address account) view returns (bool)",
  "function proxyAdminAddress() view returns (address)",
]);

export type AusdFacts = Readonly<{
  transfersPaused: boolean;
  signedTransfersPaused: boolean;
  /** The account that can replace the token's code. */
  proxyAdmin: string;
  /** Each contract that holds gifts, and whether the issuer has frozen it. */
  holders: ReadonlyArray<{ address: string; frozen: boolean }>;
}>;

export type AusdReader = Readonly<{ read(functionName: "isTransferPaused" | "isSignatureVerificationPaused" | "proxyAdminAddress"): Promise<unknown>; frozen(account: Hex): Promise<boolean> }>;

export function chainAusdReader(): AusdReader {
  const chain = createPublicClient({ transport: monadTransport() });
  return {
    read: (functionName) => chain.readContract({ address: AUSD_ADDRESS, abi: AUSD_ABI, functionName }),
    frozen: async (account) => Boolean(await chain.readContract({ address: AUSD_ADDRESS, abi: AUSD_ABI, functionName: "isAccountFrozen", args: [account] })),
  };
}

/** The token's state now, or nothing when any of it could not be read: the page then says so rather than half of it. */
export async function ausdFacts(holders: readonly string[], reader: AusdReader = chainAusdReader()): Promise<AusdFacts | null> {
  try {
    const [transfersPaused, signedTransfersPaused, proxyAdmin, ...frozen] = await Promise.all([
      reader.read("isTransferPaused"),
      reader.read("isSignatureVerificationPaused"),
      reader.read("proxyAdminAddress"),
      ...holders.map((holder) => reader.frozen(holder as Hex)),
    ]);
    if (typeof proxyAdmin !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(proxyAdmin)) return null;
    return {
      transfersPaused: Boolean(transfersPaused),
      signedTransfersPaused: Boolean(signedTransfersPaused),
      proxyAdmin,
      holders: holders.map((address, position) => ({ address, frozen: Boolean(frozen[position]) })),
    };
  } catch {
    return null;
  }
}
