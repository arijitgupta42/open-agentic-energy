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
  assert.deepEqual(turn.counts, {agents: 2, actions: 1, mcp: 1, partners: 1, modelCalls: 5});
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
  assert.equal(AnswerPath.summary(turn).replace(/ · [\d.]+ s$/, ""), "2 agents · 1 site action · 1 MCP tool · 1 partner network · 5 model calls");
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
