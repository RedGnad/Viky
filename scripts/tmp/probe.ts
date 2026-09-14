import "../../src/load-env";
import { createHmac } from "node:crypto";

/**
 * Calls the live withdraw route as the recipient would, with a signature that is well formed but from a
 * stand-in key. The contract must refuse it, and the point is to see what the route sends back: whether the
 * operator detail arrives at all. The session is minted with our own signing secret, which is the same thing
 * the server does once a passkey has proved itself.
 */
const RECIPIENT = "0x91C964e745ffd6265c75df33cA9137D81c3c454d";
const ORIGIN = "https://viky-two.vercel.app";

function mintSession(account: string): string {
  const secret = process.env.SESSION_SIGNING_SECRET!.trim();
  const now = Date.now();
  const payload = { v: 1, kind: "session", chainId: 143, account, origin: ORIGIN, issuedAtMs: now, expiresAtMs: now + 12 * 60 * 60_000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`viky-account-auth:session:schema-1:${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

async function main() {
  const response = await fetch(`${ORIGIN}/api/gift/withdraw`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie: `__Host-viky-session=${mintSession(RECIPIENT)}`,
    },
    body: JSON.stringify({
      giftId: "1",
      to: RECIPIENT,
      amount: "2857142",
      nonce: "0",
      deadline: String(Math.floor(Date.now() / 1000) + 600),
      signature: `0x${"11".repeat(64)}1b`,
    }),
  });
  console.log("  status:", response.status);
  console.log("  body  :", (await response.text()).slice(0, 400));
}
void main();
