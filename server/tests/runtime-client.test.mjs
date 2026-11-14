// The runtime's own MCP client (sites/*/runtime/mcp.js, the vendored nsdeploy code) talks
// to the sites' MCP servers: initialize, the initialized notification, tools/list and
// tools/call, over the same Request and Response objects a browser uses. Each site's
// network names its server, and its manifest allows that origin (spec 3.2, closed policy).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { McpClient } from "../../sites/utility/runtime/mcp.js";
import { manifestAllowsPeer, selectPeerRouter } from "../../sites/utility/runtime/engine.js";
import { MCP_PATH, MCP_SERVERS } from "../sites.mjs";

const ROOT = new URL("../../", import.meta.url);
const NETWORKS = {utility: "emberwick_energy", installer: "heatwright_installers", grants: "fernbrook_grants"};

/**
 * Stand in for the network: route each request to the site whose origin it names.
 *
 * :param origins: Site id by origin.
 * :return: A fetch function, and the list of requests it saw.
 */
function fakeFetch(origins) {
  const seen = [];
  const fetcher = async (url, init) => {
    const request = new Request(url, init);
    const site = origins[new URL(request.url).origin];
    seen.push({origin: new URL(request.url).origin, path: new URL(request.url).pathname, headers: Object.fromEntries(request.headers)});
    if (!site || new URL(request.url).pathname !== MCP_PATH) {
      return new Response("not found", {status: 404});
    }
    return MCP_SERVERS[site].handle(request);
  };
  return {fetcher, seen};
}

/**
 * Read a site's built network and manifest.
 *
 * :param site: A site id.
 * :return: {network, manifest}.
 */
async function load(site) {
  const network = JSON.parse(await readFile(new URL(`sites/${site}/${NETWORKS[site]}.network.json`, ROOT), "utf8"));
  const manifest = JSON.parse(await readFile(new URL(`sites/${site}/agent-manifest.json`, ROOT), "utf8"));
  return {network, manifest};
}

/**
 * Expand an agent's instructions as the runtime does: each {name} once.
 *
 * :param network: The network JSON.
 * :param text: The instructions.
 * :return: The expanded text.
 */
function expand(network, text) {
  const strings = network.commondefs?.replacement_strings || {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (Object.hasOwn(strings, key) ? strings[key] : match));
}

test("each front agent names its own site's MCP server, and the manifest allows that origin", async () => {
  for (const site of Object.keys(NETWORKS)) {
    const {network, manifest} = await load(site);
    const front = network.tools.find((agent) => agent.name === manifest.networks[0].front_man);
    // A plain URL ending in /mcp, which the runtime's UI labels by host.
    const mcp = front.tools.filter((ref) => typeof ref === "string" && ref.endsWith(MCP_PATH));
    assert.equal(mcp.length, 1, `${site}: the front agent lists one MCP server.`);
    assert.ok(front.tools.every((ref) => typeof ref === "string"), `${site}: every tool is a plain name or URL.`);
    const url = new URL(mcp[0]);
    assert.equal(url.pathname, MCP_PATH);
    assert.ok(manifestAllowsPeer(url.href, manifest), `${site}: allowed_peers must list ${url.origin}.`);
    assert.equal(manifest.peer_policy.mode, "closed");
    const listed = (await MCP_SERVERS[site].handle(new Request(url, {method: "POST", body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "tools/list"})})));
    const names = (await listed.json()).result.tools.map((tool) => tool.name);
    // A specialist may own a tool: then it lists the same server, and its instructions
    // say when to call it.
    const users = network.tools.filter((agent) => Array.isArray(agent.tools) && agent.tools.includes(url.href));
    for (const name of names) {
      assert.ok(users.some((agent) => expand(network, agent.instructions).includes(`mcp_${name}`)), `${site}: no agent that lists ${url.href} names mcp_${name}.`);
    }
  }
});

test("the runtime's MCP client lists and calls a partner's tools, sending no credentials", async (t) => {
  const {network, manifest} = await load("grants");
  const front = network.tools.find((agent) => agent.name === manifest.networks[0].front_man);
  const url = front.tools.find((ref) => typeof ref === "string" && ref.endsWith(MCP_PATH));
  const {fetcher, seen} = fakeFetch({[new URL(url).origin]: "grants"});
  t.mock.method(globalThis, "fetch", fetcher);
  const client = new McpClient({url: url});
  const tools = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ["list_grants", "check_eligibility", "check_scheme"]);
  const text = await client.callTool("check_eligibility", {tenure: "owner-occupier", currentHeating: "oil-boiler", epcBand: "C", incomeBand: "under-31000"});
  const result = JSON.parse(text);
  assert.deepEqual(result.results.map((row) => [row.scheme, row.eligible]), [
    ["Fernbrook Heat Pump Grant", true],
    ["Fernbrook Solar Starter", true],
    ["Warm Walls Insulation Voucher", false],
  ]);
  assert.deepEqual(seen.map((request) => request.path), [MCP_PATH, MCP_PATH, MCP_PATH, MCP_PATH], "initialize, initialized, tools/list, tools/call");
  for (const request of seen) {
    assert.ok(!("authorization" in request.headers) && !("cookie" in request.headers), "No credential goes to a partner's MCP server (spec 3.4, 4).");
  }
});

test("a refusal comes back as the page's reason, and a bad call as an MCP tool error", async (t) => {
  const {fetcher} = fakeFetch({"https://installer.example": "installer"});
  t.mock.method(globalThis, "fetch", fetcher);
  const client = new McpClient({url: "https://installer.example/mcp"});
  const refused = JSON.parse(await client.callTool("estimate", {measure: "solar", homeType: "flat", floorAreaM2: 50}));
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "We do not fit solar panels on flats, because the roof is usually shared.");
  const wrong = await client.callTool("estimate", {measure: "boiler", homeType: "flat", floorAreaM2: 50});
  assert.ok(wrong.startsWith("MCP tool error: "));
  assert.equal(JSON.parse(wrong.slice("MCP tool error: ".length)).reason, "\"measure\" must be one of: heat-pump, solar.");
});

test("a partner's network runs on the caller's router, whatever its own manifest names (spec 3.2, 4)", () => {
  // runtime/engine.js _compile: a peer gets selectPeerRouter(this.userRouter), the
  // caller's active router. It takes no argument from the peer's manifest, so a partner
  // cannot point the caller's key at another router.
  assert.equal(selectPeerRouter.length, 1, "selectPeerRouter takes only the caller's router.");
  const caller = {baseUrl: "https://router.caller.example/v1", mock: false};
  assert.deepEqual(selectPeerRouter(caller), {baseUrl: "https://router.caller.example/v1", mock: false});
  assert.throws(() => selectPeerRouter(undefined), /no active LLM router/);
});
