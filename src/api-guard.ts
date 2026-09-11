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
