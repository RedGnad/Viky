# Verification

Viky publishes a reproducible path from an attested source response to the on-chain settlement it caused. This page
separates the public check from the production safeguards that create the evidence.

## Check a credited day yourself

Anybody can check a credited day without a Viky account, key, environment variable or permission:

```bash
git clone https://github.com/RedGnad/Viky.git
cd Viky
pnpm install
pnpm verify:day
```

The command takes the example that its account holder agreed to publish (`/api/judges/example` on viky.cash). It
answers five questions, showing the value it compared for each one:

1. Is the signed claim internally consistent?
2. Did the pinned Reclaim attestor sign it?
3. Is the published fingerprint the fingerprint of that claim?
4. Did the gift contract record that fingerprint exactly once, so it cannot be replayed?
5. Did the published transaction credit that day of that gift?

The two people in a gift can check any day of their own in the same way. The gift page hands over its proof, then run
`pnpm verify:day --file day.json --gift <number> --day <day>`. A milestone gift settles on a reading, so it takes
`--reading <number>` instead.

### What this establishes

The command establishes that a Reclaim-attested response has a consistent signed claim, that the pinned attestor
signed it, and that Monad settled the cited day or reading against that exact claim. The fingerprint is recorded by
the contract, so that claim cannot settle another time.

### Scope of this check

The check is about the account response and the settlement. It does not independently establish the civil identity of
the account holder or whether a human rather than a script performed the activity. Viky binds an account once,
separately, by a code in its display name or by the funder naming it.

The contracts accept attestations from Viky's evidence signer. Their Safe owner can replace that signer under the
contract rules; it cannot move money held by a gift. The public check exists so a reading cannot be presented as a
settled result without its signed claim and the corresponding on-chain record. The owner powers and their bounds are
in [Contracts](CONTRACTS.md).

## Verification path in production

Production runs with `PROOF_VERIFIER` unset. Three kinds of proof reach the evidence signer. Each has safeguards that
match the way the source is read.

### 1. A person shows their own account

A Reclaim session (`app/api/proof/session`, `app/api/proof/verify`) is verified server-side with js-sdk `verifyProof`
and Viky's application secret. Both the attestor signature and the attestation of the TEE it ran in are required. A
proof without a TEE attestation, including the AI fallback, is refused before Viky reads it.

### 2. A university portal is read by a witness provider

A university's own portal is read through a provider made for that portal. It has no TEE attestation to require, so
Viky verifies the pinned witness signature on the portal's own domain (`src/shown-verification.ts`). The first proof
from a portal is held: nothing is relayed until an operator has read what the pattern read and pinned it with
`pnpm portal:pin`. Once pinned, a proof must match the pin exactly.

#### University portal safeguards

- Before a pin, a page read with GET or POST is held. The provider chooses the method; Toulouse's portal, for example,
  answers its pages to POST. The pin fixes the method with the rest of the request.
- A university is pinned again from a real proof when the operator sets the version its sessions run on with
  `pnpm portal:pin --portal <id> --run <version>`. The next proof is held and read as a first one.
- A provider can be pinned before its first proof from the request its version publishes at Reclaim
  (`--ahead <version>`). The first proof that fits pays at once and demonstrates the pin; one that does not fit is
  held, never refused.
- Under a pin, every session asks for the pinned version. A hand-written rule runs with no agent (`ruleAsked` in
  `src/witness-portal.ts`); Reclaim's agent writes a rule only for a university's first proof when it has no rule yet.
- A results page is pinned on the academic year under way and on no other. The operator supplies `--year`; a page for a
  different year pays nothing (`wrongTerm`, `src/university-shown.ts`). Until that year's results are published, its
  provider carries no pin, every proof is held, and an operator refuses an earlier year's page by hand. The gift does
  not name a year.
- If a pinned session ends at Reclaim with no proof, the operator receives one email when the gift page asks about it:
  the university, gift and final state. A held proof is emailed to the operator when held, then every morning with the
  time left for the contract to pay it. A proof can be shown until the gift's last day plus fourteen days. After that,
  the settling pass closes the review as never made and the whole gift returns to the funder (`src/milestone-pass.ts`).

The judges page prints what each pinned provider reads from the pin itself, and says when a pin was made ahead of any
proof.

### 3. Viky reads a source itself

This covers zkFetch readings: the daily Duolingo lesson, Chess.com ratings, certificates, a race, and a connected
source read with the person's key. Reclaim's TEE client fetches the source. Server-side, js-sdk `verifyProof` verifies
the attestor signature against the attestor list it fetches from Reclaim at that moment, then Viky's own pin
(`RECLAIM_ATTESTOR_ADDRESSES`). The proof carries no attestation of the attestor's TEE on this path, so Viky does not
verify that TEE itself here.

## Local verification mode

`PROOF_VERIFIER=local` is not set in production. In that mode, Viky verifies a reading offline in the same form as
`pnpm verify:day`: it recomputes the claim identifier, recovers the signers, requires every signer to be one of
Viky’s pinned attestors, and requires the witnesses to be exactly those signers. When
`RECLAIM_ATTESTOR_IMAGE_DIGESTS` is set, every witness must also carry the TEE attestation of the key it holds,
verified offline and pinned by image digest (`src/proof-verification.ts`).

## Consent and settlement

An accepted reading is attested to the contract by the evidence signer: an EIP-712 `CheckIn` for a daily gift or a
milestone contract `Proof`. No reading that could move money is taken without the recipient's signed agreement. A gift
funded before 30 Sep 2026, when agreements began, is read as before until its recipient answers.

Session rows stay server-side. The browser never chooses the account, phase, day or profile that a reading applies to.
