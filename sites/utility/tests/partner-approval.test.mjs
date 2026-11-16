// Checks js/partner-approval.js, the same file on all three sites: the visitor's choice
// between being asked before each partner contact and automatic approval, the line the
// chat shows for an automatic one, and how site.js uses it. site.js is each site's own
// file, so its consent() is checked here for all three.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AnswerPath } from "../js/answer-path.js";
import { PartnerApproval } from "../js/partner-approval.js";
import { SwarmGraph } from "../js/swarm-graph.js";
import { TraceBus } from "../runtime/trace.js";
import { StubDocument } from "./stub_document.mjs";
import { StubElement } from "./stub_element.mjs";
import { StubOption } from "./stub_option.mjs";

const SITES = ["utility", "installer", "grants"];
const PARTNER = "heatwright.example";
const INFO = {kind: "network", peerLabel: "Heatwright Home Energy", peerOrigin: PARTNER, requestText: "Heat pump for a 95 m² semi: <b>cost</b>?"};

/** Just enough of an element. */
class FakeElement {
  constructor(tag = "div") {
    this.tag = tag;
    this.className = "";
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this.checked = false;
    this.scrollTop = 0;
    this.scrollHeight = 300;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  querySelector() {
    return this.ask;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
}

/**
 * A page with the choice and the chat's message list.
 *
 * :return: {doc, group, ask, msgs}.
 */
function page() {
  const group = new FakeElement("fieldset");
  const ask = new FakeElement("input");
  ask.value = "auto";
  group.ask = ask;
  const msgs = new FakeElement("div");
  const found = {"#partner-approval": group, "#agent-app #ns-msgs": msgs};
  const doc = {querySelector: (selector) => found[selector] || null, createElement: (tag) => new FakeElement(tag)};
  return {doc, group, ask, msgs};
}

test("the page starts on asking, and the choice follows the menu", () => {
  PartnerApproval.auto = true;
  const {doc, group, ask} = page();
  assert.equal(PartnerApproval.attach(doc), group);
  assert.equal(PartnerApproval.auto, false, "Always ask on a fresh page, whatever the browser restored.");
  assert.equal(ask.value, "ask");
  group.listeners.change({target: {value: "auto"}});
  assert.equal(PartnerApproval.auto, true);
  group.listeners.change({target: {value: "ask"}});
  assert.equal(PartnerApproval.auto, false);
  assert.equal(PartnerApproval.attach({querySelector: () => null}), null, "A page without the choice is left alone.");
});

test("an automatic approval is shown in the chat with the partner and the whole request, as text", () => {
  const {doc, msgs} = page();
  const line = PartnerApproval.announce(doc, INFO);
  assert.equal(msgs.children[0], line);
  assert.equal(line.className, "ns-msg bot ns-auto-approved");
  const [title, origin, request] = line.children;
  assert.equal(title.textContent, "✓ Contacted Heatwright Home Energy automatically");
  assert.equal(origin.textContent, PARTNER);
  assert.equal(request.textContent, `“${INFO.requestText}”`, "The partner reads all of it, so all of it is shown.");
  assert.equal(PartnerApproval.announce({querySelector: () => null}, INFO), null);
});

test("the trace says the visit chose automatic approval, and the graph says so too", () => {
  const trace = new TraceBus();
  const run = trace.start("run", {origin: "emberwick.example", input: "Could I get a heat pump?"});
  const front = trace.start("agent", {parent: run, origin: "emberwick.example", agent: "emberwick_assistant", network: "emberwick_energy", isTopFrontMan: true});
  const partner = trace.start("tool", {parent: front, origin: "emberwick.example", tool: "heatwright_installers", callId: "c1", toolKind: "remote network", args: {request: "Heat pump?"}});
  trace.note("consent", {page: true, peerOrigin: PARTNER, decision: "allow", auto: true, consentFor: "network"});
  const fetch = trace.start("remote_fetch", {parent: partner, origin: "emberwick.example", peerOrigin: PARTNER, url: `https://${PARTNER}/heatwright_installers`});
  trace.end(fetch, {network: "heatwright_installers", peerOrigin: PARTNER});
  trace.end(partner, {resultPreview: "Yes."});
  trace.end(front, {});
  trace.end(run, {answerPreview: "Yes."});
  const [turn] = AnswerPath.build(trace.events, "emberwick.example").turns;
  const node = turn.nodes[0].children.find((child) => child.kind === "partner");
  assert.equal(node.consent, `You had chosen automatic approval, so contact with ${PARTNER} went ahead without a card.`);
  assert.equal(SwarmGraph.consentWords(node.consent), "approved automatically");
  assert.equal(SwarmGraph.consentWords("You allowed this one contact with heatwright.example."), "you allowed it", "A card's answer reads as before.");
});

/**
 * Load site.js for one site, under Node, with the page stand-in it needs.
 *
 * :param site: The site's folder.
 * :return: Its AssistantMount.
 */
async function mountOf(site) {
  const html = await readFile(new URL(`../../${site}/index.html`, import.meta.url), "utf8");
  globalThis.document = StubDocument.fromHtml(html, "http://localhost:8080/");
  globalThis.Option = StubOption;
  return (await import(`../../${site}/site.js`)).AssistantMount;
}

test("with automatic approval, consent() allows at once, shows no card, and records the decision", async () => {
  const mount = await mountOf("utility");
  const msgs = new StubElement("div");
  document.provide("#agent-app #ns-msgs", [msgs]);
  document.provide("#ns-input", [new StubElement("input")]);
  const notes = [];
  mount.trace = {note: (kind, fields) => notes.push([kind, fields])};
  let cards = 0;
  mount.defaultConsent = () => {
    cards += 1;
    return "decline";
  };
  PartnerApproval.auto = true;
  try {
    assert.equal(await mount.consent(INFO), "allow");
    assert.equal(cards, 0, "The runtime's card was not opened.");
    assert.deepEqual(notes, [["consent", {page: true, peerOrigin: PARTNER, decision: "allow", auto: true, consentFor: "network"}]]);
    assert.equal(msgs.children.length, 1, "The chat lists the contact.");
    // Back to asking takes effect at once: the next contact opens the card again.
    PartnerApproval.auto = false;
    document.provide("#ns-msgs .ns-consent", []);
    assert.equal(await mount.consent(INFO), "decline");
    assert.equal(cards, 1);
  } finally {
    PartnerApproval.auto = false;
  }
});

test("the file is the same on all three sites, and only partner contact can be approved automatically", async () => {
  const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  const source = await read("utility/js/partner-approval.js");
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML/);
  for (const site of SITES) {
    assert.equal(await read(`${site}/js/partner-approval.js`), source, `Copy sites/utility/js/partner-approval.js to sites/${site}/js/.`);
    const html = await read(`${site}/index.html`);
    assert.match(html, /<div id="partner-approval" class="partner-approval" hidden>/);
    assert.match(html, /<option value="ask" selected>/, `${site}: ask is the default.`);
    assert.match(html, /<option value="auto">/);
    const mount = await read(`${site}/site.js`);
    assert.match(mount, /PartnerApproval\.attach\(document\)/);
    // The setting is read in consent() only. The dialog for a change that cannot be undone
    // never looks at it.
    const review = mount.slice(mount.indexOf("static async review("), mount.indexOf("static async consent("));
    assert.doesNotMatch(review, /PartnerApproval/, `${site}: review() must not depend on automatic approval.`);
    assert.match(mount, /static async consent\(info\) \{\r?\n[^\n]*\n\s*if \(PartnerApproval\.auto\) \{/);
  }
});
