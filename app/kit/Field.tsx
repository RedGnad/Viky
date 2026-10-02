import { FIELD, HELP } from "../components/ui";
import { FieldRefusal } from "./FieldRefusal";

/**
 * A line somebody types into: its label, one line of help under it when the question needs one, and its refusal under
 * the field in cause (rule F of the specification; GOV.UK: "Show the error message next to the field it relates to").
 *
 * The help is one line under the field, 60 characters at most (the founder's rule 4 of 1 Oct 2026): whoever draws the
 * field cuts a longer help with `helpLine` (src/help-line.ts) and puts the rest in a fold. It stood above the field,
 * whole, until then. An example of what to type is the field's own placeholder, not a sentence about it.
 *
 * It lived inside the funder's old assistant until 19 Sep 2026 and is in the kit now, because the sheets of the card
 * and the payment screen both ask questions and a field that looked slightly different in each would be two fields.
 */
export function Field({
  id,
  label,
  labelHidden = false,
  help,
  placeholder,
  value,
  onChange,
  onBlur,
  refusal,
  inputMode,
  autoComplete,
  spellCheck,
}: Readonly<{
  id: string;
  label: string;
  labelHidden?: boolean;
  help?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  refusal?: string;
  inputMode?: "decimal" | "numeric";
  autoComplete?: string;
  spellCheck?: boolean;
}>) {
  const described = [help ? `${id}-help` : "", refusal ? `${id}-refusal` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-[var(--space-xs)]">
      <label htmlFor={id} className={labelHidden ? "sr-only" : "font-medium"}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        inputMode={inputMode}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        aria-invalid={refusal ? true : undefined}
        aria-describedby={described}
        className={`${FIELD} placeholder:text-[var(--waiting-ink)] ${refusal ? "border-[3px]" : ""}`}
      />
      {help ? (
        <p id={`${id}-help`} className={HELP}>
          {help}
        </p>
      ) : null}
      <FieldRefusal id={`${id}-refusal`}>{refusal}</FieldRefusal>
    </div>
  );
}
