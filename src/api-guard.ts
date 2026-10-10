// Ported from Lock-in: same-origin check and a bounded JSON body reader for every route. Refusals are
// typed (RequestError) so a route answers them as 4xx with their sentence.
import { RequestError } from "./request-error";

const JSON_CONTENT_TYPE = "application/json";

export function assertSameOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new RequestError("CROSS_SITE", "Cross-site requests are not allowed");
  }

  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!origin || !host) return;

  let originHost: string;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    originHost = parsed.host;
  } catch {
    throw new RequestError("BAD_ORIGIN", "Invalid request origin");
  }
  if (originHost.toLowerCase() !== host.toLowerCase()) {
    throw new RequestError("CROSS_ORIGIN", "Cross-origin requests are not allowed");
  }
}

/**
 * The same check, as an answer, for a route whose refusals are not all answered in one place (the audit of 9 Oct
 * 2026): nothing when the request may go on. Fifteen routes that write were held from another site's page by the
 * session cookie alone, which a browser does not send on a POST from elsewhere; they now say it themselves too.
 */
export function refusedFromElsewhere(request: Request): Response | null {
  try {
    assertSameOrigin(request);
    return null;
  } catch (error) {
    if (!(error instanceof RequestError)) throw error;
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  assertSameOrigin(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.startsWith(JSON_CONTENT_TYPE)) {
    throw new RequestError("BAD_CONTENT_TYPE", "Content-Type must be application/json", 415);
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestError("BODY_TOO_LARGE", "Request body is too large", 413);
  }
  const payload = await request.arrayBuffer();
  if (payload.byteLength === 0 || payload.byteLength > maxBytes) {
    throw payload.byteLength === 0 ? new RequestError("EMPTY_BODY", "Request body is empty") : new RequestError("BODY_TOO_LARGE", "Request body is too large", 413);
  }
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  } catch {
    throw new RequestError("BAD_JSON", "Request body is not valid JSON");
  }
}

/**
 * Whether a request was made by one of our own pages (the founder, 9 Oct 2026): for a route that spends something on
 * each call, as the card quote does, which asks a partner with our key. Stricter than `assertSameOrigin`, which lets
 * through a request that says nothing of where it comes from: here a request must say it comes from this site.
 *
 * A browser says it by itself on every fetch (`Sec-Fetch-Site: same-origin`, Chrome 76, Firefox 90, Safari 16.4);
 * an older one sends the page's address as the referer of a request to its own site, and that is taken instead. An
 * `Origin` that is another site's refuses whatever else is said. A program that writes these headers itself is not
 * stopped by this: the route's own limit by address is what bounds it.
 */
export function askedFromOurOwnPage(request: Request): boolean {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = (forwardedHost || request.headers.get("host") || "").toLowerCase();
  if (!host) return false;
  const hostOf = (address: string | null): string | null => {
    if (!address) return null;
    try {
      return new URL(address).host.toLowerCase();
    } catch {
      return "";
    }
  };
  const origin = hostOf(request.headers.get("origin"));
  if (origin !== null && origin !== host) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin";
  return hostOf(request.headers.get("referer")) === host;
}
