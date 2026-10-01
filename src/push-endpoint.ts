/**
 * The push services browsers use, and nothing else (the audit of 1 Oct 2026). The address a browser gives is one the
 * server later sends a request to, on every settled day: an address anybody may name is a way to make Viky's server
 * call any host of their choosing. Chrome and the browsers built on it use Google's, Firefox Mozilla's, Safari Apple's
 * and Edge Microsoft's.
 */
const PUSH_HOSTS: readonly RegExp[] = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

export function endpointOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1_024) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return null;
    return PUSH_HOSTS.some((host) => host.test(url.hostname.toLowerCase())) ? value : null;
  } catch {
    return null;
  }
}
