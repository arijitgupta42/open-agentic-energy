// Checks js/prompt-hints.js, the same file on all three sites, with a small page
// stand-in. It reads all three sites, so it lives here once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PromptHints } from "../js/prompt-hints.js";

const SITES = ["utility", "installer", "grants"];
const CONFIG = {site: "Test Site", about: "It does things.", starter: "Start here", followUps: ["First follow-up", "Second follow-up"]};

/** Just enough of an element for PromptHints. */
class FakeElement {
  constructor() {
    this.attributes = {};
    this.listeners = {};
    this.value = "";
    this.placeholder = PromptHints.DEFAULT_PLACEHOLDER;
    this.hidden = false;
    this.textContent = "";
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

  insertAdjacentElement() {}

  focus() {}
}

/**
 * Build the hints on fake parts.
 *
 * :param ask: The model stand-in.
 * :return: {hints, input, history}.
 */
function build(ask) {
  const history = [];
  const doc = {createElement: () => new FakeElement(), defaultView: {Event: class { constructor(type) { this.type = type; } }}};
  const input = new FakeElement();
  const hints = new PromptHints(doc, {bar: new FakeElement(), input, newChat: new FakeElement()}, CONFIG, ask, () => history);
  return {hints, input, history};
}

/** A Tab key event. */
function tab() {
  return {key: "Tab", prevented: false, preventDefault() { this.prevented = true; }};
}

/**
 * Finish a turn that produced an answer, and let the suggestion settle.
 *
 * :param built: The build() result.
 */
async function answered(built) {
  built.hints.turn(true);
  built.history.push({role: "user", content: "Which tariff is cheapest?"}, {role: "assistant", content: "Fixed 12 Month.\n\nCRUSE presentation turn: x"});
  built.hints.turn(false);
  await new Promise((resolve) => setTimeout(resolve, 5));
}

test("The starter shows before the first message, and Tab in an empty box takes it", () => {
  const {hints, input} = build(async () => null);
  assert.equal(input.placeholder, "Start here");
  const event = tab();
  hints.keydown(event);
  assert.equal(event.prevented, true);
  assert.equal(input.value, "Start here");
  assert.equal(hints.suggestion, "");
});

test("Tab does nothing in a box with text, with a modifier, or while a turn runs", () => {
  const {hints, input} = build(async () => null);
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

test("After a turn the model's reply is the next suggestion, cleaned to one line", async () => {
  let prompt = null;
  const built = build(async (messages) => {
    prompt = messages;
    return '"Can I switch to Fixed 12 Month?"\nBecause it is cheaper.';
  });
  await answered(built);
  assert.equal(built.input.placeholder, "Can I switch to Fixed 12 Month?");
  assert.match(prompt[0].content, /fictional demo website/);
  assert.match(prompt[1].content, /Which tariff is cheapest\?/);
  assert.doesNotMatch(prompt[1].content, /CRUSE/);
});

test("When the model gives nothing or something unusable, the fixed follow-ups are used in turn", async () => {
  const replies = [null, "Write to me at a@b.example", "x".repeat(300)];
  const built = build(async () => replies.shift());
  for (const expected of ["First follow-up", "Second follow-up", PromptHints.DEFAULT_PLACEHOLDER]) {
    await answered(built);
    assert.equal(built.input.placeholder, expected);
    built.hints.keydown(tab());
    built.input.value = "";
  }
});

test("A model that throws leaves the fixed follow-up, and a new turn cancels a slow answer", async () => {
  const failing = build(async () => {
    throw new Error("router said no");
  });
  await answered(failing);
  assert.equal(failing.input.placeholder, "First follow-up");
  let signalled = null;
  const slow = build((messages, signal) => new Promise((resolve) => {
    signalled = signal;
    setTimeout(() => resolve("Late suggestion"), 10);
  }));
  slow.hints.turn(true);
  slow.history.push({role: "user", content: "q"}, {role: "assistant", content: "a"});
  slow.hints.turn(false);
  slow.hints.turn(true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(signalled.aborted, true);
  assert.notEqual(slow.input.placeholder, "Late suggestion");
});

test("New chat goes back to the starter", () => {
  const {hints, input} = build(async () => null);
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

test("The model is not asked on the mock router or without a key, and is never given tools", async () => {
  const source = await readFile(new URL("../js/prompt-hints.js", import.meta.url), "utf8");
  assert.match(source, /tools: \[\]/);
  assert.equal(await PromptHints.ask({top: {llm: {mock: true}}}, [], undefined), null);
  assert.equal(await PromptHints.ask({top: {llm: {mock: false, apiKey: "demo"}}, byokKey: "demo"}, [], undefined), null);
});

test("The file is the same on all three sites, and each site wires its own hints", async () => {
  const first = await readFile(new URL("../js/prompt-hints.js", import.meta.url), "utf8");
  for (const site of SITES) {
    assert.equal(await readFile(new URL(`../../${site}/js/prompt-hints.js`, import.meta.url), "utf8"), first, `${site} differs`);
    const mount = await readFile(new URL(`../../${site}/site.js`, import.meta.url), "utf8");
    assert.match(mount, /PromptHints\.attach\(document, booted\.engine, AssistantMount\.HINTS\)/);
    const starter = mount.match(/starter: "([^"]+)"/)?.[1];
    assert.ok(starter, `${site} starter`);
    const follow = (mount.match(/followUps: \[([^\]]+)\]/)?.[1].match(/"[^"]+"/g) || []).map((item) => item.slice(1, -1));
    assert.ok(follow.length >= 3, `${site} follow-ups`);
    for (const text of [starter, ...follow]) {
      assert.equal(PromptHints.clean(text), text, `${site}: ${text}`);
    }
  }
});
