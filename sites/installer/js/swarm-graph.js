// Draws the swarm beside the chat: the 11 agents of the three linked sites, grouped by
// site, with the calls between them. While a message runs, the agents and calls working
// on it light up. Afterwards the visitor picks an answer (a numbered button, or by
// pointing at a message in the chat) to see its path again, and points at an agent or a
// call to read what it did for that answer (spec 5, "Observable execution").
//
// It is plain inline SVG with a fixed layout, animated with CSS: glowing orbs, sparks
// that travel along each working call, and a slight tilt that follows the pointer. No
// library, no third-party script and no network request. With "reduce motion" set, the
// stylesheet stops the animations and the tilt stays off. It reads what js/answer-path.js builds from the runtime's trace, and
// the fixed map in js/swarm-map.js, so no partner site is contacted to draw it.
//
// This file is the same on all three sites.
import { AnswerPath } from "./answer-path.js";
import { SwarmMap } from "./swarm-map.js";

/**
 * The live graph of the swarm, and the pure functions that work out what it shows.
 */
export class SwarmGraph {
  /** The drawing's width in SVG units. Its height follows from the number of sites. */
  static WIDTH = 320;

  /** Each site's box: its height, and the space between two boxes. */
  static BOX = {height: 126, gap: 12, top: 4};

  /** The most requests or notes one tooltip lists. */
  static MAX_ROWS = 2;

  /** The longest request or reply a tooltip quotes, in characters. */
  static MAX_QUOTE = 90;

  /** How bad each status is. The worst one wins when an agent or a call has several. */
  static RANK = {ok: 0, asking: 1, running: 2, refused: 3, error: 4};

  /**
   * Work out where everything goes. Sites stack top to bottom. In each, the front agent
   * sits above its specialists. A call inside a site is a straight line. A call to
   * another site curves around the side of the boxes.
   *
   * :return: {width, height, sites, nodes, edges}. A node has key, x, y and r. An edge
   *   has key, from, to, partner, d (the SVG path) and arrow (the arrowhead's points).
   */
  static layout() {
    const {height, gap, top} = SwarmGraph.BOX;
    const middle = SwarmGraph.WIDTH / 2;
    const sites = [];
    const nodes = new Map();
    SwarmMap.SITES.forEach((site, index) => {
      const y = top + index * (height + gap);
      sites.push({...site, x: 4, y, width: SwarmGraph.WIDTH - 8, height});
      const agents = SwarmMap.AGENTS.filter((agent) => agent.network === site.network);
      const specialists = agents.filter((agent) => !agent.front);
      const step = specialists.length > 2 ? 90 : 110;
      for (const agent of agents) {
        const key = SwarmMap.key(agent.network, agent.name);
        if (agent.front) {
          nodes.set(key, {...agent, key, icon: site.icon, x: middle, y: y + 47, r: 14});
        } else {
          const place = specialists.indexOf(agent) - (specialists.length - 1) / 2;
          nodes.set(key, {...agent, key, x: middle + place * step, y: y + 88, r: 11});
        }
      }
    });
    const edges = [];
    SwarmMap.CALLS.forEach(([from, to], index) => {
      const a = nodes.get(from);
      const b = nodes.get(to);
      const partner = a.network !== b.network;
      // Two front agents that call each other: the later call takes a lane of its own.
      const first = SwarmMap.CALLS.findIndex(([caller, callee]) => caller === to && callee === from);
      const back = first !== -1 && first < index;
      const shape = partner ? SwarmGraph.curve(a, b, middle, back) : SwarmGraph.line(a, b);
      edges.push({key: `${from}>${to}`, from, to, partner, ...shape});
    });
    const last = sites[sites.length - 1];
    return {width: SwarmGraph.WIDTH, height: last.y + last.height + top, sites, nodes, edges};
  }

  /**
   * A straight call between two agents of one site, from circle edge to circle edge.
   *
   * :param a: The calling node.
   * :param b: The called node.
   * :return: {d, arrow, mid}.
   */
  static line(a, b) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const start = {x: a.x + ux * a.r, y: a.y + uy * a.r};
    const end = {x: b.x - ux * (b.r + 2), y: b.y - uy * (b.r + 2)};
    return {
      d: `M${SwarmGraph.n(start.x)},${SwarmGraph.n(start.y)} L${SwarmGraph.n(end.x)},${SwarmGraph.n(end.y)}`,
      arrow: SwarmGraph.arrow(end, ux, uy),
      mid: {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2},
    };
  }

  /**
   * A call to another site: it leaves the caller sideways, runs along the side of the
   * boxes and enters the other site's front agent from that side. A front agent uses
   * the left side and a specialist the right, so the two lanes never cross.
   *
   * :param a: The calling node.
   * :param b: The called node, a front agent.
   * :param middle: The drawing's middle x.
   * :param back: True for a call back to a site that has called this one: it takes a
   *   second lane so the two curves do not lie on each other.
   * :return: {d, arrow, mid}.
   */
  static curve(a, b, middle, back = false) {
    const side = a.x > middle ? 1 : -1;
    const down = b.y > a.y ? 1 : -1;
    const start = {x: a.x + side * a.r, y: a.y + down * 3};
    const end = {x: b.x + side * (b.r + 2), y: b.y - down * 2};
    // The further the call goes, the wider it swings, so two calls from one agent part.
    const swing = Math.abs(end.y - start.y) > 150 ? 20 : 0;
    const cx = side > 0 ? 308 + swing : (back ? -3 : -19);
    const peak = 0.125 * start.x + 0.75 * cx + 0.125 * end.x;
    return {
      d: `M${SwarmGraph.n(start.x)},${SwarmGraph.n(start.y)} C${cx},${SwarmGraph.n(start.y)} ${cx},${SwarmGraph.n(end.y)} ${SwarmGraph.n(end.x)},${SwarmGraph.n(end.y)}`,
      arrow: SwarmGraph.arrow(end, -side, 0),
      mid: {x: peak, y: (start.y + end.y) / 2},
    };
  }

  /**
   * The three points of an arrowhead.
   *
   * :param tip: Where it points to.
   * :param ux: The direction's x, as a unit vector.
   * :param uy: The direction's y.
   * :return: The points, for a <polygon>.
   */
  static arrow(tip, ux, uy) {
    const back = {x: tip.x - ux * 6, y: tip.y - uy * 6};
    const points = [tip, {x: back.x - uy * 3, y: back.y + ux * 3}, {x: back.x + uy * 3, y: back.y - ux * 3}];
    return points.map((point) => `${SwarmGraph.n(point.x)},${SwarmGraph.n(point.y)}`).join(" ");
  }

  /**
   * Round a coordinate to one decimal place.
   *
   * :param value: The number.
   * :return: The rounded number.
   */
  static n(value) {
    return Math.round(value * 10) / 10;
  }

  /**
   * Work out what each agent, call and partner site did for one answer.
   *
   * :param turn: A turn from AnswerPath.build(), or null.
   * :return: {agents, edges, sites}: maps by agent key, by "caller>called" and by
   *   network name. An agent or a call that took no part is absent.
   */
  static activity(turn) {
    const act = {agents: new Map(), edges: new Map(), sites: new Map()};
    if (turn) {
      SwarmGraph.walk(turn.nodes, {caller: "", network: "", via: {}, turn}, act);
    }
    return act;
  }

  /**
   * Read some nodes of an answer's tree into the activity.
   *
   * :param nodes: Nodes from AnswerPath.
   * :param ctx: The calling agent's key and network, how the call was made (via: AAOSA
   *   mode, how many calls ran together, the partner request), and the turn.
   * :param act: The activity to fill.
   */
  static walk(nodes, ctx, act) {
    for (const node of nodes) {
      const caller = ctx.caller ? SwarmGraph.agentRecord(act, ctx.caller) : null;
      if (node.kind === "agent") {
        SwarmGraph.walkAgent(node, ctx, act);
      } else if (node.kind === "model" && caller) {
        caller.model = node.title.replace(/^Model: /, "");
        caller.modelCalls += node.calls || 0;
        if (node.error) {
          caller.notes.push(`Model call failed: ${node.error}`);
        }
      } else if ((node.kind === "action" || node.kind === "mcp") && caller) {
        caller[node.kind === "action" ? "actions" : "mcp"].push({name: node.name, args: node.detail || "", status: node.status, why: node.refusal || node.error || ""});
      } else if (node.kind === "partner") {
        // A partner call with nothing under it yet waits for the visitor's answer on the
        // consent card: nothing has been sent, so it must not look like it is working.
        const status = node.status === "running" && !node.children.length ? "asking" : node.status;
        const site = {status, consent: node.consent || "", host: node.host || "", ran: Boolean(node.ran), why: node.refusal || node.error || ""};
        act.sites.set(node.network, site);
        const front = SwarmMap.front(node.network);
        if (front && ctx.caller) {
          const edge = SwarmGraph.edgeRecord(act, ctx.caller, front);
          edge.status = SwarmGraph.worse(edge.status, status);
          edge.request = node.quote || edge.request;
          edge.why = site.consent || site.why || edge.why;
          edge.parallel = ctx.via.parallel || edge.parallel;
        }
        SwarmGraph.walk(node.children, {...ctx, via: {...ctx.via, request: node.quote || ""}}, act);
      } else if (node.kind === "parallel") {
        SwarmGraph.walk(node.children, {...ctx, via: {...ctx.via, parallel: node.children.length}}, act);
      } else if (node.kind === "aaosa") {
        const key = SwarmMap.key(ctx.network, node.agent);
        if (!node.children.some((child) => child.kind === "agent") && ctx.caller) {
          const edge = SwarmGraph.edgeRecord(act, ctx.caller, key);
          edge.status = SwarmGraph.worse(edge.status, node.status === "ok" ? "error" : node.status);
          edge.why = node.refusal || node.error || edge.why;
        }
        SwarmGraph.walk(node.children, {...ctx, via: {...ctx.via, mode: node.mode, request: node.asked || "", reply: node.reply || ""}}, act);
      } else if (caller && ["skip", "limit", "consent", "error", "tool"].includes(node.kind)) {
        caller.notes.push([node.title, node.detail, node.refusal, node.error].filter(Boolean).join(": "));
      }
    }
  }

  /**
   * Read one agent's node into the activity: the agent, the call that reached it, and
   * everything under it.
   *
   * :param node: An "agent" node from AnswerPath.
   * :param ctx: As for walk().
   * :param act: The activity to fill.
   */
  static walkAgent(node, ctx, act) {
    const network = node.network || ctx.network;
    const key = SwarmMap.key(network, node.agent);
    // AnswerPath gives an agent no network only when its call failed before it ran.
    const ran = Boolean(node.network);
    if (ctx.caller) {
      const edge = SwarmGraph.edgeRecord(act, ctx.caller, key);
      edge.count += 1;
      edge.status = SwarmGraph.worse(edge.status, node.status);
      edge.request = node.asked || ctx.via.request || edge.request;
      edge.parallel = ctx.via.parallel || edge.parallel;
      edge.why = node.refusal || node.error || edge.why;
      if (ctx.via.mode && !edge.modes.includes(ctx.via.mode)) {
        edge.modes.push(ctx.via.mode);
      }
      const caller = SwarmGraph.agentRecord(act, ctx.caller);
      if (!caller.called.includes(key)) {
        caller.called.push(key);
      }
    }
    if (!ran) {
      return;
    }
    const record = SwarmGraph.agentRecord(act, key);
    record.runs += 1;
    record.status = SwarmGraph.worse(record.status, node.status);
    record.durationMs += node.durationMs || 0;
    if (node.error) {
      record.notes.push(`Failed: ${node.error}`);
    }
    record.asks.push({
      from: ctx.caller,
      text: ctx.caller ? (node.asked || ctx.via.request || "") : AnswerPath.cut(ctx.turn.question),
      mode: ctx.via.mode || "",
      parallel: ctx.via.parallel || 0,
    });
    const replied = ctx.caller ? (node.replied || ctx.via.reply || "") : AnswerPath.cut(ctx.turn.answer);
    if (replied) {
      record.replied = replied;
    }
    SwarmGraph.walk(node.children, {...ctx, caller: key, network, via: {}}, act);
  }

  /**
   * Get an agent's record in the activity, making it when it is new.
   *
   * :param act: The activity.
   * :param key: The agent's key.
   * :return: The record.
   */
  static agentRecord(act, key) {
    if (!act.agents.has(key)) {
      act.agents.set(key, {status: "ok", runs: 0, asks: [], replied: "", model: "", modelCalls: 0, actions: [], mcp: [], called: [], notes: [], durationMs: 0});
    }
    return act.agents.get(key);
  }

  /**
   * Get a call's record in the activity, making it when it is new.
   *
   * :param act: The activity.
   * :param from: The calling agent's key.
   * :param to: The called agent's key.
   * :return: The record.
   */
  static edgeRecord(act, from, to) {
    const key = `${from}>${to}`;
    if (!act.edges.has(key)) {
      act.edges.set(key, {status: "ok", count: 0, modes: [], parallel: 0, request: "", why: ""});
    }
    return act.edges.get(key);
  }

  /**
   * Pick the worse of two statuses.
   *
   * :param a: A status: "ok", "asking", "running", "refused" or "error".
   * :param b: Another.
   * :return: The worse one.
   */
  static worse(a, b) {
    return (SwarmGraph.RANK[b] ?? 0) > (SwarmGraph.RANK[a] ?? 0) ? b : a;
  }

  /**
   * Say how an agent looks for one answer.
   *
   * :param key: The agent's key.
   * :param act: The answer's activity.
   * :return: "idle", "ok", "running", "refused" or "error". An agent that never ran
   *   but whose call was stopped or failed takes that call's status.
   */
  static agentState(key, act) {
    const record = act.agents.get(key);
    if (record && record.runs) {
      return record.status;
    }
    let state = "idle";
    for (const [edgeKey, edge] of act.edges) {
      if (edgeKey.endsWith(`>${key}`) && (edge.status === "refused" || edge.status === "error")) {
        state = SwarmGraph.worse(state === "idle" ? "ok" : state, edge.status);
      }
    }
    return state;
  }

  /**
   * Say what a site's box shows beside its name.
   *
   * :param network: The site's network name.
   * :param own: This page's network name.
   * :param act: The answer's activity.
   * :return: Such as "this site", "partner" or "partner · declined".
   */
  static siteStatus(network, own, act) {
    if (network === own) {
      return "this site";
    }
    const site = act.sites.get(network);
    const ran = [...act.agents.entries()].some(([key, record]) => key.startsWith(`${network}/`) && record.runs);
    if (!site) {
      return ran ? "partner · ran here" : "partner";
    }
    if (site.status === "refused") {
      return /declined/.test(`${site.consent} ${site.why}`) ? "partner · declined" : "partner · stopped";
    }
    if (site.status === "error") {
      return "partner · failed";
    }
    if (site.status === "asking") {
      return "partner · asking you";
    }
    return site.status === "running" ? "partner · working" : "partner · ran here";
  }

  /**
   * Shorten an agent key to the agent's name.
   *
   * :param key: The key.
   * :return: The name, such as "tariff_advisor".
   */
  static short(key) {
    return key.split("/").pop();
  }

  /**
   * Cut a text to MAX_QUOTE characters and put it in quotation marks.
   *
   * :param text: The text.
   * :return: The quote, ending in "…" when it was cut.
   */
  static quote(text) {
    const value = String(text || "").trim();
    return `“${value.length > SwarmGraph.MAX_QUOTE ? `${value.slice(0, SwarmGraph.MAX_QUOTE - 1)}…` : value}”`;
  }

  /**
   * List names once each, with how often each came up, such as "check_scheme ×2".
   *
   * :param names: The names, with repeats.
   * :return: The list as text.
   */
  static tally(names) {
    const counts = new Map();
    for (const name of names) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(", ");
  }

  /**
   * Say in a few words how the visitor answered a partner's consent card.
   *
   * :param sentence: AnswerPath's consent sentence, or "".
   * :return: Such as "you allowed it", or "".
   */
  static consentWords(sentence) {
    if (/rest of this visit|earlier/.test(sentence)) {
      return "allowed for this visit";
    }
    if (/declined/.test(sentence)) {
      return "you declined";
    }
    return sentence ? "you allowed it" : "";
  }

  /**
   * Describe an answer in one short line, such as "10 agents · 3 sites · 5 tools ·
   * 16 model calls · 8.2 s".
   *
   * :param turn: A turn from AnswerPath.build().
   * :param act: The turn's activity. An agent that ran twice counts once.
   * :return: The line.
   */
  static brief(turn, act) {
    const count = (number, one, many) => `${number} ${number === 1 ? one : many}`;
    const agents = [...act.agents.values()].filter((record) => record.runs).length;
    const parts = [count(agents, "agent", "agents"), count(turn.counts.sites, "site", "sites")];
    const tools = turn.counts.actions + turn.counts.mcp;
    if (tools) {
      parts.push(count(tools, "tool", "tools"));
    }
    parts.push(count(turn.counts.modelCalls, "model call", "model calls"));
    if (turn.durationMs !== null) {
      parts.push(`${(turn.durationMs / 1000).toFixed(1)} s`);
    }
    if (turn.status !== "ok") {
      parts.push(turn.status === "running" ? "working…" : "failed");
    }
    return parts.join(" · ");
  }

  /**
   * Write what one agent did for an answer, as the few lines of its tooltip: who asked
   * it what, the tools it used, who it asked in turn, its reply, and one line of facts.
   *
   * :param key: The agent's key.
   * :param act: The answer's activity.
   * :param turn: The answer's turn, or null before the first message.
   * :param own: This page's network name.
   * :return: {title, subtitle, rows}. Each row has label, text and, for a problem,
   *   tone "bad".
   */
  static agentLines(key, act, turn, own) {
    const agent = SwarmMap.agent(key);
    const site = SwarmMap.site(agent.network);
    const rows = [];
    const result = {title: agent.name, subtitle: `${site.icon} ${site.name}`, rows};
    const record = act.agents.get(key);
    if (!record || !record.runs) {
      rows.push({label: "", text: agent.does});
      const call = [...act.edges.entries()].find(([edgeKey, edge]) => edgeKey.endsWith(`>${key}`) && edge.status !== "ok");
      if (!turn) {
        return result;
      }
      if (call && call[1].status === "asking") {
        rows.push({label: "Waiting", text: "for your answer in the chat. Nothing has been sent."});
      } else if (call && call[1].status === "running") {
        rows.push({label: "Starting", text: "its network is loading from its site."});
      } else if (call) {
        rows.push({label: "Did not run", text: call[1].why || "Its call was stopped.", tone: "bad"});
      } else {
        rows.push({label: "", text: "Not needed for this answer."});
      }
      return result;
    }
    // One row per caller and request: an AAOSA Determine and Fulfill share theirs.
    const asks = [];
    for (const ask of record.asks) {
      let same = asks.find((item) => item.from === ask.from && item.text === ask.text);
      if (!same) {
        same = {from: ask.from, text: ask.text, modes: [], parallel: 0};
        asks.push(same);
      }
      if (ask.mode && !same.modes.includes(ask.mode)) {
        same.modes.push(ask.mode);
      }
      same.parallel = ask.parallel || same.parallel;
    }
    for (const ask of asks.slice(0, SwarmGraph.MAX_ROWS)) {
      const how = [ask.modes.length ? `AAOSA ${ask.modes.join(" + ")}` : "", ask.parallel ? "in parallel" : ""].filter(Boolean).join(", ");
      const who = ask.from ? `From ${SwarmGraph.short(ask.from)}` : "You asked";
      rows.push({label: how ? `${who} (${how})` : who, text: ask.text ? SwarmGraph.quote(ask.text) : "(no request text)"});
    }
    const tools = [...record.actions, ...record.mcp];
    if (tools.length) {
      rows.push({label: "Used", text: SwarmGraph.tally(tools.map((tool) => tool.name))});
    }
    for (const tool of tools.filter((item) => item.status !== "ok" && item.status !== "running").slice(0, SwarmGraph.MAX_ROWS)) {
      rows.push({label: tool.name, text: tool.why || "stopped", tone: "bad"});
    }
    if (record.called.length) {
      rows.push({label: "Asked", text: record.called.map(SwarmGraph.short).join(", ")});
    }
    if (record.replied) {
      rows.push({label: "Replied", text: SwarmGraph.quote(record.replied)});
    }
    for (const note of record.notes.slice(0, SwarmGraph.MAX_ROWS)) {
      rows.push({label: "Note", text: note, tone: "bad"});
    }
    const facts = [];
    if (record.status === "running") {
      facts.push("working now");
    }
    if (agent.network !== own) {
      facts.push(["ran in your browser", SwarmGraph.consentWords(act.sites.get(agent.network)?.consent || "")].filter(Boolean).join(", "));
    }
    if (record.modelCalls) {
      facts.push(record.modelCalls === 1 ? "1 model call" : `${record.modelCalls} model calls`);
    }
    if (record.durationMs >= 50) {
      facts.push(`${(record.durationMs / 1000).toFixed(1)} s`);
    }
    if (facts.length) {
      rows.push({label: "", text: facts.join(" · "), tone: "quiet"});
    }
    return result;
  }

  /**
   * Write what one call did for an answer, as the few lines of its tooltip.
   *
   * :param edge: An edge from layout().
   * :param act: The answer's activity.
   * :param turn: The answer's turn, or null before the first message.
   * :return: {title, subtitle, rows}, as for agentLines().
   */
  static edgeLines(edge, act, turn) {
    const rows = [];
    const result = {title: `${SwarmGraph.short(edge.from)} → ${SwarmGraph.short(edge.to)}`, subtitle: edge.partner ? "to another site" : "", rows};
    const record = act.edges.get(edge.key);
    if (!record) {
      if (edge.partner) {
        rows.push({label: "", text: "Asks you first. Only the request text is sent."});
      }
      if (turn) {
        rows.push({label: "", text: "Not used for this answer."});
      }
      return result;
    }
    if (record.request) {
      rows.push({label: "Sent", text: SwarmGraph.quote(record.request)});
    }
    const stopped = record.status === "refused" || record.status === "error";
    if (stopped) {
      rows.push({label: "Stopped", text: record.why || "The call did not run.", tone: "bad"});
    }
    const facts = [];
    if (record.status === "asking") {
      facts.push("waiting for your answer, nothing sent");
    }
    if (record.status === "running") {
      facts.push("working now");
    }
    if (record.count > 1) {
      facts.push(`used ${record.count} times`);
    }
    if (record.modes.length) {
      facts.push(`AAOSA ${record.modes.join(" + ")}`);
    }
    if (record.parallel) {
      facts.push("in parallel");
    }
    if (edge.partner && !stopped && record.why) {
      facts.push(SwarmGraph.consentWords(record.why));
    }
    if (facts.length) {
      rows.push({label: "", text: facts.join(" · "), tone: "quiet"});
    }
    return result;
  }

  /**
   * Describe an agent's state in a few words, for screen readers.
   *
   * :param state: A state from agentState().
   * :return: The words.
   */
  static stateWords(state) {
    return {idle: "not used for this answer", ok: "worked on this answer", running: "working now", refused: "stopped", error: "failed"}[state] || "";
  }

  /**
   * Find which answer a chat message belongs to. The chat lists the visitor's messages
   * in order, and "New chat" removes the old ones, so messages are matched from the
   * newest back and checked against the question's text.
   *
   * :param bubbles: The text of each of the visitor's messages in the chat, oldest
   *   first, without notes added while an answer ran.
   * :param position: Which of them the visitor points at, from 0.
   * :param turns: The turns from AnswerPath.build().
   * :return: The turn's index, or -1 when the message matches none.
   */
  static turnOfBubble(bubbles, position, turns) {
    const index = turns.length - (bubbles.length - position);
    if (index < 0 || index >= turns.length) {
      return -1;
    }
    return turns[index].question.trim() === String(bubbles[position]).trim() ? index : -1;
  }

  /**
   * Draw the graph in a page element. It shows every agent as not used until update()
   * gives it turns.
   *
   * :param root: The element to fill, such as <aside id="swarm-map">.
   * :param own: This page's network name, such as "emberwick_energy".
   */
  constructor(root, own) {
    this.root = root;
    this.own = own;
    this.doc = root.ownerDocument;
    this.turns = [];
    this.pinned = null;
    this.preview = null;
    this.tipFor = null;
    this.tipPinned = false;
    // Called with the turn on show, or null, whenever that changes.
    this.onSelect = null;
    this.shown = undefined;
    this.act = SwarmGraph.activity(null);
    this.plan = SwarmGraph.layout();
    this.nodeEls = new Map();
    this.edgeEls = new Map();
    this.siteEls = new Map();
    this.build();
    this.apply();
  }

  /**
   * Make an HTML element.
   *
   * :param name: The tag name.
   * :param className: Its class.
   * :param text: Its text, if any.
   * :return: The element.
   */
  html(name, className, text) {
    const element = this.doc.createElement(name);
    element.className = className;
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  /**
   * Make an SVG element.
   *
   * :param name: The tag name.
   * :param attrs: Its attributes.
   * :param text: Its text, if any.
   * :return: The element.
   */
  svg(name, attrs, text) {
    const element = this.doc.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attrs || {})) {
      element.setAttribute(key, String(value));
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  /**
   * Build the panel once: the answer buttons, the question and counts, the drawing, the
   * tooltip and the key. Later changes only set attributes and text.
   */
  build() {
    const {plan} = this;
    this.chips = this.html("div", "swarm-turns");
    this.chips.setAttribute("role", "group");
    this.chips.setAttribute("aria-label", "Show the path of answer");
    this.caption = this.html("p", "swarm-caption");
    this.counts = this.html("p", "swarm-counts");
    this.stage = this.html("div", "swarm-stage");
    const drawing = this.svg("svg", {viewBox: `0 0 ${plan.width} ${plan.height}`, class: "swarm-svg", role: "group", "aria-label": "The swarm: 11 agents on 3 sites"});
    const defs = this.svg("defs", {});
    const orb = (id, light, dark) => {
      const gradient = this.svg("radialGradient", {id, cx: "35%", cy: "30%", r: "75%"});
      gradient.append(this.svg("stop", {offset: "0%", "stop-color": "#ffffff"}), this.svg("stop", {offset: "38%", "stop-color": light}), this.svg("stop", {offset: "100%", "stop-color": dark}));
      defs.append(gradient);
    };
    orb("swarm-orb-idle", "#64748b", "#1e293b");
    const grid = this.svg("pattern", {id: "swarm-grid", width: 16, height: 16, patternUnits: "userSpaceOnUse"});
    grid.append(this.svg("circle", {cx: 1, cy: 1, r: 0.6, class: "swarm-grid-dot"}));
    defs.append(grid);
    const boxes = this.svg("g", {});
    boxes.append(this.svg("rect", {x: 0, y: 0, width: plan.width, height: plan.height, fill: "url(#swarm-grid)"}));
    const edges = this.svg("g", {});
    const labels = this.svg("g", {});
    const nodes = this.svg("g", {});
    for (const site of plan.sites) {
      orb(`swarm-orb-${site.network}`, site.glow, site.color);
      const group = this.svg("g", {class: "swarm-site", style: `--site: ${site.glow}`});
      group.append(this.svg("rect", {x: site.x, y: site.y, width: site.width, height: site.height, rx: 10}));
      boxes.append(group);
      const label = this.svg("g", {class: "swarm-site-label", style: `--site: ${site.glow}`});
      const status = this.svg("text", {x: site.x + site.width - 10, y: site.y + 19, class: "swarm-site-status", "text-anchor": "end"});
      label.append(this.svg("text", {x: site.x + 12, y: site.y + 19, class: "swarm-site-name"}, `${site.icon} ${site.name}`), status);
      labels.append(label);
      this.siteEls.set(site.network, {group, label, status});
    }
    for (const edge of plan.edges) {
      const color = SwarmMap.site(plan.nodes.get(edge.from).network).glow;
      const group = this.svg("g", {class: `swarm-edge${edge.partner ? " swarm-partner" : ""}`, style: `--site: ${color}`, "data-state": "idle"});
      group.append(
        this.svg("path", {d: edge.d, class: "swarm-edge-line"}),
        this.svg("polygon", {points: edge.arrow, class: "swarm-edge-arrow"}),
        // Two sparks travel along a call that is working, or worked, on the answer.
        this.svg("circle", {r: 2.2, class: "swarm-spark", style: `offset-path: path("${edge.d}")`}),
        this.svg("circle", {r: 2.2, class: "swarm-spark swarm-spark-late", style: `offset-path: path("${edge.d}")`}),
        this.svg("path", {d: edge.d, class: "swarm-edge-hit"}),
      );
      group.addEventListener("mouseenter", () => this.showTip({edge}, false));
      group.addEventListener("mouseleave", () => this.hideTip(false));
      edges.append(group);
      this.edgeEls.set(edge.key, group);
    }
    for (const node of plan.nodes.values()) {
      const site = SwarmMap.site(node.network);
      const group = this.svg("g", {class: `swarm-node${node.front ? " swarm-front" : ""}`, style: `--site: ${site.glow}`, tabindex: 0, role: "button", "data-state": "idle", "aria-describedby": "swarm-tip"});
      group.append(
        this.svg("circle", {cx: node.x, cy: node.y, r: node.r + 5, class: "swarm-node-halo"}),
        this.svg("circle", {cx: node.x, cy: node.y, r: node.r + 4, class: "swarm-node-ring"}),
        this.svg("circle", {cx: node.x, cy: node.y, r: node.r, class: "swarm-node-dot", fill: "url(#swarm-orb-idle)"}),
        this.svg("circle", {cx: node.x, cy: node.y, r: node.r, class: "swarm-node-lit", fill: `url(#swarm-orb-${node.network})`}),
      );
      if (node.front) {
        group.append(this.svg("text", {x: node.x, y: node.y + 5, class: "swarm-node-icon", "text-anchor": "middle", "aria-hidden": "true"}, node.icon));
      } else {
        group.append(this.svg("text", {x: node.x, y: node.y + node.r + 14, class: "swarm-node-label", "text-anchor": "middle", "aria-hidden": "true"}, node.label));
      }
      const badge = this.svg("text", {x: node.x + node.r + 2, y: node.y - node.r + 3, class: "swarm-node-count", "aria-hidden": "true"});
      group.append(badge);
      group.addEventListener("mouseenter", () => this.showTip({node}, false));
      group.addEventListener("mouseleave", () => this.hideTip(false));
      group.addEventListener("focus", () => this.showTip({node}, false));
      group.addEventListener("blur", () => this.hideTip(false));
      group.addEventListener("click", (event) => {
        event.stopPropagation();
        this.togglePin({node});
      });
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.togglePin({node});
        }
      });
      nodes.append(group);
      this.nodeEls.set(node.key, {group, badge});
    }
    drawing.append(defs, boxes, edges, labels, nodes);
    this.tilt(drawing);
    this.tip = this.html("div", "swarm-tip");
    this.tip.id = "swarm-tip";
    this.tip.setAttribute("role", "tooltip");
    this.tip.hidden = true;
    this.stage.append(drawing, this.tip);
    const key = this.html("p", "swarm-key");
    for (const [className, text] of [["swarm-key-used", "worked on the answer"], ["swarm-key-idle", "not needed"], ["swarm-key-partner", "asks you first"]]) {
      key.append(this.html("span", className, text));
    }
    this.root.append(this.chips, this.caption, this.counts, this.stage, key);
    this.doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.hideTip(true);
      }
    });
    this.doc.addEventListener("click", () => this.hideTip(true));
    this.tip.addEventListener("click", (event) => event.stopPropagation());
  }

  /**
   * Tilt the drawing a little towards the pointer, for a sense of depth. The stylesheet
   * turns the two angles into a 3D rotation. Off when the visitor asks for less motion.
   *
   * :param drawing: The <svg>.
   */
  tilt(drawing) {
    const view = this.doc.defaultView;
    if (!view || !view.matchMedia || view.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    this.stage.addEventListener("mousemove", (event) => {
      const box = this.stage.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      drawing.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
      drawing.style.setProperty("--tilt-y", `${(x * 9).toFixed(2)}deg`);
    });
    this.stage.addEventListener("mouseleave", () => {
      drawing.style.removeProperty("--tilt-x");
      drawing.style.removeProperty("--tilt-y");
    });
  }

  /**
   * Take the newest turns and redraw.
   *
   * :param turns: The turns from AnswerPath.build().
   */
  update(turns) {
    this.turns = turns || [];
    if (this.pinned !== null && this.pinned >= this.turns.length) {
      this.pinned = null;
    }
    if (this.preview !== null && this.preview >= this.turns.length) {
      this.preview = null;
    }
    this.apply();
  }

  /**
   * The answer on show: the one the visitor points at in the chat, else the one they
   * picked, else the newest.
   *
   * :return: The turn's index, or -1 before the first message.
   */
  selected() {
    if (this.preview !== null) {
      return this.preview;
    }
    return this.pinned !== null ? this.pinned : this.turns.length - 1;
  }

  /**
   * Show the chosen answer's path: set each agent's and call's state, the site labels,
   * the answer buttons, the question and the counts.
   */
  apply() {
    const index = this.selected();
    const turn = index >= 0 ? this.turns[index] : null;
    this.act = SwarmGraph.activity(turn);
    this.root.dataset.turn = turn ? "yes" : "no";
    for (const [key, {group, badge}] of this.nodeEls) {
      const state = turn ? SwarmGraph.agentState(key, this.act) : "idle";
      group.setAttribute("data-state", state);
      const runs = this.act.agents.get(key)?.runs || 0;
      badge.textContent = runs > 1 ? `×${runs}` : "";
      const agent = SwarmMap.agent(key);
      group.setAttribute("aria-label", `${agent.name}, ${SwarmMap.site(agent.network).name}${turn ? `: ${SwarmGraph.stateWords(state)}` : ""}`);
    }
    for (const [key, group] of this.edgeEls) {
      group.setAttribute("data-state", this.act.edges.get(key)?.status || "idle");
    }
    for (const [network, {group, label, status}] of this.siteEls) {
      const text = SwarmGraph.siteStatus(network, this.own, this.act);
      status.textContent = text;
      const active = network === this.own || text !== "partner";
      group.setAttribute("data-active", String(active));
      label.setAttribute("data-active", String(active));
    }
    this.drawChips(index);
    this.caption.textContent = turn ? `“${AnswerPath.cut(turn.question)}”` : "Ask something: the agents that work on it light up here.";
    this.caption.title = turn ? turn.question : "";
    this.counts.textContent = turn ? SwarmGraph.brief(turn, this.act) : "11 agents on 3 sites.";
    const model = [...this.act.agents.values()].find((record) => record.model)?.model || "";
    this.counts.title = turn ? [AnswerPath.summary(turn), model ? `Model: ${model}` : ""].filter(Boolean).join("\n") : "";
    if (this.onSelect && (turn !== this.shown || turn?.status === "running")) {
      this.onSelect(turn);
    }
    this.shown = turn;
    if (this.tipFor) {
      this.fillTip();
    }
  }

  /**
   * Draw one numbered button per answer. The newest follows the conversation until the
   * visitor picks one. Picking the chosen one again goes back to the newest.
   *
   * :param index: The answer on show.
   */
  drawChips(index) {
    this.chips.hidden = this.turns.length < 2;
    while (this.chips.children.length > this.turns.length) {
      this.chips.lastElementChild.remove();
    }
    while (this.chips.children.length < this.turns.length) {
      const chip = this.html("button", "swarm-turn", String(this.chips.children.length + 1));
      chip.type = "button";
      const position = this.chips.children.length;
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        this.pinned = this.pinned === position || position === this.turns.length - 1 ? null : position;
        this.apply();
      });
      this.chips.append(chip);
    }
    [...this.chips.children].forEach((chip, position) => {
      const turn = this.turns[position];
      chip.setAttribute("aria-pressed", String(position === index));
      chip.dataset.status = turn.status;
      chip.title = `Answer ${position + 1}: ${AnswerPath.cut(turn.question)}`;
      chip.setAttribute("aria-label", chip.title);
    });
  }

  /**
   * Let the visitor point at a chat message to see its answer's path. Moving away goes
   * back to the answer that was on show.
   *
   * :param messages: The chat's message list, the runtime's #ns-msgs.
   */
  linkChat(messages) {
    const own = (element) => [...messages.children].find((child) => child.contains(element));
    messages.addEventListener("mouseover", (event) => {
      const mine = ".ns-msg.user:not(.ns-steering-message)";
      let bubble = own(event.target);
      while (bubble && !bubble.matches(mine)) {
        bubble = bubble.previousElementSibling;
      }
      const bubbles = [...messages.querySelectorAll(mine)];
      const found = bubble ? SwarmGraph.turnOfBubble(bubbles.map((item) => item.textContent), bubbles.indexOf(bubble), this.turns) : -1;
      const next = found >= 0 ? found : null;
      if (next !== this.preview) {
        this.preview = next;
        this.apply();
      }
    });
    messages.addEventListener("mouseleave", () => {
      if (this.preview !== null) {
        this.preview = null;
        this.apply();
      }
    });
  }

  /**
   * Show the tooltip for an agent or a call.
   *
   * :param target: {node} or {edge}, from layout().
   * :param pin: True to keep it open until the visitor closes it.
   */
  showTip(target, pin) {
    if (this.tipPinned && !pin) {
      return;
    }
    this.tipFor = target;
    this.tipPinned = pin;
    this.fillTip();
  }

  /**
   * Keep an agent's tooltip open, or close it when it is already kept open. This is how
   * a touch screen and the keyboard read it.
   *
   * :param target: {node}.
   */
  togglePin(target) {
    if (this.tipPinned && this.tipFor?.node === target.node) {
      this.hideTip(true);
    } else {
      this.showTip(target, true);
    }
  }

  /**
   * Hide the tooltip.
   *
   * :param force: True to hide it even when it is kept open.
   */
  hideTip(force) {
    if (this.tipPinned && !force) {
      return;
    }
    this.tipFor = null;
    this.tipPinned = false;
    this.tip.hidden = true;
  }

  /**
   * Write the tooltip for the agent or call on show, and place it under or over it so
   * it never covers what it describes. All text goes in as text, never HTML.
   */
  fillTip() {
    const {node, edge} = this.tipFor;
    const index = this.selected();
    const turn = index >= 0 ? this.turns[index] : null;
    const lines = node ? SwarmGraph.agentLines(node.key, this.act, turn, this.own) : SwarmGraph.edgeLines(edge, this.act, turn);
    const head = this.html("p", "swarm-tip-head");
    head.append(this.html("strong", "", lines.title), " ", this.html("span", "", lines.subtitle));
    this.tip.replaceChildren(head);
    for (const row of lines.rows) {
      const line = this.html("p", `swarm-tip-row${row.tone ? ` swarm-tip-${row.tone}` : ""}`);
      if (row.label) {
        line.append(this.html("span", "swarm-tip-label", `${row.label}: `));
      }
      line.append(row.text);
      this.tip.append(line);
    }
    this.tip.dataset.pinned = String(this.tipPinned);
    this.tip.hidden = false;
    const scale = this.stage.clientWidth / this.plan.width;
    const y = node ? node.y : edge.mid.y;
    const reach = node ? node.r + (node.front ? 6 : 20) : 8;
    if (y > this.plan.height * 0.55) {
      this.tip.style.top = "";
      this.tip.style.bottom = `${Math.round((this.plan.height - y + reach) * scale + 4)}px`;
    } else {
      this.tip.style.bottom = "";
      this.tip.style.top = `${Math.round((y + reach) * scale + 4)}px`;
    }
  }
}
