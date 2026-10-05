import { CHOICE_GROUPS, liveConditions, type Condition } from "./conditions";
import type { ConditionIcon } from "./condition-icons";

/**
 * What Viky reads, by name, for the band under "Checked, not claimed." on the landing (the founder, 5 Oct 2026).
 * Browser safe.
 *
 * The names are the register's own, never a list written here: one for each line of the sheet where a condition is
 * chosen, with the pictogram that line starts with. A service the chooser lists once is one name here too, its
 * group's (`CHOICE_GROUPS`). Only what is open today is named, so a pictogram has a name here only while an open
 * condition carries it, and a condition that opens tomorrow is named tomorrow.
 */
export type ReadByName = Readonly<{ id: string; icon: ConditionIcon; name: string }>;

export function readByName(among: readonly Condition[] = liveConditions()): readonly ReadByName[] {
  return among.flatMap((option) => {
    if (!option.group) return [{ id: option.id, icon: option.icon, name: option.name }];
    if (among.find((other) => other.group?.id === option.group!.id) !== option) return [];
    return [{ id: option.group.id, icon: option.icon, name: CHOICE_GROUPS[option.group.id].name }];
  });
}

/** The same names in so many rows, each as long as the others or one shorter, in the register's order. */
export function inRows<T>(all: readonly T[], rows: number): readonly (readonly T[])[] {
  const each = Math.ceil(all.length / rows);
  return Array.from({ length: rows }, (_, row) => all.slice(row * each, (row + 1) * each)).filter((row) => row.length > 0);
}
