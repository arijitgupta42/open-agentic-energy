// Checks js/chat-sessions.js, the same file on all three sites: the list of this visit's
// chats, and the swapping of messages, history, draft and suggestion between them. It uses
// a small page stand-in, so it also reads all three sites' pages and site.js files here
// once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AnswerPath } from "../js/answer-path.js";
import { ChatSessions } from "../js/chat-sessions.js";
import { TraceBus } from "../runtime/trace.js";

const SITES = ["utility", "installer", "grants"];

/** Just enough of an element, with parents, children and fragments. */
class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.className = "";
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.parentNode = null;
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.scrollTop = 0;
    this.scrollHeight = 500;
    this.focused = false;
  }

  get childNodes() {
    return this.children;
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  /** A fragment gives up its children, as a real one does when it is added. */
  adopt(nodes) {
    const taken = [];
    for (const node of nodes) {
      if (node.tag === "#fragment") {
        taken.push(...node.children.splice(0));
      } else {
        node.parentNode?.children.splice(node.parentNode.children.indexOf(node), 1);
        taken.push(node);
      }
    }
    for (const node of taken) {
      node.parentNode = this;
    }
    return taken;
  }

  append(...nodes) {
    this.children.push(...this.adopt(nodes));
  }

  replaceChildren(...nodes) {
    const taken = this.adopt(nodes);
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = taken;
  }

  cloneNode() {
    const copy = new FakeElement(this.tag);
    copy.className = this.className;
    copy.textContent = this.textContent;
    return copy;
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

  click() {
    for (const listener of this.listeners.click || []) {
      listener({type: "click"});
    }
  }

  focus() {
    this.focused = true;
  }
}

/**
 * A page with the chat list, the runtime's message list, input bar and chat box, and an
 * engine with a history.
 *
 * :param options: Extra options for ChatSessions.attach.
 * :return: The parts, the trace and the ChatSessions.
 */
function page(options = {}) {
  const list = new FakeElement("nav");
  list.hidden = true;
  const msgs = new FakeElement("div");
  const welcome = new FakeElement("div");
  welcome.className = "ns-msg bot";
  welcome.textContent = "Hello";
  msgs.append(welcome);
  const bar = new FakeElement("div");
  const input = new FakeElement("input");
  const found = {"#chat-list": list, "#agent-app #ns-msgs": msgs, "#agent-app .ns-inputbar": bar, "#agent-app #ns-input": input};
  const doc = {
    querySelector: (selector) => found[selector] || null,
    createElement: (tag) => new FakeElement(tag),
    createDocumentFragment: () => new FakeElement("#fragment"),
    defaultView: {},
  };
  const engine = {history: []};
  const trace = new TraceBus();
  const sessions = ChatSessions.attach(doc, engine, trace, options);
  return {doc, list, msgs, input, engine, trace, sessions, welcome};
}

/**
 * Send one message the way the runtime does: the user's bubble, a run in the trace, an
 * answer bubble and two history entries.
 *
 * :param parts: The page.
 * :param text: The message.
 * :return: The run's trace number.
 */
function ask(parts, text) {
  const user = new FakeElement("div");
  user.className = "ns-msg user";
  user.textContent = text;
  const answer = new FakeElement("div");
  answer.className = "ns-msg bot";
  answer.textContent = `Answer to ${text}`;
  const run = parts.trace.start("run", {origin: "emberwick.example", input: text});
  parts.msgs.append(user, answer);
  parts.trace.end(run, {answerPreview: `Answer to ${text}`});
  parts.engine.history.push({role: "user", content: text}, {role: "assistant", content: `Answer to ${text}`});
  return parts.trace.events.find((event) => event.id === run).seq;
}

/** The list's chat names, and which one is marked as on show. */
function names(parts) {
  const picks = parts.sessions.items.children.map((item) => item.children[0]);
  return {titles: picks.map((pick) => pick.textContent), current: picks.findIndex((pick) => pick.getAttribute("aria-current") === "true")};
}

test("the list shows once the assistant is there, with one empty chat", () => {
  const parts = page();
  assert.equal(parts.list.hidden, false);
  assert.deepEqual(names(parts), {titles: ["New chat"], current: 0});
  assert.equal(ChatSessions.attach({querySelector: () => null}, {history: []}, null), null, "No chat, no list.");
});

test("the first message names the chat, cut short when long", () => {
  const parts = page();
  ask(parts, "Which tariff is cheapest for me?");
  assert.deepEqual(names(parts).titles, ["Which tariff is cheapest for me?"]);
  const long = page();
  ask(long, "What would a heat pump cost to fit and run in my 95 square metre semi-detached house?");
  const [title] = names(long).titles;
  assert.ok(title.length <= ChatSessions.TITLE_LENGTH, "Cut to fit the list.");
  assert.ok(title.endsWith("…"));
  const second = page();
  ask(second, "First");
  ask(second, "Second");
  assert.deepEqual(names(second).titles, ["First"], "Only the first message names it.");
});

test("a new chat starts with the greeting, an empty history and its own list entry, and the old chat is kept", () => {
  const hints = {restored: [], snapshot: () => ({suggestion: "old", used: []}), restore(state) { this.restored.push(state); }};
  const changed = [];
  let before = 0;
  const parts = page({hints, onChange: (chat) => changed.push(chat.id), beforeChange: () => { before += 1; }});
  ask(parts, "Which tariff is cheapest for me?");
  const oldHistory = parts.engine.history;
  parts.input.value = "a draft";
  parts.sessions.newButton.click();
  assert.equal(parts.msgs.children.length, 1, "Only the greeting is on show.");
  assert.equal(parts.msgs.children[0].textContent, "Hello");
  assert.notEqual(parts.msgs.children[0], parts.welcome, "It is a copy: the old chat keeps its own.");
  assert.deepEqual(parts.engine.history, []);
  assert.notEqual(parts.engine.history, oldHistory);
  assert.equal(parts.input.value, "", "The draft stays with the chat it was typed in.");
  assert.deepEqual(parts.sessions.current.runs.size, 0);
  assert.deepEqual(names(parts), {titles: ["Which tariff is cheapest for me?", "New chat"], current: 1});
  assert.deepEqual(hints.restored, [null], "The new chat gets the site's starter.");
  assert.deepEqual(changed, [2]);
  assert.equal(before, 1);
  assert.equal(parts.input.focused, true);
});

test("a new chat while this one is empty changes nothing", () => {
  const parts = page();
  parts.sessions.newButton.click();
  assert.deepEqual(names(parts), {titles: ["New chat"], current: 0});
  assert.equal(parts.input.focused, true);
});

test("picking an earlier chat brings back its messages, history, draft and suggestion", () => {
  const hints = {
    current: "first-suggestion",
    snapshot() { return {suggestion: this.current, used: []}; },
    restore(state) { this.current = state ? state.suggestion : "starter"; },
  };
  const changed = [];
  const parts = page({hints, onChange: (chat) => changed.push(chat.id)});
  ask(parts, "First chat question");
  parts.input.value = "typing in the first chat";
  parts.sessions.newButton.click();
  ask(parts, "Second chat question");
  assert.equal(hints.current, "starter");
  hints.current = "second-suggestion";
  const [first] = parts.sessions.chats;
  parts.sessions.select(first.id);
  assert.deepEqual(parts.msgs.children.map((child) => child.textContent), ["Hello", "First chat question", "Answer to First chat question"]);
  assert.deepEqual(parts.engine.history.map((entry) => entry.content), ["First chat question", "Answer to First chat question"]);
  assert.equal(parts.input.value, "typing in the first chat");
  assert.equal(hints.current, "first-suggestion");
  assert.deepEqual(names(parts), {titles: ["First chat question", "Second chat question"], current: 0});
  assert.equal(parts.sessions.pickedButton.focused, true, "Keyboard focus stays on the picked chat.");
  // And forward again: the second chat is as it was left.
  parts.sessions.select(parts.sessions.chats[1].id);
  assert.deepEqual(parts.msgs.children.map((child) => child.textContent), ["Hello", "Second chat question", "Answer to Second chat question"]);
  assert.deepEqual(parts.engine.history.map((entry) => entry.content), ["Second chat question", "Answer to Second chat question"]);
  assert.equal(hints.current, "second-suggestion");
  assert.deepEqual(changed, [2, 1, 2], "onChange ran for each change, with the chat now on show.");
});

test("messages go back into the page as the same elements, so the runtime's buttons still work", () => {
  const parts = page();
  ask(parts, "One");
  const bubble = parts.msgs.children[1];
  parts.sessions.newButton.click();
  parts.sessions.select(parts.sessions.chats[0].id);
  assert.equal(parts.msgs.children[1], bubble);
});

test("the graph sees only the answers made in the chat on show", () => {
  const parts = page();
  ask(parts, "First chat question");
  parts.sessions.newButton.click();
  ask(parts, "Second chat question");
  const all = AnswerPath.build(parts.trace.events, "emberwick.example").turns;
  assert.equal(all.length, 2);
  assert.deepEqual(parts.sessions.turnsOf(all).map((turn) => turn.question), ["Second chat question"]);
  parts.sessions.select(parts.sessions.chats[0].id);
  assert.deepEqual(parts.sessions.turnsOf(all).map((turn) => turn.question), ["First chat question"]);
  parts.sessions.newButton.click();
  assert.deepEqual(parts.sessions.turnsOf(all), [], "A new chat starts with no answers on show.");
});

test("switching is off while the agents work, and back on after", () => {
  const parts = page();
  ask(parts, "One");
  parts.sessions.newButton.click();
  ask(parts, "Two");
  const [first] = parts.sessions.chats;
  parts.sessions.lock(true);
  assert.equal(parts.sessions.newButton.disabled, true);
  const picks = parts.sessions.items.children.map((item) => item.children[0]);
  assert.deepEqual(picks.map((pick) => pick.disabled), [true, false], "Only the chat on show stays enabled.");
  parts.sessions.select(first.id);
  parts.sessions.newButton.click();
  assert.equal(parts.sessions.current.id, 2, "Nothing changed.");
  assert.equal(parts.msgs.children[1].textContent, "Two");
  parts.sessions.lock(false);
  assert.equal(parts.sessions.newButton.disabled, false);
  parts.sessions.select(first.id);
  assert.equal(parts.sessions.current.id, 1);
});

test("the file is the same on all three sites, stores nothing and each site wires it", async () => {
  const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  const source = await read("utility/js/chat-sessions.js");
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|innerHTML/);
  for (const site of SITES) {
    assert.equal(await read(`${site}/js/chat-sessions.js`), source, `Copy sites/utility/js/chat-sessions.js to sites/${site}/js/.`);
    const html = await read(`${site}/index.html`);
    assert.match(html, /<nav id="chat-list" class="chat-list"[^>]*hidden>/);
    assert.match(html, /<aside id="chat-side"[^>]*hidden>/);
    // The list comes before the chat in the page, so it sits to the left of it.
    assert.ok(html.indexOf('id="chat-side"') < html.indexOf('data-ns-slot="chat"'), `${site}: the list must come before the chat.`);
    const mount = await read(`${site}/site.js`);
    assert.match(mount, /ChatSessions\.attach\(document, engine, trace,/);
    assert.match(mount, /graph\.update\(AssistantMount\.turns\(\)\)/, `${site}: the graph must show the chat on show only.`);
    assert.match(mount, /AssistantMount\.graph\?\.replace\(AssistantMount\.turns\(\)\)/);
  }
});
