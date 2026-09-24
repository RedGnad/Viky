import type { Metadata } from "next";
import { Figure, Scene, type ArmsPose, type Eyes, type LegsPose, type Mouth } from "@/app/kit/Figure";
import { forcedAppearance, requireLab } from "../lab";
import { LAB_METADATA, LabFrame } from "../LabFrame";

export const metadata: Metadata = { ...LAB_METADATA, title: "Character sheet (dev)" };

type Props = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

/**
 * The model sheet of the figure (D236): what an animation studio keeps of a character so everybody draws the same
 * one. A turnaround of leans, where the reflections stay with the light; the expressions; the poses; the three
 * destinations' scenes. Served only in the laboratory, as the looks are. `?appearance=day|night` forces one.
 */
const LEANS = [-14, 0, 14];
const EXPRESSIONS: readonly Readonly<{ name: string; eyes: Eyes; mouth: Mouth; gaze?: { x: number; y: number } }>[] = [
  { name: "rest", eyes: "open", mouth: "smile" },
  { name: "joy", eyes: "open", mouth: "grin" },
  { name: "content", eyes: "closed", mouth: "smile" },
  { name: "sleepy", eyes: "half", mouth: "flat" },
  { name: "surprise", eyes: "open", mouth: "o", gaze: { x: 0.4, y: -0.6 } },
  { name: "cool", eyes: "shades", mouth: "grin" },
];
const POSES: readonly Readonly<{ name: string; arms: ArmsPose; legs: LegsPose }>[] = [
  { name: "rest", arms: "rest", legs: "rest" },
  { name: "wave", arms: "wave", legs: "rest" },
  { name: "crossed", arms: "crossed", legs: "apart" },
  { name: "hold", arms: "hold", legs: "rest" },
  { name: "run", arms: "run", legs: "run" },
  { name: "shoulder", arms: "shoulder", legs: "rest" },
];

function Cell({ name, children, wide = false }: Readonly<{ name: string; children: React.ReactNode; wide?: boolean }>) {
  return (
    <figure className={`m-0 flex flex-col items-center gap-2 ${wide ? "col-span-2" : ""}`}>
      <div className={wide ? "w-[300px]" : "w-[150px]"}>{children}</div>
      <figcaption className="text-xs opacity-70">{name}</figcaption>
    </figure>
  );
}

export default async function Page({ searchParams }: Props) {
  await requireLab();
  const appearance = forcedAppearance((await searchParams).appearance);
  return (
    <LabFrame appearance={appearance}>
      <main className="mx-auto max-w-5xl space-y-10 px-4 py-8" data-character-sheet>
        <h1 className="text-2xl font-semibold">The figure, its light, its faces, its poses</h1>
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide opacity-70">Turnaround: the light stays where it is</h2>
          <div className="grid grid-cols-3 gap-6 sm:grid-cols-6">
            {LEANS.map((lean) => (
              <Cell key={lean} name={`lean ${lean}`}>
                <Figure id={`lean${lean}`} lean={lean} />
              </Cell>
            ))}
            {LEANS.map((lean) => (
              <Cell key={`r${lean}`} name={`light from the right, lean ${lean}`}>
                <Figure id={`right${lean}`} lean={lean} light={{ x: 1, y: -1 }} />
              </Cell>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide opacity-70">Expressions</h2>
          <div className="grid grid-cols-3 gap-6 sm:grid-cols-6">
            {EXPRESSIONS.map((face) => (
              <Cell key={face.name} name={face.name}>
                <Figure id={`face-${face.name}`} eyes={face.eyes} mouth={face.mouth} gaze={face.gaze} />
              </Cell>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide opacity-70">Poses</h2>
          <div className="grid grid-cols-3 gap-6 sm:grid-cols-6">
            {POSES.map((pose) => (
              <Cell key={pose.name} name={pose.name}>
                <Figure id={`pose-${pose.name}`} arms={pose.arms} legs={pose.legs} />
              </Cell>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide opacity-70">The three destinations</h2>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Cell name="Home: a suit and a case">
              <Scene which="home" />
            </Cell>
            <Cell name="Gifts: an arm on a shoulder" wide>
              <Scene which="gifts" />
            </Cell>
            <Cell name="Me: arms crossed, shades">
              <Scene which="me" />
            </Cell>
          </div>
        </section>
      </main>
    </LabFrame>
  );
}
