// A stand-in for the visitor's LLM router (OpenRouter) in the browser tests. It answers
// the runtime's streamed chat completions with a fixed script per agent, so the real
// runtime, the swarm, the partner networks, the consent cards and the MCP servers all run
// in a real browser with no model and no real key.
//
// Each agent is known by a phrase from its own instructions. Its next step depends only
// on how many tool rounds this invocation has had, so agents that run at the same time
// cannot take each other's replies. Its answers repeat figures from the tool results it
// got, which come from the sites' own data and rules: a test that finds "£145.92" in the
// chat knows the figure travelled through the swarm, not from this script.

/** The router the sites' manifests name, and the test key typed into the settings. */
export const ROUTER = "https://openrouter.ai/api/v1";
export const TEST_KEY = "e2e-test-key-not-real";

/**
 * Turn one reply into the server-sent events the runtime reads (runtime/llm.js _readSse).
 *
 * :param reply: {text} or {calls: [{name, args}]}.
 * :param step: The invocation's step, for unique call ids.
 * :return: The response body.
 */
function sse(reply, step) {
  const chunks = [];
  if (reply.calls) {
    reply.calls.forEach((call, index) => {
      chunks.push({choices: [{index: 0, delta: {tool_calls: [{index, id: `call_${step}_${index}_${call.name}`, type: "function", function: {name: call.name, arguments: JSON.stringify(call.args)}}]}}]});
    });
    chunks.push({choices: [{index: 0, delta: {}, finish_reason: "tool_calls"}]});
  } else {
    chunks.push({choices: [{index: 0, delta: {content: reply.text}}]});
    chunks.push({choices: [{index: 0, delta: {}, finish_reason: "stop"}]});
  }
  return chunks.map((chunk) => `data: ${JSON.stringify({model: "e2e/scripted", ...chunk})}\n\n`).join("") + "data: [DONE]\n\n";
}

/**
 * Read what the request holds: the agent's instructions, the latest visitor or caller
 * text, the step, and the results of the tools called so far by name.
 *
 * :param body: The chat completion request.
 * :return: {system, input, site, step, results}: site is true when the agent has this site's own
 *   website_* tools.
 */
function read(body) {
  const messages = body.messages || [];
  const text = (message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content || ""));
  const system = messages.filter((message) => message.role === "system").map(text).join("\n");
  const users = messages.filter((message) => message.role === "user");
  const input = users.length ? text(users[users.length - 1]) : "";
  // Only this turn's rounds: those after the latest visitor or caller message.
  const last = messages.lastIndexOf(users[users.length - 1]);
  const turn = messages.slice(last + 1);
  const names = new Map();
  for (const message of turn) {
    for (const call of message.tool_calls || []) {
      names.set(call.id, call.function.name);
    }
  }
  const results = {};
  for (const message of turn) {
    if (message.role === "tool") {
      results[names.get(message.tool_call_id)] = text(message);
    }
  }
  const site = (body.tools || []).some((tool) => String(tool.function?.name).startsWith("website_"));
  return {system, input, site, step: turn.filter((message) => message.role === "assistant").length, results};
}

/**
 * Parse a tool result: an agent's {"text": ...}, an MCP tool's JSON, a site action's
 * receipt, or plain text such as a declined partner.
 *
 * :param raw: The tool message's content.
 * :return: The parsed value, or {text: raw} when it is not JSON.
 */
function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {text: String(raw || "")};
  }
}

/**
 * Find the first value of a key anywhere in a parsed result.
 *
 * :param value: The parsed result.
 * :param key: The key.
 * :return: The value, or undefined.
 */
function find(value, key) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (Object.hasOwn(value, key)) {
    return value[key];
  }
  for (const child of Object.values(value)) {
    const found = find(child, key);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * The text an agent or partner answered, or the runtime's own sentence (a decline).
 *
 * :param raw: The tool message's content.
 * :return: The text.
 */
function answer(raw) {
  const value = parse(raw);
  return typeof value.text === "string" ? value.text : String(raw || "");
}

/**
 * What the scripted front agents suggest as the visitor's next request, as the last line
 * of their answer (the `next_rules` in each .hocon), when they have the site's own tools.
 */
export const SUGGESTION = "What do I need to apply for it?";

/**
 * Add the suggested next request as the last line, as a front agent with its site's own
 * tools does.
 *
 * :param request: The read() result.
 * :param text: The answer.
 * :return: {text}.
 */
function withNext(request, text) {
  return {text: request.site ? `${text}\n\n<next>${SUGGESTION}</next>` : text};
}

const SCHEMES = ["heat-pump-grant", "solar-starter", "warm-walls"];

/** Each agent's script: the phrase that finds it in its instructions, and its steps. */
const AGENTS = [
  {
    name: "scheme agent",
    match: (system) => SCHEMES.find((id) => system.includes(`the one with id "${id}"`)),
    reply({step, input, results}, id) {
      const fulfill = input.includes("Fulfill");
      if (step === 0) {
        return {calls: [{name: "mcp_check_scheme", args: fulfill ? {scheme: id, currentHeating: "gas-boiler"} : {scheme: id}}]};
      }
      const result = parse(results.mcp_check_scheme);
      if (!fulfill) {
        return {text: id === "heat-pump-grant" ? `Yes: ${result.scheme} pays towards heat pumps.` : `No: ${result.scheme} is not for heat pumps.`};
      }
      return {text: `${result.scheme}: ${result.amount}. Still needed: ${(result.stillNeeded || []).join(" ")}`};
    },
  },
  {
    name: "fernbrook_assistant",
    match: (system) => system.includes("You are the assistant on the Fernbrook Retrofit Grants website"),
    reply(request) {
      const {step, input, results} = request;
      if (step === 0) {
        const calls = ["heat_pump_grant_agent", "solar_starter_agent", "warm_walls_agent"].map((name) => ({name, args: {inquiry: input, mode: "Determine"}}));
        // The starter also asks what a heat pump costs to fit: Heatwright's network, run here.
        if (request.site && /cost to fit/i.test(input)) {
          calls.push({name: "heatwright_installers", args: {request: "Heat pump for a 95 m2 house: what to fit and its price?"}});
        }
        return {calls};
      }
      if (step === 1) {
        return {calls: [{name: "heat_pump_grant_agent", args: {inquiry: `${input} Heating: gas boiler.`, mode: "Fulfill"}}]};
      }
      const fit = results.heatwright_installers ? ` | ${answer(results.heatwright_installers)}` : "";
      return withNext(request, `Grant: ${answer(results.heat_pump_grant_agent)}${fit}`);
    },
  },
  {
    name: "heat_pump_engineer",
    match: (system) => system.includes("You size air-source heat pumps"),
    reply({step, results}) {
      if (step === 0) {
        return {calls: [{name: "mcp_estimate", args: {measure: "heat-pump", homeType: "semi-detached", floorAreaM2: 95}}]};
      }
      const estimate = find(parse(results.mcp_estimate), "estimate");
      return {text: `${estimate.product}, ${estimate.priceRange}`};
    },
  },
  {
    name: "heatwright_assistant",
    match: (system) => system.includes("You are the assistant on the Heatwright Home Energy website"),
    reply(request) {
      const {step, input, results} = request;
      if (step === 0) {
        const calls = [{name: "heat_pump_engineer", args: {request: input}}];
        // The starter also asks about a grant: Fernbrook's network, run here.
        if (request.site && /is there a grant/i.test(input)) {
          calls.push({name: "fernbrook_grants", args: {request: "Which grants help pay for a heat pump?"}});
        }
        return {calls};
      }
      const grant = results.fernbrook_grants ? ` | ${answer(results.fernbrook_grants)}` : "";
      return withNext(request, `Fit: ${answer(results.heat_pump_engineer)}${grant}`);
    },
  },
  {
    name: "usage_analyst",
    match: (system) => system.includes("You answer usage questions"),
    reply({step, results}) {
      if (step === 0) {
        return {calls: [{name: "mcp_estimate_heat_pump_running_cost", args: {electricityKwh: 2975, gasKwh: 11770}}]};
      }
      const result = parse(results.mcp_estimate_heat_pump_running_cost);
      return {text: `Running: ${result.cheapestWithHeatPump}, ${result.yearlyDifference}`};
    },
  },
  {
    name: "retrofit_planner",
    match: (system) => system.includes("You plan home energy upgrades"),
    reply({step, results}) {
      if (step === 0) {
        // One step, no website_* tool in it, so the runtime runs the three together.
        return {calls: [
          {name: "heatwright_installers", args: {request: "Heat pump for a 95 m2 semi-detached house: what to fit and its price?"}},
          {name: "fernbrook_grants", args: {request: "Which grants help pay for a heat pump?"}},
          {name: "usage_analyst", args: {request: "Heat pump running cost for this account."}},
        ]};
      }
      return {text: [results.heatwright_installers, results.fernbrook_grants, results.usage_analyst].map(answer).join(" | ")};
    },
  },
  {
    name: "emberwick_assistant",
    match: (system) => system.includes("You are the assistant on the Emberwick Energy website"),
    reply(request) {
      const {step, input, results} = request;
      if (/switch/i.test(input)) {
        if (step === 0) {
          return {calls: [{name: "website_get_account_state", args: {}}]};
        }
        if (step === 1) {
          const version = find(parse(results.website_get_account_state), "version");
          return {calls: [{name: "website_switch_tariff", args: {tariffId: "fixed-12", expectedVersion: version}}]};
        }
        const receipt = parse(results.website_switch_tariff);
        return {text: `Switch ${receipt.status}: ${find(receipt, "reference") || "no reference"}.`};
      }
      if (/by month/i.test(input)) {
        // A usage answer with its figures as an openui block (js/openui.js), written
        // from the account state this turn read, as the real front agent is told to.
        if (step === 0) {
          return {calls: [{name: "website_get_account_state", args: {}}]};
        }
        const usage = find(parse(results.website_get_account_state), "usage");
        const months = usage.months;
        const block = [
          "root = Stack([totals, chart])",
          "totals = Stack([gas, power], \"row\")",
          `gas = Stat("Gas, last 12 months", ${usage.gasKwh}, "kWh")`,
          `power = Stat("Electricity, last 12 months", ${usage.electricityKwh}, "kWh")`,
          `chart = BarChart("Gas and electricity by month", ${JSON.stringify(months.map((m) => m.month))}, [Series("Gas", ${JSON.stringify(months.map((m) => m.gasKwh))}), Series("Electricity", ${JSON.stringify(months.map((m) => m.electricityKwh))})], "kWh")`,
        ].join("\n");
        return withNext(request, `Gas use peaks in winter.\n\n\`\`\`openui\n${block}\n\`\`\``);
      }
      if (step === 0) {
        return {calls: [{name: "retrofit_planner", args: {request: input}}]};
      }
      return withNext(request, `Plan: ${answer(results.retrofit_planner)}`);
    },
  },
];

/**
 * Answer one chat completion request.
 *
 * :param body: The parsed request.
 * :return: The SSE body.
 * :raises Error: When no script matches the agent, so a renamed agent fails loudly.
 */
export function reply(body) {
  const request = read(body);
  for (const agent of AGENTS) {
    const matched = agent.match(request.system);
    if (matched) {
      return sse(agent.reply(request, matched), request.step);
    }
  }
  throw new Error(`No script for this agent: ${request.system.slice(0, 120)}`);
}

/**
 * Route the router's requests to the script, and record every request the page makes
 * to the given hosts, with its headers, so a test can check what each site received.
 *
 * :param browser: The e2e browser fixture.
 * :param hosts: Hosts to record, such as "localhost:8081".
 * :return: The recorded requests: {host, url, headers}.
 */
export async function useScriptedRouter(browser, hosts = []) {
  const seen = [];
  for (const host of hosts) {
    await browser.route(new RegExp(`^https?://${host.replace(/[.:[\]]/g, "\\$&")}/`), async (route) => {
      seen.push({host, url: route.request.url, headers: route.request.headers});
      await route.continue();
    });
  }
  await browser.route(/^https:\/\/openrouter\.ai\//, async (route) => {
    seen.push({host: "openrouter.ai", url: route.request.url, headers: route.request.headers});
    if (!route.request.url.endsWith("/chat/completions")) {
      await route.fulfill({json: {data: []}});
      return;
    }
    await route.fulfill({status: 200, contentType: "text/event-stream", body: reply(JSON.parse(route.request.postData || "{}"))});
  });
  return seen;
}
