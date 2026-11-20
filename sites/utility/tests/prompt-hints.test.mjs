// Checks js/prompt-hints.js, the same file on all three sites, with a small page
// stand-in, and that each site's agents are told to write the suggestion. It reads all
// three sites, so it lives here once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PromptHints } from "../js/prompt-hints.js";

const SITES = {utility: "emberwick_energy", installer: "heatwright_installers", grants: "fernbrook_grants"};
const CONFIG = {starter: "Start here", followUps: ["First follow-up", "Second follow-up"]};

/** A text node. */
class FakeText {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parentNode = null;
  }

  get textContent() {
    return this.nodeValue;
  }

  remove() {
    this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
  }
}

/** Just enough of an element for PromptHints. */
class FakeElement {
  constructor(className = "") {
    this.className = className;
    this.attributes = {};
    this.listeners = {};
    this.childNodes = [];
    this.parentNode = null;
    this.value = "";
    this.placeholder = PromptHints.DEFAULT_PLACEHOLDER;
    this.hidden = false;
    this.ownerDocument = {createTreeWalker: (root) => FakeElement.walker(root)};
  }

  /** A walker over the text nodes under a root, in order. */
  static walker(root) {
    const texts = [];
    const visit = (node) => node.childNodes.forEach((child) => (child.nodeType === 3 ? texts.push(child) : visit(child)));
    visit(root);
    let at = 0;
    return {nextNode: () => texts[at++] || null};
  }

  get children() {
    return this.childNodes.filter((child) => child.nodeType !== 3);
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.label = value;
  }

  append(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  remove() {
    this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  dispatchEvent(event) {
    (this.listeners[event.type] || []).forEach((listener) => listener(event));
  }

  querySelectorAll(selector) {
    const kind = selector.includes(".user") ? "user" : "bot";
    return this.children.filter((child) => child.className.includes("ns-msg") && child.className.split(" ").includes(kind));
  }

  insertAdjacentElement() {}

  focus() {}
}

/**
 * Build the hints on fake parts.
 *
 * :return: {hints, input, msgs}.
 */
function build(coarse = false) {
  const view = {Event: class { constructor(type) { this.type = type; } }, matchMedia: (query) => ({matches: coarse && query === "(pointer: coarse)"})};
  const doc = {createElement: () => new FakeElement(), defaultView: view};
  const input = new FakeElement();
  const msgs = new FakeElement();
  const hints = new PromptHints(doc, {bar: new FakeElement(), input, msgs, newChat: new FakeElement()}, CONFIG);
  return {hints, input, msgs};
}

test("The hint line says Tap on a touch screen, and Press Tab on a keyboard", () => {
  assert.equal(build(false).hints.hint.label, "Press Tab to use this suggestion");
  assert.equal(build(true).hints.hint.label, "Tap to use this suggestion");
});

/**
 * Add a rendered answer, the way the runtime does: one paragraph per line.
 *
 * :param msgs: The message list.
 * :param lines: The answer's paragraphs.
 * :return: The bubble.
 */
function answer(msgs, ...lines) {
  const bubble = msgs.append(new FakeElement("ns-msg bot"));
  for (const line of lines) {
    bubble.append(new FakeElement("p")).append(new FakeText(line));
  }
  return bubble;
}

/**
 * Run a turn that ends with the given answer.
 *
 * :param built: The build() result.
 * :param lines: The answer's paragraphs.
 * :return: The bubble.
 */
function turn(built, ...lines) {
  built.hints.turn(true);
  const bubble = answer(built.msgs, ...lines);
  built.hints.turn(false);
  return bubble;
}

/** A Tab key event. */
function tab() {
  return {key: "Tab", prevented: false, preventDefault() { this.prevented = true; }};
}

test("The starter shows before the first message, and Tab in an empty box takes it", () => {
  const {hints, input} = build();
  assert.equal(input.placeholder, "Start here");
  const event = tab();
  hints.keydown(event);
  assert.equal(event.prevented, true);
  assert.equal(input.value, "Start here");
  assert.equal(hints.suggestion, "");
});

test("Tab does nothing in a box with text, with a modifier, or while a turn runs", () => {
  const {hints, input} = build();
  input.value = "my own words";
  const event = tab();
  hints.keydown(event);
  assert.equal(event.prevented, false);
  assert.equal(input.value, "my own words");
  input.value = "";
  hints.keydown({...tab(), shiftKey: true});
  assert.equal(input.value, "");
  hints.turn(true);
  hints.keydown(tab());
  assert.equal(input.value, "");
});

test("The agent's <next> line leaves the bubble and becomes the suggestion at the same moment", () => {
  const built = build();
  const bubble = turn(built, "A survey takes about an hour.", "<next>Can I book a survey?</next>");
  assert.equal(bubble.textContent, "A survey takes about an hour.");
  assert.equal(bubble.children.length, 1, "the paragraph that held only the line is gone");
  assert.equal(built.input.placeholder, "Can I book a survey?");
  const event = tab();
  built.hints.keydown(event);
  assert.equal(built.input.value, "Can I book a survey?");
});

test("A <next> line at the end of a paragraph is cut off and the rest stays", () => {
  const built = build();
  const bubble = turn(built, "The estimate is £9,200.\n<next>What would it cost to run?</next>");
  assert.equal(bubble.textContent, "The estimate is £9,200.");
  assert.equal(built.input.placeholder, "What would it cost to run?");
});

test("With no line and no question, the fixed follow-ups come in turn, each once", () => {
  const built = build();
  turn(built, "Fixed 12 Month is cheapest.");
  assert.equal(built.input.placeholder, "First follow-up");
  built.hints.keydown(tab());
  built.input.value = "";
  turn(built, "Here is the grant.");
  assert.equal(built.input.placeholder, "Second follow-up");
});

test("After a question with no line of its own, a follow-up is still suggested", () => {
  const asked = build();
  turn(asked, "What is your EPC band?");
  assert.equal(asked.input.placeholder, "First follow-up");
  assert.equal(asked.hints.canAccept(), true);
});

test("After a failed turn, the visitor's last request is suggested again", () => {
  const failed = build();
  failed.msgs.append(new FakeElement("ns-msg user")).append(new FakeText("Which tariff is cheapest?"));
  turn(failed, "⚠️ The model did not answer.");
  assert.equal(failed.input.placeholder, "Which tariff is cheapest?");
  // With no request to repeat, a follow-up stands in.
  const empty = build();
  turn(empty, "⚠️ An AI provider key is required.");
  assert.equal(empty.input.placeholder, "First follow-up");
});

test("An empty or unusable <next> line gives a follow-up instead, and the line is still removed", () => {
  for (const line of ["<next></next>", "<next>Write to me at a@b.example</next>", `<next>${"x".repeat(300)}</next>`]) {
    const built = build();
    const bubble = turn(built, "Done.", line);
    assert.equal(bubble.textContent, "Done.");
    assert.equal(built.input.placeholder, "First follow-up");
  }
});

test("A suggestion already taken is not offered again, and the follow-ups go round once all are used", () => {
  const built = build();
  const take = () => {
    built.hints.keydown(tab());
    built.input.value = "";
  };
  turn(built, "Done.", "<next>Same again</next>");
  take();
  turn(built, "Done.", "<next>Same again</next>");
  assert.equal(built.input.placeholder, "First follow-up");
  take();
  turn(built, "Done.");
  assert.equal(built.input.placeholder, "Second follow-up");
  take();
  // Every follow-up is used: they go round rather than leaving the box empty.
  for (const expected of ["First follow-up", "Second follow-up", "First follow-up"]) {
    turn(built, "Done.");
    assert.equal(built.input.placeholder, expected);
    take();
  }
});

test("New chat goes back to the starter", () => {
  const {hints, input} = build();
  hints.keydown(tab());
  input.value = "";
  hints.reset();
  assert.equal(input.placeholder, "Start here");
});

test("clean refuses what looks like personal data or a link", () => {
  assert.equal(PromptHints.clean("What are my usage figures?"), "What are my usage figures?");
  assert.equal(PromptHints.clean("Email me at x@y.com"), null);
  assert.equal(PromptHints.clean("My reference is 12345678"), null);
  assert.equal(PromptHints.clean("See https://x.example"), null);
  assert.equal(PromptHints.clean(""), null);
  assert.equal(PromptHints.clean(null), null);
});

test("The file is the same on all three sites, and each site wires its own hints", async () => {
  const first = await readFile(new URL("../js/prompt-hints.js", import.meta.url), "utf8");
  assert.doesNotMatch(first, /LlmClient|llm\.chat|fetch\(/, "the page makes no model call of its own");
  for (const site of Object.keys(SITES)) {
    assert.equal(await readFile(new URL(`../../${site}/js/prompt-hints.js`, import.meta.url), "utf8"), first, `${site} differs`);
    const mount = await readFile(new URL(`../../${site}/site.js`, import.meta.url), "utf8");
    assert.match(mount, /PromptHints\.attach\(document, AssistantMount\.HINTS\)/);
    const starter = mount.match(/starter: "([^"]+)"/)?.[1];
    assert.ok(starter, `${site} starter`);
    const follow = (mount.match(/followUps: \[([^\]]+)\]/)?.[1].match(/"[^"]+"/g) || []).map((item) => item.slice(1, -1));
    assert.ok(follow.length >= 3, `${site} follow-ups`);
    for (const text of [starter, ...follow]) {
      assert.equal(PromptHints.clean(text), text, `${site}: ${text}`);
    }
  }
});

test("Every front agent is told to end with the <next> line, with the same words on every site", async () => {
  const rules = new Set();
  for (const [site, name] of Object.entries(SITES)) {
    const config = JSON.parse(await readFile(new URL(`../../${site}/${name}.network.json`, import.meta.url), "utf8"));
    const text = config.commondefs.replacement_strings.next_rules;
    assert.ok(text, `${site}: next_rules is missing.`);
    rules.add(text.trim());
    assert.ok(config.tools[0].instructions.includes("{next_rules}"), `${site}: ${config.tools[0].name} lacks {next_rules}.`);
    for (const agent of config.tools.slice(1)) {
      assert.ok(!String(agent.instructions || "").includes("{next_rules}"), `${site}: only the front agent writes a suggestion (${agent.name}).`);
    }
  }
  assert.equal(rules.size, 1, "next_rules differs between sites. Keep it the same on all three.");
  const [rule] = rules;
  assert.match(rule, /<next>/);
  assert.match(rule, /no website_\* tools/, "a partner's network, which has no website_* tools, must leave the line out");
});
