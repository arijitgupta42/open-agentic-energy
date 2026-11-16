// Checks js/live-chat.js, the same file on all three sites: the steps block and the
// streamed answer, with a small page stand-in.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LiveChat } from "../js/live-chat.js";

/** Just enough of an element. */
class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.className = "";
    this.attributes = {};
    this.children = [];
    this.parent = null;
    this.textContent = "";
    this.scrollTop = 0;
    this.scrollHeight = 100;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  remove() {
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }
}

/**
 * Build a LiveChat on fake parts.
 *
 * :return: {live, msgs}.
 */
function build() {
  const msgs = new FakeElement("div");
  const live = new LiveChat({createElement: (tag) => new FakeElement(tag)}, msgs);
  return {live, msgs};
}

const tool = (phase, id, name, kind, status) => ({kind: "tool", phase, id, tool: name, toolKind: kind, status});

test("Steps get readable names, and a partner's address shows its network", () => {
  assert.equal(LiveChat.label("retrofit_planner", "agent"), "Asking Retrofit Planner");
  assert.equal(LiveChat.label("http://localhost:8081/heatwright_installers", "remote network"), "Contacting Heatwright Installers");
  assert.equal(LiveChat.label("mcp_check_scheme", "MCP"), "Checking Check Scheme");
  assert.equal(LiveChat.label("website_get_account_state", "site action"), "Running Get Account State");
});

test("The block lists steps while the turn runs, ticks them, and folds with a count", () => {
  const {live, msgs} = build();
  live.event({kind: "run", phase: "start"});
  const block = msgs.children[0];
  assert.equal(block.tag, "details");
  assert.equal("open" in block.attributes, false, "The steps start folded.");
  live.event(tool("start", "a", "retrofit_planner", "agent"));
  live.event(tool("start", "b", "mcp_estimate", "MCP"));
  live.event(tool("end", "a", "retrofit_planner", "agent", "ok"));
  live.event(tool("end", "b", "mcp_estimate", "MCP", "error"));
  const [summary, list] = block.children;
  assert.equal(summary.textContent, "Working… Checking Estimate");
  assert.deepEqual(list.children.map((item) => item.textContent), ["✓ Asking Retrofit Planner", "✗ Checking Estimate"]);
  live.event({kind: "run", phase: "end"});
  assert.equal("open" in block.attributes, false);
  assert.equal(block.attributes["data-running"], "false");
  assert.equal(summary.textContent, "Worked through 2 steps");
});

test("A turn with no steps leaves no block, and the next turn starts a fresh one", () => {
  const {live, msgs} = build();
  live.event({kind: "run", phase: "start"});
  live.event({kind: "run", phase: "end"});
  assert.equal(msgs.children.length, 0);
  live.event({kind: "run", phase: "start"});
  live.event(tool("start", "x", "a", "agent"));
  live.event({kind: "run", phase: "end"});
  live.event({kind: "run", phase: "start"});
  assert.equal(msgs.children.length, 2);
});

test("The answer shows as it arrives, without the <next> line or the start of it", () => {
  const {live, msgs} = build();
  live.delta("The estimate");
  assert.equal(msgs.children[0].textContent, "The estimate");
  live.delta(" is £9,200.\n\n<ne");
  assert.equal(msgs.children[0].textContent, "The estimate is £9,200.");
  live.delta("xt>What next?</next>");
  assert.equal(msgs.children[0].textContent, "The estimate is £9,200.");
  assert.equal(msgs.children[0].attributes["aria-hidden"], "true");
});

test("Words from a round that went on to call tools are dropped when the next round starts", () => {
  const {live, msgs} = build();
  live.delta("Let me check.");
  live.event({kind: "model_call", phase: "start"});
  assert.equal(msgs.children.length, 0);
  live.delta("Final answer.");
  assert.equal(msgs.children[0].textContent, "Final answer.");
});

test("The runtime's own answer, or an error, replaces the streamed one; its other nodes do not", () => {
  const {live, msgs} = build();
  live.delta("Streaming…");
  live.added({className: "ns-turn-status ns-msg bot"});
  live.added({className: "ns-steps"});
  assert.equal(msgs.children.length, 1);
  live.added({className: "ns-msg bot"});
  assert.equal(msgs.children.length, 0);
});

test("The file is the same on all three sites, makes no request and each site wires it", async () => {
  const first = await readFile(new URL("../js/live-chat.js", import.meta.url), "utf8");
  assert.doesNotMatch(first, /fetch\(|XMLHttpRequest|localStorage/);
  for (const site of ["utility", "installer", "grants"]) {
    assert.equal(await readFile(new URL(`../../${site}/js/live-chat.js`, import.meta.url), "utf8"), first, `${site} differs`);
    const mount = await readFile(new URL(`../../${site}/site.js`, import.meta.url), "utf8");
    assert.match(mount, /LiveChat\.attach\(document, booted\.engine, booted\.trace\)/);
  }
});
