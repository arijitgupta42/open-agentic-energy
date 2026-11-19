// The phone layout of each site: one screen at a time, chat first, with a tab bar at the
// bottom. It is the same page, the same runtime and the same rules as on a laptop (CLAUDE.md
// rule 5): this file only decides which part of the page is on show, and mobile.css (loaded
// on screens up to 760px wide) lays that part out for a thumb.
//
//   Ask       the assistant's chat, full height, with its input above the keyboard
//   <Page>    the site's own content (usage, tariffs, estimates, eligibility)
//   Swarm     "The swarm at work", and the developer log when it is switched on
//   Settings  the notes on what goes to the AI provider, and the AI model settings
//
// A "Chats" button over the chat opens the list of this visit's chats as a sheet. The
// body's data-view says which screen is on show and data-sheet says whether the chat list
// is open. Without this file, or on a wide screen, none of it applies: the page is the
// desktop page, stacked on a narrow screen as before.
//
// This file is the same on all three sites.

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The phone layout's state and its tab bar.
 */
export class Mobile {
  /** The screen width, in CSS pixels, up to which the phone layout is used (see mobile.css). */
  static QUERY = "(max-width: 760px)";

  /** The screens, in tab order. Each icon is a list of SVG shapes [tag, attributes]. */
  static VIEWS = [
    {id: "ask", label: "Ask", icon: [["path", {d: "M4 5h16v11H9l-5 4z"}]]},
    {id: "page", label: "Page", icon: [["path", {d: "M6 4h12v16H6zM9 9h6M9 13h6M9 17h3"}]]},
    {id: "swarm", label: "Swarm", icon: [["path", {d: "M12 8v4M12 12l-5 4M12 12l5 4"}], ["circle", {cx: 12, cy: 6, r: 2}], ["circle", {cx: 7, cy: 18, r: 2}], ["circle", {cx: 17, cy: 18, r: 2}]]},
    {id: "settings", label: "Settings", icon: [["path", {d: "M4 7h9M17 7h3M4 17h3M11 17h9M4 12h16"}], ["circle", {cx: 15, cy: 7, r: 2}], ["circle", {cx: 9, cy: 17, r: 2}]]},
  ];

  /**
   * The screen a link or the address points to.
   *
   * :param doc: The document.
   * :param hash: The address's hash, such as "#tariffs".
   * :return: A screen's id: "ask" for no hash, #assistant or anything inside the assistant;
   *     "page" for another part of the page.
   */
  static viewFor(doc, hash) {
    const id = String(hash || "").replace(/^#/, "");
    if (!id || id === "assistant") {
      return "ask";
    }
    const target = doc.getElementById?.(id);
    if (!target) {
      return "ask";
    }
    const assistant = doc.querySelector("#assistant");
    return assistant && assistant.contains?.(target) ? "ask" : "page";
  }

  /**
   * Set up the phone layout, if the page has what it needs.
   *
   * :param doc: The document.
   * :param win: The window.
   * :return: The Mobile, or null when the page has no header or assistant.
   */
  static attach(doc, win) {
    if (!doc.querySelector("header") || !doc.querySelector("#assistant") || !doc.body) {
      return null;
    }
    const mobile = new Mobile(doc, win);
    mobile.build();
    return mobile;
  }

  /**
   * :param doc: The document.
   * :param win: The window.
   */
  constructor(doc, win) {
    this.doc = doc;
    this.win = win;
    this.view = null;
    this.tabs = new Map();
  }

  /**
   * Make a small SVG icon.
   *
   * :param shapes: A list of [tag, attributes].
   * :return: The SVG element.
   */
  icon(shapes) {
    const svg = this.doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attrs] of shapes) {
      const shape = this.doc.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) {
        shape.setAttribute(name, String(value));
      }
      svg.append(shape);
    }
    return svg;
  }

  /**
   * Add the tab bar, the toolbar over the chat and the sheet's backdrop, and start
   * following the address, the keyboard and the screen's size.
   */
  build() {
    const {doc, win} = this;
    const label = doc.querySelector("main")?.getAttribute("data-m-label");
    const bar = doc.createElement("nav");
    bar.className = "m-tabs";
    bar.setAttribute("aria-label", "Sections");
    for (const view of Mobile.VIEWS) {
      const tab = doc.createElement("button");
      tab.type = "button";
      tab.className = "m-tab";
      tab.setAttribute("data-view", view.id);
      const text = doc.createElement("span");
      text.textContent = view.id === "page" && label ? label : view.label;
      tab.append(this.icon(view.icon), text);
      tab.addEventListener("click", () => this.setView(view.id));
      bar.append(tab);
      this.tabs.set(view.id, tab);
    }
    doc.body.append(bar);

    const assistant = doc.querySelector("#assistant");
    const toolbar = doc.createElement("div");
    toolbar.className = "m-toolbar";
    const chats = doc.createElement("button");
    chats.type = "button";
    chats.className = "m-chats";
    chats.textContent = "Chats";
    chats.setAttribute("aria-haspopup", "dialog");
    chats.addEventListener("click", () => this.sheet(true));
    const demo = doc.createElement("span");
    demo.className = "m-demo";
    demo.textContent = "Fictional demo";
    toolbar.append(chats, demo);
    assistant.prepend(toolbar);

    const backdrop = doc.createElement("div");
    backdrop.className = "m-backdrop";
    backdrop.addEventListener("click", () => this.sheet(false));
    doc.body.append(backdrop);

    // A chosen chat, or a new one, closes the sheet.
    doc.addEventListener("click", (event) => {
      if (event.target?.closest?.("#chat-side .chat-pick, #chat-side .chat-new")) {
        this.sheet(false);
      }
    });
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.sheet(false);
      }
    });
    // The header's own links: "Ask us" goes to the chat, the others to the page.
    for (const link of doc.querySelectorAll("header nav a")) {
      link.addEventListener("click", (event) => {
        const view = Mobile.viewFor(doc, link.getAttribute("href"));
        this.setView(view);
        if (view === "ask") {
          event.preventDefault();
        }
      });
    }
    win.addEventListener("hashchange", () => this.showHash());
    this.follow();
    this.showHash();
  }

  /**
   * Keep --m-vh the height of what is really visible, so the chat's input stays above
   * the keyboard on phones that do not shrink the page for it. The developer log opening
   * brings up the Swarm screen, where it is shown.
   */
  follow() {
    const {doc, win} = this;
    const sync = () => {
      const height = win.visualViewport?.height ?? win.innerHeight;
      doc.documentElement.style.setProperty("--m-vh", `${Math.round(height)}px`);
      if (this.view !== "page") {
        win.scrollTo?.(0, 0);
      }
    };
    win.visualViewport?.addEventListener("resize", sync);
    win.visualViewport?.addEventListener("scroll", sync);
    win.addEventListener("resize", sync);
    win.addEventListener("orientationchange", sync);
    sync();
    const app = doc.querySelector("#agent-app");
    const Observer = win.MutationObserver;
    // The assistant's status line is hidden over the chat once it is connected, but a
    // page that is still connecting, or whose assistant could not load, must say so
    // (the chat would be empty), so mobile.css keeps it on show then.
    const status = doc.querySelector("#assistant-status");
    if (status) {
      const mark = () => {
        const loud = /could not load|connecting/i.test(status.textContent || "");
        doc.body.setAttribute("data-m-status", loud ? "alert" : "ok");
      };
      mark();
      if (Observer) {
        new Observer(mark).observe(status, {childList: true, characterData: true, subtree: true});
      }
    }
    if (app && Observer) {
      new Observer(() => {
        if (app.getAttribute("data-dev") === "true" && this.view === "ask") {
          this.setView("swarm");
        }
      }).observe(app, {attributes: true, attributeFilter: ["data-dev"]});
    }
  }

  /**
   * Show what the address points to: the chat, or a part of the page, scrolled to.
   */
  showHash() {
    const hash = this.win.location.hash;
    const view = Mobile.viewFor(this.doc, hash);
    this.setView(view, view === "page" ? this.doc.getElementById(hash.slice(1)) : null);
  }

  /**
   * Show a screen.
   *
   * :param view: A screen's id.
   * :param target: For the page, the part to scroll to, or nothing for the top.
   */
  setView(view, target = null) {
    if (!this.tabs.has(view)) {
      return;
    }
    this.view = view;
    this.doc.body.setAttribute("data-view", view);
    this.sheet(false);
    for (const [id, tab] of this.tabs) {
      tab.setAttribute("aria-current", String(id === view));
    }
    const raf = this.win.requestAnimationFrame?.bind(this.win) ?? ((fn) => fn());
    raf(() => {
      if (view === "ask") {
        // The chat was hidden: it comes back at its newest message.
        const msgs = this.doc.querySelector("#ns-msgs");
        if (msgs) {
          msgs.scrollTop = msgs.scrollHeight;
        }
      } else if (view === "page") {
        if (target) {
          target.scrollIntoView?.();
        } else {
          this.win.scrollTo?.(0, 0);
        }
      }
    });
  }

  /**
   * Open or close the list of chats.
   *
   * :param open: True to open it.
   */
  sheet(open) {
    if (open) {
      this.doc.body.setAttribute("data-sheet", "chats");
    } else {
      this.doc.body.removeAttribute("data-sheet");
    }
  }
}

if (typeof document !== "undefined") {
  try {
    Mobile.attach(document, window);
  } catch (error) {
    console.error("The phone layout is off", error);
  }
}
