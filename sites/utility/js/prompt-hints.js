// Suggested requests for each site's assistant, like the grey suggestion in Claude Code.
// The chat box shows a suggestion in place of "Type a request…". Pressing Tab in the empty
// box fills it in; typing something else replaces it.
//
// Before the first message the suggestion is the site's own starter. After that, the
// front agent writes the next suggestion itself, as the last line of its answer:
//   <next>Can I get a survey booked?</next>
// (the `next_rules` text in each .hocon). This page takes that line out of the chat
// bubble and puts it in the chat box, in the same moment the answer appears. It is one
// model call, so it costs nothing extra and the suggestion follows from the answer the
// model has just written; after a question, it is the visitor's likely answer. When the
// answer has no usable line, a fixed follow-up from the site's own list is used instead,
// going round the list once every one has been used, and after a failed turn the
// visitor's last request is offered again. So there is always a suggestion.
//
// A suggestion only fills the chat box. It never sends anything: the visitor reads it and
// presses Send, as with voice input (js/voice-input.js).
//
// This file is the same on all three sites. Each site's values are in its site.js.

/**
 * Suggestions in the chat box, with a small hint line under it.
 */
export class PromptHints {
  /** The runtime's own idle placeholder, which this replaces. */
  static DEFAULT_PLACEHOLDER = "Type a request…";

  /** The longest suggestion to accept. */
  static MAX_LENGTH = 110;

  /** The line an answer ends with, which this page takes out of the bubble. */
  static TAG = /<next>([\s\S]*?)<\/next>/gi;

  /**
   * Add suggestions to the chat box, if it exists.
   *
   * :param doc: The document.
   * :param config: {starter, followUps}: the first suggestion, and fixed next suggestions
   *   for answers that bring none of their own.
   * :return: The PromptHints, or null when the chat box is missing.
   */
  static attach(doc, config) {
    const bar = doc.querySelector("#agent-app .ns-inputbar");
    const input = doc.querySelector("#agent-app #ns-input");
    const msgs = doc.querySelector("#agent-app #ns-msgs");
    const newChat = doc.querySelector("#agent-app #ns-newchat");
    if (!bar || !input || !msgs) {
      return null;
    }
    const hints = new PromptHints(doc, {bar, input, msgs, newChat}, config);
    hints.watch(doc.defaultView?.MutationObserver);
    return hints;
  }

  /**
   * :param doc: The document.
   * :param parts: The runtime's input bar, chat box, message list and New chat button.
   * :param config: See attach.
   */
  constructor(doc, parts, config) {
    this.doc = doc;
    this.bar = parts.bar;
    this.input = parts.input;
    this.msgs = parts.msgs;
    this.config = config;
    this.suggestion = config.starter;
    this.used = new Set();
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
   * Follow the runtime: answers appearing, a turn starting or ending, and the runtime
   * putting its own placeholder back.
   *
   * :param Observer: The MutationObserver constructor, when the page has one.
   */
  watch(Observer) {
    if (!Observer) {
      return;
    }
    // The answer's line is taken out as soon as the bubble is drawn, before the browser
    // paints it.
    new Observer(() => this.scan()).observe(this.msgs, {childList: true, subtree: true});
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
   * Take the `<next>` line out of every answer that has one, and keep the last as the
   * suggestion for the end of the turn.
   */
  scan() {
    for (const bubble of this.msgs.querySelectorAll(".ns-msg.bot:not(.ns-live)")) {
      const found = PromptHints.extract(bubble);
      if (found !== null) {
        this.pending = found;
      }
    }
  }

  /**
   * Remove the `<next>…</next>` line from a bubble.
   *
   * :param bubble: A chat bubble element.
   * :return: The line's text, or null when the bubble has none.
   */
  static extract(bubble) {
    if (!/<next>/i.test(bubble.textContent || "")) {
      return null;
    }
    let found = null;
    const walker = bubble.ownerDocument.createTreeWalker(bubble, 4);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      nodes.push(node);
    }
    for (const node of nodes) {
      const text = node.nodeValue;
      const next = text.replace(PromptHints.TAG, (all, inner) => {
        found = inner;
        return "";
      });
      if (next !== text) {
        node.nodeValue = next.trimEnd();
        let parent = node.parentNode;
        if (!node.nodeValue.trim() && parent && parent !== bubble && !parent.textContent.trim() && !parent.children.length) {
          parent.remove();
        } else if (!node.nodeValue.trim() && parent === bubble) {
          node.remove();
        }
      }
    }
    return found === null ? null : (PromptHints.clean(found) || "");
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
      this.pending = undefined;
      this.suggestion = "";
      return;
    }
    this.scan();
    this.finish();
  }

  /**
   * The turn ended: choose the next suggestion from the answer.
   */
  finish() {
    const bubbles = [...this.msgs.querySelectorAll(".ns-msg.bot:not(.ns-live)")];
    const answer = (bubbles.at(-1)?.textContent || "").trim();
    if (this.pending && !this.used.has(this.pending)) {
      // The agent wrote one: after an answer, what to ask next; after a question, a reply.
      this.suggestion = this.pending;
    } else if (!answer || answer.startsWith("⚠️")) {
      // The turn failed: offer the visitor's request again.
      this.suggestion = this.lastRequest() || this.fallback();
    } else {
      this.suggestion = this.fallback();
    }
    this.pending = undefined;
    this.render();
  }

  /**
   * The visitor's last request in the chat, to send again after a failed turn.
   *
   * :return: Its text, or "" when there is none or it is too long to suggest.
   */
  lastRequest() {
    const asked = [...this.msgs.querySelectorAll(".ns-msg.user:not(.ns-steering-message)")];
    return PromptHints.clean(asked.at(-1)?.textContent || "") || "";
  }

  /**
   * The next fixed suggestion: one not yet offered in this chat, or, once every one has
   * been, the list again in turn.
   *
   * :return: The suggestion, or "" only when the site has no follow-ups.
   */
  fallback() {
    const list = this.config.followUps;
    const fresh = list.find((text) => !this.used.has(text));
    if (fresh) {
      return fresh;
    }
    // Every follow-up has been used: go round the list rather than leave the box empty.
    this.round = ((this.round ?? -1) + 1) % list.length;
    return list[this.round] || "";
  }

  /**
   * Make an agent's line fit for the chat box.
   *
   * :param reply: The line's text.
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
    // A touch screen has no Tab key: the line is a button to tap.
    const touch = Boolean(this.doc.defaultView?.matchMedia?.("(pointer: coarse)")?.matches);
    this.hint.textContent = showing ? (touch ? "Tap to use this suggestion" : "Press Tab to use this suggestion") : "";
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
   * The suggestion state of this chat, to bring back when the visitor returns to it.
   *
   * :return: {suggestion, used}.
   */
  snapshot() {
    return {suggestion: this.suggestion, used: [...this.used]};
  }

  /**
   * Bring back a chat's suggestion state, or start afresh.
   *
   * :param state: What snapshot() gave, or null for a new chat.
   */
  restore(state) {
    if (!state) {
      this.reset();
      return;
    }
    this.used = new Set(state.used);
    this.pending = undefined;
    this.suggestion = state.suggestion;
    this.render();
  }

  /**
   * New chat: back to the site's starter.
   */
  reset() {
    this.used.clear();
    this.pending = undefined;
    this.suggestion = this.config.starter;
    this.render();
  }
}
