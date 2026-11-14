// Checks js/voice-input.js (issue #15), the same file on all three sites, with a small
// page stand-in and a scripted SpeechRecognition. It reads all three sites, so it lives
// here once.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { VoiceInput } from "../js/voice-input.js";

const SITES = ["utility", "installer", "grants"];

/** Just enough of an element for VoiceInput. */
class FakeElement {
  constructor(id = "", tag = "div") {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.events = [];
    this.focused = false;
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
    this.events.push(event.type);
    for (const listener of this.listeners[event.type] || []) {
      listener(event);
    }
    return true;
  }

  insertBefore(child, before) {
    const at = this.children.indexOf(before);
    this.children.splice(at < 0 ? this.children.length : at, 0, child);
  }

  focus() {
    this.focused = true;
  }

  insertAdjacentElement(where, element) {
    this.placed = [where, element];
  }

  async click() {
    for (const listener of this.listeners.click || []) {
      await listener({type: "click"});
    }
  }
}

/**
 * A page with the runtime's input bar and the site's #voice-input panel.
 *
 * :return: {doc, bar, input, send, panel, status, note}.
 */
function page() {
  const bar = new FakeElement("", "div");
  const input = new FakeElement("ns-input", "input");
  const send = new FakeElement("ns-send", "button");
  send.addEventListener("click", () => {
    throw new Error("Voice input must never press Send.");
  });
  bar.children.push(input, send);
  const status = new FakeElement("voice-status", "p");
  const note = new FakeElement("voice-note", "p");
  const panel = new FakeElement("voice-input");
  panel.hidden = true;
  panel.querySelector = (selector) => ({"#voice-status": status, "#voice-note": note})[selector] || null;
  const found = {"#agent-app .ns-inputbar": bar, "#agent-app #ns-input": input, "#agent-app #ns-send": send, "#voice-input": panel};
  const doc = {
    querySelector: (selector) => found[selector] || null,
    createElement: (tag) => new FakeElement("", tag),
    defaultView: {Event},
  };
  return {doc, bar, input, send, panel, status, note};
}

/**
 * A scripted SpeechRecognition class. Each instance records its settings, and the test
 * drives its events.
 *
 * :param availability: What available() answers for each language, or null for a
 *   browser without on-device recognition (no available() at all).
 * :return: The class, with a list of its instances and the install() calls.
 */
function recognitionClass(availability) {
  class Recognition {
    static instances = [];
    static installs = [];

    constructor() {
      this.started = false;
      this.stopped = false;
      Recognition.instances.push(this);
    }

    start() {
      this.started = true;
    }

    stop() {
      this.stopped = true;
      this.onend?.();
    }

    /** Send results as the browser would: a list of results, each with alternatives. */
    hear(...parts) {
      this.onresult?.({results: parts.map((part) => [{transcript: part}])});
    }
  }
  if (availability) {
    Recognition.available = async ({langs, processLocally}) => {
      assert.equal(processLocally, true);
      return availability[langs[0]] || "unavailable";
    };
    Recognition.install = async (options) => {
      Recognition.installs.push(options);
      return true;
    };
  }
  return Recognition;
}

test("the three sites carry the same voice-input.js, and each page has its panel and hook", async () => {
  const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  const source = await read("utility/js/voice-input.js");
  for (const site of SITES) {
    assert.equal(await read(`${site}/js/voice-input.js`), source, `Copy sites/utility/js/voice-input.js to sites/${site}/js/.`);
    const html = await read(`${site}/index.html`);
    assert.match(html, /<div id="voice-input" class="voice-input" hidden>/);
    assert.match(html, /<p id="voice-status" class="voice-status" role="status" aria-live="polite">/);
    assert.match(await read(`${site}/site.js`), /VoiceInput\.attach\(document, window\)/);
  }
  // Speech only fills the box: the module never presses a button or answers a card.
  assert.doesNotMatch(source, /\.click\(|ns-consent|onActionConfirm|onConsent|showModal/);
});

test("the runtime still draws the chat box this module joins", async () => {
  // The ids belong to the vendored runtime (runtime/ui.js). A runtime update that renames
  // them hides the mic, so this test says where to look.
  for (const site of SITES) {
    const ui = await readFile(new URL(`../../${site}/runtime/ui.js`, import.meta.url), "utf8");
    assert.match(ui, /class="ns-inputbar/, `${site}: runtime/ui.js no longer has .ns-inputbar.`);
    assert.match(ui, /<input id="ns-input"/, `${site}: runtime/ui.js no longer has #ns-input.`);
    assert.match(ui, /<button id="ns-send"/, `${site}: runtime/ui.js no longer has #ns-send.`);
  }
});

test("without speech recognition (Firefox) the mic stays hidden", async () => {
  const {doc, bar, panel} = page();
  assert.equal(await VoiceInput.attach(doc, {}), null);
  assert.equal(panel.hidden, true);
  assert.equal(bar.children.length, 2, "No button added.");
});

test("on-device recognition is used when the browser has it, and the note says the audio stays", async () => {
  const {doc, bar, send, panel, note, input, status} = page();
  const Recognition = recognitionClass({"en-GB": "available"});
  const voice = await VoiceInput.attach(doc, {SpeechRecognition: Recognition});
  assert.equal(panel.hidden, false);
  assert.deepEqual(bar.placed, ["afterend", status], "The status line sits just under the chat box.");
  // Before the first press the page has asked the browser nothing.
  assert.equal(note.textContent, VoiceInput.NOTE_FIRST);
  assert.equal(bar.children[1], voice.button, "The mic sits before Send.");
  assert.equal(bar.children[2], send);
  assert.equal(voice.button.getAttribute("aria-pressed"), "false");
  assert.equal(voice.button.getAttribute("aria-describedby"), "voice-note");

  await voice.button.click();
  assert.equal(note.textContent, VoiceInput.NOTE_LOCAL, "On the device: it says so and listens at once.");
  const [recognition] = Recognition.instances;
  assert.equal(recognition.started, true);
  assert.equal(recognition.processLocally, true);
  assert.equal(recognition.lang, "en-GB");
  assert.equal(recognition.interimResults, true);
  assert.equal(recognition.continuous, true, "It keeps listening through pauses.");
  assert.equal(voice.button.getAttribute("aria-pressed"), "true");
  assert.match(status.textContent, /^Listening…/);

  // Interim, then final: the box follows, and Send is never pressed.
  recognition.hear("Which tariff");
  assert.equal(input.value, "Which tariff");
  recognition.hear("Which tariff", " is cheapest for me?");
  assert.equal(input.value, "Which tariff is cheapest for me?");
  assert.ok(input.events.includes("input"), "The runtime sees the text as typed.");

  // The browser ends its session at a pause: a new one starts, and the words stay.
  recognition.onend();
  assert.equal(voice.button.getAttribute("aria-pressed"), "true", "Still listening after a pause.");
  const next = Recognition.instances[1];
  assert.equal(next.started, true);
  next.hear("And when");
  assert.equal(input.value, "Which tariff is cheapest for me? And when", "Live text follows the earlier words.");
  next.hear("And when does it start?");
  assert.equal(input.value, "Which tariff is cheapest for me? And when does it start?");

  // Only Stop ends it.
  await voice.button.click();
  assert.equal(next.stopped, true);
  assert.equal(Recognition.instances.length, 2, "No new session after Stop.");
  assert.equal(input.value, "Which tariff is cheapest for me? And when does it start?");
  assert.equal(voice.button.getAttribute("aria-pressed"), "false");
  assert.equal(status.textContent, "Check the request in the chat box, then press Send.");
  assert.equal(input.focused, true);
});

test("a one-time language download comes first when the browser offers it", async () => {
  const {doc, note, status} = page();
  const Recognition = recognitionClass({"en-GB": "unavailable", "en-US": "downloadable"});
  const voice = await VoiceInput.attach(doc, {SpeechRecognition: Recognition});
  await voice.button.click();
  assert.equal(note.textContent, VoiceInput.NOTE_LOCAL);
  assert.deepEqual(Recognition.installs, [{langs: ["en-US"], processLocally: true}]);
  assert.equal(Recognition.instances[0].lang, "en-US");
  assert.match(status.textContent, /^Listening…/);
});

test("a browser without on-device recognition says the audio would leave, and listens only on a second press", async () => {
  const {doc, note, status} = page();
  const Recognition = recognitionClass(null);
  const voice = await VoiceInput.attach(doc, {webkitSpeechRecognition: Recognition});
  await voice.button.click();
  assert.equal(note.textContent, VoiceInput.NOTE_ONLINE);
  assert.match(status.textContent, /Press Speak again to go ahead/);
  assert.equal(Recognition.instances.length, 0, "No audio is taken before the second press.");
  await voice.button.click();
  assert.equal(Recognition.instances.length, 1);
  assert.equal(Recognition.instances[0].processLocally, undefined);
  assert.equal(Recognition.instances[0].lang, "en-GB");
});

test("speech adds to what the visitor already typed", async () => {
  const {doc, input} = page();
  input.value = "For a 3-bed semi:";
  const Recognition = recognitionClass(null);
  const voice = await VoiceInput.attach(doc, {SpeechRecognition: Recognition});
  await voice.button.click();
  await voice.button.click();
  Recognition.instances[0].hear("what heat pump would suit it?");
  assert.equal(input.value, "For a 3-bed semi: what heat pump would suit it?");
});

test("a blocked microphone, silence and a second press each end cleanly", async () => {
  const {doc, status} = page();
  const Recognition = recognitionClass(null);
  const voice = await VoiceInput.attach(doc, {SpeechRecognition: Recognition});
  await voice.button.click();

  await voice.button.click();
  Recognition.instances[0].onerror({error: "not-allowed"});
  Recognition.instances[0].onend();
  assert.match(status.textContent, /microphone is blocked/);
  assert.equal(voice.button.disabled, true);
  assert.equal(Recognition.instances.length, 1, "A blocked microphone is not tried again.");

  // Silence: the browser's no-speech ends a session, and listening goes on.
  voice.button.disabled = false;
  await voice.button.click();
  Recognition.instances[1].onerror({error: "no-speech"});
  Recognition.instances[1].onend();
  assert.equal(Recognition.instances.length, 3, "Listening goes on after a quiet moment.");
  assert.equal(voice.button.getAttribute("aria-pressed"), "true");
  await voice.button.click();
  assert.equal(Recognition.instances[2].stopped, true, "A second press stops listening.");
  assert.equal(voice.button.getAttribute("aria-pressed"), "false");
  assert.equal(status.textContent, VoiceInput.ERRORS["no-speech"]);
});

test("sessions that end at once with nothing heard stop instead of looping", async () => {
  const {doc, status} = page();
  const Recognition = recognitionClass(null);
  const voice = await VoiceInput.attach(doc, {SpeechRecognition: Recognition});
  await voice.button.click();
  await voice.button.click();
  for (let i = 0; i < 3; i += 1) {
    Recognition.instances[i].onend();
  }
  assert.equal(Recognition.instances.length, 3);
  assert.equal(voice.button.getAttribute("aria-pressed"), "false");
  assert.match(status.textContent, /Voice input stopped/);
});

test("on-device recognition that stops at once offers the online service, after another press", async () => {
  const {doc, note, status, input} = page();
  const Recognition = recognitionClass({"en-GB": "available"});
  const voice = await VoiceInput.attach(doc, {SpeechRecognition: Recognition});
  await voice.button.click();
  Recognition.instances[0].onend();
  Recognition.instances[1].onend();
  assert.equal(Recognition.instances.length, 2);
  assert.equal(note.textContent, VoiceInput.NOTE_ONLINE);
  assert.match(status.textContent, /Press Speak again to go ahead/);
  assert.equal(voice.button.getAttribute("aria-pressed"), "false");

  await voice.button.click();
  const online = Recognition.instances[2];
  assert.equal(online.processLocally, undefined, "The online service only after the visitor agrees.");
  online.hear("Is there a grant?");
  assert.equal(input.value, "Is there a grant?");
});

test("in Brave, which has no online speech service, it says to use Chrome or Edge", async () => {
  const {doc, status} = page();
  const Recognition = recognitionClass({"en-GB": "unavailable"});
  const win = {SpeechRecognition: Recognition, navigator: {brave: {isBrave: async () => true}}};
  const voice = await VoiceInput.attach(doc, win);
  await voice.button.click();
  assert.equal(status.textContent, VoiceInput.BRAVE);
  await voice.button.click();
  assert.equal(Recognition.instances.length, 0, "Nothing is started that would fail at once.");
  assert.equal(voice.button.getAttribute("aria-pressed"), "false");
});

test("in Brave, on-device recognition is still used when it is there", async () => {
  const {doc, status} = page();
  const Recognition = recognitionClass({"en-GB": "available"});
  const win = {SpeechRecognition: Recognition, navigator: {brave: {isBrave: async () => true}}};
  const voice = await VoiceInput.attach(doc, win);
  await voice.button.click();
  assert.equal(Recognition.instances.length, 1);
  assert.match(status.textContent, /^Listening…/);
  // If it then stops at once, Brave has nothing to fall back on.
  Recognition.instances[0].onend();
  Recognition.instances[1].onend();
  assert.equal(status.textContent, VoiceInput.BRAVE);
});
