// Keeps the start of a long answer in view.
//
// The runtime scrolls the chat to the bottom whenever it adds something (the answer, a
// form, a status line), and the live answer view (js/live-chat.js) follows the newest
// line while the answer is written. For an answer taller than the chat, that leaves the
// visitor at its end, scrolling back up every time. This holds the chat so the answer's
// first line never goes above the top: the chat follows a new answer down until its
// start reaches the top, then stays there. A short answer that fits is not touched.
//
// It only ever holds an answer that appeared after the visitor's latest message, so a
// message sent while an answer streams (or any new message) is never pulled back up
// from. It only scrolls up, never down, and it stops as soon as the visitor scrolls or
// presses a key in the chat themselves, until their next message. It reads no text and
// changes nothing but the chat's scroll position. It is the same on all three sites.

/**
 * Holds the chat at the start of the newest answer.
 */
export class ChatScroll {
  /** Space left above the answer's first line, in pixels. */
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
    // The answer to hold: the first one added after the visitor's latest message.
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
   * answer streams, lets go of the answer above it: what comes after it is new. The first
   * answer added after it is the one to hold. The final answer replaces the streamed one,
   * so an answer that has left the chat is replaced by the next one added.
   *
   * :param node: The added node.
   */
  added(node) {
    if (node.nodeType !== 1 || node.parentElement !== this.msgs) {
      return;
    }
    if (node.matches(".ns-msg.user")) {
      this.anchor = null;
      this.moved = false;
      return;
    }
    // The turn status line ("Working…") is a bot message too, but the sites hide it, and a
    // hidden element has no place in the chat to hold: it is never the answer.
    if (node.matches(".ns-msg.bot:not(.ns-consent):not(.ns-auto-approved):not(.ns-turn-status), .ns-widget")
      && (!this.anchor || !this.anchor.isConnected || (this.anchor.matches(".ns-live") && !node.matches(".ns-live")))) {
      this.anchor = node;
    }
  }

  /**
   * The answer to hold: the first one added after the visitor's latest message, while it
   * is still in the chat.
   *
   * :return: The element, or null.
   */
  answer() {
    const anchor = this.anchor;
    // Not drawn (display: none) means no position: holding it would scroll the chat to its top.
    return anchor?.isConnected && anchor.getClientRects().length ? anchor : null;
  }

  /**
   * Scroll up, if needed, so the newest answer's first line is at the top of the chat.
   *
   * :return: True when it moved the chat.
   */
  hold() {
    const answer = this.moved ? null : this.answer();
    if (!answer) {
      return false;
    }
    const top = answer.getBoundingClientRect().top - this.msgs.getBoundingClientRect().top + this.msgs.scrollTop - ChatScroll.GAP;
    if (this.msgs.scrollTop <= top + 1) {
      return false;
    }
    this.msgs.scrollTop = Math.max(0, top);
    return true;
  }
}
