import assert from "node:assert/strict";
import test from "node:test";
import { reclaimChannelInitOptions, reclaimChannelLaunchOptions, resolveReclaimChannel } from "../src/reclaim-channel";

test("resolves the Reclaim delivery channel from configuration, failing closed", () => {
  // The channel decides whether a user re-authenticates inside a remote browser on every check-in, so a
  // typo must not silently fall back to the remote one.
  assert.equal(resolveReclaimChannel(undefined), "portal");
  assert.equal(resolveReclaimChannel(""), "portal");
  assert.equal(resolveReclaimChannel("portal"), "portal");
  assert.equal(resolveReclaimChannel("app"), "app");
  assert.equal(resolveReclaimChannel(" APP "), "app");
  assert.throws(() => resolveReclaimChannel("mobile"), /must be "portal" or "app"/);
  assert.throws(() => resolveReclaimChannel("extension"), /must be "portal" or "app"/);
});

test("app mode asks for the App Clip and the deferred deep link, each in the options the SDK reads", () => {
  // useAppClip is a ProofRequestOptions field; canUseDeferredDeepLinksFlow is a launch option. Putting the
  // deep link in the init options would have been silently ignored.
  assert.deepEqual(reclaimChannelInitOptions("app"), { useAppClip: true });
  assert.deepEqual(reclaimChannelInitOptions("portal"), {});
  assert.deepEqual(reclaimChannelLaunchOptions("app"), { verificationMode: "app", canUseDeferredDeepLinksFlow: true });
  assert.deepEqual(reclaimChannelLaunchOptions("portal"), { verificationMode: "portal" });
});
