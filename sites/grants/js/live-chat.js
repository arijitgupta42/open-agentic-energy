// Live progress in the chat, for each site's assistant, so the visitor is not left
// waiting on a blank screen. Two parts, both drawn from what the runtime already reports:
//
// 1. A collapsible "Working…" block of steps: which agents are asked, which partner
//    sites are contacted, which services are checked. It is folded to start with, and its
//    summary line names the step that is running, then "Worked through N steps" when the
//    turn ends. The visitor opens it to read the list. It shows names only, never the
//    arguments of a call.
// 2. The front agent's answer as it is written. The runtime draws the answer in one go
//    when the turn ends; this shows the same words as they arrive, then the runtime's
//    own answer (with its formatting) replaces them. The `<next>…</next>` line that
//    js/prompt-hints.js reads is never shown.
//
// Nothing here changes what is sent or what the agents do, and the chat works without it.
// This file is the same on all three sites.

/**
 * The progress block and the streamed answer.
 */
export class LiveChat {
  /** The line the answer ends with, which the page hides (see js/prompt-hints.js). */
  static TAG = "<next>";

  /**
   * Show live progress in the chat, if it exists.
   *
   * :param doc: The document.
   * :param engine: The runtime's engine, whose front-agent text this follows.
   * :param trace: The runtime's trace.
   * :return: The LiveChat, or null when the chat is missing.
   */
  static attach(doc, engine, trace) {
    const msgs = doc.querySelector("#agent-app #ns-msgs");
    const bar = doc.querySelector("#agent-app .ns-inputbar");
    if (!msgs || !engine || !trace) {
      return null;
    }
    const live = new LiveChat(doc, msgs);
    engine.onAnswerDelta = (text) => live.delta(text);
    trace.addEventListener("event", (event) => live.event(event.detail));
    const Observer = doc.defaultView?.MutationObserver;
    if (Observer) {
      new Observer((records) => {
        for (const record of records) {
          record.addedNodes.forEach((node) => live.added(node));
        }
      }).observe(msgs, {childList: true});
      if (bar) {
        new Observer(() => {
          if (bar.getAttribute("data-turn-active") !== "true") {
            live.removeLive();
          }
        }).observe(bar, {attributes: true, attributeFilter: ["data-turn-active"]});
      }
    }
    return live;
  }

  /**
   * :param doc: The document.
   * :param msgs: The chat's message list.
   */
  constructor(doc, msgs) {
    this.doc = doc;
    this.msgs = msgs;
    this.text = "";
    this.bubble = null;
    this.block = null;
  }

  /**
   * A readable name for a step.
   *
   * :param tool: The tool's name, or a partner network's address.
   * :param kind: The runtime's kind of tool.
   * :return: A short sentence, such as "Asking Retrofit Planner".
   */
  static label(tool, kind) {
    let name = String(tool || "");
    if (/^https?:\/\//i.test(name)) {
      name = name.split("/").filter(Boolean).pop() || name;
    }
    name = name.replace(/^(mcp|website)_/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    name = name.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "a service";
    if (kind === "agent") {
      return `Asking ${name}`;
    }
    if (kind === "remote network" || kind === "linked network") {
      return `Contacting ${name}`;
    }
    if (kind === "MCP") {
      return `Checking ${name}`;
    }
    return `Running ${name}`;
  }

  /**
   * One event of the runtime's trace.
   *
   * :param ev: The event.
   */
  event(ev) {
    if (!ev) {
      return;
    }
    if (ev.kind === "run") {
      if (ev.phase === "start") {
        this.begin();
      } else if (ev.phase === "end") {
        this.fold();
      }
    } else if (ev.kind === "model_call" && ev.phase === "start") {
      // A new round of the model: words from an earlier round, written before it called
      // tools, are not the answer.
      this.restart();
    } else if (ev.kind === "tool" && this.block) {
      if (ev.phase === "start") {
        this.step(ev);
      } else if (ev.phase === "end") {
        this.mark(ev);
      }
    }
  }

  /**
   * A turn starts: a fresh progress block.
   */
  begin() {
    this.removeLive();
    this.text = "";
    const block = this.doc.createElement("details");
    block.className = "ns-steps";
    // Folded: the summary line already says which step is running, and the visitor opens
    // the list when they want it.
    block.setAttribute("data-running", "true");
    const summary = this.doc.createElement("summary");
    summary.textContent = "Working…";
    const list = this.doc.createElement("ul");
    block.append(summary, list);
    this.msgs.append(block);
    this.block = {element: block, summary, list, items: new Map(), count: 0};
    this.scroll();
  }

  /**
   * A tool starts: add a step.
   *
   * :param ev: The trace event.
   */
  step(ev) {
    const item = this.doc.createElement("li");
    const text = LiveChat.label(ev.tool, ev.toolKind);
    item.textContent = `… ${text}`;
    this.block.list.append(item);
    this.block.items.set(ev.id, {item, text});
    this.block.count += 1;
    this.block.summary.textContent = `Working… ${text}`;
    this.scroll();
  }

  /**
   * A tool ends: tick or cross its step.
   *
   * :param ev: The trace event.
   */
  mark(ev) {
    const step = this.block.items.get(ev.id);
    if (step) {
      step.item.textContent = `${ev.status === "ok" || !ev.status ? "✓" : "✗"} ${step.text}`;
    }
  }

  /**
   * The turn ends: name the block's steps, or drop it when nothing was done. It stays as
   * the visitor left it, open or folded.
   */
  fold() {
    const block = this.block;
    this.block = null;
    if (!block) {
      return;
    }
    if (block.count === 0) {
      block.element.remove();
      return;
    }
    block.element.setAttribute("data-running", "false");
    block.summary.textContent = `Worked through ${block.count} step${block.count === 1 ? "" : "s"}`;
  }

  /**
   * The front agent wrote more of its answer.
   *
   * :param piece: The new text.
   */
  delta(piece) {
    this.text += String(piece || "");
    const shown = LiveChat.visible(this.text);
    if (!shown) {
      return;
    }
    if (!this.bubble) {
      this.bubble = this.doc.createElement("div");
      this.bubble.className = "ns-msg bot ns-live";
      this.bubble.setAttribute("aria-hidden", "true");
      this.msgs.append(this.bubble);
    }
    this.bubble.textContent = shown;
    this.scroll();
  }

  /**
   * The part of the answer to show: without the `<next>` line, or the start of it.
   *
   * :param text: The answer so far.
   * :return: The text to show.
   */
  static visible(text) {
    const at = text.toLowerCase().indexOf("<next");
    let shown = at === -1 ? text : text.slice(0, at);
    if (at === -1) {
      for (let size = LiveChat.TAG.length - 1; size > 0; size -= 1) {
        if (shown.toLowerCase().endsWith(LiveChat.TAG.slice(0, size))) {
          shown = shown.slice(0, shown.length - size);
          break;
        }
      }
    }
    return shown.trimEnd();
  }

  /**
   * A new round of the model starts: forget the words so far.
   */
  restart() {
    this.text = "";
    this.removeLive();
  }

  /**
   * Something was added to the chat. The runtime's own answer, or an error, replaces the
   * streamed words.
   *
   * :param node: The added node.
   */
  added(node) {
    const names = String(node?.className || "").split(/\s+/);
    if (names.includes("ns-msg") && names.includes("bot") && !names.includes("ns-live") && !names.includes("ns-turn-status")) {
      this.removeLive();
    }
  }

  /**
   * Take the streamed answer out of the chat.
   */
  removeLive() {
    if (this.bubble) {
      this.bubble.remove();
      this.bubble = null;
    }
  }

  /**
   * Keep the newest line in view.
   */
  scroll() {
    this.msgs.scrollTop = this.msgs.scrollHeight;
  }
}
