# Verification

How a reading becomes a payment, and how anybody checks afterwards that a credited day had a proof behind it.

## Verification path

Three kinds of proof reach the evidence signer, and they are not checked the same way. What is true in production
today (`PROOF_VERIFIER` unset):

1. **A proof the person shows from their own account, with a TEE attestation** (a Reclaim session: `app/api/proof/session`,
   `app/api/proof/verify`). It is verified server side with js-sdk `verifyProof` and the application secret: the
   attestor's signature and the attestation of the TEE it ran in, both required. A proof without a TEE attestation
   (the AI fallback) is refused before anything else is read.
2. **A proof the person shows through a witness provider, with no TEE** (a university's own portal, read by a
   provider made for that portal). There is no TEE to require, so the proof is verified by the pinned witness's
   signature on the portal's own domain (`src/shown-verification.ts`). The first proof from a portal is held, nothing
   is relayed, and an operator reads what the pattern read before pinning it (`pnpm portal:pin`); once pinned, a proof
   must match the pin exactly. Before the pin a page read with GET or with POST is held, since the provider chooses
   how it reads (Toulouse's portal answers its pages to POST); the pin then fixes the method with the rest. A
   university is pinned again the same way, from a real proof: the operator sets the version of the provider its
   sessions run on (`pnpm portal:pin --portal <id> --run <version>`), which takes the pin off, and the next proof is
   held and read as a first one is. A provider can also be pinned ahead of any proof, from the request its version
   publishes at Reclaim (`--ahead <version>`): the first proof that fits that pin is paid at once and bears it out;
   one that does not is held, never refused. Under a pin, every session asks for the pinned version, whatever an
   earlier session came to, and a rule written by hand runs with no agent (`ruleAsked` in `src/witness-portal.ts`):
   Reclaim's agent writes a rule only for the first proof of a university that has none yet. A session of a pinned
   rule that Reclaim ended with no proof is said to the operator by email when the gift's page asks about it, in one
   line: the university, the gift and the state it ended in. The judges
   page prints what each pinned provider reads, from the pin itself, and says of a pin made ahead that no proof has
   been shown on it yet.
3. **A reading Viky makes itself** (zkFetch: the daily Duolingo lesson, the Chess.com ratings, the certificates, a race,
   and a connected source's reading with the person's key). It is fetched through Reclaim's TEE client and verified
   server side by the attestor's signature only: js-sdk `verifyProof` checks it against the attestor list it fetches
   from Reclaim at that moment, then Viky's own pin (`RECLAIM_ATTESTOR_ADDRESSES`). The proof carries no attestation of
   the attestor's TEE, so the TEE itself is not verified on this path.

**Behind the switch** (`PROOF_VERIFIER=local`, not set in production): a reading is verified offline, by Viky alone,
the way `pnpm verify:day` does it by hand: the claim's identifier recomputed, the signers recovered, every signer one
of Viky's pinned attestors, and the witnesses exactly those signers; with `RECLAIM_ATTESTOR_IMAGE_DIGESTS` set, every
witness must also carry the attestation of the TEE holding its key, verified offline and pinned by image digest
(`src/proof-verification.ts`).

Either way, what is accepted is then attested to the contract by the evidence signer (EIP-712 `CheckIn`, or the
milestone contract's `Proof`), and no reading that could move money is taken without the recipient's signed yes (a
gift funded before 30 Sep 2026, when agreements began, is read as before until its recipient answers). Session rows
are held server side; the browser never chooses the account, the phase, the day or the profile.

## Check a credited day yourself

Anybody can check that a day Viky credited really had a proof behind it. It needs no key, no account, no environment
variable and no permission from us:

```bash
git clone https://github.com/RedGnad/Viky.git
cd Viky
pnpm install
pnpm verify:day
```

It takes the one example published with its account holder's agreement (`/api/judges/example` on viky.cash),
recomputes the claim's identifier from the signed claim, recovers the attestor that signed it, recomputes the
fingerprint, asks the gift contract whether that fingerprint is recorded against replay, and reads the transaction
back to see it credit that day. Every answer is printed beside what it was compared against.

The two people a gift is between can do the same with any day of their own: the gift's page hands over that day's
proof, then `pnpm verify:day --file day.json --gift <number> --day <day>`. A milestone gift settles on a reading, so
it takes `--reading <number>` instead.

**What it proves**: the source's own servers answered that, and the contract settled that day against that one claim,
which can never be replayed. **What it does not prove**: that the account belongs to the person the gift is for, or
that a human rather than a script did the work. The account is tied to the person once, separately, by a code in its
display name or by the funder naming it. The key that signs is ours and the owner can replace it, which is why this
check exists: a signed reading with no claim behind it cannot be re-verified by anybody.
