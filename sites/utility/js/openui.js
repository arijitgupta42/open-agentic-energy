// Generative UI for numbers, in the chat of each site's assistant.
//
// The assistant can answer with an "openui" block: a few lines of OpenUI Lang, the
// compact format of the open source OpenUI project (github.com/thesysdev/openui, MIT).
// This file reads that format and draws stat tiles, tables, charts and callouts from it.
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
    Card: {params: [["title", "string"], ["children", "nodes"]]},
    Text: {params: [["content", "string"], ["style?", "enum:body|heading|muted"]]},
    Stat: {params: [["label", "string"], ["value", "value"], ["unit?", "string"], ["detail?", "string"], ["tone?", "enum:neutral|good|bad"]]},
    Table: {params: [["columns", "strings"], ["rows", "rows"], ["caption?", "string"]]},
    Series: {params: [["name", "string"], ["values", "numbers"]]},
    BarChart: {params: [["title", "string"], ["labels", "strings"], ["series", "series"], ["unit?", "string"]]},
    LineChart: {params: [["title", "string"], ["labels", "strings"], ["series", "series"], ["unit?", "string"]]},
    PieChart: {params: [["title", "string"], ["labels", "strings"], ["values", "numbers"], ["unit?", "string"]]},
    Callout: {params: [["text", "string"], ["tone?", "enum:info|good|warn"]]},
  };

  /** Limits, so a runaway answer cannot build a huge page. */
  static LIMITS = {text: 400, items: 120, children: 24, nodes: 150, depth: 8, columns: 12, rows: 200, series: 8};

  /** Series colours: the site's own colour first, then colours that stay apart. */
  static COLORS = ["var(--ns-primary, #9a3412)", "#0f766e", "#4f46e5", "#b45309", "#be185d", "#0369a1", "#4d7c0f", "#6b7280"];

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
        return {call: word[0], args: list(")", value, depth)};
      }
      if (word[0] === "true" || word[0] === "false") {
        return word[0] === "true";
      }
      return word[0] === "null" ? null : {ref: word[0]};
    };
    const result = value(0);
    space();
    if (at < text.length) {
      fail("there is text after the value");
    }
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
    if (!statements.has("root")) {
      if (!partial) {
        errors.push("There is no root statement.");
      }
      return {root: null, errors};
    }
    const root = OpenUi.build(statements, partial);
    OpenUi.faults(root, errors);
    return {root, errors};
  }

  /**
   * Turn the statements into a tree of checked nodes.
   *
   * :param statements: Map of name to value.
   * :param partial: True while the text is still arriving.
   * :return: The root node.
   */
  static build(statements, partial) {
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
      const props = {};
      def.params.forEach(([label, type], index) => {
        const name = label.replace("?", "");
        if (index >= call.args.length) {
          if (!label.endsWith("?")) {
            fail(`${call.call} needs ${name}.`);
          }
          return;
        }
        props[name] = arg(call.args[index], `${call.call} ${name}`, type, stack, depth);
      });
      const problem = OpenUi.check(call.call, props);
      if (problem) {
        fail(problem);
      }
      return {type: call.call, props};
    };
    return node({ref: "root"}, [], 0);
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
   * :return: True when it starts with "root =".
   */
  static looksLike(code) {
    return /^\s*root\s*=/.test(String(code || ""));
  }

  // ---- Drawing -------------------------------------------------------------------------

  /**
   * Draw a block.
   *
   * :param doc: The document.
   * :param source: The OpenUI Lang text.
   * :param options: {partial} true while the text is still arriving; {source} true to
   *     add a folded copy of the text.
   * :return: The element, or null when there is nothing to draw (no root, or it is wrong).
   */
  static draw(doc, source, options = {}) {
    const {root, errors} = OpenUi.parse(source, Boolean(options.partial));
    if (!root || root.type === "Error") {
      return null;
    }
    const wrap = doc.createElement("div");
    wrap.className = "ou-root";
    wrap.setAttribute("data-openui", options.partial ? "drawing" : "done");
    wrap.append(OpenUi.render(doc, root));
    if (options.source) {
      const details = doc.createElement("details");
      details.className = "ou-source";
      const summary = doc.createElement("summary");
      summary.textContent = errors.length ? `Show what the assistant wrote (${errors.length} part${errors.length === 1 ? "" : "s"} not drawn)` : "Show what the assistant wrote";
      const pre = doc.createElement("pre");
      pre.textContent = String(source).trim();
      // So attach() does not draw this copy again.
      pre.setAttribute("data-openui", "source");
      details.append(summary, pre);
      wrap.append(details);
    }
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
   * Draw one node.
   *
   * :param doc: The document.
   * :param node: A node from parse().
   * :return: The element.
   */
  static render(doc, node) {
    const make = (tag, className, text) => {
      const el = doc.createElement(tag);
      if (className) {
        el.className = className;
      }
      if (text !== undefined) {
        el.textContent = String(text);
      }
      return el;
    };
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
    if (node.type === "Card") {
      const card = make("section", "ou-card");
      card.append(make("h4", "ou-card-title", props.title), ...children(props.children));
      return card;
    }
    if (node.type === "Text") {
      const style = props.style || "body";
      return make(style === "heading" ? "h4" : "p", `ou-text ou-text-${style}`, props.content);
    }
    if (node.type === "Stat") {
      const stat = make("div", `ou-stat ou-tone-${props.tone || "neutral"}`);
      const value = make("div", "ou-stat-value", OpenUi.withUnit(props.value, props.unit));
      stat.append(make("div", "ou-stat-label", props.label), value);
      if (props.detail) {
        stat.append(make("div", "ou-stat-detail", props.detail));
      }
      return stat;
    }
    if (node.type === "Callout") {
      const note = make("p", `ou-callout ou-callout-${props.tone || "info"}`, props.text);
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
    if (!/^[^\p{L}\p{N}\s]$/u.test(unit)) {
      return `${text} ${unit}`;
    }
    // A currency sign goes after the minus: -£145.92.
    return text.startsWith("-") ? `-${unit}${text.slice(1)}` : `${unit}${text}`;
  }

  /**
   * A table. Columns holding only numbers line up on the right.
   *
   * :param doc: The document.
   * :param columns: The column names.
   * :param rows: The rows.
   * :param caption: A caption, or nothing.
   * :return: The element.
   */
  static renderTable(doc, columns, rows, caption) {
    const scroll = doc.createElement("div");
    scroll.className = "ou-scroll";
    const table = doc.createElement("table");
    table.className = "ou-table";
    if (caption) {
      const cap = doc.createElement("caption");
      cap.textContent = caption;
      table.append(cap);
    }
    const numeric = columns.map((_, index) => rows.length > 0
      && rows.every((row) => typeof row[index] === "number" || row[index] === null));
    const head = doc.createElement("tr");
    columns.forEach((name, index) => {
      const th = doc.createElement("th");
      th.setAttribute("scope", "col");
      th.textContent = name;
      th.className = numeric[index] ? "ou-num" : "";
      head.append(th);
    });
    const thead = doc.createElement("thead");
    thead.append(head);
    const tbody = doc.createElement("tbody");
    for (const row of rows) {
      const tr = doc.createElement("tr");
      row.forEach((cell, index) => {
        const td = doc.createElement("td");
        td.textContent = OpenUi.format(cell);
        td.className = numeric[index] ? "ou-num" : "";
        tr.append(td);
      });
      tbody.append(tr);
    }
    table.append(thead, tbody);
    scroll.append(table);
    return scroll;
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
   * A legend: a colour key and a name for each series or slice.
   *
   * :param doc: The document.
   * :param names: The names.
   * :return: The element.
   */
  static legend(doc, names) {
    const legend = doc.createElement("div");
    legend.className = "ou-legend";
    names.forEach((name, index) => {
      const item = doc.createElement("span");
      const key = doc.createElement("span");
      key.className = "ou-key";
      key.style.background = OpenUi.COLORS[index % OpenUi.COLORS.length];
      item.append(key, doc.createTextNode(name));
      legend.append(item);
    });
    return legend;
  }

  /**
   * A bar or line chart, with its numbers in a table underneath for anyone who cannot
   * see the picture.
   *
   * :param doc: The document.
   * :param kind: "bar" or "line".
   * :param props: title, labels, series and unit.
   * :return: The element.
   */
  static renderChart(doc, kind, props) {
    const {title, labels, unit} = props;
    const series = props.series.filter((s) => s.type === "Series");
    const W = 640;
    const H = 300;
    const left = 62;
    const top = 14;
    const plotW = W - left - 14;
    const plotH = H - top - 40;
    const all = series.flatMap((s) => s.props.values);
    const ticks = OpenUi.ticks(Math.min(0, ...all), Math.max(0, ...all));
    const low = ticks[0];
    const high = ticks[ticks.length - 1];
    const y = (v) => top + plotH * (high - v) / (high - low);
    const figure = doc.createElement("figure");
    figure.className = "ou-chart";
    const caption = doc.createElement("figcaption");
    caption.textContent = unit ? `${title} (${unit})` : title;
    const svg = OpenUi.svg(doc, "svg", {viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${kind === "line" ? "Line" : "Bar"} chart: ${title}. The numbers are in the table below it.`});
    for (const tick of ticks) {
      svg.append(OpenUi.svg(doc, "line", {x1: left, x2: W - 14, y1: y(tick), y2: y(tick), class: tick === 0 ? "ou-axis" : "ou-grid"}));
      svg.append(OpenUi.svg(doc, "text", {x: left - 8, y: y(tick) + 4, "text-anchor": "end", class: "ou-tick"}, OpenUi.withUnit(tick, unit, true)));
    }
    const slot = plotW / labels.length;
    const every = Math.ceil(labels.length / 12);
    labels.forEach((label, index) => {
      if (index % every === 0) {
        const text = label.length > 12 ? `${label.slice(0, 11)}…` : label;
        svg.append(OpenUi.svg(doc, "text", {x: left + slot * (index + 0.5), y: H - 16, "text-anchor": "middle", class: "ou-tick"}, text));
      }
    });
    series.forEach((s, index) => {
      const color = OpenUi.COLORS[index % OpenUi.COLORS.length];
      const points = s.props.values.map((v, i) => [left + slot * (i + 0.5), y(v)]);
      const mark = (v, i) => `${labels[i]}, ${s.props.name}: ${OpenUi.withUnit(v, unit)}`;
      if (kind === "line") {
        const line = OpenUi.svg(doc, "polyline", {points: points.map((p) => p.join(",")).join(" "), class: "ou-line", "stroke-dasharray": OpenUi.DASHES[index]});
        line.style.stroke = color;
        svg.append(line);
        s.props.values.forEach((v, i) => {
          const dot = OpenUi.svg(doc, "circle", {cx: points[i][0], cy: points[i][1], r: 3.5, class: "ou-dot"});
          dot.style.fill = color;
          dot.append(OpenUi.svg(doc, "title", {}, mark(v, i)));
          svg.append(dot);
        });
      } else {
        const bar = (slot * 0.8) / series.length;
        s.props.values.forEach((v, i) => {
          const x = left + slot * i + slot * 0.1 + bar * index;
          const rect = OpenUi.svg(doc, "rect", {x, y: Math.min(y(v), y(0)), width: Math.max(bar - 1, 1), height: Math.abs(y(v) - y(0)), class: "ou-bar"});
          rect.style.fill = color;
          rect.append(OpenUi.svg(doc, "title", {}, mark(v, i)));
          svg.append(rect);
        });
      }
    });
    figure.append(caption, svg);
    if (series.length > 1) {
      figure.append(OpenUi.legend(doc, series.map((s) => s.props.name)));
    }
    const data = doc.createElement("details");
    data.className = "ou-data";
    const summary = doc.createElement("summary");
    summary.textContent = "View the numbers";
    data.append(summary, OpenUi.renderTable(doc, ["", ...series.map((s) => (unit ? `${s.props.name} (${unit})` : s.props.name))],
      labels.map((label, i) => [label, ...series.map((s) => s.props.values[i])])));
    figure.append(data);
    return figure;
  }

  /**
   * A donut chart, with each slice named in a list beside it.
   *
   * :param doc: The document.
   * :param props: title, labels, values and unit.
   * :return: The element.
   */
  static renderPie(doc, props) {
    const {title, labels, values, unit} = props;
    const total = values.reduce((sum, v) => sum + v, 0);
    const figure = doc.createElement("figure");
    figure.className = "ou-chart ou-pie";
    const caption = doc.createElement("figcaption");
    caption.textContent = unit ? `${title} (${unit})` : title;
    const svg = OpenUi.svg(doc, "svg", {viewBox: "0 0 200 200", role: "img", "aria-label": `Donut chart: ${title}. The numbers are in the list beside it.`});
    const centre = 100;
    const outer = 92;
    const inner = 54;
    const point = (angle, radius) => [centre + radius * Math.sin(angle), centre - radius * Math.cos(angle)];
    let start = 0;
    values.forEach((v, index) => {
      if (v <= 0) {
        return;
      }
      const sweep = (v / total) * Math.PI * 2;
      const color = OpenUi.COLORS[index % OpenUi.COLORS.length];
      let shape;
      if (sweep >= Math.PI * 2 - 1e-6) {
        shape = OpenUi.svg(doc, "circle", {cx: centre, cy: centre, r: (outer + inner) / 2, "stroke-width": outer - inner, class: "ou-ring"});
        shape.style.stroke = color;
      } else {
        const [x1, y1] = point(start, outer);
        const [x2, y2] = point(start + sweep, outer);
        const [x3, y3] = point(start + sweep, inner);
        const [x4, y4] = point(start, inner);
        const large = sweep > Math.PI ? 1 : 0;
        shape = OpenUi.svg(doc, "path", {d: `M${x1} ${y1} A${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`, class: "ou-slice"});
        shape.style.fill = color;
      }
      shape.append(OpenUi.svg(doc, "title", {}, `${labels[index]}: ${OpenUi.withUnit(v, unit)}`));
      svg.append(shape);
      start += sweep;
    });
    const list = doc.createElement("ul");
    list.className = "ou-slices";
    labels.forEach((label, index) => {
      const item = doc.createElement("li");
      const key = doc.createElement("span");
      key.className = "ou-key";
      key.style.background = OpenUi.COLORS[index % OpenUi.COLORS.length];
      const share = Math.round((values[index] / total) * 1000) / 10;
      item.append(key, doc.createTextNode(`${label}: ${OpenUi.withUnit(values[index], unit)} (${OpenUi.format(share)}%)`));
      list.append(item);
    });
    const body = doc.createElement("div");
    body.className = "ou-pie-body";
    body.append(svg, list);
    figure.append(caption, body);
    return figure;
  }

  // ---- In the page -----------------------------------------------------------------------

  /** The look of the blocks. It uses the chat's own colours, so each site keeps its own. */
  static CSS = `
.ou-root{display:flex;flex-direction:column;gap:10px;margin:8px 0;white-space:normal;line-height:1.45;min-width:0}
.ou-live-text{white-space:pre-wrap}
.ou-stack{display:flex;gap:10px;min-width:0}.ou-column{flex-direction:column}.ou-row{flex-direction:row;flex-wrap:wrap}
.ou-row>*{flex:1 1 150px;min-width:0}
.ou-card{border:1px solid var(--ns-border,#d0d7de);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:var(--ns-bg,#fff)}
.ou-card-title,.ou-text-heading{margin:0;font-size:1em;font-weight:700}
.ou-text{margin:0}.ou-text-muted{color:var(--ns-muted,#59636e);font-size:.92em}
.ou-stat{border:1px solid var(--ns-border,#d0d7de);border-left:4px solid var(--ns-muted,#59636e);border-radius:8px;padding:8px 12px;background:var(--ns-bg,#fff)}
.ou-stat.ou-tone-good{border-left-color:#1a7f37}.ou-stat.ou-tone-bad{border-left-color:#b42318}
.ou-stat-label{font-size:.85em;color:var(--ns-muted,#59636e)}
.ou-stat-value{font-size:1.6em;font-weight:700;line-height:1.2;overflow-wrap:anywhere}
.ou-stat-detail{font-size:.85em;margin-top:2px}
.ou-tone-good .ou-stat-detail{color:#1a7f37}.ou-tone-bad .ou-stat-detail{color:#b42318}
.ou-callout{margin:0;padding:8px 12px;border-radius:8px;border:1px solid var(--ns-border,#d0d7de);border-left-width:4px;background:var(--ns-msgbg,#f6f8fa)}
.ou-callout-good{border-left-color:#1a7f37}.ou-callout-warn{border-left-color:#b45309}.ou-callout-info{border-left-color:var(--ns-primary,#9a3412)}
.ou-scroll{overflow-x:auto;max-width:100%}
.ou-table{width:100%;border-collapse:collapse;font-size:.9em}
.ou-table caption{text-align:left;font-weight:700;padding-bottom:4px}
.ou-table th,.ou-table td{padding:6px 8px;border-bottom:1px solid var(--ns-border,#d0d7de);text-align:left;vertical-align:top}
.ou-table th{background:var(--ns-msgbg,#f6f8fa)}.ou-table .ou-num{text-align:right!important;font-variant-numeric:tabular-nums}
.ou-chart{margin:0;display:flex;flex-direction:column;gap:6px}
.ou-chart figcaption{font-weight:700}
.ou-chart svg{display:block;width:100%;height:auto;min-width:280px}
.ou-grid{stroke:var(--ns-border,#d0d7de);stroke-width:1}.ou-axis{stroke:var(--ns-muted,#59636e);stroke-width:1.2}
.ou-tick{font-size:11px;fill:var(--ns-muted,#59636e)}
.ou-line{fill:none;stroke-width:2.5;stroke-linejoin:round}.ou-dot{stroke:var(--ns-bg,#fff);stroke-width:1}
.ou-ring{fill:none}
.ou-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:.85em}
.ou-key{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:2px}
.ou-pie-body{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.ou-pie-body svg{width:180px;min-width:0}
.ou-slices{list-style:none;margin:0;padding:0;font-size:.9em;display:flex;flex-direction:column;gap:4px}
.ou-data summary,.ou-source summary{cursor:pointer;font-size:.85em;color:var(--ns-muted,#59636e)}
.ou-source pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8em;padding:8px;background:var(--ns-msgbg,#f6f8fa);border-radius:6px}
.ou-error{margin:0;font-size:.9em;color:#b42318}
.ou-pending{height:56px;border-radius:8px;background:var(--ns-msgbg,#f6f8fa);animation:ou-pulse 1.2s ease-in-out infinite}
@keyframes ou-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.ou-pending{animation:none}}
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
          const drawn = OpenUi.draw(doc, pre.textContent, {source: true});
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
