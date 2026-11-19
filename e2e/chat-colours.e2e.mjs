// Workflow 19: every kind of element the chat can show stays readable on every site, in
// the light and the dark theme. chat-gallery.js draws them all into the real chat (the
// runtime's own renderers and markup) and measures each piece of text against what is
// behind it.
import { readFile } from "node:fs/promises";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const GALLERY = readFile(new URL("./chat-gallery.js", import.meta.url), "utf8");

test("19. Every element the chat can show is readable on every site, in the light and the dark theme, and consent cards match", async ({ app, browser }) => {
  const source = await GALLERY;
  const results = [];
  const cards = [];
  for (const url of ["/", "http://localhost:8081/", "http://localhost:8082/"]) {
    await app.open(url);
    for (const theme of ["light", "dark"]) {
      const {checked, failures} = await browser.evaluate(`(${source})(${JSON.stringify(theme)})`);
      results.push({url, theme, checked, failures});
      // Consent cards: one width whatever their text, and a decline in red, not the allow's green.
      cards.push(await browser.evaluate(() => {
        const all = [...document.querySelectorAll("#ns-msgs .ns-consent.gallery")];
        const colour = (card) => getComputedStyle(card.querySelector(".ns-consent-done")).color.match(/\d+/g).map(Number);
        const declined = all.find((card) => card.dataset.decision === "decline");
        const allowed = all.find((card) => card.querySelector(".ns-consent-done") && card !== declined);
        const [r, g] = colour(declined);
        return {widths: [...new Set(all.map((card) => Math.round(card.getBoundingClientRect().width)))], red: r > g * 1.5, differs: colour(declined).join() !== colour(allowed).join()};
      }));
    }
  }
  for (const result of results) {
    // Enough text was checked for the gallery to have drawn.
    expect(result.checked).toBeGreaterThan(80);
  }
  expect(results.filter((result) => result.failures.length).map(({url, theme, failures}) => ({url, theme, failures}))).toEqual([]);
  // The same card width on every site and theme.
  expect([...new Set(cards.flatMap((card) => card.widths))]).toHaveLength(1);
  for (const card of cards) {
    expect(card).toMatchObject({red: true, differs: true});
  }
});
