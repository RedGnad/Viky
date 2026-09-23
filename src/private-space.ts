import { tidyGiftName } from "./gift-names";

/**
 * The funder's private space: their people, the nickname they give each one, and their own notes (Mera's "One
 * Passkey, Many Keys"). It is sealed in the browser with a key derived from the funder's passkey under its own salt,
 * so the server keeps something it cannot read, and the same passkey opens it on any device it is synced to.
 *
 * Two shapes live here, and the server only ever sees the second:
 * - `PrivateSpace`, what the funder reads and writes, in the clear, in the page only;
 * - `SealedSpace`, the envelope the server stores: a version, a nonce and a ciphertext, nothing else.
 *
 * The first name written on a gift is not in here: it stays in clear on the gift, where the recipient reads it.
 */

/** The label the PRF salt is the SHA-256 of. A different label is an unrelated key, so this never changes. */
export const PRIVATE_SPACE_SALT_LABEL = "viky:private:v1";
/** What the AES key is derived for (HKDF info), so the same PRF output could never key anything else by accident. */
export const PRIVATE_SPACE_KEY_INFO = "viky.private.v1.aes-256-gcm";

export const NICKNAME_MAX_LENGTH = 40;
export const NOTES_MAX_LENGTH = 2_000;
export const PEOPLE_MAX = 60;
/** Base64url of the largest space the limits above allow, with room for JSON and the GCM tag. */
export const SEALED_CIPHERTEXT_MAX_LENGTH = 32_000;

export type Person = Readonly<{ nickname: string }>;
export type PrivateSpace = Readonly<{ version: 1; people: Readonly<Record<string, Person>>; notes: string }>;
export type SealedSpace = Readonly<{ version: 1; nonce: string; ciphertext: string }>;

export const EMPTY_SPACE: PrivateSpace = { version: 1, people: {}, notes: "" };

/** One person, whatever the case or the spaces a gift's first name was typed with. */
export function personKey(firstName: string): string {
  return tidyGiftName(firstName).toLocaleLowerCase("en");
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** What the server accepts to keep: the envelope's shape and size, never its content, which it cannot read. */
export function parseSealedSpace(value: unknown): SealedSpace | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { version, nonce, ciphertext } = value as Record<string, unknown>;
  if (version !== 1) return undefined;
  if (typeof nonce !== "string" || nonce.length !== 16 || !BASE64URL.test(nonce)) return undefined;
  if (typeof ciphertext !== "string" || ciphertext.length < 22 || ciphertext.length > SEALED_CIPHERTEXT_MAX_LENGTH || !BASE64URL.test(ciphertext)) return undefined;
  return { version: 1, nonce, ciphertext };
}

/** What a decrypted space may hold. Anything else in it is dropped, and a space that is not one is refused. */
export function parsePrivateSpace(value: unknown): PrivateSpace | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { version, people, notes } = value as Record<string, unknown>;
  if (version !== 1 || typeof notes !== "string" || !people || typeof people !== "object") return undefined;
  const kept: Record<string, Person> = {};
  for (const [key, person] of Object.entries(people as Record<string, unknown>).slice(0, PEOPLE_MAX)) {
    const nickname = (person as { nickname?: unknown } | null)?.nickname;
    if (typeof nickname !== "string") continue;
    const tidy = tidyNickname(nickname);
    if (tidy) kept[personKey(key)] = { nickname: tidy };
  }
  return { version: 1, people: kept, notes: notes.slice(0, NOTES_MAX_LENGTH) };
}

export function tidyNickname(value: string): string {
  return [...value.normalize("NFC").replace(/\s+/g, " ").trim()].slice(0, NICKNAME_MAX_LENGTH).join("");
}

/**
 * The people a funder sees in their space: the first names of the gifts they funded, then anybody already in the
 * space whose gift is gone from the list, each once, in the order the gifts come.
 */
export function peopleOf(firstNames: readonly (string | null)[], space: PrivateSpace): { key: string; firstName: string; nickname: string }[] {
  const seen = new Map<string, { key: string; firstName: string; nickname: string }>();
  for (const name of firstNames) {
    if (!name) continue;
    const key = personKey(name);
    if (!key || seen.has(key)) continue;
    seen.set(key, { key, firstName: tidyGiftName(name), nickname: space.people[key]?.nickname ?? "" });
  }
  for (const [key, person] of Object.entries(space.people)) {
    if (!seen.has(key)) seen.set(key, { key, firstName: key, nickname: person.nickname });
  }
  return [...seen.values()];
}

/** The space as the funder left it: empty nicknames dropped, the rest tidied, the notes cut to their limit. */
export function spaceFrom(people: readonly { key: string; nickname: string }[], notes: string): PrivateSpace {
  const kept: Record<string, Person> = {};
  for (const person of people.slice(0, PEOPLE_MAX)) {
    const nickname = tidyNickname(person.nickname);
    if (nickname) kept[person.key] = { nickname };
  }
  return { version: 1, people: kept, notes: notes.slice(0, NOTES_MAX_LENGTH) };
}
