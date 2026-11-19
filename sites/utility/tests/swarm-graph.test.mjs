// Checks "The swarm at work": js/swarm-map.js (the fixed map of the 11 agents),
// js/swarm-graph.js (what the graph shows for each answer) and js/dev-log.js (the
// developer log's filters). The modules are the same on all three sites, so their tests
// live here once. The drawing itself is checked in a browser by e2e/assistant.e2e.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TraceBus } from "../runtime/trace.js";
import { AnswerPath } from "../js/answer-path.js";
import { DevLog } from "../js/dev-log.js";
import { SwarmGraph } from "../js/swarm-graph.js";
import { SwarmMap } from "../js/swarm-map.js";

const SITES = {utility: "emberwick_energy", installer: "heatwright_installers", grants: "fernbrook_grants"};
const PAGE = "emberwick.example";
const INSTALLER = "heatwright.example";
const GRANTS = "fernbrook.example";
const OWN = "emberwick_energy";
const QUESTION = "What would a heat pump cost, and is there a grant?";

/**
 * Read a file of one site as text.
 *
 * :param site: The site's folder.
 * :param file: The path under it.
 * :return: The text.
 */
function read(site, file) {
  return readFile(new URL(`../../${site}/${file}`, import.meta.url), "utf8");
}

/**
 * Record one model call the way the runtime's LLM client does.
 *
 * :param trace: The TraceBus.
 * :param parent: The agent's span.
 * :param origin: The agent's host.
 */
function model(trace, parent, origin) {
  const span = trace.start("model_call", {parent, origin, model: "openai/gpt-6-luna", mock: false, routerHost: "openrouter.ai", keySource: "local BYOK (not shown)"});
  trace.end(span, {});
}

/**
 * Record the heat pump question up to the two partner calls: the front agent hands it to
 * retrofit_planner, which asks usage_analyst and both partners in one step. The
 * installer is allowed and runs. The grants call is left as the caller says.
 *
 * :param trace: The TraceBus to record into.
 * :param grants: "waiting" (the consent card is still open), "declined" or "allowed".
 * :return: The spans still open, to end with finish().
 */
function recordHeatPump(trace, grants) {
  const run = trace.start("run", {origin: PAGE, input: QUESTION});
  const front = trace.start("agent", {parent: run, origin: PAGE, agent: "emberwick_assistant", network: OWN});
  model(trace, front, PAGE);
  const toPlanner = trace.start("tool", {parent: front, origin: PAGE, tool: "retrofit_planner", toolKind: "agent", args: {input: "Plan a heat pump for a 95 m2 semi."}});
  const planner = trace.start("agent", {parent: toPlanner, origin: PAGE, agent: "retrofit_planner", network: OWN});
  model(trace, planner, PAGE);
  // One step, three calls: they start before any of them ends.
  const toUsage = trace.start("tool", {parent: planner, origin: PAGE, tool: "usage_analyst", toolKind: "agent", args: {input: "Running cost with a heat pump?"}});
  const toInstaller = trace.start("tool", {parent: planner, origin: PAGE, tool: "heatwright_installers", toolKind: "remote network", args: {request: "Heat pump estimate for a 95 m2 semi?"}});
  const toGrants = trace.start("tool", {parent: planner, origin: PAGE, tool: "fernbrook_grants", toolKind: "remote network", args: {request: "Which grants pay towards a heat pump?"}});
  const usage = trace.start("agent", {parent: toUsage, origin: PAGE, agent: "usage_analyst", network: OWN});
  model(trace, usage, PAGE);
  const cost = trace.start("tool", {parent: usage, origin: PAGE, tool: "mcp_estimate_heat_pump_running_cost", toolKind: "MCP", args: {floorArea: 95}});
  trace.end(cost, {resultPreview: "{}"});
  trace.end(usage, {});
  trace.end(toUsage, {resultPreview: "About 3,900 kWh a year."});
  trace.note("consent", {page: true, peerOrigin: INSTALLER, decision: "allow", consentFor: "network"});
  const fetched = trace.start("remote_fetch", {parent: toInstaller, origin: PAGE, peerOrigin: INSTALLER});
  trace.end(fetched, {network: "heatwright_installers", peerOrigin: INSTALLER});
  const call = trace.start("remote_call", {parent: toInstaller, origin: PAGE, peerOrigin: INSTALLER, network: "heatwright_installers"});
  const installer = trace.start("agent", {parent: call, origin: INSTALLER, agent: "heatwright_assistant", network: "heatwright_installers"});
  model(trace, installer, INSTALLER);
  trace.end(installer, {});
  trace.end(call, {});
  trace.end(toInstaller, {resultPreview: "An 8 kW pump."});
  if (grants === "declined") {
    trace.note("consent", {page: true, peerOrigin: GRANTS, decision: "decline", consentFor: "network"});
    trace.note("consent", {parent: toGrants, origin: PAGE, peerOrigin: GRANTS, decision: "declined"});
    trace.end(toGrants, {resultPreview: `The user declined to contact ${GRANTS}. Proceed without it and note that to the user.`});
  }
  if (grants === "allowed") {
    trace.note("consent", {page: true, peerOrigin: GRANTS, decision: "allow", consentFor: "network"});
    const grantCall = trace.start("remote_call", {parent: toGrants, origin: PAGE, peerOrigin: GRANTS, network: "fernbrook_grants"});
    const grantFront = trace.start("agent", {parent: grantCall, origin: GRANTS, agent: "fernbrook_assistant", network: "fernbrook_grants"});
    model(trace, grantFront, GRANTS);
    for (const mode of ["Determine", "Fulfill"]) {
      const ask = trace.start("tool", {parent: grantFront, origin: GRANTS, tool: "heat_pump_grant_agent", toolKind: "agent", args: {inquiry: "A grant towards a heat pump?", mode}});
      const scheme = trace.start("agent", {parent: ask, origin: GRANTS, agent: "heat_pump_grant_agent", network: "fernbrook_grants"});
      model(trace, scheme, GRANTS);
      trace.end(scheme, {});
      trace.end(ask, {resultPreview: mode === "Determine" ? "Yes: it pays towards a heat pump." : "The grant applies."});
    }
    trace.end(grantFront, {});
    trace.end(grantCall, {});
    trace.end(toGrants, {resultPreview: "The grant applies."});
  }
  return {run, front, toPlanner, planner};
}

/**
 * End the spans recordHeatPump() left open.
 *
 * :param trace: The TraceBus.
 * :param open: What recordHeatPump() returned.
 */
function finish(trace, open) {
  trace.end(open.planner, {});
  trace.end(open.toPlanner, {resultPreview: "Plan: an 8 kW pump."});
  trace.end(open.front, {});
  trace.end(open.run, {answerPreview: "Plan: an 8 kW pump."});
}

/**
 * Build the newest turn of a trace and its activity.
 *
 * :param trace: The TraceBus.
 * :return: {turn, act}.
 */
function latest(trace) {
  const turn = AnswerPath.build(trace.events, PAGE).turns.at(-1);
  return {turn, act: SwarmGraph.activity(turn)};
}

test("the three sites carry the same swarm-map.js, swarm-graph.js, dev-log.js and brand-logos.js", async () => {
  for (const file of ["js/swarm-map.js", "js/swarm-graph.js", "js/dev-log.js", "js/brand-logos.js"]) {
    const utility = await read("utility", file);
    assert.equal(await read("installer", file) === utility, true, `Copy sites/utility/${file} to sites/installer/js/.`);
    assert.equal(await read("grants", file) === utility, true, `Copy sites/utility/${file} to sites/grants/js/.`);
  }
});

test("the map lists exactly the agents and calls the three published networks declare", async () => {
  const agents = [];
  const calls = [];
  const fronts = {};
  for (const [site, name] of Object.entries(SITES)) {
    const manifest = JSON.parse(await read(site, "agent-manifest.json"));
    fronts[name] = manifest.networks.find((entry) => entry.name === name).front_man;
  }
  for (const [site, name] of Object.entries(SITES)) {
    const network = JSON.parse(await read(site, `${name}.network.json`));
    const names = network.tools.map((entry) => entry.name);
    for (const entry of network.tools) {
      agents.push(SwarmMap.key(name, entry.name));
      for (const ref of entry.tools || []) {
        if (typeof ref !== "string") {
          continue;
        }
        if (names.includes(ref)) {
          calls.push(`${SwarmMap.key(name, entry.name)}>${SwarmMap.key(name, ref)}`);
        } else if (/^https?:\/\//.test(ref) && !ref.endsWith("/mcp")) {
          const partner = new URL(ref).pathname.split("/").pop();
          calls.push(`${SwarmMap.key(name, entry.name)}>${SwarmMap.key(partner, fronts[partner])}`);
        }
      }
    }
  }
  assert.deepEqual(SwarmMap.AGENTS.map((agent) => SwarmMap.key(agent.network, agent.name)).sort(), agents.sort());
  assert.deepEqual(SwarmMap.CALLS.map(([from, to]) => `${from}>${to}`).sort(), calls.sort());
  assert.equal(SwarmMap.AGENTS.length, 11);
  for (const [name, front] of Object.entries(fronts)) {
    assert.equal(SwarmMap.front(name), SwarmMap.key(name, front));
  }
  assert.deepEqual(SwarmMap.SITES.map((site) => site.network), Object.values(SITES));
});

test("each site's colour in the map is the brand colour of its own stylesheet", async () => {
  for (const [site, name] of Object.entries(SITES)) {
    const styles = await read(site, "styles.css");
    assert.ok(styles.includes(`--brand: ${SwarmMap.site(name).color};`), `${name}'s colour differs from sites/${site}/styles.css.`);
  }
});

test("the layout places 11 agents and 14 calls inside the drawing, with no two agents touching", () => {
  const plan = SwarmGraph.layout();
  const nodes = [...plan.nodes.values()];
  assert.equal(nodes.length, 11);
  assert.equal(plan.edges.length, 14);
  assert.equal(plan.edges.filter((edge) => edge.partner).length, 5);
  for (const node of nodes) {
    const site = plan.sites.find((candidate) => candidate.network === node.network);
    assert.ok(node.x - node.r > site.x && node.x + node.r < site.x + site.width, `${node.name} is outside its site's box.`);
    assert.ok(node.y - node.r > site.y && node.y + node.r < site.y + site.height, `${node.name} is outside its site's box.`);
    for (const other of nodes) {
      if (other !== node) {
        assert.ok(Math.hypot(other.x - node.x, other.y - node.y) > other.r + node.r + 10, `${node.name} touches ${other.name}.`);
      }
    }
  }
  for (const edge of plan.edges) {
    assert.match(edge.d, /^M[\d.-]+,[\d.-]+ [LC]/);
    assert.equal(edge.arrow.split(" ").length, 3);
  }
});

test("while the consent card waits, the partner shows as asking, not as working", () => {
  const trace = new TraceBus();
  recordHeatPump(trace, "waiting");
  const {turn, act} = latest(trace);
  const state = (name, network = OWN) => SwarmGraph.agentState(SwarmMap.key(network, name), act);
  assert.equal(state("emberwick_assistant"), "running");
  assert.equal(state("retrofit_planner"), "running");
  assert.equal(state("usage_analyst"), "ok");
  assert.equal(state("tariff_advisor"), "idle");
  assert.equal(state("heatwright_assistant", "heatwright_installers"), "ok");
  assert.equal(state("fernbrook_assistant", "fernbrook_grants"), "idle", "Nothing was sent to the grants site yet.");
  assert.equal(act.edges.get("emberwick_energy/retrofit_planner>fernbrook_grants/fernbrook_assistant").status, "asking");
  assert.equal(SwarmGraph.siteStatus("fernbrook_grants", OWN, act), "partner · asking you");
  assert.equal(SwarmGraph.siteStatus("heatwright_installers", OWN, act), "partner · ran here");
  assert.equal(SwarmGraph.siteStatus(OWN, OWN, act), "this site");
  const lines = SwarmGraph.agentLines("fernbrook_grants/fernbrook_assistant", act, turn, OWN);
  assert.deepEqual(lines.rows.at(-1), {label: "", text: "Waiting for your OK before this site is contacted."});
  const planner = SwarmGraph.agentLines("emberwick_energy/retrofit_planner", act, turn, OWN);
  assert.deepEqual(planner.rows.at(-1), {label: "", text: "Working on it now: so far it asked Usage and Heatwright Home Energy."});
});

test("a declined partner shows as stopped, with the visitor's decision", () => {
  const trace = new TraceBus();
  finish(trace, recordHeatPump(trace, "declined"));
  const {turn, act} = latest(trace);
  const edge = act.edges.get("emberwick_energy/retrofit_planner>fernbrook_grants/fernbrook_assistant");
  assert.equal(edge.status, "refused");
  assert.equal(edge.why, `You declined contact with ${GRANTS}.`);
  assert.equal(SwarmGraph.agentState("fernbrook_grants/fernbrook_assistant", act), "refused");
  assert.equal(SwarmGraph.siteStatus("fernbrook_grants", OWN, act), "partner · declined");
  assert.equal(act.agents.has("fernbrook_grants/fernbrook_assistant"), false, "A declined partner's agent never ran.");
  const lines = SwarmGraph.agentLines("fernbrook_grants/fernbrook_assistant", act, turn, OWN);
  assert.deepEqual(lines.rows.at(-1), {label: "", text: "You chose not to contact this site."});
  const call = SwarmGraph.edgeLines(SwarmGraph.layout().edges.find((item) => item.key === "emberwick_energy/retrofit_planner>fernbrook_grants/fernbrook_assistant"), act, turn);
  assert.equal(call.rows.at(-1).text, "Not sent: “Which grants pay towards a heat pump?”");
});

test("a finished answer gives each agent a plain tooltip: its job, who asked it what, and what it did", () => {
  const trace = new TraceBus();
  finish(trace, recordHeatPump(trace, "allowed"));
  const {turn, act} = latest(trace);
  assert.equal([...act.agents.values()].filter((record) => record.runs).length, turn.counts.agents - 1, "The scheme agent ran twice but is one agent.");
  const usage = SwarmGraph.agentLines("emberwick_energy/usage_analyst", act, turn, OWN);
  assert.equal(usage.title, "Usage", "A visitor sees the agent's short label, not its identifier.");
  assert.equal(usage.subtitle, "Emberwick Energy");
  assert.equal(usage.logo, "ember");
  assert.deepEqual(usage.rows, [
    {label: "", text: "Reads the account's usage, month by month."},
    {label: "", text: "Retrofit asked: “Running cost with a heat pump?”"},
    {label: "", text: "For this answer it worked out heat pump running costs."},
  ]);
  const front = SwarmGraph.agentLines("emberwick_energy/emberwick_assistant", act, turn, OWN).rows;
  assert.deepEqual(front.slice(1), [
    {label: "", text: "Took your question."},
    {label: "", text: "For this answer it asked Retrofit and wrote the reply you see."},
  ]);
  const planner = SwarmGraph.agentLines("emberwick_energy/retrofit_planner", act, turn, OWN).rows;
  assert.deepEqual(planner.at(-1), {label: "", text: "For this answer it asked Usage, Heatwright Home Energy and Fernbrook Retrofit Grants."});
  const grant = SwarmGraph.agentLines("fernbrook_grants/heat_pump_grant_agent", act, turn, OWN).rows;
  assert.deepEqual(grant.slice(1), [
    {label: "", text: "Assistant asked: “A grant towards a heat pump?”"},
    {label: "", text: "For this answer it said whether it could help and gave its part of the answer (you allowed it)."},
  ], "An AAOSA scheme agent's two steps read as plain words.");
  const scheme = act.agents.get("fernbrook_grants/heat_pump_grant_agent");
  assert.equal(scheme.runs, 2);
  assert.deepEqual(scheme.asks.map((ask) => ask.mode), ["Determine", "Fulfill"]);
  assert.deepEqual(act.edges.get("fernbrook_grants/fernbrook_assistant>fernbrook_grants/heat_pump_grant_agent").modes, ["Determine", "Fulfill"]);
  const partner = SwarmGraph.agentLines("heatwright_installers/heatwright_assistant", act, turn, OWN).rows;
  assert.deepEqual(partner.slice(1), [
    {label: "", text: "Retrofit (Emberwick Energy) asked: “Heat pump estimate for a 95 m2 semi?”"},
    {label: "", text: "It answered from what it was asked (you allowed it)."},
  ]);
  const call = SwarmGraph.edgeLines(SwarmGraph.layout().edges.find((edge) => edge.key === "emberwick_energy/retrofit_planner>heatwright_installers/heatwright_assistant"), act, turn);
  assert.equal(call.title, "Retrofit → Heatwright Home Energy");
  assert.deepEqual(call.rows, [
    {label: "", text: "Used for this answer (you allowed it)."},
    {label: "", text: "Sent: “Heat pump estimate for a 95 m2 semi?”"},
  ]);
  const twice = SwarmGraph.edgeLines(SwarmGraph.layout().edges.find((edge) => edge.key === "fernbrook_grants/fernbrook_assistant>fernbrook_grants/heat_pump_grant_agent"), act, turn);
  assert.equal(twice.rows[0].text, "Used twice for this answer.");
  const unused = SwarmGraph.agentLines("emberwick_energy/tariff_advisor", act, turn, OWN).rows;
  assert.deepEqual(unused.at(-1), {label: "", text: "Not needed for this answer."});
});

test("every site action and MCP tool has plain words for the tooltip, in the present and the past", async () => {
  const files = ["utility/site-actions.js", "installer/site-actions.js", "grants/site-actions.js"].map((file) => new URL(`../../${file}`, import.meta.url));
  files.push(...["utility", "installer", "grants"].map((site) => new URL(`../../../server/tools/${site}.mjs`, import.meta.url)));
  const names = new Set();
  for (const file of files) {
    for (const [, name] of (await readFile(file, "utf8")).matchAll(/^\s+name: "([a-z_]+)",/gm)) {
      names.add(name);
    }
  }
  assert.ok(names.size >= 15, `Expected the tool names of all three sites, found ${names.size}.`);
  for (const name of names) {
    assert.ok(Object.hasOwn(SwarmMap.TOOLS, name), `SwarmMap.TOOLS lacks words for ${name}.`);
  }
  assert.equal(SwarmMap.toolWords("website_get_account_state", true), "read the account");
  assert.equal(SwarmMap.toolWords("request_survey", true), "booked a survey");
  assert.equal(SwarmMap.toolWords("set_estimate", true), "put an estimate on the page");
  assert.equal(SwarmMap.toolWords("mcp_something_new", true), "used something new");
  assert.equal(SwarmMap.toolWords("switch_tariff"), "switch the tariff");
});

test("a tooltip holds nothing technical: no identifiers, tool names, models or timings", () => {
  const trace = new TraceBus();
  finish(trace, recordHeatPump(trace, "allowed"));
  const {turn, act} = latest(trace);
  const tips = [
    ...SwarmMap.AGENTS.map((agent) => SwarmGraph.agentLines(SwarmMap.key(agent.network, agent.name), act, turn, OWN)),
    ...SwarmGraph.layout().edges.map((edge) => SwarmGraph.edgeLines(edge, act, turn)),
  ];
  for (const tip of tips) {
    const words = [tip.title, tip.subtitle, ...tip.rows.map((row) => `${row.label} ${row.text}`)].join(" ");
    assert.doesNotMatch(words, /_|AAOSA|Determine|Fulfill|model call|\d s\b|openai|website|mcp/i, `A tooltip is too technical: ${words}`);
    assert.ok(tip.rows.length <= 3, `A tooltip stays to three lines: ${words}`);
    for (const row of tip.rows) {
      assert.equal(row.label, "", "A tooltip row is one plain sentence, with no label.");
    }
  }
});

test("a tooltip never shows the runtime's own notes, only what the agent did", () => {
  // A skipped partner, a limit, a tool call and a failed model call used to add a red "Note"
  // row. They are for the developer log: a visitor reads what the agent did, and the
  // orb itself turns red when it failed.
  const asked = "Which tariff would be cheapest for me?";
  const turn = {
    question: asked,
    answer: "Green Flex.",
    nodes: [{
      kind: "agent", agent: "emberwick_assistant", network: OWN, status: "error", error: "The model call failed", asked, replied: "Green Flex.",
      children: [
        {kind: "skip", title: "Not offered heatwright_installers", detail: "The runtime left it out: already in this request.", status: "ok", children: []},
        {kind: "limit", title: "Stopped by the runtime", detail: "too many steps", status: "refused", children: []},
        {kind: "tool", title: "Tool website_get_account_state (site action)", detail: "", status: "ok", children: []},
        {kind: "error", title: "Something failed", error: "boom", status: "error", children: []},
        {kind: "model", title: "Model: openai/gpt-6-luna", calls: 1, error: "429 rate limited", status: "error", children: []},
      ],
    }],
  };
  const act = SwarmGraph.activity(turn);
  const lines = SwarmGraph.agentLines("emberwick_energy/emberwick_assistant", act, turn, OWN);
  assert.ok(lines.rows.length > 0, "The tooltip still says who asked and what came back.");
  for (const row of lines.rows) {
    assert.notEqual(row.label, "Note");
    assert.doesNotMatch(`${row.label} ${row.text}`, /runtime left it out|Stopped by the runtime|rate limited|boom/);
  }
});

test("no tooltip ever holds a key, and the panel summary counts what ran", () => {
  const trace = new TraceBus();
  finish(trace, recordHeatPump(trace, "allowed"));
  const {turn, act} = latest(trace);
  const text = JSON.stringify(SwarmMap.AGENTS.map((agent) => SwarmGraph.agentLines(SwarmMap.key(agent.network, agent.name), act, turn, OWN)));
  assert.doesNotMatch(text, /sk-|Bearer |BYOK/);
  assert.equal(SwarmGraph.brief(turn, act).replace(/ · [\d.]+ s$/, ""), "6 agents · 3 sites · 1 tool · 7 model calls");
});

test("the developer log shows the answer on show: an event belongs to the turn that spans it", () => {
  const trace = new TraceBus();
  finish(trace, recordHeatPump(trace, "allowed"));
  const open = recordHeatPump(trace, "waiting");
  const [first, second] = AnswerPath.build(trace.events, PAGE).turns;
  assert.equal(DevLog.inTurn(first.seq, first), true);
  assert.equal(DevLog.inTurn(first.endSeq, first), true);
  assert.equal(DevLog.inTurn(second.seq, first), false);
  assert.equal(DevLog.inTurn(first.seq, second), false);
  assert.equal(second.endSeq, null, "The second answer is still running.");
  assert.equal(DevLog.inTurn(second.seq + 1000, second), true, "A running answer takes every later event.");
  assert.equal(DevLog.inTurn(NaN, first), false, "A row from before the log was watched belongs to no answer.");
  assert.equal(DevLog.inTurn(NaN, null), true);
  finish(trace, open);
});

test("the graph moves while an answer is being made, and stands still once it is done", async () => {
  const trace = new TraceBus();
  const open = recordHeatPump(trace, "allowed");
  assert.equal(SwarmGraph.live(latest(trace).turn), true, "A running answer moves.");
  finish(trace, open);
  assert.equal(SwarmGraph.live(latest(trace).turn), false, "A finished answer stands still.");
  assert.equal(SwarmGraph.live(null), false);
  assert.equal(SwarmGraph.live({status: "error"}), false);
  // Every moving swarm rule waits for data-live="yes", which apply() sets from live().
  for (const site of ["utility", "installer", "grants"]) {
    const css = (await read(site, "styles.css")).replace(/\r\n/g, "\n");
    for (const rule of css.split("\n").filter((line) => /\.swarm-/.test(line) && /animation:\s*swarm-/.test(line))) {
      assert.match(rule, /\.swarm-map\[data-live="yes"\]/, `${site}: this rule moves after the answer is done: ${rule.trim()}`);
    }
  }
});

test("before the first message every agent is idle and says so", () => {
  const act = SwarmGraph.activity(null);
  assert.equal(act.agents.size, 0);
  assert.equal(SwarmGraph.agentState("emberwick_energy/tariff_advisor", act), "idle");
  assert.equal(SwarmGraph.siteStatus("fernbrook_grants", OWN, act), "partner");
  assert.deepEqual(SwarmGraph.agentLines("emberwick_energy/tariff_advisor", act, null, OWN).rows, [{label: "", text: "Works out which tariff suits this account."}]);
});

test("a chat message maps to its answer, also after 'New chat' removed older messages", () => {
  const turns = [{question: "First"}, {question: "Second"}, {question: "Third"}];
  assert.equal(SwarmGraph.turnOfBubble(["First", "Second", "Third"], 0, turns), 0);
  assert.equal(SwarmGraph.turnOfBubble(["First", "Second", "Third"], 2, turns), 2);
  // "New chat" after the second answer: only the third message is left in the chat.
  assert.equal(SwarmGraph.turnOfBubble(["Third"], 0, turns), 2);
  assert.equal(SwarmGraph.turnOfBubble(["Something else"], 0, turns), -1);
  assert.equal(SwarmGraph.turnOfBubble(["a", "b", "c", "Third"], 0, turns), -1);
});

test("every page has the graph's panel beside the chat, and no step-by-step record", async () => {
  for (const site of Object.keys(SITES)) {
    const page = await read(site, "index.html");
    assert.match(page, /<div data-ns-slot="chat"><\/div>\s*<aside id="swarm-map" class="swarm-map" aria-labelledby="swarm-map-heading" hidden>/, `sites/${site}/index.html has no swarm panel beside the chat.`);
    assert.doesNotMatch(page, /answer-path/, `sites/${site}/index.html still has the step-by-step record.`);
    assert.doesNotMatch(page, /<script[^>]+src="https?:/, "No third-party script may load on the page.");
    const styles = await read(site, "styles.css");
    assert.ok(styles.includes("@media (prefers-reduced-motion: reduce)"), `sites/${site}/styles.css must stop the graph's motion on request.`);
    for (const [id] of DevLog.FILTERS.filter(([filter]) => filter !== "all")) {
      assert.ok(styles.includes(`#ns-rows[data-show="${id}"]`), `sites/${site}/styles.css has no rule for the "${id}" log filter.`);
    }
  }
});
