// The judges page is drawn when the journal cannot be read (the money path audit of 27 Sep 2026): the reliability
// section used to throw without its database, which took the whole page down, in CI and on any database failure.

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JudgesReliability } from "../app/judges/JudgesReliability";

test("without a database the reliability section says the journal could not be read, and does not throw", async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const html = renderToStaticMarkup(await JudgesReliability());
    assert.match(html, /The journal could not be read just now/);
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  }
});
