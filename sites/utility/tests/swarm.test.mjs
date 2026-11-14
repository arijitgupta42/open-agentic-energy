// Each site publishes a swarm: a front agent and specialists that run in the visitor's
// browser. These tests read the three published networks and check that each swarm is
// wired as its .hocon comments say. It reads all three sites, so it lives here once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GrantData } from "../../grants/js/grant-data.js";
import { InstallData } from "../../installer/js/install-data.js";

const NETWORKS = {
  utility: "emberwick_energy",
  installer: "heatwright_installers",
  grants: "fernbrook_grants",
};

/**
 * Read a site's published network.
 *
 * :param site: The site's folder.
 * :return: The network JSON.
 */
async function network(site) {
  return JSON.parse(await readFile(new URL(`../../${site}/${NETWORKS[site]}.network.json`, import.meta.url), "utf8"));
}

/**
 * Find one agent and expand its instructions as the runtime does: each {name} once.
 *
 * :param config: The network JSON.
 * :param name: The agent's name.
 * :return: The agent, with its instructions expanded.
 */
function agent(config, name) {
  const found = config.tools.find((entry) => entry.name === name);
  assert.ok(found, `${name} is missing.`);
  const strings = config.commondefs?.replacement_strings || {};
  const instructions = found.instructions.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (Object.hasOwn(strings, key) ? strings[key] : match));
  return {...found, instructions};
}

/**
 * The partner networks an agent lists, by network name.
 *
 * :param entry: An agent.
 * :return: The names, such as ["heatwright_installers"].
 */
function partners(entry) {
  return entry.tools
    .filter((ref) => typeof ref === "string" && /^https?:\/\//.test(ref) && !ref.endsWith("/mcp"))
    .map((ref) => new URL(ref).pathname.split("/").pop());
}

test("Emberwick: the front agent hands upgrades to retrofit_planner, which asks both partners and usage_analyst", async () => {
  const config = await network("utility");
  assert.deepEqual(config.tools.map((entry) => entry.name), ["emberwick_assistant", "tariff_advisor", "usage_analyst", "retrofit_planner"]);
  const front = agent(config, "emberwick_assistant");
  assert.deepEqual(front.tools.filter((ref) => !ref.startsWith("http")), ["tariff_advisor", "usage_analyst", "retrofit_planner"]);
  assert.deepEqual(partners(front), [], "Only the planner contacts partner sites.");
  assert.match(front.instructions, /call them in the same step/);
  assert.match(front.instructions, /Never add or subtract figures from different sites/, "Seen live: a grant taken off a fitting price.");
  const planner = agent(config, "retrofit_planner");
  assert.ok(planner.tools.includes("usage_analyst"));
  assert.deepEqual(partners(planner), ["heatwright_installers", "fernbrook_grants"]);
  assert.match(planner.instructions, /Call every one it needs in one step, together/);
  // runner.js marks website_* actions parallelSafe false: one in the step makes the
  // runtime run every call in it one at a time, as the first live run showed.
  for (const fanOut of [front, planner]) {
    assert.match(fanOut.instructions, /with no website_\* tool in (it|that step): a site action makes the runtime run the step one call at a time/);
  }
  assert.match(planner.instructions, /the cheapest tariff now, the cheapest with a heat pump and the yearly difference/);
  assert.match(planner.instructions, /Do not add or subtract figures from different sources/);
  assert.match(planner.instructions, /never include names, emails, phone numbers or booking codes/, "The planner keeps the partner rules.");
  const analyst = agent(config, "usage_analyst");
  assert.match(analyst.instructions, /mcp_estimate_heat_pump_running_cost/);
  assert.ok(analyst.tools.every((ref) => ref.endsWith("/mcp")), "The analyst reads only its own site's MCP server.");
});

test("Heatwright: one specialist per product, each reading the site's own estimate", async () => {
  const config = await network("installer");
  const front = agent(config, "heatwright_assistant");
  assert.ok(front.tools.includes("heat_pump_engineer") && front.tools.includes("solar_designer"));
  assert.match(front.instructions, /for both, call both in one step with no website_\* call/);
  const measures = InstallData.MEASURES.map((measure) => measure.id);
  for (const [name, measure] of [["heat_pump_engineer", "heat-pump"], ["solar_designer", "solar"]]) {
    const specialist = agent(config, name);
    assert.ok(measures.includes(measure));
    assert.ok(specialist.instructions.includes(`mcp_estimate with measure "${measure}"`), `${name} asks for ${measure}.`);
    assert.match(specialist.instructions, /Never call website_set_estimate or website_request_survey/);
    assert.deepEqual(partners(specialist), [], `${name} contacts no partner.`);
  }
});

test("Fernbrook: one AAOSA agent per scheme, and the front agent runs Determine then Fulfill", async () => {
  const config = await network("grants");
  const front = agent(config, "fernbrook_assistant");
  assert.match(front.instructions, /mode "Determine"[\s\S]*only those that answered "Yes"[\s\S]*mode "Fulfill"/);
  const schemeAgents = config.tools.filter((entry) => entry.name !== "fernbrook_assistant");
  // Every scheme on the site has exactly one agent, named by its id in GrantData.
  for (const scheme of GrantData.SCHEMES) {
    const owners = schemeAgents.filter((entry) => entry.instructions.includes(`"${scheme.id}"`));
    assert.equal(owners.length, 1, `${scheme.id} has one agent.`);
    assert.ok(front.tools.includes(owners[0].name));
  }
  assert.equal(schemeAgents.length, GrantData.SCHEMES.length);
  for (const entry of schemeAgents) {
    const expanded = agent(config, entry.name);
    assert.deepEqual(entry.function.parameters.required, ["inquiry", "mode"]);
    assert.deepEqual(entry.function.parameters.properties.mode.enum, ["Determine", "Fulfill"]);
    assert.match(expanded.instructions, /mode "Determine": call mcp_check_scheme with your scheme id only/);
    assert.match(expanded.instructions, /Leave out every answer it does not give: never fill one in/);
    assert.match(expanded.instructions, /Never call website_set_eligibility_answers or website_start_application/);
  }
});

test("each site has its own icon in the chat's agent map", async () => {
  // runtime/ui.js splitBrand: the map shows a manifest brand's first character as the
  // site's icon when it is past U+2000, and the same 🧭 for every site otherwise.
  const icons = [];
  for (const site of Object.keys(NETWORKS)) {
    const manifest = JSON.parse(await readFile(new URL(`../../${site}/agent-manifest.json`, import.meta.url), "utf8"));
    const [first, ...rest] = Array.from(manifest.brand);
    assert.ok(first.codePointAt(0) > 0x2000, `${site}: brand must start with its icon, such as "⚡ Name".`);
    assert.equal(rest[0], " ", `${site}: one space after the icon, so the label reads cleanly.`);
    icons.push(first);
  }
  assert.equal(new Set(icons).size, icons.length, `Icons must differ: ${icons.join(" ")}`);
});
