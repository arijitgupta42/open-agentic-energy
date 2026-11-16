// A chat box that grows. The runtime's chat box (#ns-input) is a one-line <input>, which
// cannot wrap a long request onto new lines. This puts a <textarea> in front of it that
// grows upward as the visitor types, with the bottom of the box staying put, and goes back
// to one line once the request is sent.
//
// The runtime and the other page scripts keep using #ns-input and never learn about the
// textarea. The input stays in the page, hidden, and the two are kept the same:
//   - the input's value is the textarea's text, line breaks included (a one-line input
//     would drop them), and typing sends the input an "input" event;
//   - when a script sets the input's value (the runtime clearing it after Send, a
//     suggestion, voice input, switching chats), the textarea follows and resizes;
//   - Enter and Tab in the textarea go to the input's own key handlers, which send the
//     request and take a suggestion;
//   - the input's placeholder, disabled state and focus() are handed on to the textarea.
// Enter sends. Shift+Enter, and line breaks in pasted text, make new lines.
//
// Nothing here reads, stores or sends what is typed. This file is the same on all three
// sites.

/**
 * The growing chat box.
 */
export class ChatBox {
  /** The tallest the box grows, in pixels. Longer text scrolls inside it. */
  static MAX_HEIGHT = 168;

  /**
   * Put the growing box in front of the runtime's chat box, if both exist.
   *
   * :param doc: The document.
   * :return: The ChatBox, or null when the chat box is missing.
   */
  static attach(doc) {
    const input = doc.querySelector("#agent-app #ns-input");
    if (!input || !input.parentNode || typeof doc.createElement !== "function") {
      return null;
    }
    return new ChatBox(doc, input);
  }

  /**
   * :param doc: The document.
   * :param input: The runtime's chat box.
   */
  constructor(doc, input) {
    this.doc = doc;
    this.input = input;
    this.box = doc.createElement("textarea");
    this.box.className = "ns-input ns-grow";
    this.box.rows = 1;
    this.box.setAttribute("aria-label", input.getAttribute("aria-label") || "Your request");
    this.box.setAttribute("autocomplete", "off");
    this.copyState();
    const wrap = doc.createElement("div");
    wrap.className = "ns-inputwrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.append(this.box, input);
    input.hidden = true;
    this.hook();
    this.resize();
  }

  /**
   * Take the input's value, placeholder and disabled state.
   */
  copyState() {
    this.box.value = this.input.value;
    this.box.placeholder = this.input.placeholder || "";
    this.box.disabled = Boolean(this.input.disabled);
  }

  /**
   * Join the textarea and the input.
   */
  hook() {
    const {input, box} = this;
    // The input's value is the textarea's text. A script setting it: the textarea follows.
    const own = ChatBox.descriptor(input, "value");
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => box.value,
      set: (value) => {
        const text = String(value ?? "");
        if (own.set) {
          own.set.call(input, text);
        }
        box.value = text;
        this.resize();
      },
    });
    // The page's focus calls reach the box the visitor sees.
    input.focus = () => box.focus();
    box.addEventListener("input", () => this.typed());
    box.addEventListener("keydown", (event) => this.key(event));
    // A script changing the placeholder or disabling the input.
    const Observer = this.doc.defaultView?.MutationObserver;
    if (Observer) {
      new Observer(() => {
        box.placeholder = input.placeholder || "";
        box.disabled = Boolean(input.disabled);
      }).observe(input, {attributes: true, attributeFilter: ["placeholder", "disabled"]});
    }
    this.doc.defaultView?.addEventListener?.("resize", () => this.resize());
  }

  /**
   * Find a property's descriptor on an object or the objects it inherits from.
   *
   * :param object: The object.
   * :param name: The property.
   * :return: The descriptor, or {} for a plain stored value.
   */
  static descriptor(object, name) {
    for (let at = object; at; at = Object.getPrototypeOf(at)) {
      const found = Object.getOwnPropertyDescriptor(at, name);
      if (found) {
        return found.get || found.set ? found : {};
      }
    }
    return {};
  }

  /**
   * The visitor typed, pasted or deleted in the textarea: fit the height and tell the
   * input's listeners, as a keystroke in the input would.
   */
  typed() {
    this.resize();
    const EventClass = this.doc.defaultView?.Event || Event;
    this.input.dispatchEvent(new EventClass("input", {bubbles: true}));
  }

  /**
   * A key in the textarea. Enter sends and Tab takes the suggestion, by way of the
   * input's own handlers. Shift+Enter is a line break.
   *
   * :param event: The keydown event.
   */
  key(event) {
    if (event.isComposing) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      // Shift+Enter is left alone: the textarea starts a new line.
      event.preventDefault();
      this.forward(event);
    } else if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      this.forward(event, true);
    }
  }

  /**
   * Give a key to the input's listeners.
   *
   * :param event: The keydown event in the textarea.
   * :param follow: True to cancel the original too when a listener cancels the copy,
   *   as the suggestion does when it takes Tab.
   */
  forward(event, follow = false) {
    const EventClass = this.doc.defaultView?.KeyboardEvent || Event;
    const copy = new EventClass("keydown", {key: event.key, bubbles: true, cancelable: true});
    this.input.dispatchEvent(copy);
    if (follow && copy.defaultPrevented) {
      event.preventDefault();
    }
  }

  /**
   * Fit the height to the text, from one line up to MAX_HEIGHT. The bar sits at the bottom
   * of the chat, so the box grows upward and the text above it moves up.
   */
  resize() {
    const {box} = this;
    if (box.value === "") {
      // One line, whatever the placeholder: a long suggestion would wrap and make the
      // empty box two lines high.
      box.style.height = "";
      box.style.overflowY = "hidden";
      return;
    }
    box.style.height = "auto";
    const wanted = box.scrollHeight;
    if (wanted > 0) {
      box.style.height = `${Math.min(wanted, ChatBox.MAX_HEIGHT)}px`;
    } else {
      box.style.height = "";
    }
    box.style.overflowY = wanted > ChatBox.MAX_HEIGHT ? "auto" : "hidden";
  }
}
