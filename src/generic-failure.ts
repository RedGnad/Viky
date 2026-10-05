/**
 * The one sentence a failure with nothing to say for itself is given: by the server, for an error that is a library's
 * or the infrastructure's (src/gift-api.ts), and by the browser, for an answer that carries no sentence at all
 * (src/client/api.ts). Browser safe.
 *
 * It is true of a request that did nothing. It is not to be read as it is on a screen where a card payment is waited
 * for or has just arrived (the founder, 5 Oct 2026): there, "Nothing was changed" may be false of the payment, and
 * what is said is what is known (src/after-paying.ts).
 */
export const GENERIC_FAILURE = "Something went wrong. Nothing was changed.";
