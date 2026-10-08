/**
 * The link of a gift, kept by the device that made it (the founder's scope of 17 Sep 2026: "Copy the link again" on the
 * device that created the gift). The link carries the key that lets the gift be opened and that prints the two names,
 * so it is never something the server can hand back: whoever made the gift is the only one holding it, and losing the
 * tab used to mean losing the link.
 *
 * It stays on that device and nowhere else. A device that keeps nothing simply does not offer it again.
 */

const KEY = "viky.gift-link.";

/** Whoever draws from this memory is told when a link is kept: the gift's page says "Send it" the moment one is here. */
const followers = new Set<() => void>();

export function followGiftLinks(follower: () => void): () => void {
  followers.add(follower);
  return () => {
    followers.delete(follower);
  };
}

export function rememberGiftLink(giftId: string, claimUrl: string): void {
  try {
    window.localStorage.setItem(KEY + giftId, claimUrl);
  } catch {
    // A browser that refuses storage still made the gift; only the second copy of the link is lost.
  }
  for (const follower of followers) follower();
}

export function giftLinkOnThisDevice(giftId: string): string | null {
  try {
    const kept = window.localStorage.getItem(KEY + giftId);
    return kept && kept.startsWith("http") ? kept : null;
  } catch {
    return null;
  }
}
