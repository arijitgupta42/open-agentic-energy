// Chats in one visit, for each site's assistant. A list to the left of the chat window
// holds every chat started since the page loaded. Choosing one shows its messages, its
// conversation history and, in "The swarm at work", only the answers made in that chat.
//
// The runtime keeps one conversation at a time: its message list (#ns-msgs) and
// engine.history. This file keeps the other chats' messages and history out of the way
// and swaps them in, so the runtime never knows. It adds no storage: chats live in page
// memory and end with the visit, like the rest of the demo's data. Nothing here is sent
// anywhere, and the chat works without it.
//
// Switching is off while the agents work, because the runtime is writing into the
// message list then.
//
// This file is the same on all three sites. The page's own markup is in index.html.

/**
 * The list of chats, and the switching between them.
 */
export class ChatSessions {
  /** The longest a chat's first message gets in its tooltip. */
  static TITLE_LENGTH = 80;

  /**
   * A chat's name in the list: "Chat session 1", "Chat session 2" and so on, in the order
   * they were started.
   *
   * :param number: The chat's number.
   * :return: The name.
   */
  static name(number) {
    return `Chat session ${number}`;
  }

  /**
   * Add the chat list to the page, if the runtime's chat is there.
   *
   * :param doc: The document.
   * :param engine: The runtime's engine, whose history this swaps.
   * :param trace: The runtime's trace, which says when a message starts.
   * :param options: {hints, beforeChange, onChange}. hints is the PromptHints, so each
   *   chat keeps its own suggestion. beforeChange runs before the chat on show changes,
   *   and onChange after it, with the chat.
   * :return: The ChatSessions, or null when the list or the chat is missing.
   */
  static attach(doc, engine, trace, options = {}) {
    const list = doc.querySelector("#chat-list");
    const msgs = doc.querySelector("#agent-app #ns-msgs");
    const bar = doc.querySelector("#agent-app .ns-inputbar");
    const input = doc.querySelector("#agent-app #ns-input");
    if (!list || !msgs || !bar || !input || !engine) {
      return null;
    }
    const sessions = new ChatSessions(doc, {list, msgs, input}, engine, options);
    trace?.addEventListener("event", (event) => sessions.event(event.detail));
    const Observer = doc.defaultView?.MutationObserver;
    if (Observer) {
      new Observer(() => sessions.lock(bar.getAttribute("data-turn-active") === "true"))
        .observe(bar, {attributes: true, attributeFilter: ["data-turn-active"]});
    }
    list.hidden = false;
    return sessions;
  }

  /**
   * :param doc: The document.
   * :param parts: The list's element, the runtime's message list and its chat box.
   * :param engine: The runtime's engine.
   * :param options: See attach.
   */
  constructor(doc, parts, engine, options = {}) {
    this.doc = doc;
    this.root = parts.list;
    this.msgs = parts.msgs;
    this.input = parts.input;
    this.engine = engine;
    this.hints = options.hints || null;
    this.beforeChange = options.beforeChange || null;
    this.onChange = options.onChange || null;
    this.count = 0;
    this.locked = false;
    this.chats = [];
    this.current = this.make();
    this.chats.push(this.current);
    this.build();
    this.render();
  }

  /**
   * A new, empty chat record.
   *
   * :return: {id, title, frame, history, draft, hint, runs}. title is the first message,
   *   shown as the tooltip, and the chat's name comes from its id. frame holds the messages
   *   while the chat is off show, and runs the trace numbers of its messages.
   */
  make() {
    this.count += 1;
    return {id: this.count, title: "", frame: null, history: [], draft: "", hint: null, runs: new Set()};
  }

  /**
   * Make an element.
   *
   * :param name: The tag name.
   * :param className: Its class.
   * :param text: Its text, if any.
   * :return: The element.
   */
  html(name, className, text) {
    const element = this.doc.createElement(name);
    element.className = className;
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  /**
   * Build the list's parts once: the New chat button, the chats and a note.
   */
  build() {
    this.newButton = this.html("button", "chat-new", "+ New chat");
    this.newButton.type = "button";
    this.newButton.addEventListener("click", () => this.start());
    this.items = this.html("ul", "chat-items");
    this.note = this.html("p", "chat-note", "Chats stay in this tab until you refresh the page.");
    this.root.append(this.newButton, this.items, this.note);
  }

  /**
   * One event of the runtime's trace. A message starting belongs to the chat on show,
   * and the first one is kept to tell the chats apart on hover.
   *
   * :param ev: The event.
   */
  event(ev) {
    if (!ev || ev.kind !== "run" || ev.phase !== "start") {
      return;
    }
    this.current.runs.add(ev.seq);
    if (!this.current.title) {
      this.current.title = ChatSessions.title(ev.input);
      this.render();
    }
  }

  /**
   * A chat's first message, cut short, for its tooltip.
   *
   * :param text: The message.
   * :return: One line.
   */
  static title(text) {
    const line = String(text || "").replace(/\s+/g, " ").trim();
    if (line.length <= ChatSessions.TITLE_LENGTH) {
      return line;
    }
    return `${line.slice(0, ChatSessions.TITLE_LENGTH - 1).trimEnd()}…`;
  }

  /**
   * Keep only the answers made in the chat on show.
   *
   * :param turns: The turns from AnswerPath.build(), for every chat.
   * :return: The chat's own turns, oldest first.
   */
  turnsOf(turns) {
    return (turns || []).filter((turn) => this.current.runs.has(turn.seq));
  }

  /**
   * Turn switching on or off. It is off while the agents work.
   *
   * :param locked: True to turn it off.
   */
  lock(locked) {
    this.locked = locked;
    this.render();
  }

  /**
   * Start a new chat, and show it. A chat with no message yet is already new, so the
   * visitor stays in it.
   */
  start() {
    if (this.locked) {
      return;
    }
    if (this.current.runs.size === 0) {
      this.input.focus();
      return;
    }
    // Every chat opens with the same first message, which is the one the page greets with.
    const welcome = this.msgs.firstElementChild ? this.msgs.firstElementChild.cloneNode(true) : null;
    this.beforeChange?.();
    this.stash();
    const chat = this.make();
    this.chats.push(chat);
    this.engine.history = [];
    this.msgs.replaceChildren(...(welcome ? [welcome] : []));
    this.input.value = "";
    this.hints?.restore(null);
    this.current = chat;
    this.shown();
    this.input.focus();
  }

  /**
   * Show another chat.
   *
   * :param id: The chat's id.
   */
  select(id) {
    const chat = this.chats.find((candidate) => candidate.id === id);
    if (this.locked || !chat || chat === this.current) {
      return;
    }
    this.beforeChange?.();
    this.stash();
    this.engine.history = chat.history;
    this.msgs.replaceChildren(chat.frame);
    chat.frame = null;
    this.input.value = chat.draft;
    this.hints?.restore(chat.hint);
    this.current = chat;
    this.shown();
    // The list was redrawn, so keep keyboard focus on the chat that was picked.
    this.pickedButton?.focus();
  }

  /**
   * Put the chat on show to one side: its messages, history, draft and suggestion.
   */
  stash() {
    const chat = this.current;
    const frame = this.doc.createDocumentFragment();
    frame.append(...Array.from(this.msgs.childNodes));
    chat.frame = frame;
    chat.history = this.engine.history;
    chat.draft = this.input.value;
    chat.hint = this.hints ? this.hints.snapshot() : null;
  }

  /**
   * The chat on show changed: redraw the list, scroll to the newest message and tell the
   * page.
   */
  shown() {
    this.render();
    this.msgs.scrollTop = this.msgs.scrollHeight;
    this.onChange?.(this.current);
  }

  /**
   * Draw the list: one button per chat, the one on show marked.
   */
  render() {
    this.newButton.disabled = this.locked;
    this.items.replaceChildren();
    for (const chat of this.chats) {
      const item = this.html("li", "chat-item");
      const name = ChatSessions.name(chat.id);
      const button = this.html("button", "chat-pick", name);
      button.type = "button";
      button.title = chat.title ? `${name}: ${chat.title}` : name;
      button.disabled = this.locked && chat !== this.current;
      if (chat === this.current) {
        button.setAttribute("aria-current", "true");
        this.pickedButton = button;
      }
      button.addEventListener("click", () => this.select(chat.id));
      item.append(button);
      this.items.append(item);
    }
  }
}
