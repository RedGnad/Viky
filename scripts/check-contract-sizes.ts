import { readFile } from "node:fs/promises";

// Monad accepts contracts up to 128 KiB of runtime bytecode. Every production artifact is checked
// here after `forge build`, so a contract that outgrows the limit fails in CI, not at deployment.

const MONAD_MAX_RUNTIME_BYTES = 128 * 1024;

const productionArtifacts = [
  ["GiftEscrow", "out/GiftEscrow.sol/GiftEscrow.json"],
  ["MilestoneGift", "out/MilestoneGift.sol/MilestoneGift.json"],
  ["GiftEscrowV2", "out/GiftEscrowV2.sol/GiftEscrowV2.json"],
  ["MilestoneGiftV2", "out/MilestoneGiftV2.sol/MilestoneGiftV2.json"],
  ["ConsentAnchor", "out/ConsentAnchor.sol/ConsentAnchor.json"],
  ["ExitRouter", "out/ExitRouter.sol/ExitRouter.json"],
  ["VikyReclaimVerifier", "out/VikyReclaimVerifier.sol/VikyReclaimVerifier.json"],
  ["VikyStravaClaimParser", "out/VikyStravaReclaimVerifier.sol/VikyStravaClaimParser.json"],
  ["VikyStravaReclaimVerifier", "out/VikyStravaReclaimVerifier.sol/VikyStravaReclaimVerifier.json"],
] as const;

function byteLength(value: unknown, label: string): number {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
    throw new Error(`${label} is not valid hex bytecode; run forge build first`);
  }
  return (value.length - 2) / 2;
}

async function main(): Promise<void> {
  const results = await Promise.all(
    productionArtifacts.map(async ([contract, path]) => {
      const artifact = JSON.parse(await readFile(path, "utf8")) as {
        bytecode?: { object?: unknown };
        deployedBytecode?: { object?: unknown };
      };
      const initcodeBytes = byteLength(artifact.bytecode?.object, `${contract} initcode`);
      const runtimeBytes = byteLength(artifact.deployedBytecode?.object, `${contract} runtime`);
      if (runtimeBytes === 0) throw new Error(`${contract} has empty runtime bytecode`);
      if (runtimeBytes > MONAD_MAX_RUNTIME_BYTES) {
        throw new Error(
          `${contract} runtime is ${runtimeBytes} bytes, above Monad's ${MONAD_MAX_RUNTIME_BYTES}-byte limit`,
        );
      }
      return {
        contract,
        runtimeBytes,
        initcodeBytes,
        runtimeMarginBytes: MONAD_MAX_RUNTIME_BYTES - runtimeBytes,
      };
    }),
  );

  console.log(JSON.stringify({ network: "Monad", maxRuntimeBytes: MONAD_MAX_RUNTIME_BYTES, contracts: results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
