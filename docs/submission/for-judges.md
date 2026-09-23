# For judges

One section per bounty: what Viky claims, how to check it in thirty seconds, and the measurement the bounty asks for.
A claim is written only if it was read on Monad mainnet or in production on 23 Sep 2026 (block 107,254,273, production
serving commit `ee85f6e`). What is not built, or not measured, is said as such, in the section it belongs to.

Every command below runs from any machine with Foundry's `cast` and no key. Set once:

```bash
export R=https://rpc.monad.xyz
export AUSD=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a
export GIFT=0x995Ab09d8B20511d057E9E87D00fa1f41fC0e233          # GiftEscrow, the daily gift, current
export GIFT_EARLIER=0xE04CD59bB93765333200a9da01df83149D4C4d67  # GiftEscrow, the first gift still runs here
export MILESTONE=0x8dc281Ac8a1c789fdb65a063b9225E98eC522F0e     # MilestoneGift, one milestone, whole or nothing
export ROUTER=0x8a1790DfD10CF1599bDaeD5eC8BB46B2A6eB6223        # ExitRouter, the way out
export SAFE=0xE08D926c148A5065F4Df2892702785a183de86F9          # owner of all four
```

Where the bounty criteria come from: the public page (`monad.xyz/developers/hackathons/metropolis`) gives the titles and
the amounts only; the criteria live in the participant portal (`hackathon.monad.xyz`, whose catalogue API answers 401
without a session). The criteria quoted for Agora, Mera UX and Envio are the ones read in the portal on 11 Sep 2026
(`docs/reports/2026-09-11-status.md`, `docs/DECISIONS.md` D23). Mera "One Passkey, Many Keys" and Alchemy were not
recorded then: their criteria are to be read in the portal before submitting.

## What is true of the whole product, in numbers

| what | value | how to read it |
|---|---|---|
| gifts ever made | 6: gift 1 on the earlier daily contract, gifts 2 and 3 on the current one, 1,000,000 to 1,000,002 on the milestone contract | `cast call $GIFT "nextGiftId()(uint256)" --rpc-url $R` (4), the same on `$GIFT_EARLIER` (2) and `$MILESTONE` (1000003) |
| money held by the contracts | 7.428580 AUSD (2.857148, 1.571432, 3.000000) | `cast call $AUSD "balanceOf(address)(uint256)" $GIFT --rpc-url $R`, and for the two others |
| money of gift 1 still to go back | 2.857148 AUSD, refundable since it was finalised and not yet sent | `cast call $GIFT_EARLIER "refundableBalance(uint256)(uint256)" 1 --rpc-url $R` |
| who funded them | two accounts of the team; gifts 2 and 3 are gifts to oneself | `getGift` below, fields 1 and 3 |
| conditions that have carried a gift | two: a Duolingo lesson each day (goal 1, daily) and a Chess.com rapid rating (goal 1, milestone) | field 5 of `getGift` |
| conditions offered in production | six (`curl -s https://viky.cash/api/conditions`) | four of them have not carried a gift yet |

So Viky does not claim users beyond its team today, nor a gift made by a stranger.

## Agora: Best Cross-Border Payments App on Monad ($10,000)

**What the bounty asks** (portal, 11 Sep): "a working demo showing passkey onboarding, an AUSD balance, and a
completed send/receive transaction settled instantly"; judged on implementation quality, real-world usability, business
viability of the payments flow. A progressive web app counts as the mobile app (D31, answer relayed from the bounty's
owner).

**What Viky claims.**
- The only asset is AUSD, on Monad mainnet. A gift is AUSD allocated in the recipient's name, released day by day on a
  verified reading, and returned to the funder for every day not earned.
- Funding is one signature: the funder's EIP-3009 authorization, whose nonce is the hash of the gift's terms, so the
  one signature pays and consents to those exact terms. Viky's relayer submits it; the funder holds no gas.
- The recipient signs in with a passkey (Mera), never sees a wallet, a seed or a fee, and is paid on a signed intent the
  relayer submits.
- "Funded" is shown only after finality.

**Check it in thirty seconds.**

```bash
# The first gift, whole life on chain: $20.00 over 7 days, 1 day earned and taken, 6 days missed, 5 of them sent back so far
cast call $GIFT_EARLIER "getGift(uint256)((address,address,address,bytes32,uint8,uint32,uint32,uint32,uint32,uint32,uint32,uint32,uint256,uint256,uint256,uint256,uint256,bytes32,uint64,uint64,uint64,uint64,bool,bool))" 1 --rpc-url $R
#   fields 10 and 11: creditedDays 1, drainedDays 6; 13: amount 20000000; 15: withdrawn 2857142; 16: refunded 14285710
# The funding, one transaction, the funder's single signature relayed
cast receipt 0x6abe9c0b2624048f0503bb231fcdfe9748d51340d211a4e1363f07717ec19c30 status --rpc-url $R   # 1 (success)
# The recipient's claim, relayed
cast receipt 0x3ee46d8dbfa6ccf701b45e39fafe01479349a0a9cc182a4341d0dc673feb73a6 status --rpc-url $R   # 1 (success)
# What the contract binds the signature to
cast call $GIFT "FUND_NONCE_TAG()(bytes32)" --rpc-url $R
```

**The measurement.** Funding, from the tap to "Funded", finality included: **2 seconds**, measured on the page log of
11 Sep 2026 ("create gift" 00:44:55, "funded gift 1" 00:44:57, block 103,756,970; `docs/spikes/KT1.md`, leg 3). That is
one gift, on a desk, by the founder. Not measured: the same on a phone, and a gift between two countries.

**Not claimed.** Agora's Instant Settlement pair is not used: it needs a whitelisting the docs describe no public way to
get (D23, D34). The euro leg out has converted once (16 Sep, 9.999586 USDC received) and has not yet been seen to arrive
in a bank account (`docs/OPERATIONS.md`, "The first real trial"). No cross-border gift has run.

## Mera: Best Mera-Powered UX on Monad ($2,500)

**What the bounty asks** (portal, 11 Sep): time to first transaction in taps and seconds; session design (prompt-free
scope, clean expiry); the stateless test (judges clear local storage or use a fresh device mid-demo, and identity must
reconstruct from the passkey); prompt-free signing sessions; a bonus for gas sponsorship, intents and recovery.

**What Viky claims.**
- Mera is the whole account layer: the passkey's PRF output derives the account key (`src/account/mera.ts:125-138`,
  `src/account/derive.ts:17`), the key lives in memory and is zeroed on sign-out and after ten idle minutes
  (`src/account/mera.ts:128`). No seed phrase, no extension, no custody backend, no Privy, no Dynamic.
- Two reaches, written down in D98: *reading* is a twelve-hour cookie (who you are, your gifts, no prompt); *signing* is
  the key, one prompt at the first signature of a page's life, then ten idle minutes.
- Gas is sponsored on every recipient step and on funding: the relayer submits the signed authorization or intent.
- Intents: withdrawals are EIP-712 intents the relayer submits (`GiftEscrow.sol:428-439`).

**The stateless test, as a procedure.** Nothing on the device is needed to find the account again: sign-in asks the
platform's passkey picker when no credential id is stored (`src/account/mera.ts:161-173`), the account is derived again
from the PRF output, and the gifts are read from the contracts for that account (`app/api/gifts/mine/route.ts`,
`src/my-gifts.ts`).

1. On `viky.cash`, signed in, note the gifts on Home.
2. Clear the site's data (Chrome: the lock icon, "Site settings", "Delete data"; Safari: Settings, Safari, Advanced,
   Website Data, `viky.cash`), or open the site on another device where the same passkey syncs.
3. Open `viky.cash`, choose to sign in, pick the passkey in the picker, pass Face ID or the fingerprint.
4. Expected: the same account, the same gifts. Measured by nobody yet for this document: to be timed on camera.

**The measurement: time and taps to the first transaction.** **Not measured.** A first transaction is either a funding
(the funder needs money in the account) or a claim (the recipient needs a real gift link), so it cannot be timed without
a real gift, and none was made for this document. What exists: funding measured at 2 s from the tap to "Funded" on a
desk, above; KT5 ("link tap to money in your name under 60 s on a fresh phone") has no measurement
(`docs/spikes/KT1.md`: "Not timed, so KT5 still has no measurement"). Protocol to run it once, filmed:

1. A phone that has never opened `viky.cash`, a screen recording started, a gift link sent to it by message.
2. Start the clock at the tap on the link. Count every tap, and every biometric prompt apart.
3. Stop at the screen that says the money is in their name, which is shown only once the claim transaction is final.
4. Write down: seconds, taps, prompts, the claim's transaction hash, and the phone and browser. Repeat once on a second
   phone family (iOS and Android).

**Recovery.** A passkey synced by iCloud Keychain, Google Password Manager or 1Password comes back on a new device of
the same account. Nothing else recovers an account: without the passkey, the account is gone. That is said, not hidden.

## Mera: One Passkey, Many Keys ($2,500)

**What the bounty asks.** Not recorded in this repository; to be read in the portal.

**What Viky has.** One passkey, one PRF output, one derived account key (BIP-44 `m/44'/60'/0'/0/0`), the index a
parameter of `deriveEvmPrivateKey(prfOutput, index)` (`src/account/derive.ts:17`) that only ever receives 0.

**What Viky does not have.** The second key from the same passkey that the specification planned (SPEC section 8: an
HKDF message key encrypting the funder's note to the recipient) is not built: no HKDF, no encrypted note, anywhere in
`src/` or `app/`. Nothing in this section can be verified because nothing is there. If this bounty is kept, that is the
work; if not, it comes off the list.

## Envio: Best Use of Envio ($1,000)

**What the bounty asks** (portal, 11 Sep): a deployed indexer with a public `config.yaml`, `schema.graphql` and
handlers, a front that consumes it, a demo; judged on depth (derived entities, aggregates).

**What Viky has.** No indexer. There is no `config.yaml`, no `schema.graphql`, no handler and no Envio endpoint in the
repository or on any of its branches, and no screen reads one. The screens and the judges page read the contracts
directly, and the daily pass reads its own records.

**The aggregates such an indexer would have to match, read from the chain today**, so that one built later can be
checked against them:

| aggregate | chain value, block 107,254,273 | command |
|---|---|---|
| gifts created, all contracts | 6 | `nextGiftId()` on the three gift contracts, less their first ids (1, 2, 1,000,000) |
| AUSD held, all contracts | 7,428,580 units | `balanceOf` on AUSD for each |
| AUSD held by the router | 0 | `cast call $AUSD "balanceOf(address)(uint256)" $ROUTER --rpc-url $R` |
| days credited and drained, gift 1 | 1 and 6 | fields 10 and 11 of `getGift(1)` on `$GIFT_EARLIER` |

`eth_getLogs` on the public RPC is capped at 100 blocks, which is why counts above come from state and not from events.

## Alchemy: Best Projects using Alchemy ($1,000 in credits)

**What the bounty asks.** Not recorded in this repository; to be read in the portal.

**What Viky has.** Production reads the chain and relays through an Alchemy Monad RPC endpoint (the value of
`NEXT_PUBLIC_MONAD_RPC_URL`, read on the judges page on 23 Sep). Nothing else from Alchemy: no webhook, no Alchemy SDK
call (`alchemy-sdk` is in the lockfile only as a dependency of a dependency, imported by no file of Viky), no account
abstraction product.

**Not to show as it is.** That endpoint carries its key in the URL and is printed on the judges page and shipped in the
browser bundle (`docs/reports/2026-09-23-secrets-history.md`, section 4). Until the key is regenerated and kept on the
server, the one thing this section could point at is a leak.

## What a judge can re-verify without us

```bash
git clone https://github.com/RedGnad/Viky.git && cd Viky && pnpm install
pnpm verify:day
```

It fetches the one example published with its holder's agreement (`https://viky.cash/api/judges/example`, gift 1, the
day of 12 Sep 2026), recomputes the claim's identifier, recovers the attestor that signed it
(`0x244897572368Eadf65bfBc5aec98D8e5443a9072`), recomputes the fingerprint, asks the contract whether it is recorded
against replay, and reads the transaction that credited the day. Measured on 23 Sep 2026: five answers "yes", **15.2
seconds** once the dependencies are installed. The same check by hand:

```bash
cast call $GIFT_EARLIER "usedNullifiers(bytes32)(bool)" 0xcefaf52fb44553c088f63ae0442e36f7135f95c5851798b04c6119b9ea2dd9d3 --rpc-url $R   # true
```

**One refusal, with its typed error.** Gift 2 is finalised, so draining it is refused, before any gas is spent:

```bash
cast call $GIFT "drain(uint256)" 2 --rpc-url $R   # execution reverted, data: 0x26b7f2fe
cast sig "AlreadyFinalised()"                      # 0x26b7f2fe
```

**Who can change what.** All four contracts answer the same owner, a Safe of three project keys that needs two:

```bash
cast call $GIFT "owner()(address)" --rpc-url $R      # the Safe, and the same on the three others
cast call $SAFE "getThreshold()(uint256)" --rpc-url $R  # 2
cast call $SAFE "getOwners()(address[])" --rpc-url $R   # three addresses
cast call $GIFT "evidenceSigner()(address)" --rpc-url $R  # 0x85702Eaaa6B8694A61a6FbBff2634FCd7E644d9a
```

**The trust assumption, in one sentence.** The contracts credit a day because Viky's evidence signer signed a reading it
verified off chain, so whoever holds that key could credit a day no source ever answered; `pnpm verify:day` is how
anybody checks that a credited day had a real, signed reading behind it.
