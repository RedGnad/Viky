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

/**
 * Said when a request that moves money left and no answer of its route came back (the founder, 12 Oct 2026): the
 * connection dropped on the way, or something between answered in the route's place. Whether the money moved is not
 * known then, so neither "done" nor "nothing was taken" is said: the person is told what was not heard, and to look
 * before sending again. Before the request leaves (a signature refused, say) nothing can have moved, and the screen's
 * own sentence stands.
 */
export const NO_ANSWER_AFTER_SENDING = "Viky got no answer. Check your balance in a minute before sending again.";
