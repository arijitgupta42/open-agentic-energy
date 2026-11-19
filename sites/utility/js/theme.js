// The dark and light themes of each site, with a switch in the header. The page is dark
// by default: every page carries data-theme="dark" on <html> in its own HTML, so it is
// dark before any script runs. The switch changes that attribute, and styles.css (and the
// figures drawn by js/openui.js) follow it through CSS variables. The choice is kept in
// this browser's local storage for this site only; it is never sent anywhere. Without
// storage the switch still works for the visit.
//
// The page works without this file: it stays dark. It is the same on all three sites.

/**
 * The theme and its switch.
 */
export class Theme {
  /** The storage key of the choice. */
  static KEY = "theme";

  /** The theme a visitor gets before choosing. */
  static DEFAULT = "dark";

  /**
   * The theme to show: the saved choice, or the default.
   *
   * :param storage: A Storage, or nothing.
   * :return: "dark" or "light".
   */
  static read(storage) {
    try {
      const saved = storage?.getItem(Theme.KEY);
      return saved === "light" || saved === "dark" ? saved : Theme.DEFAULT;
    } catch {
      return Theme.DEFAULT;
    }
  }

  /**
   * Keep the choice, when storage allows.
   *
   * :param storage: A Storage, or nothing.
   * :param theme: "dark" or "light".
   */
  static save(storage, theme) {
    try {
      storage?.setItem(Theme.KEY, theme);
    } catch {
      // Private windows and blocked storage: the choice lasts until the page closes.
    }
  }

  /**
   * Show a theme.
   *
   * :param doc: The document.
   * :param theme: "dark" or "light".
   */
  static apply(doc, theme) {
    doc.documentElement.setAttribute("data-theme", theme);
    const button = doc.querySelector(".theme-switch");
    if (button) {
      button.setAttribute("aria-checked", String(theme === "dark"));
    }
  }

  /**
   * Apply the saved theme and put the switch in the header, after its navigation.
   *
   * :param doc: The document.
   * :param win: The window, for its storage.
   * :return: The switch button, or null when the page has no header.
   */
  static attach(doc, win) {
    const header = doc.querySelector("header");
    let storage = null;
    try {
      storage = win?.localStorage ?? null;
    } catch {
      storage = null;
    }
    if (!header) {
      Theme.apply(doc, Theme.read(storage));
      return null;
    }
    let button = doc.querySelector(".theme-switch");
    if (!button) {
      button = doc.createElement("button");
      button.type = "button";
      button.className = "theme-switch";
      button.setAttribute("role", "switch");
      const track = doc.createElement("span");
      track.className = "theme-track";
      track.setAttribute("aria-hidden", "true");
      const knob = doc.createElement("span");
      knob.className = "theme-knob";
      track.append(knob);
      const text = doc.createElement("span");
      text.textContent = "Dark mode";
      button.append(track, text);
      header.append(button);
    }
    Theme.apply(doc, Theme.read(storage));
    button.addEventListener("click", () => {
      const next = doc.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      Theme.apply(doc, next);
      Theme.save(storage, next);
    });
    return button;
  }
}

if (typeof document !== "undefined") {
  try {
    Theme.attach(document, window);
  } catch (error) {
    console.error("The theme switch is off", error);
  }
}
