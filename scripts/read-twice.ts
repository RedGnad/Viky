import "../src/load-env";
import { localAttestedFetch } from "../src/attested-read";
import { CHESS_PLAYER, CHESS_PROFILE, DUOLINGO_PROFILE } from "../src/attested-sources";

/** Two attested reads of one unchanged page, to see whether the claim identifier, and so our nullifier, repeats. */
async function main() {
  const sources = { "chess-player": CHESS_PLAYER, "chess-profile": CHESS_PROFILE, "duolingo-profile": DUOLINGO_PROFILE } as const;
  const source = sources[(process.argv[2] ?? "chess-player") as keyof typeof sources];
  if (!source) throw new Error("no such source");
  const account = process.argv[3] ?? "sevyb";
  for (const n of [1, 2]) {
    const proof = await localAttestedFetch(source, account);
    const context = JSON.parse(proof.claimData.context) as { extractedParameters?: Record<string, string> };
    console.log(`read ${n}: identifier ${proof.claimData.identifier.slice(0, 18)}… timestampS ${proof.claimData.timestampS} | extracted ${JSON.stringify(context.extractedParameters).slice(0, 160)}`);
    const rest = { ...(context as Record<string, unknown>) };
    delete rest.extractedParameters;
    console.log(`  context, without the fields: ${JSON.stringify(rest).slice(0, 400)}`);
    console.log(`  parameters: ${proof.claimData.parameters.slice(0, 300)}`);
  }
}
void main();
