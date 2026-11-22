// Checks the fluted-glass ground (ground.css): the same text on all three sites, linked after each page's variant.css,
// built only from gradients (no file, no other host, no motion), and coloured from each site's own tokens. It
// reads all three sites, so it lives here once, beside design.test.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SITES = ["utility", "installer", "grants"];

/**
 * Read a text file of a site, with LF line endings.
 *
 * :param site: The site's folder name.
 * :param file: The file, relative to the site's folder.
 * :return: The text.
 */
async function read(site, file) {
  return (await readFile(new URL(`../../${site}/${file}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
}

test("ground.css is the same text on all three sites", async () => {
  const texts = new Set();
  for (const site of SITES) texts.add(await read(site, "ground.css"));
  assert.equal(texts.size, 1, "ground.css differs between sites. Keep it the same on all three; a site sets --marble-accent in its variant.css instead.");
});

test("Every page links ground.css after its variant.css", async () => {
  const pages = [["utility", "index.html", "variant.css", "ground.css"], ["installer", "index.html", "variant.css", "ground.css"], ["grants", "index.html", "variant.css", "ground.css"], ["utility", "lab/index.html", "../variant.css", "../ground.css"]];
  for (const [site, file, first, second] of pages) {
    const html = await read(site, file);
    const a = html.indexOf(`href="${first}"`);
    const b = html.indexOf(`href="${second}"`);
    assert.ok(a >= 0 && b > a, `${site}/${file}: ground.css must be linked after variant.css.`);
  }
});

test("The ground is gradients only, moves nothing, and takes its colours from the site's tokens", async () => {
  const css = await read("utility", "ground.css");
  assert.doesNotMatch(css, /https?:\/\//i, "ground.css names another host.");
  assert.doesNotMatch(css, /@import|@font-face|url\(/i, "ground.css loads a file.");
  assert.doesNotMatch(css, /@keyframes|animation:|transition:/, "The ground must not move.");
  assert.match(css, /var\(--ground-accent\)/);
  assert.match(css, /position: fixed/, "The ground must stay fixed behind the page, not follow the scroll.");
});

test("Emberwick sets its own accent for the ground, and no page keeps the square behind its hero panel", async () => {
  assert.match(await read("utility", "variant.css"), /--ground-accent:\s*var\(--ember\)/);
  for (const site of SITES) {
    const css = await read(site, "variant.css");
    const rule = css.match(/^\.hero__art \{[^\n]*\}/m)?.[0] ?? "";
    assert.match(rule, /background: none/, `${site}: .hero__art draws a square behind the panel.`);
  }
  assert.match(await read("utility", "ground.css"), /\.hero__art\.mo-cs > \.mo-cs__light \{ display: none; \}/, "The spotlight layer still lights the hero panel's box.");
});
