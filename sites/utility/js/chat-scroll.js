// Keeps the visitor's latest message in view while it is answered.
//
// The runtime scrolls the chat to the bottom whenever it adds something (the answer, a
// form, a status line), and the live answer view (js/live-chat.js) follows the newest
// line while the answer is written. For an answer taller than the chat, that leaves the
// visitor at its end, with their own question out of sight. This holds the chat so the
// visitor's latest message stays at the top: the chat follows the answer down until that
// message reaches the top, then stays there while the answer is written. A short answer
// that fits is not touched.
//
// The message to hold is always the visitor's latest one, also one sent while an answer
// streams, so a new message is never pulled back from. It only scrolls up, never down,
// and it stops as soon as the visitor scrolls or presses a key in the chat themselves,
// until their next message. It reads no text and changes nothing but the chat's scroll
// position. It is the same on all three sites.

/**
 * Holds the chat at the visitor's latest message.
 */
export class ChatScroll {
  /** Space left above the message, in pixels. */
  static GAP = 8;

  /** Keys that scroll a list, so pressing one means the visitor is moving it. */
  static KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

  /**
   * Watch the chat, if it exists.
   *
   * :param doc: The document.
   * :return: The ChatScroll, or null when the chat is missing.
   */
  static attach(doc) {
    const msgs = doc.querySelector("#agent-app #ns-msgs");
    const bar = doc.querySelector("#agent-app .ns-inputbar");
    const view = doc.defaultView;
    if (!msgs || !bar || !view?.MutationObserver) {
      return null;
    }
    return new ChatScroll(msgs, bar, view);
  }

  /**
   * :param msgs: The chat's message list, which scrolls.
   * :param bar: The runtime's input bar, which carries data-turn-active during a turn.
   * :param view: The window.
   */
  constructor(msgs, bar, view) {
    this.msgs = msgs;
    this.view = view;
    this.moved = false;
    // The message to hold: the visitor's latest.
    this.anchor = null;
    const settle = () => view.requestAnimationFrame(() => this.hold());
    new view.MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => this.added(node));
      }
      settle();
    }).observe(msgs, {childList: true, subtree: true, characterData: true});
    msgs.addEventListener("scroll", () => this.hold());
    for (const type of ["wheel", "touchstart", "pointerdown"]) {
      msgs.addEventListener(type, () => {
        this.moved = true;
      }, {passive: true});
    }
    msgs.addEventListener("keydown", (event) => {
      if (ChatScroll.KEYS.has(event.key)) {
        this.moved = true;
      }
    });
    // The messages themselves say when a new turn starts, so the input bar is not watched.
    void bar;
    for (const node of msgs.children) {
      this.added(node);
    }
  }

  /**
   * Note an element added to the chat. A message from the visitor, also one sent while an
   * answer streams, becomes the message to hold, and the chat is the visitor's again until
   * they scroll.
   *
   * :param node: The added node.
   */
  added(node) {
    if (node.nodeType !== 1 || node.parentElement !== this.msgs) {
      return;
    }
    if (node.matches(".ns-msg.user")) {
      this.anchor = node;
      this.moved = false;
    }
  }

  /**
   * The message to hold: the visitor's latest, while it is in the chat and drawn. A hidden
   * element has no position, so holding it would scroll the chat to its top.
   *
   * :return: The element, or null.
   */
  message() {
    const anchor = this.anchor;
    return anchor?.isConnected && anchor.getClientRects().length ? anchor : null;
  }

  /**
   * Scroll up, if needed, so the visitor's latest message is at the top of the chat.
   *
   * :return: True when it moved the chat.
   */
  hold() {
    const message = this.moved ? null : this.message();
    if (!message) {
      return false;
    }
    const top = message.getBoundingClientRect().top - this.msgs.getBoundingClientRect().top + this.msgs.scrollTop - ChatScroll.GAP;
    if (this.msgs.scrollTop <= top + 1) {
      return false;
    }
    this.msgs.scrollTop = Math.max(0, top);
    return true;
  }
}
