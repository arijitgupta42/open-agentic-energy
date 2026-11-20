// Checks that js/chat-scroll.js is the same on all three sites and that each site turns it
// on. What it does in the chat is checked in a browser by e2e/chat-scroll.e2e.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Read a file of a site.
 *
 * :param site: The site's folder name.
 * :param file: The path inside it.
 * :return: The text.
 */
function read(site, file) {
  return readFile(new URL(`../../${site}/${file}`, import.meta.url), "utf8");
}

test("The long-answer scroll keeper is the same on all three sites, and each site turns it on", async () => {
  const utility = await read("utility", "js/chat-scroll.js");
  for (const site of ["installer", "grants"]) {
    assert.equal(await read(site, "js/chat-scroll.js"), utility, `Copy sites/utility/js/chat-scroll.js to sites/${site}/js/.`);
  }
  for (const site of ["utility", "installer", "grants"]) {
    assert.match(await read(site, "site.js"), /^\s+ChatScroll\.attach\(document\);/m, site);
  }
});
