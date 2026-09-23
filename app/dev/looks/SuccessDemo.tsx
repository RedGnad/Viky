"use client";
import { useState } from "react";
import { Character } from "@/app/kit/Character";
import { Gaze, Success } from "@/app/kit/Motion";
import { PRIMARY_BUTTON } from "@/app/components/ui";

/**
 * The success of a gesture, on the motion page: the press on the primary action is what brings the gift character, once
 * per press. In the product the press also moves money and opens the next screen; here it only answers.
 */
export function SuccessDemo({ label }: Readonly<{ label: string }>) {
  const [presses, setPresses] = useState(0);
  return (
    <>
      <div className="flex min-h-[132px] items-center justify-center">
        {presses > 0 ? (
          <Success gesture={presses}>
            <Gaze>
              <Character drawn="inline" state="gift" className="h-auto w-[112px]" />
            </Gaze>
          </Success>
        ) : null}
      </div>
      <button type="button" data-success-demo onClick={() => setPresses((count) => count + 1)} className={PRIMARY_BUTTON}>
        {label}
      </button>
    </>
  );
}
