/**
 * The laboratory's own words: the labels of the laboratory itself, and the one caption no product screen says yet. The
 * screens quote src/sentences.ts and the product's own components for everything else, so a screen is judged on the
 * product's real words.
 */
export const LAB = {
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
