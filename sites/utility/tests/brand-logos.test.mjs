// Checks js/brand-logos.js: the ember, the fan and the leaf drawn as SVG for the swarm
// graph and the chat header, and the swap of the manifest brand's plain character for them.
// The module is the same on all three sites, so its tests live here once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BrandLogos } from "../js/brand-logos.js";
import { SwarmMap } from "../js/swarm-map.js";

const SITES = {utility: "emberwick_energy", installer: "heatwright_installers", grants: "fernbrook_grants"};

/** A text node with just what the swap uses. */
class FakeText {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parentNode = null;
  }

  splitText(offset) {
    const after = new FakeText(this.nodeValue.slice(offset));
    this.nodeValue = this.nodeValue.slice(0, offset);
    this.parentNode.insertBefore(after, this.nextSibling());
    return after;
  }

  nextSibling() {
    const siblings = this.parentNode.children;
    return siblings[siblings.indexOf(this) + 1] || null;
  }
}

/** An element with just what the logos use. */
class FakeElement {
  constructor(tag, doc) {
    this.nodeType = 1;
    this.tag = tag;
    this.ownerDocument = doc;
    this.attrs = {};
    this.children = [];
    this.parentNode = null;
  }

  setAttribute(key, value) {
    this.attrs[key] = value;
  }

  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === "string" ? new FakeText(node) : node;
      child.parentNode = this;
      this.children.push(child);
    }
  }

  insertBefore(node, before) {
    node.parentNode = this;
    this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, node);
  }

  texts() {
    return this.children.filter((child) => child.nodeType === 3).map((child) => child.nodeValue);
  }
}

/** A document that makes those elements and walks the text under a root. */
class FakeDocument {
  createElementNS(namespace, tag) {
    return new FakeElement(tag, this);
  }

  createTreeWalker(root) {
    const texts = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.nodeType === 3) {
          texts.push(child);
        } else {
          visit(child);
        }
      }
    };
    visit(root);
    return {nextNode: () => texts.shift() || null};
  }
}

/**
 * Collect an element and every element under it.
 *
 * :param element: The element.
 * :return: A list of elements.
 */
function all(element) {
  return [element, ...element.children.filter((child) => child.nodeType === 1).flatMap(all)];
}

test("each site has a logo, with its own plain character, and the logos differ", () => {
  const kinds = SwarmMap.SITES.map((site) => site.logo);
  assert.deepEqual(kinds, ["ember", "fan", "leaf"]);
  assert.equal(new Set(kinds.map((kind) => BrandLogos.GLYPHS[kind])).size, 3);
  for (const kind of kinds) {
    assert.ok(BrandLogos.SHAPES[kind].length > 0, `${kind} has shapes.`);
    assert.ok(BrandLogos.GLYPHS[kind].codePointAt(0) > 0x2000, `${kind}'s character is not plain ASCII.`);
  }
});

test("a logo is a hidden inline SVG that takes the colour around it", () => {
  const doc = new FakeDocument();
  const fan = BrandLogos.build(doc, "fan");
  assert.equal(fan.tag, "svg");
  assert.equal(fan.attrs.viewBox, "-1.1 -1.1 2.2 2.2");
  assert.equal(fan.attrs.fill, "currentColor");
  assert.equal(fan.attrs["aria-hidden"], "true");
  assert.match(fan.attrs.class, /brand-logo-fan/);
  assert.equal(all(fan).filter((element) => element.tag === "path").length, 4, "The fan has four blades.");
  assert.equal(all(BrandLogos.build(doc, "ember")).filter((element) => element.tag === "circle").length, 2);
  assert.equal(all(BrandLogos.build(doc, "leaf")).filter((element) => element.tag === "path").length, 2, "The leaf and its vein.");
});

test("a logo placed in the swarm graph is centred and scaled", () => {
  const group = BrandLogos.place(new FakeDocument(), "leaf", 40, 25, 7.5);
  assert.equal(group.tag, "g");
  assert.equal(group.attrs.transform, "translate(40 25) scale(7.5)");
  assert.match(group.attrs.class, /swarm-logo/);
});

test("the plain character before a site's name becomes its logo, and other text stays", () => {
  const doc = new FakeDocument();
  const root = new FakeElement("div", doc);
  const title = new FakeElement("div", doc);
  title.append("● Emberwick Energy Assistant");
  const plain = new FakeElement("p", doc);
  plain.append("● a bullet with no site name");
  root.append(title, plain);
  BrandLogos.swap(root);
  assert.deepEqual(title.texts(), ["", "Emberwick Energy Assistant"]);
  assert.match(title.children[1].attrs.class, /brand-logo-ember/);
  assert.deepEqual(plain.texts(), ["● a bullet with no site name"]);
  BrandLogos.swap(root);
  assert.equal(title.children.filter((child) => child.nodeType === 1).length, 1, "A second swap adds nothing.");
});

test("each manifest's brand starts with the plain character of its site's logo", async () => {
  for (const [site, network] of Object.entries(SITES)) {
    const manifest = JSON.parse(await readFile(new URL(`../../${site}/agent-manifest.json`, import.meta.url), "utf8"));
    const kind = SwarmMap.site(network).logo;
    assert.ok(manifest.brand.startsWith(`${BrandLogos.GLYPHS[kind]} `), `${site}: the brand must start with "${BrandLogos.GLYPHS[kind]} ".`);
  }
});

test("no site is drawn with an emoji any more", async () => {
  for (const site of Object.keys(SITES)) {
    for (const file of ["js/swarm-map.js", "js/swarm-graph.js", "agent-manifest.json", "favicon.svg"]) {
      const text = await readFile(new URL(`../../${site}/${file}`, import.meta.url), "utf8");
      assert.doesNotMatch(text, /[⚡\u{1F527}\u{1F331}\u{1F9ED}]/u, `${site}/${file} still has an emoji for a logo.`);
    }
  }
});
