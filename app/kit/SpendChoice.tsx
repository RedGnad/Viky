"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/src/client/api";
import { faceValue } from "@/src/currencies";
import { surelyOutOfReach } from "@/src/out-of-reach";
import type { Rates } from "@/src/rates";
import { BODY, CARD_AMOUNT, FIELD, HELP, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/ui";
import { Button } from "./Button";
import { StepInProgress, WaitLine } from "./Waiting";

/**
 * Spending from the balance: the amount, its price and the one button, for the gift card and the phone top-up (the
 * founder, 10 Oct 2026, on a mockup, after the first real tester). One rule:
 *
 * - One way to choose at a time. The fixed amounts are buttons; a typed amount stands behind "Another amount", or
 *   alone where the thing bought has no fixed amount.
 * - The price is never a step. It is asked the moment the choice is whole, a button pressed or the typing over, and
 *   shown in place: the total that leaves the account, and one sentence that says what it buys, its fees, and what
 *   stays. There was a press of its own for it, "See the price", and the amount was asked twice.
 * - One currency for the account's money, the one the person reads in (`say`). The thing bought keeps its face value
 *   in its own currency, which is what is printed on it.
 * - One button, and it carries the outcome: its words, then what it is doing, and what did not happen under it. The
 *   first tester pressed it five times: the refusal stood in a quiet line above it, and nothing else had changed.
 *
 * A price that has run out is asked again at once, the choice being still made, and the refusal stays said under the
 * button until the next press.
 */
export type SpendPrice = Readonly<{ ausdUnits: bigint; feeUnits: bigint }>;
export type SpendChosen = Readonly<{ packageId: string } | { value: number }>;

/** How long after the last key a typed amount is taken as said. */
export const TYPED_SETTLES_MS = 700;

export function SpendChoice<P extends SpendPrice>({
  packages,
  range,
  currency,
  held,
  rates,
  say,
  ask,
  total,
  pay,
  refused,
  words,
  numeric = false,
  children,
}: Readonly<{
  /** The fixed amounts of the thing bought, and the range a typed amount must fall in, in its own currency. */
  packages: ReadonlyArray<Readonly<{ id: string; value: string }>>;
  range: Readonly<{ min: number; max: number }> | null;
  currency: string;
  /** What the account holds, to say which amounts are more than that. */
  held: bigint;
  rates?: Rates;
  /** An amount of the account's money, in the currency the person reads in. */
  say: (units: bigint) => string;
  /** Asks the price of what was chosen. Nothing moves. */
  ask: (chosen: SpendChosen) => Promise<P>;
  /** The sentence under the total: what it buys, its fees when it has any, and what stays. */
  total: (price: P, stays: string, fees: string | undefined) => string;
  /** Pays the price. It returns when the screen has moved on, and throws what was refused. */
  pay: (price: P) => Promise<void>;
  /** The sentence for a refusal, or nothing when the refusal closed the session and the screen is leaving. */
  refused: (error: unknown) => string | null;
  words: Readonly<{ another: string; howMuch: string; range: (min: string, max: string) => string; outOfReach: string; asking: string; askingStep: string; confirm: string; confirming: string }>;
  /** A typed amount with no decimals: a phone's keyboard of figures alone. */
  numeric?: boolean;
  /** The small buttons under the one button: another card, back. They are told when a payment is under way. */
  children?: (paying: boolean) => ReactNode;
}>) {
  const [packageId, setPackageId] = useState<string | null>(null);
  // The field is the one way to choose where nothing is fixed, and stands behind "Another amount" where something is.
  const [typing, setTyping] = useState(packages.length === 0);
  const [typed, setTyped] = useState("");
  const [price, setPrice] = useState<P | null>(null);
  const [asking, setAsking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /** Each asking has its turn: an answer to a choice since changed is dropped. */
  const turn = useRef(0);
  /** The field is why "Another amount" was pressed: the keyboard comes with it. Alone on the card, it waits. */
  const field = useRef<HTMLInputElement>(null);
  const pressedAnother = useRef(false);
  useEffect(() => {
    if (!typing || !pressedAnother.current) return;
    pressedAnother.current = false;
    field.current?.focus();
  }, [typing]);

  const value = Number(typed.replace(/\s/g, "").replace(",", "."));
  const fits = typing && range !== null && typed.trim() !== "" && Number.isFinite(value) && value >= range.min && value <= range.max;
  const far = fits && surelyOutOfReach(value, currency, held, rates);

  const priceOf = async (chosen: SpendChosen, keepsTheRefusal = false) => {
    const mine = ++turn.current;
    setPrice(null);
    if (!keepsTheRefusal) setFailed(null);
    setAsking(true);
    try {
      const answered = await ask(chosen);
      if (turn.current === mine) setPrice(answered);
    } catch (error) {
      if (turn.current === mine) setFailed(refused(error));
    } finally {
      if (turn.current === mine) setAsking(false);
    }
  };

  /** Nothing is chosen any more: no price stands, and none is on its way. */
  const unchoose = () => {
    turn.current += 1;
    setPrice(null);
    setAsking(false);
    setFailed(null);
  };

  // A typed amount is asked once the typing is over, and only one that can be bought.
  useEffect(() => {
    if (!fits || far) return;
    const timer = window.setTimeout(() => void priceOf({ value }), TYPED_SETTLES_MS);
    return () => window.clearTimeout(timer);
    // The amount is the whole of what this waits on: `priceOf` is made anew at each render and asks the same thing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fits, far]);

  const chosen: SpendChosen | null = packageId ? { packageId } : fits && !far ? { value } : null;

  const press = async () => {
    if (!price) return;
    setPaying(true);
    setFailed(null);
    try {
      await pay(price);
    } catch (error) {
      setFailed(refused(error));
      // A price that ran out bought nothing and cannot be pressed again: the same choice is priced anew at once.
      if (error instanceof ApiError && error.code === "PRICE_EXPIRED" && chosen) void priceOf(chosen, true);
    } finally {
      setPaying(false);
    }
  };

  const busy = paying;
  return (
    <>
      {packages.length > 0 ? (
        <div className="flex flex-wrap gap-[var(--tap-gap)]" data-spend-amounts="">
          {packages.map((one) => {
            // Its face value alone is more than they hold: shown, never hidden, and said why it cannot be chosen.
            const beyond = surelyOutOfReach(Number(one.value), currency, held, rates);
            const pressed = one.id === packageId;
            return (
              <button
                key={one.id}
                type="button"
                aria-pressed={pressed}
                disabled={busy || beyond}
                className={`${pressed ? PRIMARY_BUTTON : SECONDARY_BUTTON} spend-amount flex-col gap-0`}
                onClick={() => {
                  setPackageId(one.id);
                  setTyping(false);
                  setTyped("");
                  void priceOf({ packageId: one.id });
                }}
              >
                {faceValue(Number(one.value), currency)}
                {beyond ? <span className="block text-[length:var(--type-help)]">{words.outOfReach}</span> : null}
              </button>
            );
          })}
          {range ? (
            <button
              type="button"
              aria-pressed={typing}
              disabled={busy}
              className={`${typing ? PRIMARY_BUTTON : SECONDARY_BUTTON} spend-amount`}
              onClick={() => {
                pressedAnother.current = true;
                setPackageId(null);
                setTyping(true);
                unchoose();
              }}
            >
              {words.another}
            </button>
          ) : null}
        </div>
      ) : null}
      {typing && range ? (
        <label className="flex flex-col gap-[var(--space-xs)]">
          <span className={BODY}>{words.howMuch}</span>
          <input
            value={typed}
            inputMode={numeric ? "numeric" : "decimal"}
            className={FIELD}
            disabled={busy}
            ref={field}
            onChange={(event) => {
              setTyped(event.target.value);
              unchoose();
            }}
          />
          <span className={HELP}>{words.range(faceValue(range.min, currency), faceValue(range.max, currency))}</span>
          {far ? <span className={HELP}>{words.outOfReach}</span> : null}
        </label>
      ) : null}
      {asking ? (
        <div data-spend-asking="" className="border-t border-[var(--divider)] pt-[var(--space-md)]">
          <WaitLine>{words.asking}</WaitLine>
          <StepInProgress busy step={words.askingStep} />
        </div>
      ) : null}
      {price && !asking ? (
        <div data-spend-total="" className="flex flex-col gap-[var(--space-xs)] border-t border-[var(--divider)] pt-[var(--space-md)]">
          <p className={CARD_AMOUNT}>{say(price.ausdUnits)}</p>
          <p className={HELP}>{total(price, say(held > price.ausdUnits ? held - price.ausdUnits : 0n), price.feeUnits > 0n ? say(price.feeUnits) : undefined)}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-[var(--space-sm)]">
        <Button doing={paying ? words.confirming : null} waiting={!price || asking} failed={failed} failedId="spend-refused" onPress={() => void press()} data-spend-pay="">
          {words.confirm}
        </Button>
      </div>
      {children ? <div className="flex flex-wrap gap-[var(--tap-gap)]">{children(paying)}</div> : null}
    </>
  );
}
