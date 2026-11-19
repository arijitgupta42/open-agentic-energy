// Every kind of element the chat can show, drawn into the page's own chat, and a check
// that each piece of text in it can be read against what is behind it (WCAG contrast:
// 4.5:1, or 3:1 for large text). The runtime paints many of these in fixed light colours,
// so a theme can leave text unreadable; this finds that on any site, in either theme.
//
// The file is one async function, run in the page by chat-colours.e2e.mjs (and by hand
// in a browser console while fixing). It uses the runtime's own renderers where they are
// exported (renderMarkdown, renderRichComponent) and the page's OpenUi, and copies the
// runtime's markup (ui.js renderWidget, renderField, the consent and link cards) where they
// are not. It changes nothing but the chat's message list, and returns what failed.
async (theme) => {
  if (theme) {
    document.documentElement.dataset.theme = theme;
  }
  for (let i = 0; i < 80 && !document.querySelector("#agent-app #ns-msgs"); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const msgs = document.querySelector("#agent-app #ns-msgs");
  if (!msgs) {
    return {checked: 0, failures: ["The chat did not mount."]};
  }
  const {renderMarkdown, renderRichComponent} = await import("/runtime/cruse-render.js");
  const {OpenUi} = await import("/js/openui.js");
  document.querySelectorAll(".gallery").forEach((node) => node.remove());
  const add = (parent, className, html) => {
    const node = document.createElement("div");
    node.className = `${className} gallery`;
    if (html !== undefined) {
      node.innerHTML = html;
    }
    parent.append(node);
    return node;
  };
  const widget = (body, head = "Check the grant estimate", extra = "") => add(msgs, `ns-widget${extra}`,
    `<div class="ns-w-head"><span class="ns-w-icon">🧾</span><b>${head}</b></div><div class="ns-w-desc">Two answers are needed.</div>${body}`);

  // Messages: the visitor's, a steering note, a reply in markdown, a live reply, the status line.
  add(msgs, "ns-msg user", "What would a heat pump cost to fit and run?");
  add(msgs, "ns-msg user ns-steering-message", "Also check solar panels.");
  const reply = add(msgs, "ns-msg bot");
  renderMarkdown(reply, "## Heading\n### Smaller heading\nPlain text with **bold**, *italic*, `code` and a [link](https://example.com).\n\n- one\n- two\n\n1. first\n2. second\n\n> A quote.\n\n| Tariff | Cost |\n| --- | --- |\n| Heat Pump Saver | £1,617.79 |\n\n```\ncode block\n```\n\n---\nAfter the rule.");
  add(msgs, "ns-msg bot ns-live", '<div class="ou-live-text">Streaming reply text…</div>');
  add(msgs, "ns-turn-status", '<span class="ns-turn-status-spinner"></span><span class="ns-turn-status-text">Contacting Heatwright Home Energy…</span>');

  // Figures: every OpenUI component and tone, a part that failed and one still arriving.
  const figures = add(msgs, "ns-msg bot");
  const drawn = OpenUi.draw(document, [
    "root = Stack([head, tiles, meters, table, bars, line, pie, notes, wrong])",
    'head = Text("Your heat pump", "heading")',
    'tiles = Stack([Stat("Fit", "£9,200", "", "8 kW pump", "neutral", [1, 2, 3]), Stat("Grant", 5000, "£", "eligible", "good"), Stat("Gas", 11770, "kWh", "more than average", "bad")], "row")',
    'meters = Stack([Meter("Grant", 5000, 11200, "£"), Meter("Saved", 40, 100, "%", "good"), Meter("Over", 80, 100, "%", "bad")])',
    'table = Table(["Tariff", "Cost"], [["Saver", 1617.79], ["Total", 1617.79]], "Yearly costs")',
    'bars = BarChart("Gas used", ["Jan", "Feb"], [Series("2025", [820, 640]), Series("2026", [700, 600])], "kWh")',
    'line = LineChart("Cost", ["Jan", "Feb", "Mar"], [Series("£", [120, 110, 90])])',
    'pie = PieChart("Split", ["Gas", "Power"], [70, 30], "%")',
    'notes = Stack([Callout("For information."), Callout("A saving.", "good"), Callout("Check this.", "warn"), Text("Muted note", "muted")])',
    'wrong = Gauge(1)',
  ].join("\n"));
  figures.append(drawn);
  figures.append(OpenUi.draw(document, "root = Stack([a, b])\na = Stat(\"Done\", 1)", {partial: true}));

  // Chat widgets: a form with every field type, choices, info, confirm, action, rich parts, a used one.
  widget(`<form class="ns-w-form">
    <div class="ns-w-row"><label class="ns-w-label">Do you own or rent your home? *</label><select><option value="">—</option><option>Own</option></select></div>
    <div class="ns-w-row"><label class="ns-w-label">Floor area</label><div class="ns-w-fdesc">In square metres.</div><input type="number" value="95"></div>
    <div class="ns-w-row"><label class="ns-w-label">Postcode area</label><input type="text" placeholder="AB1"></div>
    <div class="ns-w-row"><label class="ns-w-label">Survey date</label><input type="date"></div>
    <div class="ns-w-row"><label class="ns-w-label">Notes</label><textarea>Loft is boarded.</textarea></div>
    <fieldset class="ns-w-row"><legend class="ns-w-label">EPC band</legend><div class="ns-w-radio"><label><input type="radio" name="g" checked><span>C</span></label><label><input type="radio" name="g"><span>D</span></label></div></fieldset>
    <div class="ns-w-row"><label class="ns-w-label">Measures</label><div class="ns-w-multi"><label><input type="checkbox" checked> loft</label><label><input type="checkbox"> walls</label></div></div>
    <div class="ns-w-row"><label class="ns-w-label">Benefits</label><label class="ns-w-toggle"><input type="checkbox"> Yes</label></div>
    <div class="ns-w-actions"><button type="submit" class="ns-w-btn">Check grant eligibility</button></div></form>`);
  widget('<div class="ns-w-choices"><button class="ns-w-choice"><div class="ns-w-ctitle">Heat Pump Saver</div><div class="ns-w-csub">Cheapest with a heat pump</div><div class="ns-w-cmeta">£1,617.79 a year</div></button><button class="ns-w-choice"><div class="ns-w-ctitle">Fixed 12 Month</div></button></div>', "Pick a tariff");
  widget('<div class="ns-w-fields"><div class="ns-w-field"><span class="ns-w-fk">Tariff</span><span class="ns-w-fv">Standard Variable</span></div></div>', "Your account");
  widget('<div class="ns-w-actions"><button class="ns-w-btn">Confirm</button><button class="ns-w-btn ghost">Cancel</button></div>', "Switch tariff?");
  widget('<button class="ns-w-btn">Review action</button>', "Book a survey");
  for (const spec of [
    {kind: "report", markdown: "**Report** with a [link](https://example.com) and `code`.\n\n> Quoted."},
    {kind: "table", columns: ["Scheme", "Amount"], rows: [["Heat pump", "£5,000"]]},
    {kind: "chart", type: "bar", title: "Usage", labels: ["Jan", "Feb"], series: [{name: "kWh", values: [820, 640]}]},
    {kind: "html", html: "<p>Safe <b>html</b> and <a href='https://example.com'>a link</a>.</p>"},
  ]) {
    const card = widget("", `A ${spec.kind}`);
    const body = document.createElement("div");
    renderRichComponent(body, spec);
    card.append(body);
  }

  // Partner contact: a card waiting, one answered, the automatic note, and the link card.
  add(msgs, "ns-msg bot ns-consent", '<div class="ns-consent-title">🔗 Contact <b>Fernbrook Retrofit Grants</b> on your behalf?</div><div class="ns-consent-sub">https://fernbrook.example · est. ~900 tokens</div><div class="ns-consent-req">“Which grants pay towards a heat pump?”</div><div class="ns-consent-actions"><button>Allow</button><button class="ghost">Always allow</button><button class="ghost">Decline</button></div>');
  add(msgs, "ns-msg bot ns-consent", '<div class="ns-consent-title">🔗 Contact <b>Heatwright</b> on your behalf?</div><div class="ns-consent-done">✓ Allowed</div>');
  add(msgs, "ns-msg bot ns-consent", '<div class="ns-consent-title">🔗 Contact <b>Heatwright</b> on your behalf?</div><div class="ns-consent-done">✕ Declined</div>');
  msgs.lastElementChild.dataset.decision = "decline";
  add(msgs, "ns-msg bot ns-auto-approved", '<div class="ns-auto-approved-title">✓ Contacted Heatwright automatically</div><div class="ns-auto-approved-origin">https://heatwright.example</div><div class="ns-auto-approved-request">“Heat pump estimate for a 95 m2 semi?”</div>');
  add(msgs, "ns-msg bot ns-linker", '<div class="ns-linker-title">🔗 Link a partner network</div><div class="ns-linker-sub">Paste its network URL.</div><form class="ns-linker-form"><input type="text" value="https://partner.example/network"><button>Link</button></form>');
  add(msgs, "ns-hint", "Your key stays in this browser.");
  add(msgs, "ns-hint warn", "This model may not call tools.");
  add(msgs, "ns-msg bot", '<div class="prompt-hint">Press Tab to use this suggestion</div>');

  // The runtime's model badges, a modal, and developer-log rows, where the page shows them.
  const header = document.querySelector("#agent-app .ns-header") || msgs;
  for (const kind of ["mock", "real", "pending", "error"]) {
    add(header, `ns-llmbadge ${kind}`, `${kind} model`);
  }
  // The developer log shows in the chat's place while ⚙ Developer is on: open it to check its rows.
  const devToggle = document.querySelector("#agent-app .ns-devtoggle");
  const devWasOn = devToggle?.classList.contains("on");
  if (devToggle && !devWasOn) {
    devToggle.click();
  }
  const log = document.querySelector("#agent-app .ns-log");
  if (log) {
    for (const kind of ["k-run", "k-agent", "k-model_call", "k-tool_call", "k-rest_call", "k-remote_call", "k-mcp_call", "k-error"]) {
      add(log, `ns-row ${kind}`, `${kind} <span class="ns-pill">pill</span><pre>{"a": 1}</pre>`);
    }
  }
  const modal = add(document.querySelector("#agent-app") || document.body, "ns-modal", '<div class="ns-modal-card"><button class="ns-modal-close">×</button><h3>Details</h3><p>Plain text.</p><pre>{"call": 1}</pre><div class="ns-mact">An action</div></div>');
  // The page's own confirmation dialog for a change that cannot be undone (site.js openDialog).
  const dialog = document.createElement("dialog");
  dialog.className = "assistant-review gallery";
  dialog.innerHTML = '<h2>Switch tariff?</h2><p>Your tariff changes to Fixed 12 Month today.</p><dl><dt>Exit fee</dt><dd>£50.00</dd></dl><details open><summary>Technical details</summary><pre>website_switch_tariff({"tariffId": "fixed-12"})</pre></details><button>Switch tariff</button> <button class="assistant-decline">Not now</button>';
  document.body.append(dialog);
  dialog.showModal();

  // Read every visible piece of text against what is behind it.
  const parse = (value) => {
    const match = String(value).match(/rgba?\(([^)]+)\)/);
    if (!match) {
      return null;
    }
    const [r, g, b, a = 1] = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return {r, g, b, a};
  };
  const over = (top, under) => ({r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1});
  const behind = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== "none" && !node.closest("svg")) {
        return null;
      }
      const color = parse(style.backgroundColor);
      if (color && color.a > 0) {
        layers.push(color);
        if (color.a >= 1) {
          break;
        }
      }
    }
    let result = {r: 255, g: 255, b: 255, a: 1};
    for (const layer of layers.reverse()) {
      result = over(layer, result);
    }
    return result;
  };
  const luminance = ({r, g, b}) => {
    const channel = (value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const failures = [];
  let checked = 0;
  const scope = [...document.querySelectorAll(".gallery")];
  const seen = new Set();
  for (const root of scope) {
    for (const element of [root, ...root.querySelectorAll("*")]) {
      if (seen.has(element)) {
        continue;
      }
      seen.add(element);
      const own = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
      const field = element.matches("input[type=text], input[type=number], input[type=date], textarea, select");
      if ((!own && !field) || !element.checkVisibility?.({opacityProperty: true, visibilityProperty: true})) {
        continue;
      }
      // WCAG exempts controls that cannot be used, and decoration.
      if (element.closest("[disabled], .done, [aria-hidden=true]")) {
        continue;
      }
      const style = getComputedStyle(element);
      const inSvg = element instanceof SVGElement;
      const fg = parse(inSvg ? style.fill : style.color);
      const bg = behind(inSvg ? element.closest("svg").parentElement : element);
      if (!fg || !bg) {
        continue;
      }
      checked += 1;
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const value = ratio(over(fg, bg), bg);
      if (value < need) {
        const name = element.className?.baseVal ?? element.className;
        const text = (field ? element.value || element.placeholder || element.tagName : element.textContent).trim().slice(0, 30);
        failures.push(`${element.tagName.toLowerCase()}${name ? `.${String(name).trim().split(/\s+/).join(".")}` : ""} "${text}" ${value.toFixed(2)}:1 (needs ${need})`);
      }
    }
  }
  modal.remove();
  dialog.close();
  dialog.remove();
  if (devToggle && !devWasOn) {
    devToggle.click();
  }
  return {checked, failures};
}
