import type { Metadata } from "next";
import Link from "next/link";
import { labHref, SCREENS } from "./example";
import { requireLab } from "./lab";
import { LAB_METADATA } from "./LabFrame";
import { LAB } from "./words";

export const metadata: Metadata = { ...LAB_METADATA, title: "Looks laboratory (dev)" };

/**
 * The way in to the laboratory: the six screens on example data, each as the device shows it and each forced to the day
 * and to the night, and the motion. One look now, "Ink and sun", which the product itself wears from app/globals.css.
 * Served only when the design gallery is switched on, which production never does.
 */
export default async function Page() {
  await requireLab();
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <p className="text-sm font-medium">{LAB.exampleData}</p>
        <h1 className="text-2xl font-semibold">{LAB.title}</h1>
      </header>
      <table className="w-full text-sm">
        <tbody>
          {SCREENS.map((screen) => (
            <tr key={screen.id} className="border-t border-current/20">
              <td className="py-2">{screen.name}</td>
              <td className="py-2">
                <Link className="underline" href={labHref(screen.id)}>
                  {LAB.device}
                </Link>
              </td>
              <td className="py-2">
                <Link className="underline" href={`${labHref(screen.id)}?appearance=day`}>
                  {LAB.day}
                </Link>
              </td>
              <td className="py-2">
                <Link className="underline" href={`${labHref(screen.id)}?appearance=night`}>
                  {LAB.night}
                </Link>
              </td>
            </tr>
          ))}
          <tr className="border-t border-current/20">
            <td className="py-2">{LAB.motion}</td>
            <td className="py-2" colSpan={3}>
              <Link className="underline" href={labHref("motion")}>
                {LAB.eachMovement}
              </Link>
            </td>
          </tr>
          {/* Every page of the laboratory is one press from here (the founder, 4 Oct 2026). */}
          <tr className="border-t border-current/20">
            <td className="py-2">{LAB.moments.reached}</td>
            <td className="py-2" colSpan={3}>
              <Link className="underline" href="/dev/looks/reached?who=recipient">
                {LAB.reachedFor.recipient}
              </Link>
              {" · "}
              <Link className="underline" href="/dev/looks/reached?who=funder">
                {LAB.reachedFor.funder}
              </Link>
            </td>
          </tr>
          <tr className="border-t border-current/20">
            <td className="py-2">{LAB.giftMoments}</td>
            <td className="py-2" colSpan={3}>
              <Link className="underline" href="/dev/looks/gift-moments">
                {LAB.giftMoments}
              </Link>
            </td>
          </tr>
          <tr className="border-t border-current/20">
            <td className="py-2">{LAB.character}</td>
            <td className="py-2" colSpan={3}>
              <Link className="underline" href="/dev/looks/character">
                {LAB.character}
              </Link>
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}
