// Generative UI for numbers, in the chat of each site's assistant.
//
// The assistant can answer with an "openui" block: a few lines of OpenUI Lang, the
// compact format of the open source OpenUI project (github.com/thesysdev/openui, MIT).
// This file reads that format and draws stat tiles, meters, tables, bar, line and donut
// charts and callouts from it.
// It is our own small reader and renderer: no OpenUI code is copied and nothing is loaded
// from another site, so the page keeps its rules (no dependencies, no third-party
// scripts). It speaks the same statement syntax, so the assistant can be told to write
// OpenUI Lang without anything new to learn.
//
//   root = Stack([cost, months])
//   cost = Stat("Yearly cost", 1180, "£", "£120 less than now", "good")
//   months = BarChart("Gas used", ["Jan", "Feb"], [Series("kWh", [820, 640])], "kWh")
//
// What the model writes is only ever data. Every value is checked against LIBRARY and
// drawn with DOM text and SVG shapes made here, never from markup the model supplied, so
// it cannot run code, load a resource or restyle the page. A block that cannot be read is
// left as plain text. A part that is wrong is replaced by a short note and the rest is
// still drawn. The chat works without this file. It is the same on all three sites.

const SVG_NS = "http://www.w3.org/2000/svg";

/** A value the stream has not reached yet: its statement has not arrived. */
class Pending extends Error {}

/**
 * The components the assistant may use, and the OpenUI Lang reader and renderer.
 */
export class OpenUi {
  /**
   * Each component's values, in the order the model writes them. A name ending in "?" is
   * optional. Types: string, value (text or number), number, strings, numbers, rows,
   * nodes (components), series (Series components) and enum:a|b. The prompt in each
   * site's .hocon (figure_rules) lists these same signatures; a test keeps them equal.
   */
  static LIBRARY = {
    Stack: {params: [["children", "nodes"], ["direction?", "enum:column|row"]]},
    Text: {params: [["content", "string"], ["style?", "enum:body|heading|muted"]]},
    Stat: {params: [["label", "string"], ["value", "value"], ["unit?", "string"], ["detail?", "string"], ["tone?", "enum:neutral|good|bad"], ["trend?", "numbers"]]},
    Meter: {params: [["label", "string"], ["value", "number"], ["max", "number"], ["unit?", "string"], ["tone?", "enum:neutral|good|bad"]]},
    Table: {params: [["columns", "strings"], ["rows", "rows"], ["caption?", "string"]]},
    Series: {params: [["name", "string"], ["values", "numbers"]]},
    BarChart: {params: [["title", "string"], ["labels", "strings"], ["series", "series"], ["unit?", "string"]]},
    LineChart: {params: [["title", "string"], ["labels", "strings"], ["series", "series"], ["unit?", "string"]]},
    PieChart: {params: [["title", "string"], ["labels", "strings"], ["values", "numbers"], ["unit?", "string"]]},
    Callout: {params: [["text", "string"], ["tone?", "enum:info|good|warn"]]},
  };

  /** Limits, so a runaway answer cannot build a huge page. */
  static LIMITS = {text: 400, items: 120, children: 24, nodes: 150, depth: 8, columns: 12, rows: 200, series: 8};

  /**
   * The width, in drawing units, that charts are made at. attach() sets it from the chat,
   * so a chart in a narrow chat keeps its text a readable size instead of shrinking.
   */
  static WIDTH = 640;

  /** Line dashes, so series differ by more than colour. */
  static DASHES = ["", "7 4", "2 4", "10 4 2 4", "", "7 4", "2 4", "10 4 2 4"];

  /**
   * One component as it is written, for the prompt and the tests.
   *
   * :param name: The component's name.
   * :return: For example "Stat(label, value, unit?, detail?, tone?)".
   */
  static signature(name) {
    return `${name}(${OpenUi.LIBRARY[name].params.map(([param]) => param).join(", ")})`;
  }

  // ---- Reading -------------------------------------------------------------------------

  /**
   * Cut the source into statements. A statement ends at a line end outside any brackets
   * and quotes, so one may run over several lines.
   *
   * :param source: The OpenUI Lang text.
   * :return: A list of {text, closed}. closed is false for a last statement that is
   *     still open: brackets or quotes not shut.
   */
  static split(source) {
    const out = [];
    let current = "";
    let depth = 0;
    let quote = false;
    let escaped = false;
    const push = (closed) => {
      const text = current.trim();
      if (text) {
        out.push({text, closed});
      }
      current = "";
      depth = 0;
    };
    for (const ch of String(source || "")) {
      if (quote) {
        current += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          quote = false;
        }
        continue;
      }
      if (ch === '"') {
        quote = true;
      } else if (ch === "(" || ch === "[") {
        depth += 1;
      } else if (ch === ")" || ch === "]") {
        depth -= 1;
      } else if (ch === "\n" && depth <= 0) {
        push(true);
        continue;
      }
      current += ch;
    }
    const closed = depth <= 0 && !quote;
    push(closed);
    return out;
  }

  /**
   * Read one value: a string, number, true, false, null, a list, a reference to another
   * statement, or a component call with values.
   *
   * :param text: The text of the right-hand side.
   * :return: A string, number, boolean, null, an array, {ref} or {call, args}.
   * :raises Error: When the text is not one value.
   */
  static expression(text) {
    let at = 0;
    const fail = (message) => {
      throw new Error(message);
    };
    const space = () => {
      while (at < text.length && /\s/.test(text[at])) {
        at += 1;
      }
    };
    const string = () => {
      const start = at;
      at += 1;
      while (at < text.length && text[at] !== '"') {
        at += text[at] === "\\" ? 2 : 1;
      }
      if (at >= text.length) {
        fail("a text is not closed");
      }
      at += 1;
      try {
        return JSON.parse(text.slice(start, at));
      } catch {
        return fail("a text has a bad escape");
      }
    };
    const list = (close, item, depth) => {
      at += 1;
      const items = [];
      for (;;) {
        space();
        if (text[at] === close) {
          at += 1;
          return items;
        }
        items.push(item(depth + 1));
        space();
        if (text[at] === ",") {
          at += 1;
        } else if (text[at] !== close) {
          fail(`expected "," or "${close}"`);
        }
      }
    };
    const value = (depth) => {
      if (depth > 12) {
        fail("brackets are nested too deeply");
      }
      space();
      const ch = text[at];
      if (ch === undefined) {
        return fail("a value is missing");
      }
      if (ch === '"') {
        return string();
      }
      if (ch === "[") {
        return list("]", value, depth);
      }
      const number = text.slice(at).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (number) {
        at += number[0].length;
        return Number(number[0]);
      }
      const word = text.slice(at).match(/^[A-Za-z_]\w*/);
      if (!word) {
        return fail(`unexpected "${ch}"`);
      }
      at += word[0].length;
      if (text[at] === "(") {
        return {call: word[0], args: list(")", argument, depth)};
      }
      if (word[0] === "true" || word[0] === "false") {
        return word[0] === "true";
      }
      return word[0] === "null" ? null : {ref: word[0]};
    };
    // A component's value may be given by name, as in Stat("Cost", 5, detail="a note").
    // Models write that often. Once one is named, the rest must be named too.
    const argument = (depth) => {
      space();
      const named = text.slice(at).match(/^([A-Za-z_]\w*)\s*=(?!=)/);
      if (!named) {
        return value(depth);
      }
      at += named[0].length;
      return {named: named[1], value: value(depth)};
    };
    const checkOrder = (node) => {
      if (Array.isArray(node)) {
        node.forEach(checkOrder);
      } else if (node && node.call !== undefined) {
        let seen = false;
        for (const item of node.args) {
          if (item && item.named !== undefined) {
            seen = true;
            checkOrder(item.value);
          } else if (seen) {
            fail("a value by position comes after one by name");
          } else {
            checkOrder(item);
          }
        }
      }
    };
    const result = value(0);
    space();
    if (at < text.length) {
      fail("there is text after the value");
    }
    checkOrder(result);
    return result;
  }

  /**
   * Read OpenUI Lang and check it against LIBRARY.
   *
   * :param source: The OpenUI Lang text.
   * :param partial: True while the text is still arriving: the open last statement and
   *     statements not yet written are skipped, not reported, and a part waiting for one
   *     is drawn as a placeholder.
   * :return: {root, errors}. root is a node {type, props} (a node of type "Error" holds
   *     {message}, one of type "Pending" is waiting), or null when there is nothing to
   *     draw. errors lists what was wrong.
   */
  static parse(source, partial = false) {
    const errors = [];
    const statements = new Map();
    for (const part of OpenUi.split(source)) {
      if (!part.closed && partial) {
        continue;
      }
      const match = part.text.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
      if (!match) {
        if (!partial || part.closed) {
          errors.push(`Not a statement: ${part.text.slice(0, 40)}`);
        }
        continue;
      }
      if (statements.has(match[1])) {
        errors.push(`${match[1]} is written twice.`);
        continue;
      }
      try {
        statements.set(match[1], OpenUi.expression(match[2]));
      } catch (error) {
        // The tail of a streamed answer can be a half-written value. Anything before it
        // was ended by a line break, so it is a real fault.
        if (!partial || part.closed) {
          errors.push(`${match[1]}: ${error.message}.`);
          statements.set(match[1], {fault: error.message});
        }
      }
    }
    // The root is the statement called root, or else the first one: models do not always
    // call it root.
    const top = statements.has("root") ? "root" : statements.keys().next().value;
    if (top === undefined) {
      if (!partial) {
        errors.push("There is no root statement.");
      }
      return {root: null, errors};
    }
    const root = OpenUi.build(statements, partial, top);
    OpenUi.faults(root, errors);
    return {root, errors};
  }

  /**
   * Turn the statements into a tree of checked nodes.
   *
   * :param statements: Map of name to value.
   * :param partial: True while the text is still arriving.
   * :param top: The name of the root statement.
   * :return: The root node.
   */
  static build(statements, partial, top = "root") {
    const limits = OpenUi.LIMITS;
    let count = 0;
    const fail = (message) => {
      throw new Error(message);
    };
    // A reference stands for its statement's value. Not yet written: wait, or fail.
    const deref = (expr, stack) => {
      let current = expr;
      let path = stack;
      while (current && current.ref !== undefined) {
        if (!statements.has(current.ref)) {
          throw partial ? new Pending() : new Error(`${current.ref} is not written.`);
        }
        if (path.includes(current.ref)) {
          fail(`${current.ref} refers to itself.`);
        }
        path = [...path, current.ref];
        current = statements.get(current.ref);
      }
      if (current && current.fault !== undefined) {
        fail(`${path[path.length - 1] || "a value"} could not be read.`);
      }
      return {expr: current, path};
    };
    const node = (expr, stack, depth) => {
      try {
        const {expr: target, path} = deref(expr, stack);
        if (!target || target.call === undefined) {
          fail("A component was expected.");
        }
        count += 1;
        if (count > limits.nodes) {
          fail("There are too many components.");
        }
        if (depth > limits.depth) {
          fail("Components are nested too deeply.");
        }
        return component(target, path, depth);
      } catch (error) {
        if (error instanceof Pending) {
          return {type: "Pending"};
        }
        return {type: "Error", message: error.message};
      }
    };
    const scalar = (item) => item === null || ["string", "number", "boolean"].includes(typeof item);
    const arg = (expr, name, type, stack, depth) => {
      if (type === "nodes" || type === "series") {
        const {expr: items, path} = deref(expr, stack);
        if (!Array.isArray(items) || items.length > limits.children) {
          fail(`${name} must be a list of components, at most ${limits.children}.`);
        }
        const nodes = items.map((item) => node(item, path, depth + 1));
        if (type === "series" && nodes.some((child) => child.type !== "Series" && child.type !== "Pending")) {
          fail(`${name} must hold Series.`);
        }
        return nodes;
      }
      // A choice written without quotes, such as Stack([a], row), is that word, unless a
      // statement has the name. Models often drop the quotes around such words.
      if (type.startsWith("enum:") && expr && expr.ref !== undefined && !statements.has(expr.ref)
        && type.slice(5).split("|").includes(expr.ref)) {
        return expr.ref;
      }
      const {expr: target, path} = deref(expr, stack);
      if (type === "string") {
        if (typeof target !== "string" || target.length > limits.text) {
          fail(`${name} must be text of at most ${limits.text} characters.`);
        }
        return target;
      }
      if (type === "value") {
        if (!(typeof target === "string" && target.length <= limits.text) && !Number.isFinite(target)) {
          fail(`${name} must be text or a number.`);
        }
        return target;
      }
      if (type === "number") {
        if (!Number.isFinite(target)) {
          fail(`${name} must be a number.`);
        }
        return target;
      }
      if (type === "strings" || type === "numbers") {
        if (!Array.isArray(target) || target.length > limits.items) {
          fail(`${name} must be a list of at most ${limits.items}.`);
        }
        return target.map((item) => {
          const {expr: one} = deref(item, path);
          const ok = type === "strings" ? typeof one === "string" && one.length <= limits.text : Number.isFinite(one);
          return ok ? one : fail(`${name} must hold only ${type === "strings" ? "text" : "numbers"}.`);
        });
      }
      if (type === "rows") {
        if (!Array.isArray(target) || target.length > limits.rows
          || !target.every((row) => Array.isArray(row) && row.length <= limits.columns && row.every(scalar))) {
          fail(`${name} must be a list of rows of text and numbers.`);
        }
        return target;
      }
      if (type.startsWith("enum:")) {
        if (!type.slice(5).split("|").includes(target)) {
          fail(`${name} must be one of ${type.slice(5).split("|").join(", ")}.`);
        }
        return target;
      }
      return fail(`${name} has a type this reader does not know.`);
    };
    const component = (call, stack, depth) => {
      const def = Object.hasOwn(OpenUi.LIBRARY, call.call) ? OpenUi.LIBRARY[call.call] : null;
      if (!def) {
        fail(`${call.call} is not a component here.`);
      }
      if (call.args.length > def.params.length) {
        fail(`${call.call} takes at most ${def.params.length} values.`);
      }
      // Each value in its place: those by position first, then those by name.
      const given = new Map();
      call.args.forEach((item, index) => {
        if (item && item.named !== undefined) {
          const place = def.params.findIndex(([label]) => label.replace("?", "") === item.named);
          if (place === -1) {
            fail(`${call.call} has no value called ${item.named}.`);
          }
          if (given.has(place)) {
            fail(`${call.call} ${item.named} is given twice.`);
          }
          given.set(place, item.value);
        } else {
          given.set(index, item);
        }
      });
      const props = {};
      def.params.forEach(([label, type], index) => {
        const name = label.replace("?", "");
        if (!given.has(index)) {
          if (!label.endsWith("?")) {
            fail(`${call.call} needs ${name}.`);
          }
          return;
        }
        props[name] = arg(given.get(index), `${call.call} ${name}`, type, stack, depth);
      });
      const problem = OpenUi.check(call.call, props);
      if (problem) {
        fail(problem);
      }
      return {type: call.call, props};
    };
    return node({ref: top}, [], 0);
  }

  /**
   * The rules that need more than one value of a component.
   *
   * :param type: The component's name.
   * :param props: Its values.
   * :return: What is wrong, or null.
   */
  static check(type, props) {
    const limits = OpenUi.LIMITS;
    if (type === "Table") {
      if (!props.columns.length || props.columns.length > limits.columns) {
        return `Table needs 1 to ${limits.columns} columns.`;
      }
      if (props.rows.some((row) => row.length !== props.columns.length)) {
        return "Every Table row needs one value for each column.";
      }
    }
    if (type === "Stat" && props.trend && props.trend.length < 2) {
      return "Stat trend needs at least two numbers.";
    }
    if (type === "Meter" && (props.max <= 0 || props.value < 0)) {
      return "Meter needs a value of at least 0 and a max above 0.";
    }
    if (type === "BarChart" || type === "LineChart") {
      if (!props.labels.length) {
        return `${type} needs at least one label.`;
      }
      if (!props.series.length || props.series.length > limits.series) {
        return `${type} needs 1 to ${limits.series} series.`;
      }
      const wrong = props.series.find((s) => s.type === "Series" && s.props.values.length !== props.labels.length);
      if (wrong) {
        return `${type}: series ${wrong.props.name} needs one value for each label.`;
      }
    }
    if (type === "PieChart") {
      if (!props.labels.length || props.labels.length !== props.values.length) {
        return "PieChart needs one value for each label.";
      }
      if (props.values.some((v) => v < 0) || !props.values.some((v) => v > 0)) {
        return "PieChart values must not be negative, and at least one must be above zero.";
      }
    }
    return null;
  }

  /**
   * Collect the messages of the Error nodes of a tree.
   *
   * :param node: A node.
   * :param errors: The list to add to.
   */
  static faults(node, errors) {
    if (!node) {
      return;
    }
    if (node.type === "Error") {
      errors.push(node.message);
      return;
    }
    for (const value of Object.values(node.props || {})) {
      if (Array.isArray(value)) {
        value.filter((item) => item && typeof item === "object" && !Array.isArray(item) && item.type)
          .forEach((child) => OpenUi.faults(child, errors));
      }
    }
  }

  // ---- Finding the blocks in a message ----------------------------------------------------

  /**
   * Cut a message into plain text and openui blocks.
   *
   * :param text: The message, with its ```openui fences.
   * :return: A list of {kind: "text", text} and {kind: "openui", source, open}. open is
   *     true for a block whose closing fence has not arrived.
   */
  static segments(text) {
    const out = [];
    const lines = String(text || "").split("\n");
    let plain = [];
    let block = null;
    const flush = () => {
      const joined = plain.join("\n").trim();
      if (joined) {
        out.push({kind: "text", text: joined});
      }
      plain = [];
    };
    for (const line of lines) {
      if (block) {
        if (/^\s*```\s*$/.test(line)) {
          out.push({kind: "openui", source: block.join("\n"), open: false});
          block = null;
        } else {
          block.push(line);
        }
      } else if (/^\s*```\s*openui\s*$/i.test(line)) {
        flush();
        block = [];
      } else {
        plain.push(line);
      }
    }
    if (block) {
      out.push({kind: "openui", source: block.join("\n"), open: true});
    } else {
      flush();
    }
    return out;
  }

  /**
   * Whether a message holds an openui block, even one still arriving.
   *
   * :param text: The message.
   * :return: True when it does.
   */
  static hasBlock(text) {
    return /^\s*```\s*openui\s*$/im.test(String(text || ""));
  }

  /**
   * Whether the text of a code block is OpenUI Lang. The runtime's own formatting drops
   * the fence's label, so this goes by the first statement.
   *
   * :param code: The text of a code block.
   * :return: True when it starts with "root =", or with any name set to one of the
   *     components, such as "summary = Stack(".
   */
  static looksLike(code) {
    const first = String(code || "").match(/^\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)?\s*(\()?/);
    if (!first) {
      return false;
    }
    return first[1] === "root" || (Boolean(first[3]) && Object.hasOwn(OpenUi.LIBRARY, first[2] || ""));
  }

  // ---- Drawing -------------------------------------------------------------------------

  /**
   * Draw a block.
   *
   * :param doc: The document.
   * :param source: The OpenUI Lang text.
   * :param options: {partial} true while the text is still arriving.
   * :return: The element, or null when there is nothing to draw (no root, or it is wrong).
   */
  static draw(doc, source, options = {}) {
    const {root} = OpenUi.parse(source, Boolean(options.partial));
    if (!root || root.type === "Error") {
      return null;
    }
    const wrap = doc.createElement("div");
    wrap.className = "ou-root";
    wrap.setAttribute("data-openui", options.partial ? "drawing" : "done");
    wrap.append(OpenUi.render(doc, root));
    return wrap;
  }

  /**
   * Draw a message as it arrives: its text, and each openui block as far as it has been
   * written. For the live bubble.
   *
   * :param doc: The document.
   * :param container: The element to fill. Its old content goes.
   * :param text: The message so far.
   */
  static fill(doc, container, text) {
    const parts = OpenUi.segments(text).map((part) => {
      if (part.kind === "text") {
        const paragraph = doc.createElement("div");
        paragraph.className = "ou-live-text";
        paragraph.textContent = part.text;
        return paragraph;
      }
      return OpenUi.draw(doc, part.source, {partial: part.open});
    }).filter(Boolean);
    container.replaceChildren(...parts);
  }

  /**
   * Make an element with a class and text.
   *
   * :param doc: The document.
   * :param tag: The tag.
   * :param className: The class, or nothing.
   * :param text: The text, or undefined for none.
   * :return: The element.
   */
  static make(doc, tag, className, text) {
    const el = doc.createElement(tag);
    if (className) {
      el.className = className;
    }
    if (text !== undefined) {
      el.textContent = String(text);
    }
    return el;
  }

  /**
   * Draw one node.
   *
   * :param doc: The document.
   * :param node: A node from parse().
   * :return: The element.
   */
  static render(doc, node) {
    const make = (tag, className, text) => OpenUi.make(doc, tag, className, text);
    const props = node.props || {};
    if (node.type === "Pending") {
      const bar = make("div", "ou-pending");
      bar.setAttribute("aria-hidden", "true");
      return bar;
    }
    if (node.type === "Error") {
      const note = make("p", "ou-error", `Could not show this part: ${node.message}`);
      note.setAttribute("role", "note");
      return note;
    }
    const children = (list) => list.map((child) => OpenUi.render(doc, child));
    if (node.type === "Stack") {
      const stack = make("div", `ou-stack ou-${props.direction || "column"}`);
      stack.append(...children(props.children));
      return stack;
    }
    if (node.type === "Text") {
      const style = props.style || "body";
      return make(style === "heading" ? "h4" : "p", `ou-text ou-text-${style}`, props.content);
    }
    if (node.type === "Stat") {
      return OpenUi.renderStat(doc, props);
    }
    if (node.type === "Meter") {
      return OpenUi.renderMeter(doc, props);
    }
    if (node.type === "Callout") {
      const tone = props.tone || "info";
      const note = make("p", `ou-callout ou-callout-${tone}`);
      const icon = make("span", "ou-callout-icon", {info: "i", good: "✓", warn: "!"}[tone]);
      icon.setAttribute("aria-hidden", "true");
      note.append(icon, make("span", "ou-callout-text", props.text));
      note.setAttribute("role", "note");
      return note;
    }
    if (node.type === "Table") {
      return OpenUi.renderTable(doc, props.columns, props.rows, props.caption);
    }
    if (node.type === "BarChart" || node.type === "LineChart") {
      return OpenUi.renderChart(doc, node.type === "LineChart" ? "line" : "bar", props);
    }
    if (node.type === "PieChart") {
      return OpenUi.renderPie(doc, props);
    }
    return make("p", "ou-error", `Could not show this part: ${node.type} is not drawn on its own.`);
  }

  /**
   * A number the way a person reads it, such as 1,234.5.
   *
   * :param value: A number or text.
   * :param compact: True to shorten large numbers (12.3k), for chart axes.
   * :return: The text.
   */
  static format(value, compact = false) {
    if (typeof value !== "number") {
      return value === null || value === undefined ? "" : String(value);
    }
    const abs = Math.abs(value);
    if (compact && abs >= 10000) {
      return `${new Intl.NumberFormat("en-GB", {maximumFractionDigits: 1}).format(value / 1000)}k`;
    }
    return new Intl.NumberFormat("en-GB", {maximumFractionDigits: 2}).format(value);
  }

  /**
   * Whether a unit is a currency sign or the like, which goes before the number.
   *
   * :param unit: The unit.
   * :return: True for one symbol such as £.
   */
  static sign(unit) {
    return /^[^\p{L}\p{N}\s]$/u.test(String(unit || ""));
  }

  /**
   * A value with its unit: a currency sign before it (£120), any other unit after (820 kWh).
   *
   * :param value: A number or text.
   * :param unit: The unit, or nothing.
   * :param compact: True to shorten large numbers.
   * :return: The text.
   */
  static withUnit(value, unit, compact = false) {
    const text = OpenUi.format(value, compact);
    if (!unit) {
      return text;
    }
    if (!OpenUi.sign(unit)) {
      return `${text} ${unit}`;
    }
    // A currency sign goes after the minus: -£145.92.
    return text.startsWith("-") ? `-${unit}${text.slice(1)}` : `${unit}${text}`;
  }

  /**
   * A big figure in a tile, with its label, a note in a coloured pill, and an optional
   * small trend line under it.
   *
   * :param doc: The document.
   * :param props: label, value, unit, detail, tone and trend.
   * :return: The element.
   */
  static renderStat(doc, props) {
    const tone = props.tone || "neutral";
    const stat = OpenUi.make(doc, "div", `ou-stat ou-tone-${tone}`);
    const value = OpenUi.make(doc, "div", "ou-stat-value");
    if (typeof props.value === "number" && props.unit && !OpenUi.sign(props.unit)) {
      value.append(OpenUi.make(doc, "span", "ou-stat-num", OpenUi.format(props.value)), OpenUi.make(doc, "span", "ou-stat-unit", ` ${props.unit}`));
    } else {
      value.append(OpenUi.make(doc, "span", "ou-stat-num", OpenUi.withUnit(props.value, props.unit)));
    }
    stat.append(OpenUi.make(doc, "div", "ou-stat-label", props.label), value);
    if (props.detail) {
      stat.append(OpenUi.make(doc, "div", "ou-pill", props.detail));
    }
    if (props.trend) {
      stat.append(OpenUi.spark(doc, props.trend));
    }
    return stat;
  }

  /**
   * A small line with a soft fill under it, for a tile. It is for the eye only: the label
   * says where it starts and ends.
   *
   * :param doc: The document.
   * :param values: At least two numbers.
   * :return: The SVG element.
   */
  static spark(doc, values) {
    const W = 120;
    const H = 34;
    const pad = 3;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = high - low || 1;
    const points = values.map((v, i) => [pad + ((W - 2 * pad) * i) / (values.length - 1), pad + ((H - 2 * pad) * (high - v)) / span]);
    const line = points.map((p) => p.map((n) => Number(n.toFixed(1))).join(",")).join(" ");
    const svg = OpenUi.svg(doc, "svg", {viewBox: `0 0 ${W} ${H}`, role: "img", class: "ou-spark",
      "aria-label": `Trend from ${OpenUi.format(values[0])} to ${OpenUi.format(values[values.length - 1])}`});
    svg.append(OpenUi.svg(doc, "polygon", {points: `${line} ${W - pad},${H} ${pad},${H}`, class: "ou-spark-area"}));
    svg.append(OpenUi.svg(doc, "polyline", {points: line, class: "ou-spark-line"}));
    const last = points[points.length - 1];
    svg.append(OpenUi.svg(doc, "circle", {cx: last[0], cy: last[1], r: 2.6, class: "ou-spark-dot"}));
    return svg;
  }

  /**
   * A bar that fills as far as a value goes towards a limit, such as a grant against a
   * cost.
   *
   * :param doc: The document.
   * :param props: label, value, max, unit and tone.
   * :return: The element.
   */
  static renderMeter(doc, props) {
    const share = Math.min(Math.max(props.value / props.max, 0), 1);
    const meter = OpenUi.make(doc, "div", `ou-meter ou-tone-${props.tone || "neutral"}`);
    const head = OpenUi.make(doc, "div", "ou-meter-head");
    const percent = OpenUi.format(Math.round((props.value / props.max) * 1000) / 10);
    head.append(OpenUi.make(doc, "span", "ou-meter-label", props.label),
      OpenUi.make(doc, "span", "ou-meter-value", `${OpenUi.withUnit(props.value, props.unit)} of ${OpenUi.withUnit(props.max, props.unit)} (${percent}%)`));
    const track = OpenUi.make(doc, "div", "ou-meter-track");
    track.setAttribute("role", "meter");
    track.setAttribute("aria-label", props.label);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(props.max));
    track.setAttribute("aria-valuenow", String(props.value));
    const fill = OpenUi.make(doc, "div", "ou-meter-fill");
    fill.style.width = `${Math.round(share * 1000) / 10}%`;
    track.append(fill);
    meter.append(head, track);
    return meter;
  }

  /**
   * A table in a rounded frame. Number columns line up on the right, the first column is
   * bold, and a row that starts with "Total" stands out.
   *
   * :param doc: The document.
   * :param columns: The column names.
   * :param rows: The rows.
   * :param caption: A caption, or nothing.
   * :return: The element.
   */
  static renderTable(doc, columns, rows, caption) {
    const frame = OpenUi.make(doc, "div", "ou-table-frame");
    if (caption) {
      frame.append(OpenUi.make(doc, "div", "ou-table-caption", caption));
    }
    const scroll = OpenUi.make(doc, "div", "ou-scroll");
    const table = OpenUi.make(doc, "table", "ou-table");
    const numeric = columns.map((_, index) => rows.length > 0
      && rows.every((row) => typeof row[index] === "number" || row[index] === null));
    const head = doc.createElement("tr");
    columns.forEach((name, index) => {
      const th = OpenUi.make(doc, "th", numeric[index] ? "ou-num" : "", name);
      th.setAttribute("scope", "col");
      head.append(th);
    });
    const thead = doc.createElement("thead");
    thead.append(head);
    const tbody = doc.createElement("tbody");
    for (const row of rows) {
      const tr = OpenUi.make(doc, "tr", /^total\b/i.test(String(row[0] ?? "")) ? "ou-total" : "");
      row.forEach((cell, index) => {
        tr.append(OpenUi.make(doc, "td", numeric[index] ? "ou-num" : (index === 0 ? "ou-first" : ""), OpenUi.format(cell)));
      });
      tbody.append(tr);
    }
    table.append(thead, tbody);
    scroll.append(table);
    frame.append(scroll);
    return frame;
  }

  /**
   * Round axis limits to tidy steps.
   *
   * :param low: The smallest value, at most 0.
   * :param high: The largest value, at least 0.
   * :return: The tick values, lowest first.
   */
  static ticks(low, high) {
    const range = high - low || 1;
    const raw = range / 4;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((s) => s * magnitude).find((s) => s >= raw);
    const ticks = [];
    const first = Math.floor(low / step + 1e-9) * step;
    for (let v = first; v < high + step - 1e-9; v += step) {
      ticks.push(Number(v.toPrecision(12)));
    }
    // All zero: keep two ticks, so the axis has a height.
    if (ticks.length < 2) {
      ticks.push(Number((first + step).toPrecision(12)));
    }
    return ticks;
  }

  /**
   * Make an SVG element.
   *
   * :param doc: The document.
   * :param tag: The tag.
   * :param attrs: Attributes.
   * :param text: Text content, or nothing.
   * :return: The element.
   */
  static svg(doc, tag, attrs = {}, text = undefined) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) {
      el.setAttribute(name, String(value));
    }
    if (text !== undefined) {
      el.textContent = text;
    }
    return el;
  }

  /**
   * The colour of the series or slice at a place in the list. The palette is in the
   * stylesheet, with its own shades for the dark theme.
   *
   * :param index: The place.
   * :return: A CSS colour.
   */
  static color(index) {
    return `var(--ou-c${index % 8})`;
  }

  /**
   * A legend: a colour key and a name for each series.
   *
   * :param doc: The document.
   * :param names: The names.
   * :return: The element.
   */
  static legend(doc, names) {
    const legend = OpenUi.make(doc, "div", "ou-legend");
    names.forEach((name, index) => {
      const item = OpenUi.make(doc, "span", "ou-chip");
      const key = OpenUi.make(doc, "span", "ou-key");
      key.style.background = OpenUi.color(index);
      item.append(key, doc.createTextNode(name));
      legend.append(item);
    });
    return legend;
  }

  /**
   * A shortened label.
   *
   * :param label: The text.
   * :param size: The most characters to keep.
   * :return: The text, with … when it was cut.
   */
  static clip(label, size) {
    return label.length > size ? `${label.slice(0, size - 1)}…` : label;
  }

  /**
   * A bar or line chart in a framed card, with its numbers in a table underneath for
   * anyone who cannot see the picture. Bars lie down when the names are long and few.
   *
   * :param doc: The document.
   * :param kind: "bar" or "line".
   * :param props: title, labels, series and unit.
   * :return: The element.
   */
  static renderChart(doc, kind, props) {
    const {title, labels, unit} = props;
    const series = props.series.filter((s) => s.type === "Series");
    const all = series.flatMap((s) => s.props.values);
    const ticks = OpenUi.ticks(Math.min(0, ...all), Math.max(0, ...all));
    const horizontal = kind === "bar" && labels.length <= 10 && Math.max(...labels.map((l) => l.length)) >= 9;
    const figure = OpenUi.make(doc, "figure", "ou-chart");
    figure.append(OpenUi.make(doc, "figcaption", "ou-chart-title", unit ? `${title} (${unit})` : title));
    const name = `${kind === "line" ? "Line" : "Bar"} chart: ${title}. The numbers are in the table below it.`;
    const svg = horizontal ? OpenUi.drawRows(doc, labels, series, ticks, unit, name) : OpenUi.drawColumns(doc, kind, labels, series, ticks, unit, name);
    figure.append(svg);
    if (series.length > 1) {
      figure.append(OpenUi.legend(doc, series.map((s) => s.props.name)));
    }
    const data = OpenUi.make(doc, "details", "ou-data");
    data.append(OpenUi.make(doc, "summary", "", "View the numbers"),
      OpenUi.renderTable(doc, ["", ...series.map((s) => (unit ? `${s.props.name} (${unit})` : s.props.name))],
        labels.map((label, i) => [label, ...series.map((s) => s.props.values[i])])));
    figure.append(data);
    return figure;
  }

  /**
   * Bars standing up, or a line, over the labels. Few bars carry their value above them.
   *
   * :param doc: The document.
   * :param kind: "bar" or "line".
   * :param labels: The labels along the bottom.
   * :param series: The Series nodes.
   * :param ticks: The axis values.
   * :param unit: The unit.
   * :param name: The picture's accessible name.
   * :return: The SVG element.
   */
  static drawColumns(doc, kind, labels, series, ticks, unit, name) {
    const W = OpenUi.WIDTH;
    const H = Math.round(Math.min(Math.max(W * 0.42, 190), 250));
    const left = 62;
    const top = 18;
    const plotW = W - left - 16;
    const plotH = H - top - 32;
    const low = ticks[0];
    const high = ticks[ticks.length - 1];
    const y = (v) => top + (plotH * (high - v)) / (high - low);
    const svg = OpenUi.svg(doc, "svg", {viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": name, class: "ou-svg"});
    for (const tick of ticks) {
      svg.append(OpenUi.svg(doc, "line", {x1: left, x2: W - 16, y1: y(tick), y2: y(tick), class: tick === 0 ? "ou-axis" : "ou-grid"}));
      svg.append(OpenUi.svg(doc, "text", {x: left - 8, y: y(tick) + 4, "text-anchor": "end", class: "ou-tick"}, OpenUi.withUnit(tick, unit, true)));
    }
    const slot = plotW / labels.length;
    const every = Math.ceil(labels.length / Math.max(4, Math.floor(plotW / 44)));
    labels.forEach((label, index) => {
      if (index % every === 0) {
        svg.append(OpenUi.svg(doc, "text", {x: left + slot * (index + 0.5), y: H - 11, "text-anchor": "middle", class: "ou-tick"}, OpenUi.clip(label, 12)));
      }
    });
    const showValues = kind === "bar" ? labels.length * series.length <= 12 : labels.length <= 6 && series.length <= 2;
    series.forEach((s, index) => {
      const color = OpenUi.color(index);
      const values = s.props.values;
      const mark = (v, i) => `${labels[i]}, ${s.props.name}: ${OpenUi.withUnit(v, unit)}`;
      const tag = (el, v, i) => {
        el.append(OpenUi.svg(doc, "title", {}, mark(v, i)));
        return el;
      };
      if (kind === "line") {
        const points = values.map((v, i) => [left + slot * (i + 0.5), y(v)]);
        const path = points.map((p) => p.map((n) => Number(n.toFixed(1))).join(",")).join(" ");
        const area = OpenUi.svg(doc, "polygon", {points: `${path} ${points[points.length - 1][0]},${y(0)} ${points[0][0]},${y(0)}`, class: "ou-area"});
        area.style.fill = color;
        svg.append(area);
        const line = OpenUi.svg(doc, "polyline", {points: path, class: "ou-line", "stroke-dasharray": OpenUi.DASHES[index]});
        line.style.stroke = color;
        svg.append(line);
        values.forEach((v, i) => {
          const dot = tag(OpenUi.svg(doc, "circle", {cx: points[i][0], cy: points[i][1], r: 4, class: "ou-dot"}), v, i);
          dot.style.fill = color;
          svg.append(dot);
          if (showValues) {
            const text = OpenUi.svg(doc, "text", {x: points[i][0], y: points[i][1] - 10, "text-anchor": "middle", class: "ou-value"}, OpenUi.withUnit(v, unit, true));
            text.style.fill = color;
            svg.append(text);
          }
        });
      } else {
        const bar = Math.min((slot * 0.78) / series.length, 46);
        const group = bar * series.length;
        values.forEach((v, i) => {
          const x = left + slot * (i + 0.5) - group / 2 + bar * index;
          const rect = tag(OpenUi.svg(doc, "rect", {x, y: Math.min(y(v), y(0)), width: Math.max(bar - 2, 1), height: Math.max(Math.abs(y(v) - y(0)), 1), rx: 3, class: "ou-bar"}), v, i);
          rect.style.fill = color;
          svg.append(rect);
          if (showValues) {
            svg.append(OpenUi.svg(doc, "text", {x: x + (bar - 2) / 2, y: v >= 0 ? y(v) - 6 : y(v) + 14, "text-anchor": "middle", class: "ou-value"}, OpenUi.withUnit(v, unit, true)));
          }
        });
      }
    });
    return svg;
  }

  /**
   * Bars lying down, one row for each label: easier to read when the names are long, as
   * for tariffs. Each bar carries its value at its end.
   *
   * :param doc: The document.
   * :param labels: The row names.
   * :param series: The Series nodes.
   * :param ticks: The axis values.
   * :param unit: The unit.
   * :param name: The picture's accessible name.
   * :return: The SVG element.
   */
  static drawRows(doc, labels, series, ticks, unit, name) {
    const W = OpenUi.WIDTH;
    const left = Math.min(W * 0.38, 12 + Math.max(...labels.map((l) => Math.min(l.length, 24))) * 6.6);
    const right = 64;
    const top = 8;
    const barH = Math.min(18, 44 / series.length);
    const rowH = barH * series.length + 12;
    const H = top + rowH * labels.length + 26;
    const plotW = W - left - right;
    const low = ticks[0];
    const high = ticks[ticks.length - 1];
    const x = (v) => left + (plotW * (v - low)) / (high - low);
    const svg = OpenUi.svg(doc, "svg", {viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": name, class: "ou-svg"});
    for (const tick of ticks) {
      svg.append(OpenUi.svg(doc, "line", {x1: x(tick), x2: x(tick), y1: top, y2: H - 22, class: tick === 0 ? "ou-axis" : "ou-grid"}));
      svg.append(OpenUi.svg(doc, "text", {x: x(tick), y: H - 6, "text-anchor": "middle", class: "ou-tick"}, OpenUi.withUnit(tick, unit, true)));
    }
    labels.forEach((label, row) => {
      const mid = top + rowH * row + rowH / 2;
      svg.append(OpenUi.svg(doc, "text", {x: left - 10, y: mid + 4, "text-anchor": "end", class: "ou-tick ou-rowlabel"}, OpenUi.clip(label, Math.floor((left - 14) / 6.4))));
      series.forEach((s, index) => {
        const v = s.props.values[row];
        const y = mid - (barH * series.length) / 2 + barH * index;
        const rect = OpenUi.svg(doc, "rect", {x: Math.min(x(v), x(0)), y, width: Math.max(Math.abs(x(v) - x(0)), 1), height: barH - 3, rx: 3, class: "ou-bar"});
        rect.style.fill = OpenUi.color(index);
        rect.append(OpenUi.svg(doc, "title", {}, `${label}, ${s.props.name}: ${OpenUi.withUnit(v, unit)}`));
        svg.append(rect);
        svg.append(OpenUi.svg(doc, "text", {x: v >= 0 ? x(v) + 6 : x(v) - 6, y: y + (barH - 3) / 2 + 4, "text-anchor": v >= 0 ? "start" : "end", class: "ou-value"}, OpenUi.withUnit(v, unit, true)));
      });
    });
    return svg;
  }

  /**
   * A donut chart with the total in its middle, and each slice named in a list beside
   * it with its value, its share and a thin bar.
   *
   * :param doc: The document.
   * :param props: title, labels, values and unit.
   * :return: The element.
   */
  static renderPie(doc, props) {
    const {title, labels, values, unit} = props;
    const total = values.reduce((sum, v) => sum + v, 0);
    const figure = OpenUi.make(doc, "figure", "ou-chart ou-pie");
    figure.append(OpenUi.make(doc, "figcaption", "ou-chart-title", unit ? `${title} (${unit})` : title));
    const svg = OpenUi.svg(doc, "svg", {viewBox: "0 0 200 200", role: "img", class: "ou-svg", "aria-label": `Donut chart: ${title}. The numbers are in the list beside it.`});
    const centre = 100;
    const outer = 94;
    const inner = 58;
    const point = (angle, radius) => [centre + radius * Math.sin(angle), centre - radius * Math.cos(angle)];
    let start = 0;
    values.forEach((v, index) => {
      if (v <= 0) {
        return;
      }
      const sweep = (v / total) * Math.PI * 2;
      let shape;
      if (sweep >= Math.PI * 2 - 1e-6) {
        shape = OpenUi.svg(doc, "circle", {cx: centre, cy: centre, r: (outer + inner) / 2, "stroke-width": outer - inner, class: "ou-ring"});
        shape.style.stroke = OpenUi.color(index);
      } else {
        const [x1, y1] = point(start, outer);
        const [x2, y2] = point(start + sweep, outer);
        const [x3, y3] = point(start + sweep, inner);
        const [x4, y4] = point(start, inner);
        const large = sweep > Math.PI ? 1 : 0;
        shape = OpenUi.svg(doc, "path", {d: `M${x1} ${y1} A${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`, class: "ou-slice"});
        shape.style.fill = OpenUi.color(index);
      }
      shape.append(OpenUi.svg(doc, "title", {}, `${labels[index]}: ${OpenUi.withUnit(v, unit)}`));
      svg.append(shape);
      start += sweep;
    });
    svg.append(OpenUi.svg(doc, "text", {x: centre, y: centre + 2, "text-anchor": "middle", class: "ou-donut-total"}, OpenUi.withUnit(total, unit, true)));
    svg.append(OpenUi.svg(doc, "text", {x: centre, y: centre + 18, "text-anchor": "middle", class: "ou-tick"}, "Total"));
    const list = OpenUi.make(doc, "ul", "ou-slices");
    labels.forEach((label, index) => {
      const share = Math.round((values[index] / total) * 1000) / 10;
      const item = OpenUi.make(doc, "li", "ou-slice-row");
      const key = OpenUi.make(doc, "span", "ou-key");
      key.style.background = OpenUi.color(index);
      const head = OpenUi.make(doc, "span", "ou-slice-head");
      head.append(key, doc.createTextNode(`${label}: ${OpenUi.withUnit(values[index], unit)} (${OpenUi.format(share)}%)`));
      const track = OpenUi.make(doc, "span", "ou-slice-track");
      const fill = OpenUi.make(doc, "span", "ou-slice-fill");
      fill.style.width = `${share}%`;
      fill.style.background = OpenUi.color(index);
      track.append(fill);
      item.append(head, track);
      list.append(item);
    });
    const body = OpenUi.make(doc, "div", "ou-pie-body");
    body.append(svg, list);
    figure.append(body);
    return figure;
  }

  // ---- In the page -----------------------------------------------------------------------

  /**
   * The look of the blocks. It uses the page's own colours (--surface, --ink, --line and
   * so on, with the chat's --ns-* as a fallback), so each site and each theme keeps its
   * own look. The data-theme="dark" rules give the palette its lighter shades.
   */
  static CSS = `
.ou-root{--ou-c0:var(--ns-primary,#9a3412);--ou-c1:#0f766e;--ou-c2:#4f46e5;--ou-c3:#b45309;--ou-c4:#be185d;--ou-c5:#0369a1;--ou-c6:#4d7c0f;--ou-c7:#6b7280;--ou-good:#1a7f37;--ou-bad:#b42318;--ou-warn:#b45309;--ou-info:var(--ns-primary,#9a3412);--ou-surface:var(--surface,var(--ns-bg,#fff));--ou-soft:var(--surface-2,var(--ns-msgbg,#f6f8fa));--ou-line:var(--line,var(--ns-border,#d0d7de));--ou-ink:var(--ink,var(--ns-fg,#1f2328));--ou-muted:var(--muted,var(--ns-muted,#59636e))}
:root[data-theme="dark"] .ou-root{--ou-c0:var(--brand-ink,#fb923c);--ou-c1:#2dd4bf;--ou-c2:#a5b4fc;--ou-c3:#fbbf24;--ou-c4:#f472b6;--ou-c5:#38bdf8;--ou-c6:#a3e635;--ou-c7:#94a3b8;--ou-good:#4ade80;--ou-bad:#f87171;--ou-warn:#fbbf24;--ou-info:var(--brand-ink,#fb923c)}
.ou-root{display:flex;flex-direction:column;gap:9px;margin:6px 0;white-space:normal;line-height:1.35;min-width:0;font-size:.92em;color:var(--ou-ink)}
.ou-live-text{white-space:pre-wrap}
.ou-stack{display:flex;gap:8px;min-width:0}.ou-column{flex-direction:column}
.ou-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr))}
.ou-row>*{min-width:0}
.ou-text-heading{margin:0;font-size:1.05em;font-weight:700;letter-spacing:.005em}
.ou-text{margin:0}.ou-text-muted{color:var(--ou-muted);font-size:.9em}
.ou-stat{position:relative;overflow:hidden;border:1px solid var(--ou-line);border-radius:12px;padding:9px 12px;background:var(--ou-surface);box-shadow:0 1px 2px rgba(0,0,0,.08);display:flex;flex-direction:column;gap:2px;color:var(--ou-muted)}
.ou-stat::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:currentColor;opacity:.9}
.ou-stat.ou-tone-good{color:var(--ou-good)}.ou-stat.ou-tone-bad{color:var(--ou-bad)}
.ou-stat-label{font-size:.72em;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ou-muted)}
.ou-stat-value{color:var(--ou-ink);line-height:1.1;overflow-wrap:anywhere}
.ou-stat-num{font-size:1.65em;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.ou-stat-unit{font-size:.95em;font-weight:600;color:var(--ou-muted)}
.ou-pill{align-self:flex-start;margin-top:2px;padding:1px 8px;border-radius:999px;font-size:.74em;font-weight:600;color:var(--ou-ink);background:var(--ou-soft)}
.ou-tone-good .ou-pill{color:var(--ou-good);background:color-mix(in srgb,var(--ou-good) 14%,transparent)}
.ou-tone-bad .ou-pill{color:var(--ou-bad);background:color-mix(in srgb,var(--ou-bad) 14%,transparent)}
.ou-root .ou-spark{display:block;width:100%;height:26px;min-width:0;margin-top:3px;color:inherit}
.ou-spark-line{fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.ou-spark-area{fill:currentColor;opacity:.14}.ou-spark-dot{fill:currentColor}
.ou-meter{display:flex;flex-direction:column;gap:6px;color:var(--ou-c0)}
.ou-meter.ou-tone-good{color:var(--ou-good)}.ou-meter.ou-tone-bad{color:var(--ou-bad)}
.ou-meter-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:.9em;color:var(--ou-ink)}
.ou-meter-label{font-weight:600}.ou-meter-value{color:var(--ou-muted);font-variant-numeric:tabular-nums}
.ou-meter-track{height:10px;border-radius:999px;background:var(--ou-soft);box-shadow:inset 0 0 0 1px var(--ou-line);overflow:hidden}
.ou-meter-fill{height:100%;border-radius:999px;background:currentColor}
.ou-callout{--ou-tone:var(--ou-info);margin:0;display:flex;gap:8px;align-items:flex-start;padding:7px 11px;border-radius:10px;border:1px solid var(--ou-line);border-left:4px solid var(--ou-tone);background:var(--ou-soft)}
.ou-callout-good{--ou-tone:var(--ou-good)}.ou-callout-warn{--ou-tone:var(--ou-warn)}
.ou-callout-icon{flex:none;width:20px;height:20px;border-radius:50%;background:var(--ou-tone);color:var(--ou-surface);display:grid;place-items:center;font-size:12px;font-weight:800;line-height:1}
.ou-callout-text{color:var(--ou-ink)}
.ou-table-frame{border:1px solid var(--ou-line);border-radius:12px;overflow:hidden;background:var(--ou-surface);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.ou-table-caption{padding:8px 10px 2px;font-weight:700}
.ou-scroll{overflow-x:auto;max-width:100%}
.ou-table{width:100%;border-collapse:collapse;font-size:.94em}
.ou-table th,.ou-table td{padding:10px 14px!important;border-bottom:1px solid var(--ou-line);text-align:left;vertical-align:top}
.ou-table th{font-size:.74em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ou-muted);background:var(--ou-soft);white-space:nowrap}
.ou-table tbody tr:last-child td{border-bottom:0}
.ou-table tbody tr:hover td{background:var(--ou-soft)}
.ou-table .ou-first{font-weight:650}
.ou-table .ou-num{text-align:right!important;font-variant-numeric:tabular-nums;white-space:nowrap}
.ou-table tr.ou-total td{font-weight:750;border-top:2px solid var(--ou-line);background:var(--ou-soft)}
@media (max-width:760px){.ou-table th:first-child,.ou-table td:first-child{position:sticky;left:0;z-index:1;background:var(--ou-surface);box-shadow:1px 0 0 var(--ou-line)}.ou-table th:first-child{background:var(--ou-soft)}.ou-table tr.ou-total td:first-child{background:var(--ou-soft)}}
.ou-chart{margin:0;display:flex;flex-direction:column;gap:6px;border:1px solid var(--ou-line);border-radius:12px;padding:10px 12px;background:var(--ou-surface);box-shadow:0 1px 2px rgba(0,0,0,.08);min-width:0}
.ou-chart-title{font-weight:700}
.ou-svg{display:block;width:100%;height:auto;min-width:280px;overflow:visible}
.ou-grid{stroke:var(--ou-line);stroke-width:1;stroke-dasharray:3 4}.ou-axis{stroke:var(--ou-muted);stroke-width:1.2}
.ou-tick{font-size:11px;fill:var(--ou-muted)}.ou-rowlabel{fill:var(--ou-ink);font-size:12px}
.ou-value{font-size:11px;font-weight:700;fill:var(--ou-ink)}
.ou-bar{opacity:.92;transition:opacity .15s}.ou-bar:hover{opacity:1}
.ou-line{fill:none;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}.ou-area{opacity:.12}
.ou-dot{stroke:var(--ou-surface);stroke-width:1.5}.ou-dot:hover{r:6}
.ou-ring{fill:none}.ou-slice,.ou-ring{stroke:var(--ou-surface);stroke-width:2;transition:opacity .15s}.ou-ring{stroke-width:36}
.ou-donut-total{font-size:19px;font-weight:750;fill:var(--ou-ink)}
.ou-legend{display:flex;gap:8px;flex-wrap:wrap;font-size:.82em}
.ou-chip{display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;background:var(--ou-soft);border:1px solid var(--ou-line)}
.ou-key{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:3px;flex:none}
.ou-pie-body{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.ou-pie-body .ou-svg{width:140px;min-width:0;flex:none}
.ou-slices{list-style:none;margin:0;padding:0;font-size:.9em;display:flex;flex-direction:column;gap:7px;flex:1 1 160px;min-width:0}
.ou-slice-row{display:flex;flex-direction:column;gap:4px}.ou-slice-head{display:flex;align-items:center}
.ou-slice-track{height:6px;border-radius:999px;background:var(--ou-soft);overflow:hidden}.ou-slice-fill{display:block;height:100%;border-radius:999px}
.ou-data summary{cursor:pointer;font-size:.82em;color:var(--ou-muted)}
.ou-data .ou-table-frame{margin-top:8px;box-shadow:none}
.ou-error{margin:0;font-size:.9em;color:var(--ou-bad)}
.ou-pending{height:52px;border-radius:12px;background:var(--ou-soft);animation:ou-pulse 1.2s ease-in-out infinite}
@keyframes ou-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.ou-pending{animation:none}.ou-bar,.ou-slice{transition:none}}
`;

  /**
   * Add the stylesheet once.
   *
   * :param doc: The document.
   */
  static ensureStyle(doc) {
    if (doc.querySelector("style[data-openui]")) {
      return;
    }
    const style = doc.createElement("style");
    style.setAttribute("data-openui", "");
    style.textContent = OpenUi.CSS;
    (doc.head || doc.documentElement).append(style);
  }

  /**
   * Draw the openui blocks of the assistant's messages. The runtime shows each answer's
   * code blocks as plain text; this swaps a block of OpenUI Lang for what it describes.
   * A block that cannot be read stays as the plain text it was.
   *
   * :param doc: The document.
   * :return: The element it watches, or null when the chat is missing.
   */
  static attach(doc) {
    const msgs = doc.querySelector("#agent-app #ns-msgs");
    const Observer = doc.defaultView?.MutationObserver;
    if (!msgs || !Observer) {
      return null;
    }
    OpenUi.ensureStyle(doc);
    // A chart gets about the width the chat gives it, less the bubble's and frame's padding.
    if (msgs.clientWidth > 0) {
      OpenUi.WIDTH = Math.min(Math.max(Math.round(msgs.clientWidth - 80), 300), 640);
    }
    const scan = (node) => {
      if (!node || node.nodeType !== 1) {
        return;
      }
      const blocks = node.tagName === "PRE" ? [node] : [...node.querySelectorAll("pre")];
      for (const pre of blocks) {
        if (pre.hasAttribute("data-openui") || !OpenUi.looksLike(pre.textContent)) {
          continue;
        }
        pre.setAttribute("data-openui", "seen");
        try {
          const drawn = OpenUi.draw(doc, pre.textContent);
          if (drawn) {
            pre.replaceWith(drawn);
          }
        } catch (error) {
          console.error("Could not draw an OpenUI block", error);
        }
      }
    };
    new Observer((records) => {
      for (const record of records) {
        record.addedNodes.forEach(scan);
      }
    }).observe(msgs, {childList: true, subtree: true});
    scan(msgs);
    return msgs;
  }
}
