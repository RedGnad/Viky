/**
 * The laboratory's own words: the few sentences its screens need that no product screen says yet, and the labels of
 * the laboratory itself. The screens quote src/sentences.ts and the register for everything else, so a look is judged
 * on the product's real words.
 */
export const LAB = {
  /** Brief, section 7: one button for both, because some people are unsure whether they have an account (FIDO). */
  signInOrCreate: "Sign in or create account",
  /** Brief, section 7: the page without an account shows a real gift card, labelled as one. */
  example: "Example",
  /** Brief, section 8: at display size the symbol and the number; "about", the rate's date and the dollars go here. */
  rateCaption: (date: string, dollars: string) => `About, at the rate of ${date}: ${dollars}`,
  title: "Looks laboratory",
  exampleData: "Example data. Nothing here is anybody's gift, and no amount here is real.",
  day: "Day",
  night: "Night",
  device: "As the device",
  motion: "Motion",
  replayArrival: "Replay arrival",
} as const;
