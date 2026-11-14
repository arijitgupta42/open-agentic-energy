// Tests for the sites' MCP servers. Amounts are worked out by hand from the sites' data
// files, not by calling the sites' own functions, so a wrong sum fails here.
//
// Emberwick, 2,975 kWh electricity and 11,770 kWh gas a year (the demo account's usage):
//   Standard Variable: 2,975 x 26.4p + 11,770 x 6.3p + 365 x (55.0p + 31.0p) = 184,081p
//   Fixed 12 Month:    2,975 x 24.9p + 11,770 x 5.9p + 365 x (58.0p + 32.0p) = 176,370.5p -> 176,371p
//   Green Flex:        2,975 x 25.8p + 11,770 x 6.1p + 365 x (56.0p + 31.0p) = 180,307p
//   Heat Pump Saver:   2,975 x 21.5p + 11,770 x 6.6p + 365 x (60.0p + 31.0p) = 174,859.5p -> 174,860p
// Heatwright, a heat pump for a 95 m2 semi-detached house: 95 x 70 W = 6,650 W, so the
//   smallest pump of at least that output is the 8 kW one, £9,200 to £11,200.
// Emberwick with a heat pump in place of the gas boiler, same usage:
//   Heat from gas: 11,770 x 90% = 10,593 kWh; at 3.0 units of heat per kWh of electricity,
//   10,593 / 3.0 = 3,531 kWh more electricity, so 2,975 + 3,531 = 6,506 kWh and no gas.
//   Standard Variable: 6,506 x 26.4p + 365 x 55.0p = 191,833.4p -> 191,833p
//   Fixed 12 Month:    6,506 x 24.9p + 365 x 58.0p = 183,169.4p -> 183,169p
//   Green Flex:        6,506 x 25.8p + 365 x 56.0p = 188,294.8p -> 188,295p
//   Heat Pump Saver:   6,506 x 21.5p + 365 x 60.0p = 161,779p
//   Cheapest now is Fixed 12 Month at 176,371p: 176,371 - 161,779 = 14,592p less a year.
// Fernbrook, an owner-occupier with a gas boiler, EPC band D and income £31,000 or more:
//   Heat Pump Grant yes, Solar Starter no (income), Warm Walls yes (band D).
// One scheme at a time: the Heat Pump Grant with only tenure given still needs the
//   heating; Warm Walls with band C is not met; Solar Starter for an owner-occupier
//   under £31,000 is met.
import assert from "node:assert/strict";
import test from "node:test";
import { MCP_SERVERS } from "../sites.mjs";

const ORIGIN = "https://site.example";

/**
 * Send one JSON-RPC message to a site's server.
 *
 * :param site: A site id.
 * :param message: The JSON-RPC message, or a raw string body.
 * :param init: More fetch options.
 * :return: {status, headers, body}, with body parsed when there is one.
 */
async function send(site, message, init = {}) {
  const request = new Request(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: {"Content-Type": "application/json", Origin: "https://caller.example"},
    body: typeof message === "string" ? message : JSON.stringify(message),
    ...init,
  });
  const response = await MCP_SERVERS[site].handle(request);
  const text = await response.text();
  return {status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null};
}

/**
 * Call one tool and give its structured result.
 *
 * :param site: A site id.
 * :param name: The tool name.
 * :param args: Its arguments.
 * :return: {isError, value, text}.
 */
async function call(site, name, args = {}) {
  const reply = await send(site, {jsonrpc: "2.0", id: 7, method: "tools/call", params: {name: name, arguments: args}});
  assert.equal(reply.status, 200);
  const result = reply.body.result;
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent, "The text the model reads matches the structured result.");
  return {isError: result.isError, value: result.structuredContent, text: result.content[0].text};
}

test("initialize answers with the site and the protocol version the client asked for", async () => {
  for (const site of Object.keys(MCP_SERVERS)) {
    const reply = await send(site, {jsonrpc: "2.0", id: 1, method: "initialize", params: {protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {name: "test"}}});
    assert.equal(reply.status, 200);
    assert.equal(reply.body.id, 1);
    assert.equal(reply.body.result.protocolVersion, "2025-06-18");
    assert.deepEqual(reply.body.result.capabilities, {tools: {listChanged: false}});
    assert.match(reply.body.result.instructions, /Fictional demo data/);
    assert.equal(reply.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(reply.headers.get("Cache-Control"), "no-store");
  }
});

test("a notification gets 202 and no body; a preflight gets 204 with the CORS headers", async () => {
  const notification = await send("grants", {jsonrpc: "2.0", method: "notifications/initialized"});
  assert.equal(notification.status, 202);
  assert.equal(notification.body, null);
  const preflight = await MCP_SERVERS.grants.handle(new Request(`${ORIGIN}/mcp`, {method: "OPTIONS"}));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /MCP-Protocol-Version/);
  assert.match(preflight.headers.get("Access-Control-Allow-Methods"), /POST/);
});

test("every tool is listed as read-only with an object input schema", async () => {
  const expected = {
    utility: ["list_tariffs", "estimate_yearly_costs", "estimate_heat_pump_running_cost"],
    installer: ["list_products", "estimate"],
    grants: ["list_grants", "check_eligibility", "check_scheme"],
  };
  for (const [site, names] of Object.entries(expected)) {
    const reply = await send(site, {jsonrpc: "2.0", id: 2, method: "tools/list"});
    const tools = reply.body.result.tools;
    assert.deepEqual(tools.map((tool) => tool.name), names);
    for (const tool of tools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.destructiveHint, false);
      assert.ok(!/TODO/.test(JSON.stringify(tool)));
    }
  }
});

test("no tool asks for or returns a name, email, phone number or the demo account", async () => {
  for (const site of Object.keys(MCP_SERVERS)) {
    const reply = await send(site, {jsonrpc: "2.0", id: 3, method: "tools/list"});
    const schemas = JSON.stringify(reply.body.result.tools.map((tool) => tool.inputSchema));
    assert.doesNotMatch(schemas, /name|email|phone|postcode|reference/i);
  }
  // The demo account (js/account-data.js) never leaves the visitor's page.
  const tariffs = await call("utility", "list_tariffs");
  const costs = await call("utility", "estimate_yearly_costs", {electricityKwh: 1, gasKwh: 1, hasHeatPump: false});
  for (const reply of [tariffs.text, costs.text]) {
    assert.doesNotMatch(reply, /EW-DEMO|Demo household|reference|currentTariff|standard-variable"\s*,\s*"current/i);
  }
});

test("Emberwick lists its tariffs as the page shows them", async () => {
  const {isError, value} = await call("utility", "list_tariffs");
  assert.equal(isError, false);
  assert.deepEqual(value.tariffs.map((tariff) => tariff.name), ["Standard Variable", "Fixed 12 Month", "Green Flex", "Heat Pump Saver"]);
  const saver = value.tariffs[3];
  assert.equal(saver.electricityUnitRate, "21.5p per kWh");
  assert.equal(saver.electricityStandingCharge, "60.0p per day");
  assert.equal(saver.exitFee, "£30.00");
  assert.equal(saver.requiresHeatPump, true);
  assert.equal(value.page, `${ORIGIN}/`);
});

test("Emberwick's yearly costs match the hand-worked sums, and a heat pump opens Heat Pump Saver", async () => {
  const without = (await call("utility", "estimate_yearly_costs", {electricityKwh: 2975, gasKwh: 11770, hasHeatPump: false})).value;
  assert.deepEqual(without.tariffs.map((row) => [row.tariff, row.estimatedYearlyCost, row.available]), [
    ["Heat Pump Saver", "£1,748.60", false],
    ["Fixed 12 Month", "£1,763.71", true],
    ["Green Flex", "£1,803.07", true],
    ["Standard Variable", "£1,840.81", true],
  ]);
  assert.equal(without.cheapestAvailable, "Fixed 12 Month");
  const withPump = (await call("utility", "estimate_yearly_costs", {electricityKwh: 2975, gasKwh: 11770, hasHeatPump: true})).value;
  assert.equal(withPump.cheapestAvailable, "Heat Pump Saver");
});

test("Emberwick's heat pump running costs match the hand-worked sums", async () => {
  const {isError, value} = await call("utility", "estimate_heat_pump_running_cost", {electricityKwh: 2975, gasKwh: 11770});
  assert.equal(isError, false);
  assert.deepEqual(value.withHeatPump, {electricityKwh: 6506, extraElectricityKwh: 3531, gasKwh: 0});
  assert.deepEqual(value.tariffsWithHeatPump.map((row) => [row.tariff, row.estimatedYearlyCost]), [
    ["Heat Pump Saver", "£1,617.79"],
    ["Fixed 12 Month", "£1,831.69"],
    ["Green Flex", "£1,882.95"],
    ["Standard Variable", "£1,918.33"],
  ]);
  assert.deepEqual(value.cheapestNow, {tariff: "Fixed 12 Month", estimatedYearlyCost: "£1,763.71"});
  assert.equal(value.cheapestWithHeatPump, "Heat Pump Saver");
  assert.equal(value.yearlyDifference, "£145.92 less per year");
  assert.match(value.assumptions, /90% efficient/);
  assert.doesNotMatch(JSON.stringify(value), /EW-DEMO|Demo household/);
});

test("Heatwright's estimate matches the hand-worked heat loss and price", async () => {
  const {value} = await call("installer", "estimate", {measure: "heat-pump", homeType: "semi-detached", floorAreaM2: 95});
  assert.equal(value.ok, true);
  assert.equal(value.estimate.product, "8 kW air-source heat pump");
  assert.equal(value.estimate.estimatedHeatLoss, "6.7 kW");
  assert.equal(value.estimate.priceRange, "£9,200 to £11,200");
  const products = (await call("installer", "list_products")).value;
  assert.equal(products.products.find((product) => product.id === "ashp-5").priceRange, "£7,800 to £9,400");
});

test("Heatwright refuses what the page refuses, with the page's reason", async () => {
  const flat = (await call("installer", "estimate", {measure: "solar", homeType: "flat", floorAreaM2: 60})).value;
  assert.deepEqual(flat, {ok: false, reason: "We do not fit solar panels on flats, because the roof is usually shared.", field: "homeType"});
  const tooBig = (await call("installer", "estimate", {measure: "heat-pump", homeType: "detached", floorAreaM2: 400})).value;
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.field, "floorAreaM2");
});

test("Fernbrook's eligibility follows the scheme rules", async () => {
  const {value} = await call("grants", "check_eligibility", {tenure: "owner-occupier", currentHeating: "gas-boiler", epcBand: "D", incomeBand: "31000-or-more"});
  assert.deepEqual(value.results.map((row) => [row.scheme, row.amount, row.eligible, row.reasons]), [
    ["Fernbrook Heat Pump Grant", "£5,000", true, []],
    ["Fernbrook Solar Starter", "£1,200", false, ["The household's income must be under £31,000 a year."]],
    ["Warm Walls Insulation Voucher", "Up to £2,000", true, []],
  ]);
  assert.match(value.note, /not an application/);
  const listed = (await call("grants", "list_grants")).value;
  assert.deepEqual(listed.schemes[0].conditions[0].allowed, ["I own the home and live in it", "I am a private landlord"]);
});

test("Fernbrook checks one scheme from only the answers it needs", async () => {
  const partial = (await call("grants", "check_scheme", {scheme: "heat-pump-grant", tenure: "owner-occupier"})).value;
  assert.equal(partial.scheme, "Fernbrook Heat Pump Grant");
  assert.equal(partial.amount, "£5,000");
  assert.equal(partial.eligible, null);
  assert.deepEqual(partial.reasons, []);
  assert.deepEqual(partial.stillNeeded, ["Say how the home is heated now."]);
  const notMet = (await call("grants", "check_scheme", {scheme: "warm-walls", epcBand: "C"})).value;
  assert.equal(notMet.eligible, false);
  assert.deepEqual(notMet.reasons, ["The home's EPC band must be D, E, F or G."]);
  const met = (await call("grants", "check_scheme", {scheme: "solar-starter", tenure: "owner-occupier", incomeBand: "under-31000"})).value;
  assert.equal(met.eligible, true);
  assert.deepEqual(met.stillNeeded, []);
  const unknown = await call("grants", "check_scheme", {scheme: "no-such-scheme"});
  assert.equal(unknown.isError, true);
});

test("bad arguments come back as a tool error the model can fix, and change nothing", async () => {
  const missing = await call("grants", "check_eligibility", {tenure: "owner-occupier"});
  assert.equal(missing.isError, true);
  assert.match(missing.value.reason, /Give "currentHeating"/);
  const extra = await call("utility", "list_tariffs", {accountNumber: "123"});
  assert.equal(extra.isError, true);
  assert.match(extra.value.reason, /Unknown argument/);
  const range = await call("installer", "estimate", {measure: "heat-pump", homeType: "detached", floorAreaM2: 12.5});
  assert.equal(range.isError, true);
  assert.match(range.value.reason, /whole number from 20 to 400/);
});

test("protocol errors are JSON-RPC errors, not crashes", async () => {
  assert.equal((await send("utility", "{not json")).body.error.code, -32700);
  assert.equal((await send("utility", [{jsonrpc: "2.0", id: 1, method: "ping"}])).body.error.code, -32600);
  assert.equal((await send("utility", {jsonrpc: "2.0", id: 4, method: "resources/list"})).body.error.code, -32601);
  assert.equal((await send("utility", {jsonrpc: "2.0", id: 5, method: "tools/call", params: {name: "switch_tariff"}})).body.error.code, -32602);
  const big = await send("utility", JSON.stringify({jsonrpc: "2.0", id: 6, method: "ping", params: {pad: "x".repeat(20000)}}));
  assert.equal(big.status, 413);
  const get = await MCP_SERVERS.utility.handle(new Request(`${ORIGIN}/mcp`));
  assert.equal(get.status, 405);
});
