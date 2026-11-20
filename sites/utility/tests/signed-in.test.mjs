// The visitor is a signed-in fictional customer on every site: nothing asks for their
// name, email or address, and the agents ask for anything else with dropdowns only.
// It reads all three sites, so it lives here once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AccountData } from "../js/account-data.js";
import { InstallData } from "../../installer/js/install-data.js";
import { GrantData } from "../../grants/js/grant-data.js";

const SITES = {utility: "emberwick_energy", installer: "heatwright_installers", grants: "fernbrook_grants"};

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

test("The same fictional customer is signed in on all three sites", () => {
  assert.equal(AccountData.ACCOUNT.holder, "Ana Silva");
  assert.equal(AccountData.ACCOUNT.address, `${InstallData.CUSTOMER.address}, ${InstallData.CUSTOMER.postcodeArea}`);
  assert.deepEqual(InstallData.CUSTOMER, GrantData.CUSTOMER);
  // Fictional: an example.com address, which can never reach anyone.
  assert.match(GrantData.CUSTOMER.email, /@example\.com$/);
});

test("No action asks for a name, an email or a postcode: the customer is known", async () => {
  for (const site of Object.keys(SITES)) {
    const actions = await read(site, "site-actions.js");
    assert.doesNotMatch(actions, /^\s+(fullName|email|postcodeArea|address): \{/m, `${site}: an action takes the visitor's details.`);
  }
});

test("Every site's read action says the visitor is signed in and forms are dropdowns only", async () => {
  for (const site of Object.keys(SITES)) {
    const actions = await read(site, "site-actions.js");
    assert.match(actions, /The visitor is signed in: their name and address are here, so never ask for them\./, site);
    assert.match(actions, /make every field a dropdown: give each property an enum/, site);
  }
});

test("No agent is told to ask for a name or an email", async () => {
  for (const [site, network] of Object.entries(SITES)) {
    const hocon = await read(site, `${network}.hocon`);
    // "Do not ask for names, emails..." in the partner rules is the opposite, and allowed.
    assert.doesNotMatch(hocon, /(?<!not )ask (for )?(the )?(name|email)/i, site);
  }
});
