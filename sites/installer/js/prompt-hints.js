// Suggested requests for each site's assistant, like the grey suggestion in Claude Code.
// The chat box shows a suggestion in place of "Type a request…". Pressing Tab in the empty
// box fills it in; typing something else replaces it. Before the first message the
// suggestion is the site's own starter. After each turn it is a likely next message,
// asked of the visitor's model, with a fixed follow-up from the site's list when the model
// cannot give one.
//
// A suggestion only fills the chat box. It never sends anything: the visitor reads it and
// presses Send, as with voice input (js/voice-input.js).
//
// The model call goes to the visitor's chosen router only, with the same key as the chat
// and no tools (spec 4). It carries the last request and the last answer, which the
// router already has. It is left out of the trace on purpose, so the swarm graph shows
// only the agents' own work. It never runs in the mock router.
//
// This file is the same on all three sites. Each site's values are in its site.js.
import { LlmClient } from "../runtime/llm.js";
import { effectiveModel } from "../runtime/model.js";

/**
 * Suggestions in the chat box, with a small hint line under it.
 */
export class PromptHints {
  /** The runtime's own idle placeholder, which this replaces. */
  static DEFAULT_PLACEHOLDER = "Type a request…";

  /** The longest suggestion to accept from the model. */
  static MAX_LENGTH = 110;

  /** Stop waiting for the model after this long. */
  static TIMEOUT_MS = 15000;

  /**
   * How much of the last request and answer to give the model.
   */
  static CONTEXT_CHARS = 700;

  /**
   * Add suggestions to the chat box, if it exists.
   *
   * :param doc: The document.
   * :param engine: The runtime engine, for the conversation and the router.
   * :param config: {about, starter, followUps}: what the assistant does, the first
   *   suggestion, and fixed next suggestions for when the model gives none.
   * :return: The PromptHints, or null when the chat box is missing.
   */
  static attach(doc, engine, config) {
    const bar = doc.querySelector("#agent-app .ns-inputbar");
    const input = doc.querySelector("#agent-app #ns-input");
    const newChat = doc.querySelector("#agent-app #ns-newchat");
    if (!bar || !input) {
      return null;
    }
    const hints = new PromptHints(doc, {bar, input, newChat}, config, (messages, signal) => PromptHints.ask(engine, messages, signal), () => engine.history || []);
    hints.watch(doc.defaultView?.MutationObserver);
    return hints;
  }

  /**
   * :param doc: The document.
   * :param parts: The runtime's input bar, chat box and New chat button.
   * :param config: See attach.
   * :param ask: async (messages, signal) => the model's reply text, or null when there is
   *   no model to ask.
   * :param history: () => the conversation so far, as {role, content} messages.
   */
  constructor(doc, parts, config, ask, history) {
    this.doc = doc;
    this.bar = parts.bar;
    this.input = parts.input;
    this.config = config;
    this.ask = ask;
    this.history = history;
    this.suggestion = config.starter;
    this.used = new Set();
    this.seen = 0;
    this.pending = null;
    this.active = false;
    this.hint = doc.createElement("button");
    this.hint.type = "button";
    this.hint.id = "prompt-hint";
    this.hint.className = "prompt-hint";
    this.hint.setAttribute("aria-live", "off");
    this.hint.addEventListener("click", () => this.accept());
    this.bar.insertAdjacentElement("afterend", this.hint);
    if (!this.input.getAttribute("aria-label")) {
      this.input.setAttribute("aria-label", "Your request");
    }
    this.input.addEventListener("keydown", (event) => this.keydown(event));
    this.input.addEventListener("input", () => this.render());
    parts.newChat?.addEventListener("click", () => this.reset());
    this.render();
  }

  /**
   * Follow the runtime: a turn starting or ending, and the runtime putting its own
   * placeholder back.
   *
   * :param Observer: The MutationObserver constructor, when the page has one.
   */
  watch(Observer) {
    if (!Observer) {
      return;
    }
    new Observer((records) => {
      for (const record of records) {
        if (record.attributeName === "data-turn-active") {
          this.turn(this.bar.getAttribute("data-turn-active") === "true");
        }
      }
      this.render();
    }).observe(this.bar, {attributes: true, attributeFilter: ["data-turn-active"]});
    new Observer(() => this.render()).observe(this.input, {attributes: true, attributeFilter: ["placeholder"]});
  }

  /**
   * A turn started or ended.
   *
   * :param active: True while the agents work.
   */
  turn(active) {
    if (active === this.active) {
      return;
    }
    this.active = active;
    if (active) {
      this.pending?.abort();
      this.pending = null;
      this.suggestion = "";
      return;
    }
    this.next();
  }

  /**
   * Work out the next suggestion after a turn that gave an answer.
   */
  async next() {
    const messages = this.history();
    if (messages.length <= this.seen) {
      // The turn failed or was cancelled: nothing new to follow up on.
      this.suggestion = this.suggestion || (this.seen === 0 && !this.used.has(this.config.starter) ? this.config.starter : this.fallback());
      this.render();
      return;
    }
    this.seen = messages.length;
    const controller = new AbortController();
    this.pending = controller;
    this.suggestion = "";
    this.render();
    let text = null;
    try {
      const timer = setTimeout(() => controller.abort(), PromptHints.TIMEOUT_MS);
      try {
        text = PromptHints.clean(await this.ask(this.prompt(messages), controller.signal));
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // No model, no key, or the router said no: the fixed list covers it.
      text = null;
    }
    if (this.pending !== controller || this.active) {
      return;
    }
    this.pending = null;
    this.suggestion = text && !this.used.has(text) ? text : this.fallback();
    this.render();
  }

  /**
   * The next fixed suggestion not yet offered in this chat.
   *
   * :return: The suggestion, or "" when the list is used up.
   */
  fallback() {
    return this.config.followUps.find((text) => !this.used.has(text)) || "";
  }

  /**
   * The messages that ask the model for the next request.
   *
   * :param messages: The conversation so far.
   * :return: Chat messages.
   */
  prompt(messages) {
    const clip = (text) => String(text || "").split("\n\nCRUSE presentation")[0].slice(0, PromptHints.CONTEXT_CHARS);
    const answers = messages.filter((message) => message.role === "assistant");
    const requests = messages.filter((message) => message.role === "user" && !String(message.content).startsWith("Browser action receipts"));
    const request = clip(requests.at(-1)?.content);
    const answer = clip(answers.at(-1)?.content);
    return [
      {
        role: "system",
        content: `You suggest what the visitor could ask next on ${this.config.site}, a fictional demo website. Its assistant can do this: ${this.config.about}\n`
          + "Reply with one short message, at most 90 characters, written as the visitor in the first person, that follows naturally from the conversation and that the assistant can do. "
          + "Do not answer it. Do not include a name, an email address, a phone number, a reference code or any other personal detail. "
          + "Do not repeat the visitor's last request. Reply with the message only: no quotes, no label, no explanation.",
      },
      {role: "user", content: `The visitor's last request:\n${request}\n\nThe assistant's answer:\n${answer}\n\nSuggest the visitor's next message.`},
    ];
  }

  /**
   * Make a model reply fit for the chat box.
   *
   * :param reply: The model's text, or null.
   * :return: One plain line, or null when it is empty, too long or holds personal-looking
   *   details.
   */
  static clean(reply) {
    if (typeof reply !== "string") {
      return null;
    }
    const line = reply.trim().split("\n")[0].trim().replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "").trim();
    if (!line || line.length > PromptHints.MAX_LENGTH || /@|https?:|\d{6,}/i.test(line)) {
      return null;
    }
    return line;
  }

  /**
   * Ask the visitor's model one question, through the engine's router and key.
   *
   * :param engine: The runtime engine.
   * :param messages: Chat messages.
   * :param signal: An AbortSignal.
   * :return: The model's text, or null when the router is the in-page mock or has no key.
   */
  static async ask(engine, messages, signal) {
    const top = engine.top;
    const key = top?.llm?.apiKey || engine.byokKey;
    if (!top || top.llm.mock || !key || key === "demo") {
      return null;
    }
    const llm = new LlmClient({baseUrl: top.llm.baseUrl, apiKey: key, mock: false});
    const model = effectiveModel(engine.modelOverride, undefined, top.network?.config?.llm_config?.model_name);
    const reply = await llm.chat({model, messages, tools: [], origin: "suggestion", signal});
    return reply.content;
  }

  /**
   * Show the suggestion in the chat box and the hint line, or hide both.
   */
  render() {
    const showing = !this.active && this.suggestion !== "" && this.input.value === "";
    if (!this.active) {
      const wanted = this.suggestion || PromptHints.DEFAULT_PLACEHOLDER;
      if (this.input.placeholder !== wanted) {
        this.input.placeholder = wanted;
      }
    }
    this.hint.hidden = !showing;
    this.hint.textContent = showing ? "Press Tab to use this suggestion" : "";
    this.hint.title = showing ? this.suggestion : "";
  }

  /**
   * Tab in an empty chat box takes the suggestion.
   *
   * :param event: The keydown event.
   */
  keydown(event) {
    if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && this.canAccept()) {
      event.preventDefault();
      this.accept();
    }
  }

  /**
   * :return: True when there is a suggestion to take.
   */
  canAccept() {
    return !this.active && this.suggestion !== "" && this.input.value === "";
  }

  /**
   * Put the suggestion in the chat box as if typed, so the runtime sees it, and keep it
   * from coming back in this chat.
   */
  accept() {
    if (!this.canAccept()) {
      return;
    }
    const text = this.suggestion;
    this.used.add(text);
    this.suggestion = "";
    this.input.value = text;
    const EventClass = this.doc.defaultView?.Event || Event;
    this.input.dispatchEvent(new EventClass("input", {bubbles: true}));
    this.input.focus();
    this.render();
  }

  /**
   * New chat: back to the site's starter.
   */
  reset() {
    this.pending?.abort();
    this.pending = null;
    this.used.clear();
    this.seen = 0;
    this.suggestion = this.config.starter;
    this.render();
  }
}
