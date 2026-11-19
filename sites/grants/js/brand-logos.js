// The three sites' logos, drawn as SVG: Emberwick's ember, Heatwright's fan and Fernbrook's
// leaf. The page header draws the same marks in CSS (design.css). The swarm graph and the
// chat header draw these, so no site shows an emoji for its logo.
//
// The manifest's brand text still starts with one plain character, because the runtime shows
// that text as it is (its header, its consent cards). watch() swaps that character for the
// logo wherever it shows in the assistant. It is the same file on all three sites.

/**
 * The logos.
 */
export class BrandLogos {
  /** The plain character each site's manifest brand starts with, by logo. */
  static GLYPHS = {ember: "●", fan: "✢", leaf: "❦"};

  /** The SVG namespace. */
  static NS = "http://www.w3.org/2000/svg";

  /**
   * Each logo as shapes in a box from -1 to 1 on both axes: [tag, attributes]. Fill and
   * stroke follow the colour of the element that holds them. The fan's blades turn.
   */
  static SHAPES = {
    ember: [
      ["circle", {r: 0.52}],
      ["circle", {r: 0.9, fill: "none", stroke: "currentColor", "stroke-width": 0.14, opacity: 0.6}],
    ],
    fan: [
      ["g", {class: "brand-logo-spin"}, [0, 90, 180, 270].map((angle) => (
        ["path", {d: "M0 -1A1 1 0 0 1 0.94 -0.34L0.244 -0.088A0.26 0.26 0 0 0 0 -0.26Z", transform: `rotate(${angle})`}]
      ))],
    ],
    leaf: [
      ["path", {d: "M-0.9 0.9C-0.9 -0.2 -0.2 -0.9 0.9 -0.9C0.9 0.2 0.2 0.9 -0.9 0.9Z"}],
      ["path", {d: "M-0.9 0.9L0.45 -0.45", fill: "none", stroke: "var(--logo-cut, rgba(15, 23, 42, 0.55))", "stroke-width": 0.12, "stroke-linecap": "round"}],
    ],
  };

  /**
   * Add a logo's shapes to an SVG element.
   *
   * :param doc: The document.
   * :param parent: The SVG element to add them to.
   * :param shapes: A list of [tag, attributes] or [tag, attributes, children].
   */
  static fill(doc, parent, shapes) {
    for (const [tag, attrs, children] of shapes) {
      const element = doc.createElementNS(BrandLogos.NS, tag);
      for (const [key, value] of Object.entries(attrs)) {
        element.setAttribute(key, String(value));
      }
      if (children) {
        BrandLogos.fill(doc, element, children);
      }
      parent.append(element);
    }
  }

  /**
   * A logo as an inline SVG of its own, for the page's HTML.
   *
   * :param doc: The document.
   * :param kind: "ember", "fan" or "leaf".
   * :return: The SVG element, which takes the text colour around it.
   */
  static build(doc, kind) {
    const svg = doc.createElementNS(BrandLogos.NS, "svg");
    svg.setAttribute("viewBox", "-1.1 -1.1 2.2 2.2");
    svg.setAttribute("class", `brand-logo brand-logo-${kind}`);
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    BrandLogos.fill(doc, svg, BrandLogos.SHAPES[kind]);
    return svg;
  }

  /**
   * A logo as a group inside a larger SVG, centred on a point.
   *
   * :param doc: The document.
   * :param kind: "ember", "fan" or "leaf".
   * :param x: The centre's x.
   * :param y: The centre's y.
   * :param radius: Half the logo's size.
   * :return: The group element, which takes the CSS colour of the group.
   */
  static place(doc, kind, x, y, radius) {
    const group = doc.createElementNS(BrandLogos.NS, "g");
    group.setAttribute("transform", `translate(${x} ${y}) scale(${radius})`);
    group.setAttribute("class", `swarm-logo brand-logo-${kind}`);
    group.setAttribute("fill", "currentColor");
    group.setAttribute("aria-hidden", "true");
    BrandLogos.fill(doc, group, BrandLogos.SHAPES[kind]);
    return group;
  }

  /**
   * Swap the plain character before a site's name for its logo, in every text under a root.
   *
   * :param root: The element to look under.
   */
  static swap(root) {
    const doc = root.ownerDocument;
    const kinds = Object.fromEntries(Object.entries(BrandLogos.GLYPHS).map(([kind, glyph]) => [glyph, kind]));
    const pattern = /([●✢❦]) (?=Emberwick|Heatwright|Fernbrook)/;
    const walker = doc.createTreeWalker(root, 4);
    const found = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (pattern.test(node.nodeValue)) {
        found.push(node);
      }
    }
    for (const node of found) {
      const match = pattern.exec(node.nodeValue);
      const after = node.splitText(match.index);
      after.nodeValue = after.nodeValue.slice(match[0].length);
      node.parentNode.insertBefore(BrandLogos.build(doc, kinds[match[1]]), after);
    }
  }

  /**
   * Swap now, and again whenever the runtime draws new text under the root.
   *
   * :param root: The element to watch.
   * :return: The observer, or null when the browser has none.
   */
  static watch(root) {
    BrandLogos.swap(root);
    if (typeof root.ownerDocument.defaultView?.MutationObserver !== "function") {
      return null;
    }
    let queued = false;
    const observer = new root.ownerDocument.defaultView.MutationObserver(() => {
      if (!queued) {
        queued = true;
        queueMicrotask(() => {
          queued = false;
          BrandLogos.swap(root);
        });
      }
    });
    observer.observe(root, {childList: true, subtree: true, characterData: true});
    return observer;
  }
}
