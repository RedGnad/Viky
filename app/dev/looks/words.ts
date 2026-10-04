/**
 * The laboratory's own words: the labels of the laboratory itself, and the one caption no product screen says yet. The
 * screens quote src/sentences.ts and the product's own components for everything else, so a screen is judged on the
 * product's real words.
 */
export const LAB = {
  /** Brief, section 8: at display size the symbol and the number; "about", the rate's date and the dollars go here. */
  title: "Looks laboratory",
  exampleData: "Example data. Nothing here is anybody's gift, and no amount here is real.",
  day: "Day",
  night: "Night",
  device: "As the device",
  motion: "Motion",
  replayArrival: "Replay arrival",
  /** Each movement by itself, to be judged one at a time (the founder, 4 Oct 2026). */
  eachMovement: "Each movement, by itself",
  playAgain: "Play it",
  moments: {
    earned: "A day earned: asleep until its turn, one jump with a small turn, eyes open on the landing.",
    woken: "A day that opens: the sleeping capsule becomes the triangle, then its eyes open.",
    returned: "A day gone back: it slides in from the right and settles.",
    arrival: "Arriving: the days that changed since the last visit, in turn, then the amount.",
    reached: "A gift reached: its moment, over Home.",
  },
  reachedFor: { recipient: "For the person it is for", funder: "For the person who offered it" },
  giftMoments: "A gift's page, state by state",
  character: "The character, pose by pose",
  replayMoment: "Play the moment again",
} as const;
