// Checks js/mobile.js, the same file on all three sites: the tab bar, which screen is on
// show, the chat list sheet, and the status line that must stay visible while the assistant
// is loading or failed. A small page stand-in is used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Mobile } from "../js/mobile.js";

/** Just enough of an element. */
class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.className = "";
    this.attributes = {};
    this.children = [];
    this.handlers = {};
    this.style = {props: {}, setProperty(name, value) { this.props[name] = value; }};
    this.textContent = "";
    this.scrollTop = 0;
    this.scrollHeight = 500;
    this.ids = new Set();
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  prepend(...nodes) {
    this.children.unshift(...nodes);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  addEventListener(type, handler) {
    (this.handlers[type] ||= []).push(handler);
  }

  fire(type, event = {}) {
    for (const handler of this.handlers[type] || []) {
      handler(event);
    }
  }

  contains(node) {
    return node === this || this.ids.has(node);
  }

  scrollIntoView() {
    this.scrolledIntoView = true;
  }
}

/**
 * A page with a header, links, main, the assistant and its parts.
 *
 * :param options: {assistant: false} for a page without the assistant.
 * :return: The pieces a test needs.
 */
function page(options = {}) {
  const parts = {
    header: new FakeElement("header"),
    assistant: new FakeElement("section"),
    main: new FakeElement("main"),
    status: new FakeElement("p"),
    app: new FakeElement("div"),
    msgs: new FakeElement("div"),
    tariffs: new FakeElement("section"),
    inside: new FakeElement("div"),
    askLink: new FakeElement("a"),
    tariffLink: new FakeElement("a"),
  };
  parts.main.setAttribute("data-m-label", "Account");
  parts.status.textContent = "Connecting the assistant… If this message stays, the assistant could not load.";
  parts.askLink.setAttribute("href", "#assistant");
  parts.tariffLink.setAttribute("href", "#tariffs");
  parts.assistant.ids.add(parts.inside);
  const body = new FakeElement("body");
  const root = new FakeElement("html");
  const byId = {tariffs: parts.tariffs, inside: parts.inside, assistant: parts.assistant};
  const lookup = {
    header: parts.header, "#assistant": options.assistant === false ? null : parts.assistant, main: parts.main,
    "#assistant-status": parts.status, "#agent-app": parts.app, "#ns-msgs": parts.msgs,
  };
  const doc = new FakeElement("document");
  Object.assign(doc, {
    body, documentElement: root,
    querySelector: (selector) => lookup[selector] ?? null,
    querySelectorAll: (selector) => (selector === "header nav a" ? [parts.askLink, parts.tariffLink] : []),
    getElementById: (id) => byId[id] ?? null,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
  });
  const observers = [];
  const win = new FakeElement("window");
  Object.assign(win, {
    innerHeight: 800, location: {hash: ""}, scrolled: [],
    scrollTo(x, y) { this.scrolled.push([x, y]); },
    requestAnimationFrame: (fn) => fn(),
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} },
    visualViewport: Object.assign(new FakeElement("vv"), {height: 520}),
  });
  return {...parts, doc, win, body, root, observers};
}

const tabs = (body) => body.children.find((child) => child.className === "m-tabs").children;

test("Without a header or the assistant there is no phone layout", () => {
  assert.equal(Mobile.attach(page({assistant: false}).doc, page().win), null);
});

test("Four tabs go in a bar at the bottom, the page's own named for the site, chat first", () => {
  const p = page();
  Mobile.attach(p.doc, p.win);
  const bar = tabs(p.body);
  assert.deepEqual(bar.map((tab) => tab.children[1].textContent), ["Ask", "Account", "Swarm", "Settings"]);
  assert.deepEqual(bar.map((tab) => tab.getAttribute("data-view")), ["ask", "page", "swarm", "settings"]);
  assert.equal(p.body.getAttribute("data-view"), "ask");
  assert.deepEqual(bar.map((tab) => tab.getAttribute("aria-current")), ["true", "false", "false", "false"]);
  assert.equal(bar[0].children[0].getAttribute("aria-hidden"), "true");
});

test("A tab shows its screen, and the chat comes back at its newest message", () => {
  const p = page();
  Mobile.attach(p.doc, p.win);
  const bar = tabs(p.body);
  bar[2].fire("click");
  assert.equal(p.body.getAttribute("data-view"), "swarm");
  assert.equal(bar[2].getAttribute("aria-current"), "true");
  assert.equal(bar[0].getAttribute("aria-current"), "false");
  bar[1].fire("click");
  assert.deepEqual(p.win.scrolled.at(-1), [0, 0]);
  p.msgs.scrollTop = 0;
  bar[0].fire("click");
  assert.equal(p.msgs.scrollTop, 500);
});

test("The address says which screen: the chat, or a part of the page that is scrolled to", () => {
  const p = page();
  assert.equal(Mobile.viewFor(p.doc, ""), "ask");
  assert.equal(Mobile.viewFor(p.doc, "#assistant"), "ask");
  assert.equal(Mobile.viewFor(p.doc, "#inside"), "ask");
  assert.equal(Mobile.viewFor(p.doc, "#tariffs"), "page");
  assert.equal(Mobile.viewFor(p.doc, "#nothing"), "ask");
  p.win.location.hash = "#tariffs";
  Mobile.attach(p.doc, p.win);
  assert.equal(p.body.getAttribute("data-view"), "page");
  assert.equal(p.tariffs.scrolledIntoView, true);
  p.win.location.hash = "#assistant";
  p.win.fire("hashchange");
  assert.equal(p.body.getAttribute("data-view"), "ask");
});

test("The header's links: Ask us stays on the chat, the others go to the page", () => {
  const p = page();
  Mobile.attach(p.doc, p.win);
  const ask = {prevented: false, preventDefault() { this.prevented = true; }};
  p.askLink.fire("click", ask);
  assert.equal(p.body.getAttribute("data-view"), "ask");
  assert.equal(ask.prevented, true);
  const go = {prevented: false, preventDefault() { this.prevented = true; }};
  p.tariffLink.fire("click", go);
  assert.equal(p.body.getAttribute("data-view"), "page");
  assert.equal(go.prevented, false);
});

test("The chat list opens from the Chats button, and a chosen chat, Escape, the backdrop or a tab closes it", () => {
  const p = page();
  Mobile.attach(p.doc, p.win);
  const toolbar = p.assistant.children[0];
  assert.equal(toolbar.className, "m-toolbar");
  const [chats, demo] = toolbar.children;
  assert.equal(chats.textContent, "Chats");
  assert.equal(demo.textContent, "Fictional demo");
  const open = () => chats.fire("click");
  open();
  assert.equal(p.body.getAttribute("data-sheet"), "chats");
  p.doc.fire("keydown", {key: "Escape"});
  assert.equal(p.body.hasAttribute("data-sheet"), false);
  open();
  p.doc.fire("click", {target: {closest: (selector) => (selector.includes(".chat-pick") ? {} : null)}});
  assert.equal(p.body.hasAttribute("data-sheet"), false);
  open();
  p.doc.fire("click", {target: {closest: () => null}});
  assert.equal(p.body.getAttribute("data-sheet"), "chats");
  p.body.children.find((child) => child.className === "m-backdrop").fire("click");
  assert.equal(p.body.hasAttribute("data-sheet"), false);
  open();
  tabs(p.body)[1].fire("click");
  assert.equal(p.body.hasAttribute("data-sheet"), false);
});

test("A loading or failed assistant keeps its status line on show", () => {
  const p = page();
  Mobile.attach(p.doc, p.win);
  assert.equal(p.body.getAttribute("data-m-status"), "alert");
  p.status.textContent = "Assistant connected to this page.";
  p.observers[0].callback();
  assert.equal(p.body.getAttribute("data-m-status"), "ok");
  p.status.textContent = "The assistant could not load. You can still use the page directly.";
  p.observers[0].callback();
  assert.equal(p.body.getAttribute("data-m-status"), "alert");
});

test("The developer log opening brings up the Swarm screen, where it is shown", () => {
  const p = page();
  Mobile.attach(p.doc, p.win);
  p.app.setAttribute("data-dev", "true");
  p.observers[1].callback();
  assert.equal(p.body.getAttribute("data-view"), "swarm");
  // On another screen it leaves the screen alone.
  tabs(p.body)[1].fire("click");
  p.observers[1].callback();
  assert.equal(p.body.getAttribute("data-view"), "page");
});

test("The height that is really visible follows the keyboard", () => {
  const p = page();
  Mobile.attach(p.doc, p.win);
  assert.equal(p.root.style.props["--m-vh"], "520px");
  p.win.visualViewport.height = 300;
  p.win.visualViewport.fire("resize");
  assert.equal(p.root.style.props["--m-vh"], "300px");
  // Off the page screen, the browser's own scrolling to the focused box is undone.
  assert.deepEqual(p.win.scrolled.at(-1), [0, 0]);
});

test("Every page loads the phone styles only on a phone, and the script, and says what its page tab is", async () => {
  const pages = ["../index.html", "../../installer/index.html", "../../grants/index.html"];
  for (const file of pages) {
    const html = await readFile(new URL(file, import.meta.url), "utf8").catch(() => null);
    if (html === null) {
      continue;
    }
    assert.match(html, /<link rel="stylesheet" href="mobile.css" media="\(max-width: 760px\)">/, `${file}: mobile.css`);
    assert.ok(html.includes('src="js/mobile.js"'), `${file}: js/mobile.js`);
    assert.match(html, /<main data-m-label="[A-Za-z ]+">/, `${file}: data-m-label`);
    assert.match(html, /name="viewport" content="[^"]*viewport-fit=cover/, `${file}: viewport-fit`);
  }
});
