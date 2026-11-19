// Checks js/theme.js, the same file on all three sites: dark by default, a switch in the
// header, and the choice kept in this browser's storage when it allows. A small page
// stand-in is used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Theme } from "../js/theme.js";

/** Just enough of an element. */
class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.className = "";
    this.attributes = {};
    this.children = [];
    this.handlers = {};
    this.textContent = "";
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(name, handler) {
    this.handlers[name] = handler;
  }

  click() {
    this.handlers.click();
  }
}

/**
 * A page with a header and, once the switch is made, its button.
 *
 * :param header: True when the page has a header.
 * :return: The document stand-in.
 */
function page(header = true) {
  const root = new FakeElement("html");
  root.setAttribute("data-theme", "dark");
  const head = header ? new FakeElement("header") : null;
  const doc = {
    documentElement: root,
    createElement: (tag) => new FakeElement(tag),
    querySelector: (selector) => {
      if (selector === "header") {
        return head;
      }
      return selector === ".theme-switch" ? (head?.children.find((child) => child.className === "theme-switch") ?? null) : null;
    },
  };
  return {doc, root, head};
}

/** A storage that remembers. */
const memory = (start = {}) => {
  const data = {...start};
  return {getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; }, data};
};

test("The page is dark until the visitor chooses, and a saved choice is used", () => {
  assert.equal(Theme.read(memory()), "dark");
  assert.equal(Theme.read(null), "dark");
  assert.equal(Theme.read(memory({theme: "light"})), "light");
  assert.equal(Theme.read(memory({theme: "pink"})), "dark");
  assert.equal(Theme.read({getItem() { throw new Error("blocked"); }}), "dark");
});

test("The switch goes in the header, shows the theme and flips it, saving the choice", () => {
  const {doc, root, head} = page();
  const storage = memory();
  const button = Theme.attach(doc, {localStorage: storage});
  assert.equal(head.children[0], button);
  assert.equal(button.attributes.role, "switch");
  assert.equal(button.attributes["aria-checked"], "true");
  assert.equal(root.getAttribute("data-theme"), "dark");
  button.click();
  assert.equal(root.getAttribute("data-theme"), "light");
  assert.equal(button.attributes["aria-checked"], "false");
  assert.equal(storage.data.theme, "light");
  button.click();
  assert.equal(root.getAttribute("data-theme"), "dark");
  assert.equal(storage.data.theme, "dark");
});

test("A saved light choice is shown when the page loads", () => {
  const {doc, root} = page();
  const button = Theme.attach(doc, {localStorage: memory({theme: "light"})});
  assert.equal(root.getAttribute("data-theme"), "light");
  assert.equal(button.attributes["aria-checked"], "false");
});

test("Blocked storage does not stop the switch, and a page with no header still gets its theme", () => {
  const blocked = {getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }};
  const {doc, root} = page();
  const button = Theme.attach(doc, {localStorage: blocked});
  button.click();
  assert.equal(root.getAttribute("data-theme"), "light");
  const bare = page(false);
  assert.equal(Theme.attach(bare.doc, {localStorage: memory({theme: "light"})}), null);
  assert.equal(bare.root.getAttribute("data-theme"), "light");
  const noWindow = page();
  assert.ok(Theme.attach(noWindow.doc, {get localStorage() { throw new Error("denied"); }}));
});

test("Every page starts dark in its own HTML, and loads the switch", async () => {
  const pages = {
    "../index.html": "js/theme.js",
    "../../installer/index.html": "js/theme.js",
    "../../grants/index.html": "js/theme.js",
    "../lab/index.html": "../js/theme.js",
  };
  for (const [file, script] of Object.entries(pages)) {
    const html = await readFile(new URL(file, import.meta.url), "utf8").catch(() => null);
    if (html === null) {
      // The lab page belongs to the utility site only.
      assert.equal(file, "../lab/index.html");
      continue;
    }
    assert.match(html, /<html lang="en" data-theme="dark">/, `${file}: not dark by default.`);
    assert.ok(html.includes(`src="${script}"`), `${file}: does not load ${script}.`);
  }
});
