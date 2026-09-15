import type { CSSProperties, ReactElement } from "react";
import { Drop } from "@/app/components/Drop";
import { anton, bagelFatOne, dmSans, figtree, fraunces, manrope, nunito, unbounded } from "./fonts";

/**
 * Four throwaway directions for the top of the signed-out home, made to be looked at and chosen between, never
 * shipped as they are. The words are the real home's, word for word, so the look is the only thing that changes
 * from one to the next. The colours are written here rather than taken from the tokens on purpose: each direction
 * is a proposal for the tokens, not a use of them.
 */

const TITLE = "The money is already in their name";
const PROMISE =
  "Put money behind someone's goal. It becomes theirs as they make verified progress, and whatever they do not earn comes back to you. Nobody profits from anyone failing.";
const ACTION = "Offer a gift";

/** The frame the four share: the words first on a phone, the words beside the visual from 840 pixels. */
const FRAME =
  "mx-auto grid max-w-[1240px] gap-8 px-5 pt-9 pb-16 [@media(min-width:840px)]:grid-cols-[1.2fr_1fr] [@media(min-width:840px)]:items-center [@media(min-width:840px)]:gap-12 [@media(min-width:840px)]:px-12 [@media(min-width:840px)]:pt-20";
const WORDS = "flex flex-col items-start gap-5";

/** A star or a starburst as one closed path: outer and inner points in turn around a centre. */
function burst(cx: number, cy: number, outer: number, inner: number, spikes: number): string {
  const points = Array.from({ length: spikes * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI * index) / spikes - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${points.join(" L")}Z`;
}

/** 1. Poster and stickers: the reference's own voice, a huge condensed title and stickers stuck on at an angle. */
function PosterStickers(): ReactElement {
  const ink = "#3B0A2A";
  return (
    <main className={`${dmSans.className} min-h-dvh overflow-hidden bg-[#FFF3D9] text-[#3B0A2A]`}>
      <div className={FRAME}>
        <section className={WORDS}>
          <h1 className={`${anton.className} text-[64px] leading-[0.92] [@media(min-width:840px)]:text-[112px]`}>{TITLE}</h1>
          <p data-part="promise" className="max-w-[34ch] text-[17px] leading-[1.5] font-medium [@media(min-width:840px)]:text-[20px]">
            {PROMISE}
          </p>
          <span
            data-part="action"
            className={`${anton.className} mt-2 inline-flex h-[60px] items-center rounded-full border-2 border-[#3B0A2A] bg-[#FF5A36] px-9 text-[24px] shadow-[0_6px_0_#3B0A2A]`}
          >
            {ACTION}
          </span>
        </section>
        <svg aria-hidden focusable="false" viewBox="0 0 400 380" className="mx-auto w-full max-w-[440px]">
          <g transform="rotate(-10 130 130)">
            <path d={burst(130, 130, 96, 76, 24)} fill="#FFD84D" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
            <path
              d="M130 162c-34-22-44-40-34-56 9-14 27-12 34 4 7-16 25-18 34-4 10 16 0 34-34 56Z"
              fill="#FF5A36"
              stroke={ink}
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </g>
          <g transform="rotate(9 290 120)">
            <path
              d="M246 78c10-34 70-40 86-6 34 2 44 50 14 66 6 34-40 54-64 30-30 14-68-10-56-44-26-14-14-54 20-46Z"
              fill="#F7B7D8"
              stroke={ink}
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path d={burst(290, 118, 30, 13, 5)} fill="#FFF3D9" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
          </g>
          <g transform="rotate(-6 260 290)">
            <rect x="150" y="238" width="220" height="104" rx="52" fill="#BDEBC8" stroke={ink} strokeWidth="3" />
            <circle cx="206" cy="290" r="30" fill="#FF5A36" stroke={ink} strokeWidth="3" />
            <circle cx="206" cy="290" r="16" fill="none" stroke={ink} strokeWidth="3" />
            <circle cx="276" cy="290" r="30" fill="#FFD84D" stroke={ink} strokeWidth="3" />
            <circle cx="276" cy="290" r="16" fill="none" stroke={ink} strokeWidth="3" />
          </g>
          <g transform="translate(70 300)">
            {[0, 1, 2, 3, 4, 5].map((petal) => (
              <circle
                key={petal}
                cx={(28 * Math.cos((petal * Math.PI) / 3)).toFixed(1)}
                cy={(28 * Math.sin((petal * Math.PI) / 3)).toFixed(1)}
                r="22"
                fill="#C9C6FF"
                stroke={ink}
                strokeWidth="3"
              />
            ))}
            <circle r="16" fill="#FFF3D9" stroke={ink} strokeWidth="3" />
          </g>
        </svg>
      </div>
    </main>
  );
}

/** 2. A round world in the sun: LocoRoco's principles, fat round letters, soft hills and one drop, never its characters. */
function SunnyHills(): ReactElement {
  const ink = "#2B1600";
  const flowers = [
    { x: 70, y: 262, colour: "#FF5FA2" },
    { x: 112, y: 300, colour: "#FFFFFF" },
    { x: 300, y: 292, colour: "#FF3B30" },
    { x: 338, y: 256, colour: "#FF5FA2" },
    { x: 214, y: 344, colour: "#FFFFFF" },
  ];
  return (
    <main className={`${nunito.className} min-h-dvh overflow-hidden bg-[#FFD23F] text-[#2B1600]`}>
      <div className={FRAME}>
        <section className={WORDS}>
          <h1 className={`${bagelFatOne.className} text-[46px] leading-[1.02] [@media(min-width:840px)]:text-[84px]`}>{TITLE}</h1>
          <p data-part="promise" className="max-w-[36ch] text-[18px] leading-[1.5] font-semibold [@media(min-width:840px)]:text-[21px]">
            {PROMISE}
          </p>
          <span
            data-part="action"
            className="mt-1 inline-flex h-[62px] items-center rounded-full bg-[#D6006F] px-9 text-[21px] font-extrabold text-white shadow-[0_6px_0_#8A0048]"
          >
            {ACTION}
          </span>
        </section>
        <div className="relative mx-auto w-full max-w-[440px]" style={{ "--accent": "#FF7A3D", "--text": ink } as CSSProperties}>
          <svg aria-hidden focusable="false" viewBox="0 0 400 400" className="w-full">
            <defs>
              <clipPath id="round-world">
                <circle cx="200" cy="200" r="188" />
              </clipPath>
            </defs>
            <circle cx="200" cy="200" r="188" fill="#8FD8FF" />
            <g clipPath="url(#round-world)">
              <circle cx="306" cy="104" r="40" fill="#FFF3B0" />
              <ellipse cx="96" cy="326" rx="200" ry="112" fill="#7BD66B" />
              <ellipse cx="336" cy="344" rx="210" ry="124" fill="#3CB85C" />
              <ellipse cx="200" cy="430" rx="260" ry="120" fill="#2E9E4A" />
              {flowers.map((flower) => (
                <g key={`${flower.x}-${flower.y}`}>
                  <circle cx={flower.x} cy={flower.y} r="13" fill={flower.colour} stroke={ink} strokeWidth="3" />
                  <circle cx={flower.x} cy={flower.y} r="4.5" fill="#FFD23F" />
                </g>
              ))}
            </g>
            <circle cx="200" cy="200" r="188" fill="none" stroke={ink} strokeWidth="4" />
          </svg>
          <div className="absolute top-[34%] left-1/2 -translate-x-1/2">
            <Drop mood="cheering" size={132} />
          </div>
        </div>
      </div>
    </main>
  );
}

/** 3. A party at night: the dark ground makes the lime button the brightest thing on the screen. */
function NightParty(): ReactElement {
  const confetti = [
    { x: 58, y: 70, r: 9, colour: "#FF5FA2" },
    { x: 352, y: 64, r: 7, colour: "#C6FF4D" },
    { x: 34, y: 250, r: 6, colour: "#8B6CFF" },
    { x: 372, y: 300, r: 10, colour: "#FFD84D" },
    { x: 96, y: 364, r: 7, colour: "#C6FF4D" },
    { x: 318, y: 372, r: 6, colour: "#FF5FA2" },
  ];
  return (
    <main className={`${manrope.className} min-h-dvh overflow-hidden bg-[#1C1035] text-[#FFF6E9]`}>
      <div className={FRAME}>
        <section className={WORDS}>
          <h1 className={`${unbounded.className} text-[34px] leading-[1.12] font-bold [@media(min-width:840px)]:text-[64px]`}>{TITLE}</h1>
          <p data-part="promise" className="max-w-[38ch] text-[17px] leading-[1.6] font-medium [@media(min-width:840px)]:text-[19px]">
            {PROMISE}
          </p>
          <span
            data-part="action"
            className={`${unbounded.className} mt-2 inline-flex h-[60px] items-center rounded-full bg-[#C6FF4D] px-8 text-[18px] font-semibold text-[#1C1035] shadow-[0_0_0_4px_#1C1035,0_0_0_6px_#C6FF4D]`}
          >
            {ACTION}
          </span>
        </section>
        <svg aria-hidden focusable="false" viewBox="0 0 400 400" className="mx-auto w-full max-w-[440px]">
          <defs>
            <radialGradient id="night-glow">
              <stop offset="0%" stopColor="#8B6CFF" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#1C1035" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="200" cy="200" r="200" fill="url(#night-glow)" />
          <circle cx="200" cy="200" r="164" fill="none" stroke="#8B6CFF" strokeWidth="20" />
          <circle cx="200" cy="200" r="126" fill="none" stroke="#FF5FA2" strokeWidth="20" />
          <circle cx="200" cy="200" r="88" fill="none" stroke="#C6FF4D" strokeWidth="20" />
          <circle cx="200" cy="200" r="54" fill="#FFF6E9" />
          <path d="M200 204c-18-30-50-30-50-8 0 18 30 20 50 8Z" fill="#FF5FA2" />
          <path d="M200 204c18-30 50-30 50-8 0 18-30 20-50 8Z" fill="#FF5FA2" />
          <circle cx="200" cy="202" r="9" fill="#8B6CFF" />
          {confetti.map((dot) => (
            <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.colour} />
          ))}
        </svg>
      </div>
    </main>
  );
}

/** 4. Cut paper: a soft serif and layered paper shapes, for a gift of real money that should feel considered. */
function PaperCut(): ReactElement {
  return (
    <main className={`${figtree.className} min-h-dvh overflow-hidden bg-[#DDF5E6] text-[#10261A]`}>
      <div className={FRAME}>
        <section className={WORDS}>
          <h1
            className={`${fraunces.className} text-[48px] leading-[1.02] font-semibold [@media(min-width:840px)]:text-[88px]`}
            style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
          >
            {TITLE}
          </h1>
          <p data-part="promise" className="max-w-[36ch] text-[18px] leading-[1.55] [@media(min-width:840px)]:text-[20px]">
            {PROMISE}
          </p>
          <span
            data-part="action"
            className="mt-2 inline-flex h-[60px] items-center rounded-full bg-[#6B3FD1] px-9 text-[19px] font-bold text-white shadow-[0_3px_0_#10261A,0_14px_24px_rgba(16,38,26,0.18)]"
          >
            {ACTION}
          </span>
        </section>
        <svg aria-hidden focusable="false" viewBox="0 0 400 400" className="mx-auto w-full max-w-[440px]">
          <defs>
            {/* In the drawing's own units, so a small shape's shadow is never cut into a square by a region sized to that shape. */}
            <filter id="paper-layer" filterUnits="userSpaceOnUse" x="-20" y="-20" width="440" height="460">
              <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#10261A" floodOpacity="0.2" />
            </filter>
          </defs>
          <path
            d="M72 150c-8-70 70-112 136-96 70-30 150 20 136 96 40 54 10 150-70 156-50 44-150 38-178-24-60-24-66-110-24-132Z"
            fill="#FFD84D"
            filter="url(#paper-layer)"
          />
          <rect x="104" y="186" width="192" height="150" rx="34" fill="#FF8A65" filter="url(#paper-layer)" />
          <rect x="88" y="150" width="224" height="58" rx="29" fill="#FFB59E" filter="url(#paper-layer)" />
          <rect x="186" y="150" width="28" height="186" rx="10" fill="#6B3FD1" />
          <ellipse cx="170" cy="134" rx="36" ry="22" transform="rotate(-24 170 134)" fill="#6B3FD1" filter="url(#paper-layer)" />
          <ellipse cx="230" cy="134" rx="36" ry="22" transform="rotate(24 230 134)" fill="#6B3FD1" filter="url(#paper-layer)" />
          <circle cx="200" cy="146" r="14" fill="#8C63F0" />
          <circle cx="66" cy="96" r="14" fill="#FF8A65" filter="url(#paper-layer)" />
          <circle cx="340" cy="330" r="18" fill="#FFFFFF" filter="url(#paper-layer)" />
          <path d={burst(338, 92, 22, 10, 5)} fill="#FFFFFF" filter="url(#paper-layer)" />
        </svg>
      </div>
    </main>
  );
}

/** The four, by the number in the address. */
export const DIRECTIONS: Readonly<Record<string, () => ReactElement>> = {
  "1": PosterStickers,
  "2": SunnyHills,
  "3": NightParty,
  "4": PaperCut,
};
