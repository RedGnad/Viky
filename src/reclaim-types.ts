/**
 * The trusted part of a verified Reclaim proof: the signed context and the extracted parameters.
 * Lifted out of Lock-in's Strava policy so the Duolingo path does not drag the Strava module along.
 */
export type ReclaimTrustedData = {
  context: Record<string, unknown>;
  extractedParameters: Record<string, string>;
};
