import type { Metadata } from "next";
import Link from "next/link";
import { LOOKS } from "@/src/design-tokens";
import { labHref, SCREENS } from "./example";
import { requireLab } from "./lab";
import { LAB_METADATA } from "./LabFrame";
import { LAB } from "./words";

export const metadata: Metadata = { ...LAB_METADATA, title: "Looks laboratory (dev)" };

/**
 * The way in to the laboratory (art direction brief, section 9): three looks, the same six screens in each, on example
 * data, and each look's motion. Served only when the design gallery is switched on, which production never does.
 */
export default async function Page() {
  await requireLab();
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <p className="text-sm font-medium">{LAB.exampleData}</p>
        <h1 className="text-2xl font-semibold">{LAB.title}</h1>
      </header>
      {LOOKS.map((look) => (
        <section key={look.id} className="space-y-3">
          <h2 className="text-lg font-semibold">
            {look.number}. {look.name}
          </h2>
          <p className="text-sm">{look.intention}</p>
          <table className="w-full text-sm">
            <tbody>
              {SCREENS.map((screen) => (
                <tr key={screen.id} className="border-t border-current/20">
                  <td className="py-2">{screen.name}</td>
                  <td className="py-2">
                    <Link className="underline" href={labHref(look.id, screen.id)}>
                      {LAB.device}
                    </Link>
                  </td>
                  <td className="py-2">
                    <Link className="underline" href={`${labHref(look.id, screen.id)}?appearance=day`}>
                      {LAB.day}
                    </Link>
                  </td>
                  <td className="py-2">
                    <Link className="underline" href={`${labHref(look.id, screen.id)}?appearance=night`}>
                      {LAB.night}
                    </Link>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-current/20">
                <td className="py-2">{LAB.motion}</td>
                <td className="py-2" colSpan={3}>
                  <Link className="underline" href={labHref(look.id, "motion")}>
                    {LAB.motion}
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
