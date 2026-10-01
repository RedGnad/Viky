import { getAddress, type Hex, type LocalAccount } from "viem";
import { receiveAuthorizationTypedData, type ReceiveAuthorizationMessage } from "../ausd-authorization";
import { USDC } from "../coins";
import { conversionRefusal, termsFromJson, usdcRouterAddress, type TermsInJson } from "../usdc-router";
import { ApiError, postJson } from "./api";

/**
 * The conversion, from the browser: USDC a card payment delivered becomes what a gift holds, on one signature.
 *
 * The account calls no contract and holds none of the chain's coin, exactly as on the way out (src/client/exit.ts).
 * Two things differ. The signature is made under USDC's own domain, since each coin has its own. And nothing was shown
 * before it, so the terms are read here before they are signed: whose money, how much, which coin comes back, at least
 * ninety-nine for a hundred, and a nonce that is those terms' own (`conversionRefusal`).
 */

type Prepared = Readonly<{
  id: string;
  /** True when this account already signed these exact terms: the same ones are relayed again, never a second set. */
  signed: boolean;
  terms: TermsInJson;
  authorization: { to: Hex; value: string; validAfter: string; validBefore: string; nonce: Hex };
}>;

/** As many attempts as the way out makes, for the same reason: a route that moved is asked again (D81). */
const ATTEMPTS = 3;

export async function changeArrivedUsdc(input: { account: LocalAccount; amount: bigint }): Promise<{ hash: Hex | null }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await oneAttempt(input);
    } catch (error) {
      const moved = error instanceof ApiError && error.code === "QUOTE_STALE";
      if (!moved || attempt >= ATTEMPTS) throw error;
    }
  }
}

function refused(why: string): ApiError {
  return new ApiError({ status: 409, code: "CONVERSION_ELSEWHERE", message: `The conversion came back with terms this page would not sign (${why}), so nothing was signed and nothing moved.` });
}

async function oneAttempt(input: { account: LocalAccount; amount: bigint }): Promise<{ hash: Hex | null }> {
  const router = usdcRouterAddress();
  if (!router) throw new ApiError({ status: 503, code: "NOT_CONFIGURED", message: "Viky cannot change this money yet. Nothing was taken." });
  const prepared = await postJson<Prepared>("/api/fund/convert/prepare", { amount: input.amount.toString() });

  let signature: Hex | undefined;
  if (!prepared.signed) {
    // Signed for the router this code knows, never for an address a server answer names.
    if (getAddress(prepared.authorization.to) !== router) throw refused("another place to send the money");
    const why = conversionRefusal(termsFromJson(prepared.terms), {
      payer: getAddress(input.account.address),
      amount: input.amount,
      nonce: prepared.authorization.nonce,
      value: BigInt(prepared.authorization.value),
      nowSeconds: Math.floor(Date.now() / 1_000),
    });
    if (why) throw refused(why);
    const message: ReceiveAuthorizationMessage = {
      from: getAddress(input.account.address),
      to: router,
      value: input.amount,
      validAfter: 0n,
      // Dies with the terms, so nothing spendable outlives the window the contract enforces.
      validBefore: BigInt(prepared.terms.deadline),
      nonce: prepared.authorization.nonce,
    };
    signature = await input.account.signTypedData(receiveAuthorizationTypedData(message, USDC));
  }

  const relayed = await postJson<{ changed: boolean; hash: Hex | null }>("/api/fund/convert/relay", { id: prepared.id, ...(signature ? { signature } : {}) });
  return { hash: relayed.hash };
}
