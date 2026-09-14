import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const escrow = "0xE04CD59bB93765333200a9da01df83149D4C4d67" as const;
  const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const sig = await account.signTypedData({
    domain: { name: "Viky Gift", version: "1", chainId: 143, verifyingContract: escrow },
    types: {
      Withdraw: [
        { name: "giftId", type: "uint256" },
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint64" },
      ],
    },
    primaryType: "Withdraw",
    message: { giftId: 1n, to: account.address, amount: 2857142n, nonce: 0n, deadline: 99999999999n },
  });
  console.log("  bytes:", (sig.length - 2) / 2, "| v:", parseInt(sig.slice(-2), 16), "| signer:", account.address);
  console.log("  sig:", sig);
}
void main();
