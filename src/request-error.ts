/**
 * A refusal of the request itself (malformed body, cross-site call, unreadable contact): typed, with a
 * sentence the person can read, answered as a 4xx. Browser-safe. Anything that is not one of our typed
 * errors is answered with a generic sentence, never with its own text (src/gift-api.ts).
 */
export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 413 | 415 = 400,
  ) {
    super(message);
    this.name = "RequestError";
  }
}
