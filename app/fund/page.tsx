import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { FundGift } from "../components/FundGift";
import { Screen } from "../components/Screen";
import { Stickers } from "../components/Stickers";

export const metadata: Metadata = {
  title: "Offer a gift",
};

/**
 * A journey: one thing at a time, one way back, a narrow column at every size.
 *
 * Every step of giving is this one page, and it wears the poster look like every screen (D70, D71), its cards drawn
 * as stickers (D73).
 *
 * No title is passed to `Screen`, on purpose, and the reason is a defect I made twice. Each step carries its
 * own heading and its own way back, and `Screen` renders a title above its children, so passing one put the
 * title above the back link. I removed the title, then decided the page had no heading and put it back, which
 * recreated the same defect and shipped it to both hosts before anybody looked. The heading is the step's.
 */
export default function FundPage() {
  return (
    <>
      {/* The look's picture on each side of the column, where a wide screen had only cream. Decoration: it takes no
          pointer, says nothing a screen reader needs, and is not drawn below 1100 pixels, where the column needs the
          room (D73). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-0 hidden w-[calc(50vw_-_var(--app-column-max)/2)] items-center justify-center [@media(min-width:1100px)]:flex"
      >
        <div className="w-[min(340px,80%)] -rotate-6">
          <Stickers />
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 right-0 hidden w-[calc(50vw_-_var(--app-column-max)/2)] items-center justify-center [@media(min-width:1100px)]:flex"
      >
        <div className="w-[min(300px,70%)] rotate-12 -scale-x-100">
          <Stickers />
        </div>
      </div>
      <Screen>
        <FundGift />
        <Footer current="/fund" />
      </Screen>
    </>
  );
}
