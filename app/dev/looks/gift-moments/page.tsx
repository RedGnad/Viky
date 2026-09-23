import type { Metadata } from "next";
import Link from "next/link";
import { requireLab } from "../lab";
import { LAB_METADATA } from "../LabFrame";
import { momentsOf, READERS, SHAPES, exampleId } from "./examples";

export const metadata: Metadata = { ...LAB_METADATA, title: "A gift's page, every moment (dev)" };

/** Every moment of a gift's page, for every reader, one link each (V4, document J, section 3). Example data only. */
export default async function Page() {
  await requireLab();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <p className="text-sm">Example data. Nothing here is anybody&apos;s gift. Each link is the production page drawn from a made-up status.</p>
      {SHAPES.map((shape) => (
        <section key={shape} className="space-y-2">
          <h2 className="text-lg font-semibold">{shape}</h2>
          {momentsOf(shape).map((moment) => (
            <p key={moment} className="text-sm">
              {moment}:{" "}
              {READERS.map((reader) => (
                <Link key={reader} href={`/dev/looks/gift-moments/${exampleId(shape, moment, reader)}`} className="mr-3 underline">
                  {reader}
                </Link>
              ))}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
