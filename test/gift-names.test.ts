import assert from "node:assert/strict";
import test from "node:test";
import { GIFT_NAME_MAX_LENGTH, giftNameProblem, tidyGiftName } from "../src/gift-names";

/**
 * The two names of a gift (the founder's decision of 17 Sep 2026): the first name of the person it is for, and the
 * funder's name as they know them. Words for people, typed by a person, printed as text.
 */

test("a name people write is accepted, in any script, with the punctuation names carry", () => {
  for (const name of ["Léa", "Maman", "Tom", "Anne-Marie", "O'Neil", "Aïssatou", "Nguyễn Văn", "J. R.", "Zoë", "마리아", "Mamie 2"]) {
    assert.equal(giftNameProblem(name), undefined, name);
  }
});

test("an empty name, a name too long for a card, or anything that is not a name is refused by name", () => {
  assert.equal(giftNameProblem(""), "empty");
  assert.equal(giftNameProblem("   "), "empty");
  assert.equal(giftNameProblem("a".repeat(GIFT_NAME_MAX_LENGTH)), undefined);
  assert.equal(giftNameProblem("a".repeat(GIFT_NAME_MAX_LENGTH + 1)), "tooLong");
  for (const name of ["<b>Léa</b>", "Léa​", "https://evil.example", "-Léa", "Léa;", "@lea"]) {
    assert.equal(giftNameProblem(name), "notText", JSON.stringify(name));
  }
});

test("a name is stored as it will be printed: spaces collapsed and trimmed", () => {
  assert.equal(tidyGiftName("  Anne   Marie "), "Anne Marie");
  assert.equal(tidyGiftName("Léa\nMaman"), "Léa Maman", "a line break typed or pasted is a space");
  assert.equal(tidyGiftName("Léa"), "Léa", "composed, so the same name is the same text");
});
