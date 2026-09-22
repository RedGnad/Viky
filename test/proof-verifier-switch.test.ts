import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSignDataForClaim, getIdentifierFromClaimInfo } from "@reclaimprotocol/js-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { reclaimAttestedReadDeps, verifyWithPin, verifyWithReclaimAtRuntime, verifyWithReclaimBundled } from "../src/attested-read";
import { reclaimPublicProfileDeps, verifyProfileWithPin, type ZkFetchProof } from "../src/duolingo-public";

/**
 * The switch, seen from the dependencies the daily pass builds. With PROOF_VERIFIER unset, the `verify` handed out
 * is the very function that ran before the switch existed (js-sdk, one per import style), never the pinned one:
 * checked by identity, since js-sdk's verifier needs the network and is not run here. With `local`, it is the
 * pinned one, which is then run offline on claims signed with keys that exist only for the test.
 */

function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return run().finally(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

const ATTESTOR_KEY = generatePrivateKey();
const ATTESTOR = privateKeyToAccount(ATTESTOR_KEY);
const STRANGER_KEY = generatePrivateKey();

async function signedProof(signerKey: `0x${string}`, witnessId = privateKeyToAccount(signerKey).address.toLowerCase()): Promise<ZkFetchProof> {
  const info = {
    provider: "http",
    parameters: JSON.stringify({ url: "https://api.chess.com/pub/player/sevyb/stats", method: "GET", responseMatches: [{ type: "regex", value: '"rating":(?<rating>\\d+)' }] }),
    context: JSON.stringify({ extractedParameters: { rating: "383" }, providerHash: "0xabc" }),
  };
  const claimData = { ...info, identifier: getIdentifierFromClaimInfo(info), owner: "0x557efd2c1f7215aa040806df9a487f2bf70ccda5", timestampS: 1_790_106_529, epoch: 1 };
  const signature = await privateKeyToAccount(signerKey).signMessage({ message: createSignDataForClaim(claimData as never) });
  return { claimData, signatures: [signature], witnesses: [{ id: witnessId, url: "ws://localhost:8001/ws" }] };
}

describe("the default path, with the switch unset", () => {
  it("hands out Reclaim's runtime verifier, the same function as before, when the fetch runs in this process", async () => {
    await withEnv({ PROOF_VERIFIER: undefined, ZKFETCH_WORKER_URL: undefined }, async () => {
      const deps = reclaimAttestedReadDeps();
      assert.equal(deps.verify, verifyWithReclaimAtRuntime);
      assert.notEqual(deps.verify, verifyWithPin);
    });
  });

  it("hands out Reclaim's bundled verifier, the same function as before, when the worker fetches", async () => {
    await withEnv({ PROOF_VERIFIER: undefined, ZKFETCH_WORKER_URL: "https://worker.example" }, async () => {
      const deps = reclaimAttestedReadDeps();
      assert.equal(deps.verify, verifyWithReclaimBundled);
      assert.notEqual(deps.verify, verifyWithPin);
      const profile = await reclaimPublicProfileDeps();
      assert.notEqual(profile.verify, verifyProfileWithPin);
    });
  });

  it("reads `reclaim` the same as unset", async () => {
    await withEnv({ PROOF_VERIFIER: "reclaim", ZKFETCH_WORKER_URL: undefined }, async () => {
      assert.equal(reclaimAttestedReadDeps().verify, verifyWithReclaimAtRuntime);
    });
  });
});

describe("the other path, with the switch on", () => {
  it("hands out the pinned verifier on both fetch paths", async () => {
    await withEnv({ PROOF_VERIFIER: "local", ZKFETCH_WORKER_URL: undefined }, async () => {
      assert.equal(reclaimAttestedReadDeps().verify, verifyWithPin);
    });
    await withEnv({ PROOF_VERIFIER: "local", ZKFETCH_WORKER_URL: "https://worker.example" }, async () => {
      assert.equal(reclaimAttestedReadDeps().verify, verifyWithPin);
      assert.equal((await reclaimPublicProfileDeps()).verify, verifyProfileWithPin);
    });
  });

  it("accepts a claim signed by the pinned attestor, offline (step 1b, run c)", async () => {
    await withEnv({ PROOF_VERIFIER: "local", RECLAIM_ATTESTOR_ADDRESSES: ATTESTOR.address, RECLAIM_ATTESTOR_IMAGE_DIGESTS: undefined }, async () => {
      assert.equal(await verifyWithPin(await signedProof(ATTESTOR_KEY)), true);
      assert.equal(await verifyProfileWithPin(await signedProof(ATTESTOR_KEY)), true);
    });
  });

  it("refuses a claim signed by any other key (step 1b, runs d and f1)", async () => {
    await withEnv({ PROOF_VERIFIER: "local", RECLAIM_ATTESTOR_ADDRESSES: ATTESTOR.address, RECLAIM_ATTESTOR_IMAGE_DIGESTS: undefined }, async () => {
      assert.equal(await verifyWithPin(await signedProof(STRANGER_KEY)), false);
    });
  });

  it("refuses a forged signature under a witness list naming the pinned attestor (step 1b, run f2)", async () => {
    await withEnv({ PROOF_VERIFIER: "local", RECLAIM_ATTESTOR_ADDRESSES: ATTESTOR.address, RECLAIM_ATTESTOR_IMAGE_DIGESTS: undefined }, async () => {
      assert.equal(await verifyWithPin(await signedProof(STRANGER_KEY, ATTESTOR.address.toLowerCase())), false);
    });
  });

  it("refuses a witness without an enclave attestation once an image digest is pinned (step 1b, run e)", async () => {
    await withEnv({ PROOF_VERIFIER: "local", RECLAIM_ATTESTOR_ADDRESSES: ATTESTOR.address, RECLAIM_ATTESTOR_IMAGE_DIGESTS: "sha256:0000" }, async () => {
      assert.equal(await verifyWithPin(await signedProof(ATTESTOR_KEY)), false);
    });
  });

  it("refuses to build the dependencies on a value that is neither (step 1b, run g)", async () => {
    await withEnv({ PROOF_VERIFIER: "both" }, async () => {
      assert.throws(() => reclaimAttestedReadDeps(), /PROOF_VERIFIER must be "reclaim" or "local"/);
    });
  });
});
