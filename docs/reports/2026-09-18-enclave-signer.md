# A signing key Viky alone cannot use to sign a false day (U4, 18 Sep 2026)

Our contracts credit a day because our evidence signer signed it, and whoever holds that key could sign a reading no
source ever answered. The judges page says exactly that. Here is what it would take to put the key where we cannot
reach it either, what would still be on trust, and how long it would take. No code was written.

## Where the key is now

One key, `EVIDENCE_SIGNER_PRIVATE_KEY`, an environment variable of the Vercel project, read by two modules and used at
eight call sites: a claim when a gift is opened, a check-in when a day is counted, and a milestone claim and proof. It
signs inside the same function that verified the reading. That function takes the proof from the attested-fetch worker
(on Railway, holding no key), checks Reclaim's attestor signature, pins the attestor's address, and checks the proof is
about the right page and patterns. `setEvidenceSigner` is `onlyOwner` on both contracts, so the signer can be replaced
with no redeployment. That is what makes this trial possible at all.

## What it would take, and what it costs

An AWS account, a fourth provider beside Vercel, Railway and Neon; a machine carrying the enclave; one key whose policy
releases the wrapped signing key only to that enclave.

AWS, read today: an enclave has "no persistent storage, interactive access, or external networking", the parent "has no
access to the isolated vCPUs and memory of the enclave", and "There are no additional charges for using Nitro
Enclaves." The key is bound to the code by two condition keys on the key's own policy,
`kms:RecipientAttestation:PCR<ID>` and `kms:RecipientAttestation:ImageSha384`, which allow a decrypt "only when the
platform configuration registers (PCRs) from the signed attestation document in the request match the PCRs in the
condition key", and "If the request does not include an attestation document, permission is denied."

So the bill is a machine that must stay up, plus a dollar. The size floor is not what it looks like: the x86 families
exclude every `.large`, so four vCPUs is their floor, but Graviton has no multithreading, so a two-vCPU `.large` is
supported and only `c6g.medium` is excluded by name. One vCPU goes to the enclave and one stays with the parent. From
AWS's own price list, published 17 Sep 2026:

| what | where | price | a month at 730 hours |
|---|---|---|---|
| `c6g.large`, 2 vCPU, 4 GiB, Graviton | Paris | $0.0810 an hour | **$59.13** |
| the same | Ireland | $0.0730 an hour | $53.29 |
| `c6g.xlarge`, 4 vCPU, for headroom | Paris | $0.1620 an hour | $118.26 |
| `c6i.xlarge`, 4 vCPU, the x86 floor | Paris | $0.2020 an hour | $147.46 |
| One customer managed key, and its requests | anywhere | $1 a month, $0.03 per 10,000 with 20,000 free | $1.00 |

**About $60 a month in Paris, where our application already runs**, and read the shape before the number: we sign a
handful of times a day, two passes at 00:30 and 07:00 UTC over three gifts, plus a claim when somebody opens a gift and
a reading a recipient asks for. An enclave dies with its parent instance, so keeping the reading on demand means
keeping the machine up all month. Running it only for the two passes costs about a tenth of that and takes the
on-demand reading away, which is a product decision, not a cost one. There is no free tier that helps: the enclave
families are not burstable, and the dollar a key is never free.

## What changes in the keeper and the worker

The worker does not change: it fetches through Reclaim's TEE client and returns a proof, holding no key before or
after. The keeper stops holding a key and hands the proof and the reading to the enclave, then relays whatever comes
back, as it relays a signature today.

The real work is that **the enclave has to carry every rule that decides**. A key in an enclave is worth nothing if the
enclave signs whatever it is handed: it must verify the proof, pin the attestor, check the page and the patterns the
register names, build the identity pseudonym, and hold the windows. What moves is not the signature, it is the
judgement.

That code is smaller than it looks. In Reclaim's own SDK, a claim's identifier is a keccak over the provider, the
parameters and a canonical JSON context, and the attestor's signature is recovered from an Ethereum personal-message
signature over four lines. No proving system, no TLS to replay. So the enclave needs keccak, canonical JSON, a
secp256k1 recovery and EIP-712 signing, not their SDK, whose tree pulls twenty-eight packages including a native FFI
binding and a proving library. A single small binary is both the right shape and the only one that can be reproducibly
built.

## What would still be on trust

- **The owner can replace the signer.** One transaction points a contract back at an ordinary key. An enclave signer is
  a promise about how we behave, made checkable, not a promise the chain enforces. What the chain gives is notice, not
  prevention: both contracts emit `EvidenceSignerUpdated(previous, new)`, and the judges page reads the current signer
  from the chain.
- **AWS, in place of us.** The measurement is signed by their hypervisor and the release enforced by their key service.
  Trust moves from our operator to their platform; it does not vanish. "Even Viky cannot sign a false day" would be
  false. "Viky alone cannot, and what it would take instead is written down" is true. What is genuinely checkable by a
  third party: the attestation document is CBOR signed with COSE, its certificate chain ends at a root AWS publishes as
  a file, and that root's fingerprint matches what their documentation prints, which I verified today. Anybody can do
  that verification offline, with no account.
- **Reclaim's attestors.** The enclave verifies their signature; it does not re-run the TLS session. The judges page
  already records the gap above ours: zk-fetch 1.1.0 does not put the attestor's own TEE attestation in the proof.
  An enclave of ours does not close that and must not be presented as if it did.
- **Every new version costs something.** Any change to the code changes the measurement, so each release is either a
  change to the key policy, made by whoever holds the account, or a fresh key and a `setEvidenceSigner` on both
  contracts. A signer nobody can update quietly is the point; it also means a one-line fix stops being a one-line
  deploy. That is the running cost, more than the monthly bill.
- **The build, and AWS does not help here.** Their tooling gives the same measurement from the same artifact, which is
  not the same guarantee as the same measurement from the same source. The user guide documents what PCR0, PCR1 and
  PCR2 hash and how to read them back from a built image, and documents nothing about reproducing them from source; the
  only AWS material on it is two blog posts. So if a stranger is to confirm which code holds the key, we write and
  publish that procedure ourselves. Reproducibility is not a detail of this trial, it is the trial.
- **One trap worth writing down now.** An enclave started in debug mode produces an attestation document whose
  measurements are all zeroes, and those documents "can't be used for cryptographic attestation". A debug enclave that
  looked like it worked would prove nothing at all.

## How long, and what I would do instead first

| the piece | days |
|---|---|
| Account, an instance that supports enclaves, the toolchain, a first image, the socket to the parent | 2 |
| The signing program: verify a claim, pin the attestor, hold our rules, sign the four messages | 3 |
| The key: made inside the enclave, wrapped, released only against the measurement | 1 to 2 |
| A reproducible build, and instructions that let somebody else get the same measurement, with no AWS procedure to follow | 2 to 3 |
| The keeper calling it, what happens when it does not answer, and the tests | 1 |
| The changeover: the new address, `setEvidenceSigner` on both contracts, a real day through it | 1 |

**Ten to twelve days, so two weeks with ordinary friction**, and the reproducible build is the piece most likely to
overrun, because it is the only one whose done depends on a stranger repeating it. There are 26 days to the
submission: this is about half of them, and nobody using Viky would see anything change.

**What buys most of it for a fraction of the days.** The journal already publishes every signed reading with the
attestor claim behind it, which is what makes a signature with nothing behind it detectable. Making that
re-verification a documented, one-command thing on the judges page is one to two days, and it is honest in a way a
sentence about enclaves is not: it does not claim we cannot cheat, it shows how you would catch us. The enclave is the
stronger answer and belongs after the submission, unless the strategy side reads the trust model itself as the thing
being judged.
