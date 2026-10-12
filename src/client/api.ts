/** Browser-side calls to Viky's own routes: same origin, cookie included, typed refusals surfaced. */

import { GENERIC_FAILURE, NO_ANSWER_AFTER_SENDING } from "../generic-failure";
import { withTheLimitSaid } from "./limit";

export type ApiFailure = Readonly<{ status: number; code: string; message: string; detail?: string }>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Technical text the server sends only to one of our own accounts, never to a person using Viky. */
  readonly detail?: string;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = "ApiError";
    this.status = failure.status;
    this.code = failure.code;
    this.detail = failure.detail;
  }
}

/**
 * A request that moves money left, and no answer of its route came back (the founder, 12 Oct 2026): the connection
 * dropped, or a gateway answered in the route's place. Raised by `postJsonThatMoves` alone, and by the browser's own
 * send of the chain's coin once it is out (src/client/onchain.ts). Its sentence says neither that it was done nor
 * that nothing was taken.
 */
export class NoAnswer extends ApiError {
  constructor(status = 0) {
    super({ status, code: "NO_ANSWER", message: NO_ANSWER_AFTER_SENDING });
    this.name = "NoAnswer";
  }
}

/**
 * `postJson` for a request that moves money. It differs in one thing: a request that left and brought back no answer
 * of the route is `NoAnswer`, never a failure a screen would read as "nothing was taken". That is a connection that
 * dropped, and an answer that carries no body of the route's (a gateway's page, an answer cut short). A refusal the
 * route wrote comes back as it always did, with its code and its sentence.
 */
export async function postJsonThatMoves<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new NoAnswer();
  }
  return unwrap<T>(response, true);
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap<T>(response);
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap<T>(response);
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  return unwrap<T>(response);
}

export async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "DELETE", credentials: "same-origin" });
  return unwrap<T>(response);
}

async function unwrap<T>(response: Response, moves = false): Promise<T> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  // No body of the route's on a request that moves money: whatever answered, the route did not.
  if (moves && data === null) throw new NoAnswer(response.status);
  if (!response.ok) {
    const failure = (data ?? {}) as { error?: string; code?: string; detail?: string };
    throw new ApiError({
      status: response.status,
      // A route that refuses for too many attempts says so in a sentence and, on most of them, with no code: it is
      // named here, so that no screen takes it for a failure and says something else in its place (12 Oct 2026).
      code: failure.code ?? (response.status === 401 ? "SIGN_IN_REQUIRED" : response.status === 429 ? "RATE_LIMITED" : "FAILED"),
      message: failure.error ?? GENERIC_FAILURE,
      detail: failure.detail,
    });
  }
  // A reading refused for the month's limit says so in this reader's clock (src/client/limit.ts).
  return withTheLimitSaid(data as T);
}
