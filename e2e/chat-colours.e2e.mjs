// Workflow 19: every kind of element the chat can show stays readable on every site, in
// the light and the dark theme. chat-gallery.js draws them all into the real chat (the
// runtime's own renderers and markup) and measures each piece of text against what is
// behind it.
import { readFile } from "node:fs/promises";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const GALLERY = readFile(new URL("./chat-gallery.js", import.meta.url), "utf8");

test("19. Every element the chat can show is readable on every site, in the light and the dark theme", async ({ app, browser }) => {
  const source = await GALLERY;
  const results = [];
  for (const url of ["/", "http://localhost:8081/", "http://localhost:8082/"]) {
    await app.open(url);
    for (const theme of ["light", "dark"]) {
      const {checked, failures} = await browser.evaluate(`(${source})(${JSON.stringify(theme)})`);
      results.push({url, theme, checked, failures});
    }
  }
  for (const result of results) {
    // Enough text was checked for the gallery to have drawn.
    expect(result.checked).toBeGreaterThan(80);
  }
  expect(results.filter((result) => result.failures.length).map(({url, theme, failures}) => ({url, theme, failures}))).toEqual([]);
});
