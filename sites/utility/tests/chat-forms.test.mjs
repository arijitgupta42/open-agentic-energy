// Checks js/chat-forms.js, the same file on all three sites: which fields count as
// personal, where a dropdown's options come from, and that each site gives its own
// choices. The page itself is checked in a browser by e2e/chat-forms.e2e.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ChatForms } from "../js/chat-forms.js";

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

test("A field for a personal detail is recognised, and a question about the home is not", () => {
  for (const label of ["Full name", "Your name", "Email", "E-mail address", "Phone number", "Home address", "Postcode", "Date of birth"]) {
    assert.ok(ChatForms.PERSONAL.test(label), label);
  }
  for (const label of ["Floor area", "Home type", "What heats your home now?", "Do you own or rent your home?", "EPC band", "Income", "Which scheme?", "When can we visit?"]) {
    assert.ok(!ChatForms.PERSONAL.test(label), label);
  }
});

test("A field takes the site's own choices for its topic, and a number its limits spread out", () => {
  const choices = [{match: /floor area/i, values: [50, 95]}, {match: /heat/i, values: ["Gas boiler", "Oil boiler"]}];
  const box = (type, min, max) => ({type, getAttribute: (name) => ({min, max})[name] ?? null});
  assert.deepEqual(ChatForms.choicesFor("Floor area", box("number", "20", "400"), choices), ["50", "95"]);
  assert.deepEqual(ChatForms.choicesFor("What heats your home?", box("text"), choices), ["Gas boiler", "Oil boiler"]);
  assert.deepEqual(ChatForms.choicesFor("Rooms", box("number", "1", "8"), choices), ["1", "2", "3", "4", "5", "6", "7", "8"]);
  assert.deepEqual(ChatForms.spread(0, 1000), ["0", "200", "400", "600", "800", "1000"]);
  // No list and no limits: nothing to offer, so the field goes.
  assert.equal(ChatForms.choicesFor("Rooms", box("number"), choices), null);
  assert.equal(ChatForms.choicesFor("Anything else?", box("text"), choices), null);
});

test("The file is the same on all three sites, and each site wires its own choices", async () => {
  const utility = await read("utility", "js/chat-forms.js");
  for (const site of ["installer", "grants"]) {
    assert.equal(await read(site, "js/chat-forms.js"), utility, `Copy sites/utility/js/chat-forms.js to sites/${site}/js/.`);
  }
  for (const site of ["utility", "installer", "grants"]) {
    const mount = await read(site, "site.js");
    assert.match(mount, /ChatForms\.attach\(document, AssistantMount\.FORM_CHOICES\)/, site);
    assert.match(mount, /static FORM_CHOICES = \[/, site);
  }
});
