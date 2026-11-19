// Checks each site's design.css: the design core is the same text on all three sites, each
// site adds its own character after it, every page links it, and none of it loads anything
// from another host (CLAUDE.md rule 8: no third-party scripts, and system fonts only). It
// reads all three sites, so it lives here once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SITES = ["utility", "installer", "grants"];
const START = "/* ===== design core: the same on all three sites ===== */";
const END = "/* ===== end of the design core ===== */";

/**
 * Read a site's design.css.
 *
 * :param site: The site's folder name.
 * :return: The text, with LF line endings.
 */
async function design(site) {
  return (await readFile(new URL(`../../${site}/design.css`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
}

test("The design core is the same on all three sites, and each site has its own after it", async () => {
  const cores = new Set();
  const own = new Set();
  for (const site of SITES) {
    const css = await design(site);
    const start = css.indexOf(START);
    const end = css.indexOf(END);
    assert.ok(start >= 0 && end > start, `${site}: the design core markers are missing.`);
    cores.add(css.slice(start, end + END.length));
    const after = css.slice(end + END.length).trim();
    assert.ok(after.length > 100, `${site}: no site-specific design after the core.`);
    assert.match(after, /--font-display:/, `${site}: no display font of its own.`);
    own.add(after);
  }
  assert.equal(cores.size, 1, "The design core differs between sites. Keep it the same on all three.");
  assert.equal(own.size, SITES.length, "Two sites share the same character. Give each its own.");
});

test("The design loads nothing from another host", async () => {
  for (const site of SITES) {
    const css = await design(site);
    assert.doesNotMatch(css, /https?:\/\//i, `${site}: design.css names another host.`);
    assert.doesNotMatch(css, /@import|@font-face|url\(/i, `${site}: design.css loads a file.`);
  }
});

test("Every page links its design.css after styles.css", async () => {
  const pages = {utility: ["../index.html", "styles.css", "design.css"], installer: ["../../installer/index.html", "styles.css", "design.css"], grants: ["../../grants/index.html", "styles.css", "design.css"]};
  for (const [site, [file, first, second]] of Object.entries(pages)) {
    const html = await readFile(new URL(file, import.meta.url), "utf8");
    const a = html.indexOf(`href="${first}"`);
    const b = html.indexOf(`href="${second}"`);
    assert.ok(a >= 0 && b > a, `${site}: design.css must be linked after styles.css.`);
  }
  const lab = await readFile(new URL("../lab/index.html", import.meta.url), "utf8");
  assert.ok(lab.indexOf('href="../design.css"') > lab.indexOf('href="../styles.css"'), "The Safety checks page lacks design.css.");
});
