import { headersFor, type AttestedSource } from "./attested-sources";

/**
 * A connected source asked plainly, with the person's key, before a proof is paid for (12 Oct 2026).
 *
 * The first real reading of Strava was refused three times through the attested fetch, and all that was known of it
 * was a status, 403: the reading service's log keeps the first hundred bytes of an answer and no more. The key that
 * opens a connection lives on the server alone (src/connect-vault.ts), so the server is the one place that can ask the
 * source the same question without the attestor and hear the answer whole. It does so here, each time, first: the
 * same address, the same method, the same headers, the person's key.
 *
 * What comes back is one of three things. The source serves the page: the attested read goes, and the page itself is
 * left unread here (the body is dropped, not parsed: what a day holds is judged from the proof, never from a look).
 * The source refuses the reading (403): no proof is asked, and what the source said is kept in a few words for the
 * operator, because a refusal of a connected source is about Viky's application or its key, never about a page the
 * person could have hidden. Anything else, a failure of ours or theirs: no proof either, as for every look that fails
 * (src/daily-look.ts), and the reading is tried again later.
 *
 * Server only. The key is sent to the source and to nobody else: it is in no log line and in no sentence made here.
 */

export type ConnectedLook =
  | Readonly<{ kind: "open" }>
  /** The source answered that this reading is refused (403). `said` is its own answer, in a few words. */
  | Readonly<{ kind: "refused"; status: number; said: string }>
  /** The source did not serve the page for another reason, or did not answer at all. */
  | Readonly<{ kind: "unseen"; status: number | null; said: string }>;

export type LookFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal; cache?: "no-store"; redirect?: "manual" }) => Promise<{ status: number; text(): Promise<string>; body?: { cancel(): Promise<void> } | null }>;

const SAID_AT_MOST = 240;

function short(text: string): string {
  // A key never belongs in what a source said, and is taken out should a source ever echo one.
  return text.replace(/Bearer\s+\S+/gi, "Bearer (key)").replace(/\s+/g, " ").trim().slice(0, SAID_AT_MOST);
}

/**
 * A source's refusal in a few words, from its own answer. Strava answers `{ message, errors: [{ resource, field,
 * code }] }` (its own answers, read 12 Oct 2026), Google `{ error: { status, message } }`; anything else is said as
 * it came, cut short.
 */
export function refusalInWords(body: string): string {
  try {
    const answer = JSON.parse(body) as { message?: unknown; errors?: unknown; error?: unknown };
    if (Array.isArray(answer.errors)) {
      const errors = answer.errors
        .map((one) => {
          const error = (one ?? {}) as Record<string, unknown>;
          return [error.resource, error.field, error.code].filter((part) => typeof part === "string" && part).join(" ");
        })
        .filter(Boolean);
      return short([typeof answer.message === "string" ? answer.message : "", errors.join(", ")].filter(Boolean).join(": "));
    }
    if (answer.error && typeof answer.error === "object") {
      const error = answer.error as Record<string, unknown>;
      return short([error.status, error.message].filter((part) => typeof part === "string" && part).join(": "));
    }
    if (typeof answer.error === "string") return short(answer.error);
    if (typeof answer.message === "string") return short(answer.message);
  } catch {
    // Not JSON: said as it came.
  }
  return short(body);
}

/** The page of a connected source, asked as the attested read asks it, and what the source did with the question. */
export async function lookAtConnectedSource(source: AttestedSource, account: string, bearer: string, fetchLike: LookFetch = fetch as unknown as LookFetch): Promise<ConnectedLook> {
  let response: Awaited<ReturnType<LookFetch>>;
  try {
    response = await fetchLike(source.url(account), {
      method: source.method ?? "GET",
      headers: { ...headersFor(source), ...(source.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${bearer}` },
      ...(source.body ? { body: source.body(account) } : {}),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    return { kind: "unseen", status: null, said: short(error instanceof Error ? `${error.name}: ${error.message}` : String(error)) };
  }
  if (response.status >= 200 && response.status < 300) {
    // The day's page is not read here: nothing of it is wanted before the proof.
    await response.body?.cancel().catch(() => undefined);
    return { kind: "open" };
  }
  const said = refusalInWords(await response.text().catch(() => ""));
  return response.status === 403 ? { kind: "refused", status: 403, said } : { kind: "unseen", status: response.status, said };
}
