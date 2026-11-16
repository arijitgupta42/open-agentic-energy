// Reads the runtime's execution trace into one tree per visitor message (spec 5,
// "Observable execution"): which agent ran on which site, which site actions, MCP tools
// and partner networks it used, the consent decisions, the model and router, any
// refusal or error, and the answer. For a swarm it also finds which calls ran at the
// same time and each AAOSA question (Determine) and job (Fulfill).
//
// js/swarm-graph.js draws these turns as the graph beside the chat. This file draws
// nothing itself.
//
// It reads the trace that runtime/index.js boot() returns and never edits the runtime.
// It holds the key only as the runtime describes it ("local BYOK (not shown)"). What it
// builds stays on this page: nothing here sends or logs it.
//
// This file is the same on all three sites. sites/utility/tests/answer-path.test.mjs
// checks that the copies match.

/**
 * Turns trace events into a tree per visitor message.
 */
export class AnswerPath {
  /**
   * The longest argument or request text shown before it is cut, in characters.
   */
  static MAX_TEXT = 160;

  /**
   * Build one path per visitor message from the runtime's trace events.
   *
   * :param events: The trace's events (trace.events), oldest first. Each has phase
   *   "start", "update", "end" or "note", a kind, and the runtime's span fields.
   * :param pageHost: This page's host, such as "emberwick.example". Agents on another
   *   host belong to a partner's network, which ran in this browser.
   * :return: {turns, setup}. Each turn has question, answer, status, error, durationMs,
   *   counts, nodes, and seq and endSeq: the trace sequence numbers it spans. setup lists failures before any message, such as a network
   *   that did not load.
   */
  static build(events, pageHost) {
    const spans = new Map();
    const items = [];
    for (const event of events || []) {
      if (event.phase === "note") {
        items.push({note: true, seq: event.seq, ...event});
        continue;
      }
      let span = spans.get(event.id);
      if (!span) {
        span = {note: false, seq: event.seq, endSeq: null, children: []};
        spans.set(event.id, span);
        items.push(span);
      }
      const {phase, seq, t, wall, streamChunk, ...fields} = event;
      Object.assign(span, fields);
      if (phase === "end") {
        span.endSeq = seq;
      }
    }
    const runs = items.filter((item) => !item.note && item.kind === "run");
    for (const item of items) {
      let parent = item.parent ? spans.get(item.parent) : null;
      if (!parent && item.note) {
        // A note this page adds, such as an allowed partner, carries no parent. It
        // belongs to the message that was running when it was added.
        parent = runs.find((run) => run.seq < item.seq && (run.endSeq === null || item.seq < run.endSeq)) || null;
      }
      if (parent) {
        parent.children.push(item);
      }
    }
    const state = {pageHost: pageHost || "", always: new Set()};
    const turns = [];
    for (const run of runs) {
      turns.push(AnswerPath.turn(run, state));
    }
    const setup = [];
    for (const item of items) {
      if (!item.note && item.kind === "compile" && item.status === "error") {
        setup.push({kind: "error", title: `The ${item.what || "network"} on ${item.origin} could not load`, error: item.error, status: "error", children: []});
      }
    }
    return {turns, setup};
  }

  /**
   * Build the path of one visitor message.
   *
   * :param run: The message's "run" span, with its children.
   * :param state: What carries from one message to the next: the page host, and the
   *   partner hosts the visitor chose to always allow.
   * :return: The turn.
   */
  static turn(run, state) {
    const counts = {agents: 0, sites: 0, actions: 0, mcp: 0, partners: 0, modelCalls: 0, parallel: 0, determine: 0, fulfill: 0};
    const consents = run.children.filter((child) => child.note && child.kind === "consent" && child.page);
    const origins = new Set();
    const nodes = AnswerPath.nodes(run.children, {...state, counts, consents, origins});
    counts.sites = origins.size;
    return {
      question: run.input || "",
      answer: AnswerPath.plain(run.answerPreview),
      status: run.status === "error" ? "error" : (run.endSeq === null ? "running" : "ok"),
      error: run.error || "",
      durationMs: run.durationMs ?? null,
      seq: run.seq,
      endSeq: run.endSeq,
      counts,
      nodes,
    };
  }

  /**
   * Turn a span's children into nodes, in the order they happened.
   *
   * :param children: Spans and notes under one parent.
   * :param ctx: The page host, counts, this message's consent notes and the always-
   *   allowed hosts.
   * :return: The nodes. Each has kind, title, status and children, and may have
   *   detail, quote, consent and error.
   */
  static nodes(children, ctx) {
    const nodes = [];
    const models = children.filter((child) => !child.note && child.kind === "model_call");
    if (models.length) {
      nodes.push(AnswerPath.modelNode(models, ctx));
    }
    const groups = AnswerPath.parallelGroups(children);
    const add = (list, node) => {
      if (Array.isArray(node)) {
        list.push(...node);
      } else if (node) {
        list.push(node);
      }
    };
    for (const child of children) {
      const group = groups.get(child);
      if (!group) {
        add(nodes, AnswerPath.node(child, ctx));
      } else if (group[0] === child) {
        nodes.push(AnswerPath.parallelNode(group, ctx, add));
      }
    }
    return nodes;
  }

  /**
   * Find the tool calls that ran at the same time: a call that started before an earlier
   * one under the same agent ended. The runtime runs the calls a model asks for in one
   * step together, unless one of them must run alone.
   *
   * :param children: Spans and notes under one parent, in the order they started.
   * :return: A map from each tool span in a group of two or more to its group.
   */
  static parallelGroups(children) {
    const groups = new Map();
    let group = [];
    let open = -1;
    const close = () => {
      if (group.length > 1) {
        for (const member of group) {
          groups.set(member, group);
        }
      }
    };
    for (const child of children) {
      if (child.note || child.kind !== "tool") {
        continue;
      }
      if (group.length && child.seq < open) {
        group.push(child);
      } else {
        close();
        group = [child];
        open = -1;
      }
      open = Math.max(open, child.endSeq === null ? Infinity : child.endSeq);
    }
    close();
    return groups;
  }

  /**
   * Show tool calls that ran at the same time as one node holding each call's nodes.
   *
   * :param group: The tool spans, in the order they started.
   * :param ctx: As for nodes().
   * :param add: Adds a node, a list of nodes or nothing to a list.
   * :return: The node.
   */
  static parallelNode(group, ctx, add) {
    ctx.counts.parallel += 1;
    const children = [];
    for (const span of group) {
      add(children, AnswerPath.node(span, ctx));
    }
    const statuses = children.map((child) => child.status);
    return {
      kind: "parallel",
      title: `${group.length} calls at the same time`,
      detail: "Asked for in one step and run together by the runtime.",
      status: statuses.includes("error") ? "error" : (statuses.includes("running") ? "running" : "ok"),
      children: children,
    };
  }

  /**
   * Summarise one agent's model calls in a single line: model, router and key source.
   *
   * :param models: The agent's "model_call" spans.
   * :param ctx: Holds the counts.
   * :return: The model node.
   */
  static modelNode(models, ctx) {
    ctx.counts.modelCalls += models.length;
    const lines = [];
    for (const call of models) {
      const line = call.mock
        ? `${call.model || "mock"} on the in-page mock model (no provider, no key)`
        : `${call.model} via ${call.routerHost} · key: ${call.keySource || "none"}`;
      if (!lines.includes(line)) {
        lines.push(line);
      }
    }
    const failed = models.find((call) => call.status === "error");
    const calls = models.length === 1 ? "1 call" : `${models.length} calls`;
    return {
      kind: "model",
      calls: models.length,
      title: `Model: ${lines.join("; ")}`,
      detail: calls,
      status: failed ? "error" : "ok",
      error: failed ? failed.error : "",
      children: [],
    };
  }

  /**
   * Turn one span or note into a node, or into nothing when it adds nothing a visitor
   * needs, such as a stream update or a tool result already shown on its tool.
   *
   * :param item: A span or a note.
   * :param ctx: As for nodes().
   * :return: A node, a list of nodes, or null.
   */
  static node(item, ctx) {
    if (item.note) {
      return AnswerPath.noteNode(item);
    }
    if (item.kind === "agent") {
      ctx.counts.agents += 1;
      if (item.origin) {
        ctx.origins.add(item.origin);
      }
      const partner = ctx.pageHost && item.origin && item.origin !== ctx.pageHost;
      return {
        kind: "agent",
        agent: item.agent,
        network: item.network || "",
        origin: item.origin || "",
        durationMs: item.durationMs ?? null,
        title: `Agent ${item.agent} on ${item.origin}`,
        detail: partner ? "A partner's agent, run in this browser on your model and router." : "",
        status: AnswerPath.status(item),
        error: item.error || "",
        children: AnswerPath.nodes(item.children, ctx),
      };
    }
    if (item.kind === "tool") {
      return AnswerPath.toolNode(item, ctx);
    }
    if (item.kind === "remote_fetch") {
      return {
        kind: "fetch",
        title: `Fetched ${item.network || "the network"} from ${item.peerOrigin}`,
        detail: "Its public manifest and network definition, with no key or cookies.",
        status: AnswerPath.status(item),
        error: item.error || "",
        children: [],
      };
    }
    if (item.kind === "remote_call") {
      // Its agents follow the partner node directly: one level less to read.
      return AnswerPath.nodes(item.children, ctx);
    }
    if (item.kind === "mcp_call" && item.status === "error") {
      return {kind: "error", title: `MCP ${item.method} at ${item.peerOrigin} failed`, status: "error", error: item.error || "", children: []};
    }
    return null;
  }

  /**
   * Turn a runtime note into a node: a declined consent card, a step the runtime
   * skipped, or a limit it enforced.
   *
   * :param note: The note.
   * :return: A node, or null for notes that add nothing here.
   */
  static noteNode(note) {
    if (note.page) {
      // This page's own record of a consent card: shown on its partner node instead.
      return null;
    }
    if (note.kind === "consent" && note.decision === "declined") {
      return {kind: "consent", title: `You declined contact with ${note.peerOrigin}`, detail: "Nothing was sent there.", status: "refused", children: []};
    }
    if (note.kind === "composition_skip") {
      // Noted while the agent's tools are listed: the runtime does not offer a network
      // already in this request's chain, such as a partner's link back to the caller.
      // Nothing was attempted, so it is not shown as stopped.
      return {kind: "skip", title: `Not offered ${AnswerPath.networkName(note.target)}`, detail: `The runtime left it out: ${note.reason || "already in this request"}.`, status: "ok", children: []};
    }
    if (note.kind === "composition_limit") {
      return {kind: "limit", title: "Stopped by the runtime", detail: note.reason || "", status: "refused", children: []};
    }
    return null;
  }

  /**
   * Name a network URL by its last path part and host, such as
   * "emberwick_energy at emberwick.example".
   *
   * :param target: The network URL, or anything else the runtime noted.
   * :return: The name.
   */
  static networkName(target) {
    try {
      const url = new URL(String(target));
      const name = url.pathname.split("/").filter(Boolean).pop();
      return name ? `${name} at ${url.host}` : url.host;
    } catch {
      return String(target || "a network");
    }
  }

  /**
   * Turn a reply's Markdown into plain text for a one-line preview: drop emphasis,
   * code marks and heading marks.
   *
   * :param text: The reply.
   * :return: The plain text.
   */
  static plain(text) {
    return String(text || "")
      .replace(/(\*\*|__|`)/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Turn one tool call into a node: a site action, an MCP tool, an internal agent or a
   * partner network.
   *
   * :param span: The "tool" span.
   * :param ctx: As for nodes().
   * :return: A node, or the called agent's nodes for an internal agent.
   */
  static toolNode(span, ctx) {
    const name = span.tool || "";
    const status = AnswerPath.status(span);
    const refusal = AnswerPath.refusal(span);
    const base = {
      status: refusal ? "refused" : status,
      error: span.error || "",
      detail: "",
      children: [],
    };
    if (refusal) {
      base.refusal = refusal;
    }
    if (span.toolKind === "agent" && span.args && (span.args.mode === "Determine" || span.args.mode === "Fulfill")) {
      // AAOSA: the caller first asks each agent whether its job fits (Determine), then
      // asks only those that said so to do it (Fulfill).
      const determine = span.args.mode === "Determine";
      ctx.counts[determine ? "determine" : "fulfill"] += 1;
      return {
        ...base,
        kind: "aaosa",
        agent: name,
        mode: span.args.mode,
        asked: AnswerPath.cut(AnswerPath.requestText(span.args)),
        title: `AAOSA ${span.args.mode}: ${name}`,
        detail: determine ? "Asked whether its job fits this request." : "Asked to do its part.",
        reply: AnswerPath.cut(AnswerPath.plain(AnswerPath.replyText(span.resultPreview))),
        children: AnswerPath.nodes(span.children, ctx),
      };
    }
    if (span.toolKind === "agent") {
      const children = AnswerPath.nodes(span.children, ctx);
      // What the caller asked this agent and what it replied, for the swarm graph.
      const asked = AnswerPath.cut(AnswerPath.requestText(span.args));
      const reply = AnswerPath.cut(AnswerPath.plain(AnswerPath.replyText(span.resultPreview)));
      for (const child of children) {
        if (child.kind === "agent" && child.agent === name) {
          child.asked = asked;
          child.replied = reply;
        }
      }
      if (children.length && !refusal && status !== "error") {
        return children;
      }
      return {...base, kind: "agent", agent: name, network: "", origin: span.origin || "", title: `Agent ${name}`, children};
    }
    if (span.toolKind === "remote network" || span.toolKind === "linked network") {
      ctx.counts.partners += 1;
      const call = span.children.find((child) => !child.note && (child.kind === "remote_call" || child.kind === "remote_fetch"));
      const host = call?.peerOrigin || AnswerPath.consentHost(span, ctx) || "";
      const consent = AnswerPath.consent(host, ctx);
      const children = AnswerPath.nodes(span.children, ctx);
      const ran = span.children.some((child) => !child.note && child.kind === "remote_call");
      return {
        ...base,
        kind: "partner",
        network: call?.network || name,
        host: host,
        ran: ran,
        title: `Partner network ${call?.network || name}${host ? ` at ${host}` : ""}`,
        detail: ran ? "Loaded and run in this browser, not on the partner's server." : "",
        quote: AnswerPath.cut(AnswerPath.requestText(span.args)),
        consent: consent,
        // The consent line already says when the visitor declined.
        children: consent ? children.filter((child) => child.kind !== "consent") : children,
      };
    }
    if (span.toolKind === "MCP") {
      ctx.counts.mcp += 1;
      const call = span.children.find((child) => !child.note && child.kind === "mcp_call" && child.method === "tools/call");
      return {
        ...base,
        kind: "mcp",
        name: name.replace(/^mcp_/, ""),
        title: `MCP tool ${name.replace(/^mcp_/, "")}${call ? ` at ${call.peerOrigin}` : ""}`,
        detail: AnswerPath.cut(AnswerPath.argsText(span.args)),
      };
    }
    if (name.startsWith("website_")) {
      ctx.counts.actions += 1;
      return {
        ...base,
        kind: "action",
        name: name.slice("website_".length),
        title: `Site action ${name.slice("website_".length)} on ${span.origin}`,
        detail: AnswerPath.cut(AnswerPath.argsText(span.args)),
      };
    }
    return {...base, kind: "tool", title: `Tool ${name}${span.toolKind ? ` (${span.toolKind})` : ""}`, detail: AnswerPath.cut(AnswerPath.argsText(span.args))};
  }

  /**
   * The text of an agent's reply from a tool span's result preview, which holds the
   * reply as text or, cut short, as the runner's JSON result with a "text" field, such
   * as {"cruse":1,"text":"Yes: ...","presentation":null,...}.
   *
   * :param preview: The span's resultPreview.
   * :return: The reply text.
   */
  static replyText(preview) {
    const value = String(preview || "");
    const match = value.startsWith("{") ? /"text":"((?:[^"\\]|\\.)*)/.exec(value) : null;
    if (!match) {
      return value;
    }
    try {
      return JSON.parse(`"${match[1]}"`);
    } catch {
      // Cut inside an escape: show it as it is.
      return match[1];
    }
  }

  /**
   * The span's status as this view names it.
   *
   * :param span: A span.
   * :return: "ok", "error" or "running".
   */
  static status(span) {
    if (span.status === "error") {
      return "error";
    }
    return span.endSeq === null ? "running" : "ok";
  }

  /**
   * The runtime's reason when a tool call returned a refusal instead of a result, such as
   * a cycle it skipped or a partner the visitor declined.
   *
   * :param span: A "tool" span.
   * :return: The reason, or "".
   */
  static refusal(span) {
    const preview = typeof span.resultPreview === "string" ? span.resultPreview : "";
    if (/^(Skipped |The user declined |The user did not link )/.test(preview)) {
      return preview;
    }
    return "";
  }

  /**
   * Say how the visitor answered the consent card for a partner host in this message.
   * Uses up the matching note, so a second call to the same host finds its own.
   *
   * :param host: The partner's host.
   * :param ctx: Holds this message's consent notes and the always-allowed hosts.
   * :return: The sentence, or "" when no card was needed.
   */
  static consent(host, ctx) {
    if (!host) {
      return "";
    }
    const index = ctx.consents.findIndex((note) => note.peerOrigin === host);
    if (index >= 0) {
      const [note] = ctx.consents.splice(index, 1);
      if (note.auto) {
        return `You had chosen automatic approval, so contact with ${host} went ahead without a card.`;
      }
      if (note.decision === "always") {
        ctx.always.add(host);
        return `You allowed contact with ${host} for the rest of this visit.`;
      }
      if (note.decision === "decline") {
        return `You declined contact with ${host}.`;
      }
      return `You allowed this one contact with ${host}.`;
    }
    if (ctx.always.has(host)) {
      return `No card: you allowed ${host} for this visit earlier.`;
    }
    return "";
  }

  /**
   * The partner host named by this message's next consent note, for a partner call that
   * never got as far as fetching, such as a declined one.
   *
   * :param span: The "tool" span.
   * :param ctx: Holds this message's consent notes.
   * :return: The host, or "".
   */
  static consentHost(span, ctx) {
    const note = ctx.consents.find((candidate) => candidate.seq > span.seq);
    return note ? note.peerOrigin : "";
  }

  /**
   * The request text a partner network receives, as the runtime builds it.
   *
   * :param args: The tool call's arguments.
   * :return: The text.
   */
  static requestText(args) {
    if (!args || typeof args !== "object") {
      return String(args ?? "");
    }
    for (const key of ["request", "input", "inquiry", "query", "text", "message"]) {
      if (typeof args[key] === "string") {
        return args[key];
      }
    }
    return JSON.stringify(args);
  }

  /**
   * Show a tool call's arguments in one short line.
   *
   * :param args: The arguments.
   * :return: The text, or "" when there are none.
   */
  static argsText(args) {
    if (!args || typeof args !== "object" || !Object.keys(args).length) {
      return "";
    }
    return JSON.stringify(args);
  }

  /**
   * Cut a text to MAX_TEXT characters.
   *
   * :param text: The text.
   * :return: The text, ending in "…" when it was cut.
   */
  static cut(text) {
    const value = String(text || "");
    return value.length > AnswerPath.MAX_TEXT ? `${value.slice(0, AnswerPath.MAX_TEXT - 1)}…` : value;
  }

  /**
   * Describe a turn's counts in one line, such as "2 agents · 1 site action · 3 model
   * calls · 4.2 s".
   *
   * :param turn: A turn from build().
   * :return: The line.
   */
  static summary(turn) {
    const parts = [];
    const add = (count, one, many) => {
      if (count) {
        parts.push(`${count} ${count === 1 ? one : many}`);
      }
    };
    if (turn.counts.agents) {
      const sites = turn.counts.sites > 1 ? ` on ${turn.counts.sites} sites` : "";
      parts.push(`${turn.counts.agents} ${turn.counts.agents === 1 ? "agent" : "agents"}${sites}`);
    }
    add(turn.counts.actions, "site action", "site actions");
    add(turn.counts.mcp, "MCP tool", "MCP tools");
    add(turn.counts.partners, "partner network", "partner networks");
    add(turn.counts.parallel, "parallel step", "parallel steps");
    add(turn.counts.determine, "AAOSA Determine", "AAOSA Determines");
    add(turn.counts.fulfill, "AAOSA Fulfill", "AAOSA Fulfills");
    add(turn.counts.modelCalls, "model call", "model calls");
    if (turn.durationMs !== null) {
      parts.push(`${(turn.durationMs / 1000).toFixed(1)} s`);
    }
    if (turn.status === "running") {
      parts.push("running");
    }
    if (turn.status === "error") {
      parts.push("failed");
    }
    return parts.join(" · ");
  }

  /**
   * Write a turn as indented plain text, for tests and for reading in a console.
   *
   * :param turn: A turn from build().
   * :return: The text.
   */
  static toText(turn) {
    const lines = [`Question: ${turn.question}`];
    const walk = (nodes, depth) => {
      for (const node of nodes) {
        const pad = "  ".repeat(depth);
        const mark = node.status === "ok" ? "" : ` [${node.status}]`;
        lines.push(`${pad}- ${node.title}${mark}`);
        for (const extra of [node.detail, node.quote ? `“${node.quote}”` : "", node.reply ? `Replied: ${node.reply}` : "", node.consent, node.refusal, node.error]) {
          if (extra) {
            lines.push(`${pad}  ${extra}`);
          }
        }
        walk(node.children, depth + 1);
      }
    };
    walk(turn.nodes, 1);
    if (turn.error) {
      lines.push(`Error: ${turn.error}`);
    }
    lines.push(`Answer: ${turn.answer}`);
    return lines.join("\n");
  }
}
