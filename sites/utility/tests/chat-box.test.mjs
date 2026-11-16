// Checks js/chat-box.js, the same file on all three sites: the textarea that grows in
// front of the runtime's one-line chat box, and how the two are kept the same. The
// growing itself is checked in a browser by e2e/chats.e2e.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ChatBox } from "../js/chat-box.js";

const SITES = ["utility", "installer", "grants"];

/** Just enough of an element. */
class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.className = "";
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.parentNode = null;
    this.hidden = false;
    this.scrollHeight = 0;
    this.focused = false;
    this.events = [];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  append(...nodes) {
    nodes.forEach((node) => {
      node.parentNode = this;
    });
    this.children.push(...nodes);
  }

  insertBefore(node, before) {
    node.parentNode = this;
    this.children.splice(this.children.indexOf(before), 0, node);
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  dispatchEvent(event) {
    this.events.push(event.type);
    for (const listener of this.listeners[event.type] || []) {
      listener(event);
    }
    return !event.defaultPrevented;
  }

  focus() {
    this.focused = true;
  }
}

/**
 * The runtime's input in a bar, with the scripts that listen to it.
 *
 * :return: {doc, bar, input, box, keys}: keys lists the keys the input's listeners saw.
 */
function page() {
  const bar = new FakeElement("div");
  const input = new FakeElement("input");
  input.value = "";
  input.placeholder = "Type a request…";
  bar.append(input);
  const keys = [];
  input.addEventListener("keydown", (event) => {
    keys.push(event.key);
    if (event.key === "Tab") {
      event.preventDefault();
    }
  });
  const doc = {
    querySelector: (selector) => (selector === "#agent-app #ns-input" ? input : null),
    createElement: (tag) => new FakeElement(tag),
    defaultView: {Event, KeyboardEvent: class extends Event {
      constructor(type, init) {
        super(type, init);
        this.key = init.key;
      }
    }},
  };
  const chatBox = ChatBox.attach(doc);
  return {doc, bar, input, chatBox, box: chatBox.box, keys};
}

test("the textarea takes the input's place, and the input stays for the runtime but hidden", () => {
  const {bar, input, box} = page();
  const wrap = bar.children[0];
  assert.equal(wrap.className, "ns-inputwrap");
  assert.deepEqual(wrap.children, [box, input]);
  assert.equal(input.hidden, true);
  assert.equal(box.placeholder, "Type a request…");
  assert.equal(box.attributes["aria-label"], "Your request");
  assert.equal(ChatBox.attach({querySelector: () => null, createElement: () => null}), null, "No chat box, nothing added.");
});

test("the input's value is the textarea's text, line breaks included, and typing tells the input's listeners", () => {
  const {input, box} = page();
  box.value = "Which tariff\nis cheapest?";
  box.dispatchEvent({type: "input"});
  assert.equal(input.value, "Which tariff\nis cheapest?", "Pasted and typed line breaks reach the runtime.");
  assert.equal(box.value, "Which tariff\nis cheapest?");
  assert.ok(input.events.includes("input"), "The runtime and the suggestions see it as typed.");
});

test("a script setting the input's value, such as the runtime clearing it after Send, empties the textarea", () => {
  const {input, box} = page();
  input.value = "A suggestion";
  assert.equal(box.value, "A suggestion");
  input.value = "";
  assert.equal(box.value, "");
  assert.equal(box.style.overflowY, "hidden");
});

test("the box grows with its text up to the limit, then scrolls", () => {
  const {chatBox, box} = page();
  box.value = "a long request";
  box.scrollHeight = 90;
  chatBox.resize();
  assert.equal(box.style.height, "90px");
  assert.equal(box.style.overflowY, "hidden");
  box.scrollHeight = 400;
  chatBox.resize();
  assert.equal(box.style.height, `${ChatBox.MAX_HEIGHT}px`);
  assert.equal(box.style.overflowY, "auto");
  box.value = "";
  chatBox.resize();
  assert.equal(box.style.height, "", "Empty: one line, however long the placeholder.");
});

test("Enter sends and Tab takes the suggestion, through the input's own listeners; Shift+Enter is a line break", () => {
  const {box, keys} = page();
  const press = (key, extra = {}) => {
    const event = {type: "keydown", key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra};
    box.dispatchEvent(event);
    return event;
  };
  assert.equal(press("Enter").defaultPrevented, true, "Enter sends, so the textarea adds no line break.");
  assert.equal(press("Enter", {shiftKey: true}).defaultPrevented, false, "Shift+Enter is left to the textarea, which starts a new line.");
  assert.equal(press("Tab").defaultPrevented, true, "Tab was taken by the suggestion, so it does not leave the box.");
  assert.equal(press("a").defaultPrevented, false);
  assert.deepEqual(keys, ["Enter", "Tab"], "Only Enter and Tab reach the input; Shift+Enter and other keys stay in the textarea.");
});

test("the page's focus calls reach the textarea, and a changed placeholder follows", () => {
  const {input, box} = page();
  input.focus();
  assert.equal(box.focused, true);
});

test("the file is the same on all three sites, stores and sends nothing, and each site wires it first", async () => {
  const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  const source = await read("utility/js/chat-box.js");
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML/);
  for (const site of SITES) {
    assert.equal(await read(`${site}/js/chat-box.js`), source, `Copy sites/utility/js/chat-box.js to sites/${site}/js/.`);
    const mount = await read(`${site}/site.js`);
    assert.ok(mount.indexOf("ChatBox.attach(document)") > 0);
    assert.ok(mount.indexOf("ChatBox.attach(document)") < mount.indexOf("VoiceInput.attach(document, window)"), `${site}: the growing box must be added before the mic.`);
  }
});
