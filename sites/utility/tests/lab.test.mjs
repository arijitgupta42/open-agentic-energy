// The Safety checks page's test networks (lab/) keep doing what the page says: one is
// invalid, one cycles, one needs five partner calls, and one names an origin its
// manifest does not allow. All four run only on the in-page mock model, so the page
// never sends a visitor's key or messages to an AI provider.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { manifestAllowsPeer, selectTopRouter } from "../runtime/engine.js";
import { AgentNetwork, validateNetwork } from "../runtime/kernel.js";

const LAB = new URL("../lab/", import.meta.url);

/**
 * Read one check's manifest and its networks.
 *
 * :param name: The check's folder under lab/.
 * :return: {manifest, networks}, with each network built as the runtime builds it.
 */
async function load(name) {
  const manifest = JSON.parse(await readFile(new URL(`${name}/agent-manifest.json`, LAB), "utf8"));
  const networks = {};
  for (const entry of manifest.networks) {
    const config = JSON.parse(await readFile(new URL(`${name}/${entry.hocon.replace(/^\.\//, "")}`, LAB), "utf8"));
    networks[entry.name] = new AgentNetwork(config, entry.name);
  }
  return {manifest, networks};
}

test("every lab check runs on the in-page mock, even with a key saved for the site", async () => {
  for (const name of ["invalid", "cycle", "budget", "denied"]) {
    const {manifest} = await load(name);
    assert.deepEqual(manifest.llm_router, {base_url: "browser://mock", mock: true}, `${name}: the mock only, and no byok_router.`);
    assert.equal(manifest.peer_policy.mode, "closed");
    // lab/lab.js boots with byokKey "demo", the mock router and a blank model.
    assert.deepEqual(selectTopRouter(manifest, "browser://mock", "demo", " "), {baseUrl: "browser://mock", mock: true, upgradedToByok: false});
  }
});

test("the invalid network fails the runtime's validation, and the others pass it", async () => {
  const invalid = await load("invalid");
  const errors = validateNetwork(invalid.networks.lab_invalid).errors;
  assert.ok(errors.some((error) => error.includes("references missing tool 'ghost_agent'")), errors.join("; "));
  for (const name of ["cycle", "budget", "denied"]) {
    const {networks} = await load(name);
    for (const [networkName, network] of Object.entries(networks)) {
      assert.deepEqual(validateNetwork(network).errors, [], `${networkName} should be valid.`);
    }
  }
});

test("the cycle, budget and denied checks are wired to hit their limit", async () => {
  const cycle = await load("cycle");
  const front = (network) => network.getAgentSpec(network.findFrontMan());
  assert.match(front(cycle.networks.lab_cycle_a).tools[0], /\/lab\/cycle\/lab_cycle_b$/);
  assert.match(front(cycle.networks.lab_cycle_b).tools[0], /\/lab\/cycle\/lab_cycle_a$/);
  const budget = await load("budget");
  const partners = front(budget.networks.lab_budget).tools;
  // The runtime allows four third-party calls per visitor message (runtime/engine.js).
  assert.equal(partners.length, 5);
  assert.ok(budget.networks.lab_budget.config.max_steps > partners.length, "Enough steps to reach the fifth call, so the budget, not max_steps, stops it.");
  const denied = await load("denied");
  const outsider = front(denied.networks.lab_denied).tools[0];
  assert.equal(new URL(outsider).host, "not-allowed.example");
  assert.equal(manifestAllowsPeer(outsider, denied.manifest), false);
});
