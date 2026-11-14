// The Safety checks page: boots one test network on the runtime's in-page mock model,
// sends it one message, and says in plain words what the runtime stopped and why.
//
// The mock (router "browser://mock") answers in this page and calls each tool it is
// offered once, so each check is the same every time and needs no key. byokKey "demo"
// and a blank model keep a key saved for this site out of it (runtime/engine.js,
// selectTopRouter): nothing goes to an AI provider.

/** The four checks, by the folder under lab/ that holds each test network. */
const CASES = {
  invalid: {
    title: "Invalid network",
    setup: "lab_invalid's only agent lists ghost_agent as a tool, but the network defines no agent of that name.",
    expect: "The runtime validates a network before any model call, and refuses to run this one.",
    message: "Run the invalid-network check.",
  },
  cycle: {
    title: "Composition cycle",
    setup: "lab_cycle_a asks the lab_cycle_b network, and lab_cycle_b asks lab_cycle_a back.",
    expect: "lab_cycle_a is already in the request's call chain when lab_cycle_b would call it, so the runtime does not run it again.",
    message: "Run the cycle check.",
  },
  budget: {
    title: "Over budget",
    setup: "lab_budget asks five partner networks for one visitor message.",
    expect: "The runtime allows four third-party network calls per visitor message, so it runs four and skips the fifth.",
    message: "Run the budget check.",
  },
  denied: {
    title: "Denied origin",
    setup: "lab_denied asks a network on not-allowed.example. This site's allowed_peers lists only itself, and its peer policy is closed.",
    expect: "A consent card names the site first, as for any other site. Whichever you choose, the runtime fetches nothing from not-allowed.example: Decline stops it, and Allow meets the policy check.",
    message: "Run the denied-origin check.",
  },
};

/**
 * Runs the check the page's address names.
 */
class SafetyLab {
  /** The test network folder for the current check. */
  static name = "invalid";

  /** Model calls the run made, all to the in-page mock. */
  static modelCalls = 0;

  /**
   * Show the chosen check and wire the controls.
   */
  static start() {
    const asked = new URLSearchParams(location.search).get("case");
    SafetyLab.name = Object.hasOwn(CASES, asked) ? asked : "invalid";
    const check = CASES[SafetyLab.name];
    document.getElementById("lab-title").textContent = check.title;
    document.getElementById("lab-setup").textContent = `Set-up: ${check.setup}`;
    document.getElementById("lab-expect").textContent = `Expected: ${check.expect}`;
    for (const tab of document.querySelectorAll(".lab-tabs [data-case]")) {
      tab.setAttribute("aria-selected", String(tab.dataset.case === SafetyLab.name));
      tab.addEventListener("click", SafetyLab.choose.bind(null, tab.dataset.case));
    }
    document.getElementById("lab-run").addEventListener("click", SafetyLab.run, {once: true});
  }

  /**
   * Load another check. Each check needs a fresh runtime, so the page reloads.
   *
   * :param name: The check's folder name.
   */
  static choose(name) {
    location.search = `?case=${encodeURIComponent(name)}`;
  }

  /**
   * Boot the check's network and send its message.
   */
  static async run() {
    const button = document.getElementById("lab-run");
    button.disabled = true;
    SafetyLab.say(`Loading the ${SafetyLab.name} test network…`);
    const base = new URL(`./${SafetyLab.name}`, location.href).href.replace(/\/$/, "");
    let booted;
    try {
      const { boot } = await import("../runtime/index.js");
      booted = await boot("#agent-app", {originUrl: base, byokKey: "demo", router: "browser://mock", model: " "});
    } catch (error) {
      SafetyLab.say(`Stopped before any model call: ${error.message}`, true);
      SafetyLab.say("Model calls: 0. The network never ran.");
      return;
    }
    booted.trace.addEventListener("event", SafetyLab.onEvent);
    const input = document.querySelector("#agent-app #ns-input");
    const send = document.querySelector("#agent-app #ns-send");
    if (!input || !send) {
      SafetyLab.say("The chat did not load, so the check could not run.", true);
      return;
    }
    input.value = CASES[SafetyLab.name].message;
    input.dispatchEvent(new Event("input", {bubbles: true}));
    send.click();
  }

  /**
   * Turn a runtime tool name back into the lab network it stands for. The runtime
   * names a remote network's tool from its URL path, so lab/cycle/lab_cycle_a
   * becomes lab_cycle_lab_cycle_a. Match against the names this page defines.
   *
   * :param tool: The tool name from the trace event.
   * :returns: The lab network name, or the tool name when none matches.
   */
  static networkName(tool) {
    const known = ["lab_cycle_a", "lab_cycle_b", "lab_budget", "lab_denied", "lab_invalid"];
    const hit = known.filter((name) => tool === name || tool.endsWith(`_${name}`) || tool === `lab_${name}`);
    return hit.length ? hit.reduce((a, b) => (a.length >= b.length ? a : b)) : tool;
  }

  /**
   * Turn one runtime trace event into a sentence, when it is one this page explains.
   *
   * :param event: The trace's "event" event; its detail is the trace record.
   */
  static onEvent(event) {
    const ev = event.detail || {};
    if (ev.kind === "model_call" && ev.phase === "start") {
      SafetyLab.modelCalls += 1;
    } else if (ev.kind === "tool" && ev.phase === "end" && /^Skipped .*call chain/.test(String(ev.resultPreview || ""))) {
      // A cycle found when the call starts comes back as the tool's result
      // (runtime/runner.js, COMPOSITION_CYCLE), not as a composition_skip note.
      SafetyLab.say(`Stopped a cycle: ${SafetyLab.networkName(ev.tool)} is already in this request's call chain, so the runtime did not run it again.`, true);
    } else if (ev.kind === "composition_skip") {
      SafetyLab.say(`Stopped a cycle: ${ev.target} is already in this request's call chain (${ev.reason}), so it was not run again.`, true);
    } else if (ev.kind === "composition_limit") {
      SafetyLab.say(`Stopped over budget: ${ev.reason}. The call to ${ev.target || ev.agent} was skipped.`, true);
    } else if (ev.kind === "consent" && ev.decision === "declined") {
      SafetyLab.say(`You declined ${ev.peerOrigin}. Nothing was fetched from it.`, true);
    } else if (ev.phase === "end" && ev.status === "error" && ev.error) {
      SafetyLab.say(`Refused: ${ev.error}`, true);
    } else if (ev.kind === "run" && ev.phase === "end") {
      const outsider = performance.getEntriesByType("resource").filter((entry) => entry.name.includes("not-allowed.example")).length;
      SafetyLab.say(`The turn ended. Model calls: ${SafetyLab.modelCalls}, all to the in-page mock. Requests to not-allowed.example: ${outsider}.`);
    }
  }

  /**
   * Add one line to "What the runtime did".
   *
   * :param text: The line, as plain text.
   * :param stop: True for a line that reports a stop, which is shown in bold.
   */
  static say(text, stop = false) {
    const box = document.getElementById("lab-result");
    box.hidden = false;
    const item = document.createElement("li");
    item.textContent = text;
    if (stop) {
      item.className = "stop";
    }
    document.getElementById("lab-events").append(item);
  }
}

SafetyLab.start();
