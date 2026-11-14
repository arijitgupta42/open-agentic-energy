// Checks js/answer-path.js, which builds "How each answer was made" from the runtime's
// trace (issue #17, spec 5 "Observable execution"). One test runs the real runner with a
// scripted model. The others replay a trace written with the runtime's own TraceBus and
// the same fields its engine, runner, LLM and MCP clients record.
// The module is the same on all three sites, so its tests live here once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AgentNetwork } from "../runtime/kernel.js";
import { runAgent } from "../runtime/runner.js";
import { TraceBus } from "../runtime/trace.js";
import { AnswerPath } from "../js/answer-path.js";
import { ScriptedModel } from "./scripted_model.mjs";

const PAGE = "emberwick.example";
const PARTNER = "heatwright.example";
const KEY = "sk-test-not-a-real-key-0123456789";

/**
 * Record one visitor message the way the runtime would: the front agent reads the
 * account, asks the partner (after the visitor allows it), and the partner's agent calls
 * its own MCP tool. Model calls carry a key source, never the key.
 *
 * :param trace: The TraceBus to record into.
 * :param decision: The visitor's answer on the consent card: "allow", "always" or
 *   "decline".
 */
function recordTurn(trace, decision) {
  const run = trace.start("run", {origin: PAGE, input: "Could I get a heat pump, and is there a grant?"});
  const front = trace.start("agent", {parent: run, origin: PAGE, agent: "emberwick_assistant", network: "emberwick_energy", isTopFrontMan: true});
  const model = (parent, origin) => {
    const span = trace.start("model_call", {parent, origin, model: "openai/gpt-6-luna", mock: false, routerHost: "openrouter.ai", endpoint: "https://openrouter.ai/api/v1/chat/completions", keySource: "local BYOK (not shown)", toolNames: []});
    trace.end(span, {finishReason: "stop", contentChars: 10});
  };
  model(front, PAGE);
  const read = trace.start("tool", {parent: front, origin: PAGE, tool: "website_get_account_state", callId: "c1", toolKind: "website action", args: {}});
  trace.end(read, {resultPreview: "{\"ok\":true}"});
  trace.note("tool_result", {parent: front, origin: PAGE, tool: "website_get_account_state", preview: "{\"ok\":true}"});
  model(front, PAGE);
  const partner = trace.start("tool", {parent: front, origin: PAGE, tool: "heatwright_installers", callId: "c2", toolKind: "remote network", args: {request: "Heat pump for a 3-bed semi in the north-west?"}});
  // site.js records every answer on the card; the runtime records a decline itself.
  trace.note("consent", {page: true, peerOrigin: PARTNER, decision, consentFor: "network"});
  if (decision === "decline") {
    trace.note("consent", {parent: partner, origin: PAGE, peerOrigin: PARTNER, decision: "declined"});
    trace.end(partner, {resultPreview: `The user declined to contact ${PARTNER}. Proceed without it and note that to the user.`});
  } else {
    const fetch = trace.start("remote_fetch", {parent: partner, origin: PAGE, peerOrigin: PARTNER, url: `https://${PARTNER}/heatwright_installers`});
    trace.end(fetch, {network: "heatwright_installers", peerOrigin: PARTNER});
    const call = trace.start("remote_call", {parent: partner, origin: PAGE, peerOrigin: PARTNER, method: "fetch-and-run-locally", network: "heatwright_installers"});
    const peer = trace.start("agent", {parent: call, origin: PARTNER, agent: "heatwright_assistant", network: "heatwright_installers"});
    model(peer, PARTNER);
    const mcp = trace.start("tool", {parent: peer, origin: PARTNER, tool: "mcp_estimate_heat_pump", toolKind: "MCP", args: {bedrooms: 3}});
    const rpc = trace.start("mcp_call", {parent: mcp, peerOrigin: PARTNER, url: `https://${PARTNER}/mcp`, method: "tools/call", args: {name: "estimate_heat_pump"}});
    trace.end(rpc, {status: "ok"});
    trace.end(mcp, {resultPreview: "{\"price\":\"…\"}"});
    model(peer, PARTNER);
    trace.end(peer, {answerChars: 40});
    trace.end(call, {responsePreview: "Heatwright fits air-source heat pumps."});
    trace.end(partner, {resultPreview: "Heatwright fits air-source heat pumps."});
  }
  model(front, PAGE);
  trace.end(front, {answerChars: 50});
  trace.end(run, {answerPreview: "Yes: Heatwright can fit one."});
}

test("the three sites carry the same answer-path.js", async () => {
  const read = (site) => readFile(new URL(`../../${site}/js/answer-path.js`, import.meta.url), "utf8");
  const utility = await read("utility");
  assert.equal(await read("installer"), utility, "Copy sites/utility/js/answer-path.js to sites/installer/js/.");
  assert.equal(await read("grants"), utility, "Copy sites/utility/js/answer-path.js to sites/grants/js/.");
});

test("a turn shows agent @ site, site action, partner with consent, partner agent, MCP and model", () => {
  const trace = new TraceBus();
  recordTurn(trace, "allow");
  const {turns, setup} = AnswerPath.build(trace.events, PAGE);
  assert.deepEqual(setup, []);
  assert.equal(turns.length, 1);
  const [turn] = turns;
  assert.equal(turn.status, "ok");
  assert.deepEqual(turn.counts, {agents: 2, sites: 2, actions: 1, mcp: 1, partners: 1, modelCalls: 5, parallel: 0, determine: 0, fulfill: 0});
  assert.equal(AnswerPath.toText(turn), [
    "Question: Could I get a heat pump, and is there a grant?",
    "  - Agent emberwick_assistant on emberwick.example",
    "    - Model: openai/gpt-6-luna via openrouter.ai · key: local BYOK (not shown)",
    "      3 calls",
    "    - Site action get_account_state on emberwick.example",
    "    - Partner network heatwright_installers at heatwright.example",
    "      Loaded and run in this browser, not on the partner's server.",
    "      “Heat pump for a 3-bed semi in the north-west?”",
    "      You allowed this one contact with heatwright.example.",
    "      - Fetched heatwright_installers from heatwright.example",
    "        Its public manifest and network definition, with no key or cookies.",
    "      - Agent heatwright_assistant on heatwright.example",
    "        A partner's agent, run in this browser on your model and router.",
    "        - Model: openai/gpt-6-luna via openrouter.ai · key: local BYOK (not shown)",
    "          2 calls",
    "        - MCP tool estimate_heat_pump at heatwright.example",
    "          {\"bedrooms\":3}",
    "Answer: Yes: Heatwright can fit one.",
  ].join("\n"));
  assert.equal(AnswerPath.summary(turn).replace(/ · [\d.]+ s$/, ""), "2 agents on 2 sites · 1 site action · 1 MCP tool · 1 partner network · 5 model calls");
});

test("a declined partner shows the decision once and that nothing was fetched", () => {
  const trace = new TraceBus();
  recordTurn(trace, "decline");
  const [turn] = AnswerPath.build(trace.events, PAGE).turns;
  const partner = turn.nodes[0].children.find((node) => node.kind === "partner");
  assert.equal(partner.title, "Partner network heatwright_installers at heatwright.example");
  assert.equal(partner.status, "refused");
  assert.equal(partner.consent, "You declined contact with heatwright.example.");
  assert.deepEqual(partner.children, [], "No fetch, no partner agent, and no second 'declined' line.");
  assert.doesNotMatch(AnswerPath.toText(turn), /Loaded and run/);
});

test("'always allow' carries to the next message, which shows no card", () => {
  const trace = new TraceBus();
  recordTurn(trace, "always");
  // The runtime remembers "always" and asks no more, so no consent note this time.
  const before = trace.events.length;
  recordTurn(trace, "always");
  trace.events.splice(before).filter((event) => !(event.kind === "consent" && event.page)).forEach((event) => trace.events.push(event));
  const {turns} = AnswerPath.build(trace.events, PAGE);
  const partnerOf = (turn) => turn.nodes[0].children.find((node) => node.kind === "partner");
  assert.equal(partnerOf(turns[0]).consent, "You allowed contact with heatwright.example for the rest of this visit.");
  assert.equal(partnerOf(turns[1]).consent, "No card: you allowed heatwright.example for this visit earlier.");
});

test("refusals and errors appear in the view: denied origin, cycle, budget, invalid network, failed model call", () => {
  const trace = new TraceBus();
  const compile = trace.start("compile", {origin: PAGE, what: "top network"});
  trace.fail(compile, new Error("Network invalid: agent 'front' references missing tool 'ghost_agent'"));
  const run = trace.start("run", {origin: PAGE, input: "Try everything"});
  const front = trace.start("agent", {parent: run, origin: PAGE, agent: "front"});
  const denied = trace.start("tool", {parent: front, origin: PAGE, tool: "elsewhere", toolKind: "remote network", args: {request: "hi"}});
  trace.end(denied, {status: "error", error: "Policy: evil.example is not in front's allowed_peers; refusing to contact it."});
  const cycle = trace.start("tool", {parent: front, origin: PAGE, tool: "lab_cycle_a", toolKind: "remote network", args: {request: "hi"}});
  trace.end(cycle, {resultPreview: "Skipped lab_cycle_a: that network is already in this request's call chain. Continue with available results and do not retry it."});
  trace.note("composition_limit", {parent: front, origin: PAGE, target: "https://p5.example/x", reason: "remote-call budget exhausted (4)"});
  const model = trace.start("model_call", {parent: front, origin: PAGE, model: "m", routerHost: "openrouter.ai", keySource: "local BYOK (not shown)"});
  trace.fail(model, new Error("LLM HTTP 401"));
  trace.fail(front, new Error("LLM HTTP 401"));
  trace.fail(run, new Error("LLM HTTP 401"));
  const {turns, setup} = AnswerPath.build(trace.events, PAGE);
  assert.equal(setup.length, 1);
  assert.match(setup[0].error, /missing tool 'ghost_agent'/);
  const [turn] = turns;
  assert.equal(turn.status, "error");
  assert.equal(turn.error, "LLM HTTP 401");
  const text = AnswerPath.toText(turn);
  assert.match(text, /Model: m via openrouter\.ai .* \[error\]\n.*\n\s+LLM HTTP 401/);
  assert.match(text, /Partner network elsewhere \[error\]\n.*\n\s+Policy: evil\.example is not in front's allowed_peers/);
  assert.match(text, /Partner network lab_cycle_a \[refused\][\s\S]*Skipped lab_cycle_a: that network is already in this request's call chain/);
  assert.match(text, /Stopped by the runtime \[refused\]\n\s+remote-call budget exhausted \(4\)/);
  assert.match(AnswerPath.summary(turn), /failed$/);
});

test("a partner's link back to the caller, left out by the runtime, is not shown as stopped", () => {
  // Seen live: Heatwright's network lists emberwick_energy, which is already in the chain.
  const trace = new TraceBus();
  const run = trace.start("run", {origin: PAGE, input: "Heat pump?"});
  const peer = trace.start("agent", {parent: run, origin: PARTNER, agent: "heatwright_assistant"});
  trace.note("composition_skip", {parent: peer, origin: PARTNER, target: `https://${PAGE}/emberwick_energy`, reason: "already visited in this request"});
  trace.end(peer, {});
  trace.end(run, {answerPreview: "**Fixed 12 Month** is cheapest.\n\n## Why\n`£1,763.71`"});
  const [turn] = AnswerPath.build(trace.events, PAGE).turns;
  const [skip] = turn.nodes[0].children;
  assert.equal(skip.title, `Not offered emberwick_energy at ${PAGE}`);
  assert.equal(skip.status, "ok");
  assert.equal(skip.detail, "The runtime left it out: already visited in this request.");
  assert.equal(turn.answer, "Fixed 12 Month is cheapest. Why £1,763.71", "The preview drops Markdown marks.");
});

test("the view never holds a key: only the runtime's key source", () => {
  const trace = new TraceBus();
  recordTurn(trace, "allow");
  const built = JSON.stringify(AnswerPath.build(trace.events, PAGE));
  assert.ok(!built.includes(KEY));
  assert.ok(!/sk-[A-Za-z0-9]/.test(built));
  assert.match(built, /local BYOK \(not shown\)/);
});

test("long requests are cut, and a running message says so", () => {
  const trace = new TraceBus();
  const run = trace.start("run", {origin: PAGE, input: "x".repeat(400)});
  const [turn] = AnswerPath.build(trace.events, PAGE).turns;
  assert.equal(turn.status, "running");
  assert.equal(AnswerPath.cut(turn.question).length, AnswerPath.MAX_TEXT);
  assert.match(AnswerPath.summary(turn), /running/);
  trace.end(run, {answerPreview: "done"});
});

test("the real runner's trace: front agent calls an internal agent", async () => {
  const network = new AgentNetwork({
    tools: [
      {name: "front", function: {description: "Front"}, instructions: "Delegate.", tools: ["helper"]},
      {name: "helper", function: {description: "Helper", parameters: {type: "object", properties: {inquiry: {type: "string"}}}}, instructions: "Answer.", tools: []},
    ],
  }, "two_agents");
  const trace = new TraceBus();
  const model = new ScriptedModel([
    {tool: "helper", arguments: {inquiry: "Which tariff?"}},
    {text: "Fixed 12."},
    {text: "Fixed 12 is cheapest."},
  ]);
  const ctx = {
    network,
    manifest: {},
    baseOrigin: `https://${PAGE}`,
    displayOrigin: PAGE,
    trace,
    isTop: true,
    frontMan: "front",
    history: [],
    llm: model,
    resolveMcp: async () => ({listTools: async () => []}),
  };
  const run = trace.start("run", {origin: PAGE, input: "Which tariff is cheapest?"});
  const result = await runAgent(ctx, "front", "Which tariff is cheapest?", run, []);
  trace.end(run, {answerPreview: String(result.text ?? result)});
  const [turn] = AnswerPath.build(trace.events, PAGE).turns;
  assert.equal(turn.counts.agents, 2);
  const [front] = turn.nodes;
  assert.equal(front.title, `Agent front on ${PAGE}`);
  assert.deepEqual(front.children.map((node) => node.title), [`Agent helper on ${PAGE}`], "The internal agent sits under the front agent, with no extra 'tool' level.");
  assert.equal(turn.answer, "Fixed 12 is cheapest.");
});

/**
 * A fake model for a swarm: each agent gets its own script, chosen by the "AGENT <name>"
 * line in its instructions, so agents that run at the same time cannot take each
 * other's replies. A step may ask for several tools at once.
 */
class SwarmModel {
  /**
   * :param scripts: Each agent's steps by name. A step is {tools: [{tool, arguments}]}
   *   or {text}.
   */
  constructor(scripts) {
    this.scripts = scripts;
    this.used = {};
  }

  /**
   * Reply with the calling agent's next step.
   *
   * :param request: The runtime's request, with messages.
   * :return: A reply with content and toolCalls.
   */
  async chat(request) {
    const system = (request.messages || []).map((message) => String(message.content || "")).join("\n");
    const name = Object.keys(this.scripts).find((agent) => system.includes(`AGENT ${agent}.`));
    if (!name) {
      throw new Error("SwarmModel: no script for this agent.");
    }
    const index = this.used[name] || 0;
    this.used[name] = index + 1;
    const step = this.scripts[name][index];
    if (!step) {
      throw new Error(`SwarmModel: ${name} ran out of steps.`);
    }
    // Let the other agents run first, as a real model's reply would.
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (step.tools) {
      return {
        content: "",
        toolCalls: step.tools.map((call, n) => ({
          id: `${name}-${index}-${n}`,
          type: "function",
          function: {name: call.tool, arguments: JSON.stringify(call.arguments || {})},
        })),
      };
    }
    return {content: step.text, toolCalls: []};
  }
}

/**
 * Run a network's front agent once with the real runner, and build its path.
 *
 * :param agents: The network's agents.
 * :param scripts: As for SwarmModel.
 * :param question: The visitor's message.
 * :return: The turn.
 */
async function runSwarm(agents, scripts, question) {
  const network = new AgentNetwork({tools: agents}, "swarm");
  const trace = new TraceBus();
  const ctx = {
    network,
    manifest: {},
    baseOrigin: `https://${PAGE}`,
    displayOrigin: PAGE,
    trace,
    isTop: true,
    frontMan: agents[0].name,
    history: [],
    llm: new SwarmModel(scripts),
    resolveMcp: async () => ({listTools: async () => []}),
  };
  const run = trace.start("run", {origin: PAGE, input: question});
  const result = await runAgent(ctx, agents[0].name, question, run, []);
  trace.end(run, {answerPreview: String(result.text ?? result)});
  return AnswerPath.build(trace.events, PAGE).turns[0];
}

const REQUEST = {type: "object", properties: {request: {type: "string"}}, required: ["request"]};
const AAOSA = {type: "object", properties: {inquiry: {type: "string"}, mode: {type: "string", enum: ["Determine", "Fulfill"]}}, required: ["inquiry", "mode"]};

test("the real runner's trace: calls asked for in one step show as run at the same time", async () => {
  const turn = await runSwarm([
    {name: "front", function: {description: "Front", parameters: REQUEST}, instructions: "AGENT front.", tools: ["planner"]},
    {name: "planner", function: {description: "Planner", parameters: REQUEST}, instructions: "AGENT planner.", tools: ["fitter", "grants"]},
    {name: "fitter", function: {description: "Fitter", parameters: REQUEST}, instructions: "AGENT fitter.", tools: []},
    {name: "grants", function: {description: "Grants", parameters: REQUEST}, instructions: "AGENT grants.", tools: []},
  ], {
    front: [{tools: [{tool: "planner", arguments: {request: "Heat pump plan"}}]}, {text: "Here is the plan."}],
    planner: [{tools: [{tool: "fitter", arguments: {request: "Price?"}}, {tool: "grants", arguments: {request: "Grant?"}}]}, {text: "Fit and grant."}],
    fitter: [{text: "£9,200 to £11,200."}],
    grants: [{text: "£5,000."}],
  }, "Should I get a heat pump?");
  assert.equal(turn.counts.agents, 4);
  assert.equal(turn.counts.parallel, 1);
  const [front] = turn.nodes;
  const planner = front.children.find((node) => node.title === `Agent planner on ${PAGE}`);
  const together = planner.children.find((node) => node.kind === "parallel");
  assert.ok(together, "The planner's two calls sit under one 'at the same time' node.");
  assert.equal(together.title, "2 calls at the same time");
  assert.deepEqual(together.children.map((node) => node.title), [`Agent fitter on ${PAGE}`, `Agent grants on ${PAGE}`]);
  // The scripted model records no model_call spans: the runtime's LLM client does that.
  assert.match(AnswerPath.summary(turn), /^4 agents · 1 parallel step · [\d.]+ s$/);
});

test("the real runner's trace: an AAOSA round shows each Determine and Fulfill with its reply", async () => {
  const scheme = (name) => ({name, function: {description: name, parameters: AAOSA}, instructions: `AGENT ${name}.`, tools: []});
  const turn = await runSwarm([
    {name: "front", function: {description: "Front", parameters: REQUEST}, instructions: "AGENT front.", tools: ["pump", "solar", "walls"]},
    scheme("pump"), scheme("solar"), scheme("walls"),
  ], {
    front: [
      {tools: ["pump", "solar", "walls"].map((tool) => ({tool, arguments: {inquiry: "Grant for a heat pump?", mode: "Determine"}}))},
      {tools: ["pump", "walls"].map((tool) => ({tool, arguments: {inquiry: "Grant for a heat pump? Owner, gas boiler.", mode: "Fulfill"}}))},
      {text: "The heat pump grant fits; insulation may too."},
    ],
    pump: [{text: "Yes: needs tenure and heating."}, {text: "Eligible: £5,000."}],
    solar: [{text: "No: solar panels only."}],
    walls: [{text: "Yes: needs the EPC band."}, {text: "Not known yet: give the EPC band."}],
  }, "Is there a grant for a heat pump?");
  assert.equal(turn.counts.determine, 3);
  assert.equal(turn.counts.fulfill, 2);
  assert.equal(turn.counts.parallel, 2);
  const text = AnswerPath.toText(turn);
  assert.match(text, /- 3 calls at the same time\n.*\n\s+- AAOSA Determine: pump\n\s+Asked whether its job fits this request\.\n\s+Replied: Yes: needs tenure and heating\./);
  assert.match(text, /- AAOSA Determine: solar\n.*\n\s+Replied: No: solar panels only\./);
  assert.match(text, /- 2 calls at the same time\n.*\n\s+- AAOSA Fulfill: pump\n\s+Asked to do its part\.\n\s+Replied: Eligible: £5,000\./);
  assert.match(AnswerPath.summary(turn), /2 parallel steps · 3 AAOSA Determines · 2 AAOSA Fulfills/);
});

test("calls one after another are not shown as run at the same time", () => {
  const trace = new TraceBus();
  recordTurn(trace, "allow");
  const [turn] = AnswerPath.build(trace.events, PAGE).turns;
  assert.equal(turn.counts.parallel, 0);
  assert.doesNotMatch(AnswerPath.toText(turn), /at the same time/);
});
