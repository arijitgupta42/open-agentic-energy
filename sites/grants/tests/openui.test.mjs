// Checks js/openui.js, the same file on all three sites: reading OpenUI Lang, drawing it,
// the live bubble, and that the prompt in each site's .hocon lists the components the
// reader accepts. A small page stand-in is used; the file is not a browser emulator.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LiveChat } from "../js/live-chat.js";
import { OpenUi } from "../js/openui.js";

/** Just enough of a node, with its text and children, for the drawing code. */
class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.className = "";
    this.attributes = {};
    this.children = [];
    this.style = {};
    this.own = "";
    this.parent = null;
  }

  get textContent() {
    return this.own + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.own = String(value);
    this.children = [];
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.own = "";
    this.append(...nodes);
  }

  remove() {
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") {
      this.className = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  /** All descendants, depth first, that the test accepts. */
  all(test) {
    const out = [];
    for (const child of this.children) {
      if (test(child)) {
        out.push(child);
      }
      out.push(...child.all(test));
    }
    return out;
  }
}

/** The page stand-in. */
const doc = {
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (_ns, tag) => new FakeNode(tag),
  createTextNode: (text) => {
    const node = new FakeNode("#text");
    node.own = String(text);
    return node;
  },
};

const tag = (name) => (node) => node.tag === name;

const EXAMPLE = [
  'root = Stack([cost, months])',
  'cost = Stat("Yearly cost", 1180, "£", "£120 less than now", "good")',
  'months = BarChart("Gas used", ["Jan", "Feb", "Mar"], [Series("kWh", [820, 640, 500])], "kWh")',
].join("\n");

test("A block of statements becomes a tree, and a name can be used before it is written", () => {
  const {root, errors} = OpenUi.parse(EXAMPLE);
  assert.deepEqual(errors, []);
  assert.equal(root.type, "Stack");
  const [stat, chart] = root.props.children;
  assert.deepEqual(stat.props, {label: "Yearly cost", value: 1180, unit: "£", detail: "£120 less than now", tone: "good"});
  assert.equal(chart.type, "BarChart");
  assert.deepEqual(chart.props.labels, ["Jan", "Feb", "Mar"]);
  assert.deepEqual(chart.props.series[0].props, {name: "kWh", values: [820, 640, 500]});
});

test("A statement may run over several lines, hold a quoted bracket, and nest a component", () => {
  const {root, errors} = OpenUi.parse('root = Stack([\n  Text("a (b], c", "muted"),\n  Callout("Careful", "warn")\n])');
  assert.deepEqual(errors, []);
  assert.equal(root.props.children[0].props.content, "a (b], c");
  assert.equal(root.props.children[1].props.tone, "warn");
});

test("While text arrives, a half-written statement is skipped and a missing name waits", () => {
  const early = OpenUi.parse('root = Stack([a, b])\na = Stat("One", 1)\nb = Stat("Two", ', true);
  assert.deepEqual(early.errors, []);
  assert.equal(early.root.props.children[0].type, "Stat");
  assert.equal(early.root.props.children[1].type, "Pending");
  assert.equal(OpenUi.parse('root = Stack([a', true).root, null);
  assert.equal(OpenUi.parse("", true).root, null);
  // Once it is final, the same text is an error and nothing is drawn as fine.
  const final = OpenUi.parse('root = Stack([a, b])\na = Stat("One", 1)');
  assert.equal(final.root.props.children[1].type, "Error");
  assert.match(final.errors[0], /b is not written/);
});

test("A wrong part is replaced by a note and the rest still stands", () => {
  const {root, errors} = OpenUi.parse([
    "root = Stack([ok, bad, odd, short])",
    'ok = Stat("Fine", 5)',
    'bad = Gauge("Speed", 5)',
    'odd = Stat("Odd", [1, 2])',
    'short = BarChart("Gas", ["Jan", "Feb"], [Series("kWh", [1])])',
  ].join("\n"));
  const kinds = root.props.children.map((child) => child.type);
  assert.deepEqual(kinds, ["Stat", "Error", "Error", "Error"]);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Gauge is not a component/);
  assert.match(errors[1], /Stat value must be text or a number/);
  assert.match(errors[2], /series kWh needs one value for each label/);
});

test("A cycle, a missing root, too many values and code-like text are refused", () => {
  assert.equal(OpenUi.parse("root = Stack([root])").root.props.children[0].type, "Error");
  assert.match(OpenUi.parse('a = Text("x")').errors[0], /no root statement/);
  assert.match(OpenUi.parse('root = Text("x", "body", 3)').errors[0], /takes at most 2 values/);
  assert.match(OpenUi.parse('root = @Run("x")').errors.join(" "), /unexpected "@"/);
  assert.match(OpenUi.parse("root = Text(\"x\")\nalert(1)").errors[0], /Not a statement/);
  assert.match(OpenUi.parse('root = Text("x")\nroot = Text("y")').errors[0], /written twice/);
  assert.match(OpenUi.parse('root = Text("<img src=x onerror=alert(1)>", "side")').errors[0], /style must be one of/);
});

test("Limits stop an answer that builds too much", () => {
  const many = Array.from({length: 200}, (_, i) => `t${i}`);
  const lines = [`root = Stack([${many.join(", ")}])`, ...many.map((name) => `${name} = Text("x")`)];
  assert.match(OpenUi.parse(lines.join("\n")).errors.join(" "), /at most 24/);
  const deep = ["root = Stack([n0])", ...Array.from({length: 12}, (_, i) => `n${i} = Stack([n${i + 1}])`), 'n12 = Text("end")'];
  assert.match(OpenUi.parse(deep.join("\n")).errors.join(" "), /nested too deeply/);
  assert.match(OpenUi.parse(`root = Text("${"x".repeat(401)}")`).errors[0], /at most 400 characters/);
});

test("Tables, pies and series are checked as a whole", () => {
  assert.match(OpenUi.parse('root = Table(["A", "B"], [["x", 1], ["y"]])').errors[0], /one value for each column/);
  assert.match(OpenUi.parse('root = PieChart("Mix", ["a", "b"], [1])').errors[0], /one value for each label/);
  assert.match(OpenUi.parse('root = PieChart("Mix", ["a", "b"], [1, -1])').errors[0], /must not be negative/);
  assert.match(OpenUi.parse('root = BarChart("Mix", ["a"], [Text("no")])').errors[0], /must hold Series/);
});

test("Messages are cut into text and openui blocks, even one still arriving", () => {
  const text = `Your cost is lower.\n\n\`\`\`openui\n${EXAMPLE}\n\`\`\`\n\nAny questions?`;
  const parts = OpenUi.segments(text);
  assert.deepEqual(parts.map((p) => p.kind), ["text", "openui", "text"]);
  assert.equal(parts[1].open, false);
  assert.equal(parts[1].source, EXAMPLE);
  assert.equal(OpenUi.segments("Hi\n```openui\nroot = Te")[1].open, true);
  assert.equal(OpenUi.hasBlock("Hi\n```openui\nroot"), true);
  assert.equal(OpenUi.hasBlock("```js\nroot = 1\n```"), false);
  assert.equal(OpenUi.looksLike("root = Stack([])\n"), true);
  assert.equal(OpenUi.looksLike("const root = 1"), false);
});

test("Numbers read the way a person reads them, with a unit before a currency and after others", () => {
  assert.equal(OpenUi.withUnit(1180, "£"), "£1,180");
  assert.equal(OpenUi.withUnit(-145.92, "£"), "-£145.92");
  assert.equal(OpenUi.withUnit(-3, "kWh"), "-3 kWh");
  assert.equal(OpenUi.withUnit(820.456, "kWh"), "820.46 kWh");
  assert.equal(OpenUi.withUnit("About £90", undefined), "About £90");
  assert.equal(OpenUi.format(12500, true), "12.5k");
  assert.equal(OpenUi.format(950, true), "950");
});

test("Axis ticks use tidy steps and keep zero", () => {
  assert.deepEqual(OpenUi.ticks(0, 820), [0, 250, 500, 750, 1000]);
  assert.deepEqual(OpenUi.ticks(-50, 200), [-100, 0, 100, 200]);
  assert.deepEqual(OpenUi.ticks(0, 0), [0, 0.25]);
});

test("A stat, a table and a callout are drawn from text, never from markup", () => {
  const drawn = OpenUi.draw(doc, [
    "root = Stack([s, t, c])",
    'c = Callout("<b>careful</b>", "warn")',
    's = Stat("Yearly cost", 1180, "£", "£120 less", "good")',
    't = Table(["Month", "kWh"], [["Jan", 820], ["Feb", 640.5]], "Gas")',
  ].join("\n"));
  assert.equal(drawn.attributes["data-openui"], "done");
  const value = drawn.all((n) => n.className === "ou-stat-value")[0];
  assert.equal(value.textContent, "£1,180");
  assert.ok(drawn.all((n) => n.className === "ou-stat ou-tone-good").length === 1);
  const cells = drawn.all(tag("td")).map((n) => [n.textContent, n.className]);
  assert.deepEqual(cells, [["Jan", "ou-first"], ["820", "ou-num"], ["Feb", "ou-first"], ["640.5", "ou-num"]]);
  assert.equal(drawn.all(tag("th")).length, 2);
  assert.equal(drawn.all((n) => n.className === "ou-table-caption")[0].textContent, "Gas");
  assert.equal(drawn.all((n) => n.className === "ou-callout-text")[0].textContent, "<b>careful</b>");
  // Nothing of the assistant's own text is offered back: only what it drew.
  assert.equal(drawn.all(tag("pre")).length, 0);
  assert.equal(drawn.all(tag("summary")).length, 0);
});

test("A bar chart has one bar for each value and its numbers in a table", () => {
  const drawn = OpenUi.draw(doc, EXAMPLE);
  const bars = drawn.all((n) => n.className === "ou-bar");
  assert.equal(bars.length, 3);
  // The tallest bar is the first, 820 of a 1,000 axis.
  const heights = bars.map((bar) => Number(bar.attributes.height));
  assert.ok(heights[0] > heights[1] && heights[1] > heights[2]);
  assert.ok(Math.abs(heights[0] / heights[2] - 820 / 500) < 0.01);
  assert.equal(bars[0].all(tag("title"))[0].textContent, "Jan, kWh: 820 kWh");
  assert.equal(drawn.all(tag("svg"))[0].attributes.role, "img");
  assert.equal(drawn.all(tag("details")).length, 1);
  assert.deepEqual(drawn.all(tag("td")).map((n) => n.textContent), ["Jan", "820", "Feb", "640", "Mar", "500"]);
  // Three bars with short names stand up, and each carries its value.
  assert.equal(drawn.all((n) => n.className.includes("ou-rowlabel")).length, 0);
  assert.deepEqual(drawn.all((n) => n.className === "ou-value").map((n) => n.textContent), ["820 kWh", "640 kWh", "500 kWh"]);
});

test("A line chart draws a line and dots, and a pie shows each share", () => {
  const line = OpenUi.draw(doc, 'root = LineChart("Cost", ["A", "B"], [Series("Now", [1, 2]), Series("New", [2, 1])], "£")');
  assert.equal(line.all((n) => n.className === "ou-line").length, 2);
  assert.equal(line.all((n) => n.className === "ou-dot").length, 4);
  assert.equal(line.all((n) => n.className === "ou-legend").length, 1);
  const pie = OpenUi.draw(doc, 'root = PieChart("Mix", ["Gas", "Power"], [1, 3], "kWh")');
  assert.equal(pie.all((n) => n.className === "ou-slice").length, 2);
  assert.deepEqual(pie.all(tag("li")).map((n) => n.textContent), ["Gas: 1 kWh (25%)", "Power: 3 kWh (75%)"]);
  assert.equal(pie.all((n) => n.className === "ou-donut-total")[0].textContent, "4 kWh");
  assert.deepEqual(pie.all((n) => n.className === "ou-slice-fill").map((n) => n.style.width), ["25%", "75%"]);
  const whole = OpenUi.draw(doc, 'root = PieChart("All", ["Gas", "Power"], [0, 3])');
  assert.equal(whole.all((n) => n.className === "ou-ring").length, 1);
});

test("A block with no root, or a root that is wrong, is not drawn, so its text stays", () => {
  assert.equal(OpenUi.draw(doc, 'a = Text("x")'), null);
  assert.equal(OpenUi.draw(doc, 'root = Gauge(1)'), null);
});

test("The live bubble draws an openui block as it is written, and leaves plain text alone", () => {
  const msgs = new FakeNode("div");
  msgs.scrollHeight = 10;
  const live = new LiveChat(doc, msgs);
  live.delta("Your cost is lower.\n\n```openui\nroot = Stack([s])\n");
  const first = msgs.children[0];
  assert.equal(first.children[0].textContent, "Your cost is lower.");
  assert.equal(first.all((n) => n.className === "ou-pending").length, 1);
  live.delta('s = Stat("Cost", 12, "£")\n');
  assert.equal(first.all((n) => n.className === "ou-stat-value")[0].textContent, "£12");
  assert.equal(first.all((n) => n.className === "ou-pending").length, 0);
  live.restart();
  live.delta("Plain words");
  assert.equal(msgs.children[0].textContent, "Plain words");
});

test("Long names lie the bars down, one row each, with the value at the end of each bar", () => {
  const drawn = OpenUi.draw(doc, 'root = BarChart("Yearly cost", ["Standard Variable", "Fixed 12 Month", "Green Flex"], [Series("Cost", [1320, 1250, 1180])], "£")');
  assert.equal(drawn.all((n) => n.className.includes("ou-rowlabel")).length, 3);
  const widths = drawn.all((n) => n.className === "ou-bar").map((bar) => Number(bar.attributes.width));
  assert.ok(widths[0] > widths[1] && widths[1] > widths[2]);
  assert.ok(Math.abs(widths[0] / widths[2] - 1320 / 1180) < 0.01);
  assert.deepEqual(drawn.all((n) => n.className === "ou-value").map((n) => n.textContent), ["£1,320", "£1,250", "£1,180"]);
});

test("A stat shows a unit after the number, a note in a pill, and a trend as a small line", () => {
  const drawn = OpenUi.draw(doc, 'root = Stat("Gas", 11770, "kWh", "Down on last year", "good", [900, 800, 700])');
  assert.equal(drawn.all((n) => n.className === "ou-stat-num")[0].textContent, "11,770");
  assert.equal(drawn.all((n) => n.className === "ou-stat-unit")[0].textContent, " kWh");
  assert.equal(drawn.all((n) => n.className === "ou-pill")[0].textContent, "Down on last year");
  assert.equal(drawn.all((n) => n.className === "ou-spark")[0].attributes["aria-label"], "Trend from 900 to 700");
  assert.equal(drawn.all((n) => n.className === "ou-spark-line")[0].attributes.points.split(" ").length, 3);
  assert.match(OpenUi.parse('root = Stat("Gas", 1, "kWh", "x", "good", [5])').errors[0], /at least two numbers/);
});

test("A meter fills as far as the value goes towards its limit, and is checked", () => {
  const drawn = OpenUi.draw(doc, 'root = Meter("Grant towards fitting", 5000, 11200, "£")');
  assert.equal(drawn.all((n) => n.className === "ou-meter-value")[0].textContent, "£5,000 of £11,200 (44.6%)");
  assert.equal(drawn.all((n) => n.className === "ou-meter-fill")[0].style.width, "44.6%");
  const track = drawn.all((n) => n.className === "ou-meter-track")[0];
  assert.deepEqual([track.attributes.role, track.attributes["aria-valuenow"], track.attributes["aria-valuemax"]], ["meter", "5000", "11200"]);
  // Past its limit the bar stops at full, and the text still says the real number.
  const over = OpenUi.draw(doc, 'root = Meter("Used", 150, 100)');
  assert.equal(over.all((n) => n.className === "ou-meter-fill")[0].style.width, "100%");
  assert.match(over.all((n) => n.className === "ou-meter-value")[0].textContent, /150 of 100 \(150%\)/);
  assert.match(OpenUi.parse('root = Meter("Used", 1, 0)').errors[0], /max above 0/);
});

test("A table row that starts with Total stands out", () => {
  const drawn = OpenUi.draw(doc, 'root = Table(["Item", "£"], [["Fitting", 9200], ["Total", 9200]])');
  assert.deepEqual(drawn.all(tag("tr")).map((n) => n.className), ["", "", "ou-total"]);
});

/**
 * The text of a site's .hocon figure_rules.
 *
 * :param file: The site's .hocon path, from this folder.
 * :return: The text.
 */
async function figureRules(file) {
  const hocon = (await readFile(new URL(file, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const match = hocon.match(/"figure_rules": """\n([\s\S]*?)"""/);
  assert.ok(match, `${file}: figure_rules is missing.`);
  return match[1];
}

test("Every site's prompt lists the components the reader accepts, and is the same everywhere", async () => {
  const sites = {
    utility: "../../utility/emberwick_energy.hocon",
    installer: "../../installer/heatwright_installers.hocon",
    grants: "../../grants/fernbrook_grants.hocon",
  };
  const texts = new Set();
  for (const [site, file] of Object.entries(sites)) {
    const rules = await figureRules(file);
    texts.add(rules);
    for (const name of Object.keys(OpenUi.LIBRARY)) {
      assert.ok(rules.includes(OpenUi.signature(name)), `${site}: figure_rules lacks ${OpenUi.signature(name)}.`);
    }
    for (const [name, def] of Object.entries(OpenUi.LIBRARY)) {
      for (const [, type] of def.params.filter(([, t]) => t.startsWith("enum:"))) {
        for (const choice of type.slice(5).split("|")) {
          assert.ok(rules.includes(choice), `${site}: figure_rules lacks "${choice}" of ${name}.`);
        }
      }
    }
    const hocon = (await readFile(new URL(file, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    assert.ok(hocon.includes("{cruse_rules}\n{figure_rules}\n"), `${site}: the front agent lacks {figure_rules}.`);
  }
  assert.equal(texts.size, 1, "figure_rules differs between sites. Keep it the same on all three.");
});
