// Keeps the start of a long answer in view.
//
// The runtime scrolls the chat to the bottom whenever it adds something (the answer, a
// form, a status line), and the live answer view (js/live-chat.js) follows the newest
// line while the answer is written. For an answer taller than the chat, that leaves the
// visitor at its end, scrolling back up every time. This holds the chat so the answer's
// first line never goes above the top: the chat follows a new answer down until its
// start reaches the top, then stays there. A short answer that fits is not touched.
//
// It only ever scrolls up, never down, and it stops as soon as the visitor scrolls or
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
    const settle = () => view.requestAnimationFrame(() => this.hold());
    // A new message from the visitor starts a turn: hold the chat again from its answer.
    new view.MutationObserver(() => {
      if (bar.getAttribute("data-turn-active") === "true") {
        this.moved = false;
      }
      settle();
    }).observe(bar, {attributes: true, attributeFilter: ["data-turn-active"]});
    new view.MutationObserver(settle).observe(msgs, {childList: true, subtree: true, characterData: true});
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
  }

  /**
   * The newest answer: the first reply from the assistant after the visitor's last
   * message, not the list of working steps or a consent card.
   *
   * :return: The element, or null before the first answer.
   */
  answer() {
    const asked = [...this.msgs.querySelectorAll(".ns-msg.user:not(.ns-steering-message)")].at(-1);
    for (let node = asked?.nextElementSibling; node; node = node.nextElementSibling) {
      if (node.matches(".ns-msg.bot:not(.ns-consent):not(.ns-auto-approved), .ns-widget")) {
        return node;
      }
    }
    return null;
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
