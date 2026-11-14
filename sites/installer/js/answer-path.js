// Builds "How this answer was made" from the runtime's execution trace (spec 5,
// "Observable execution"): for each visitor message, which agent ran on which site,
// which site actions, MCP tools and partner networks it used, the consent decisions,
// the model and router, any refusal or error, and the answer.
//
// It reads the trace that runtime/index.js boot() returns and never edits the runtime.
// It shows the key only as the runtime describes it ("local BYOK (not shown)"). What it
// builds stays on this page: nothing here sends or logs it.
//
// This file is the same on all three sites. sites/utility/tests/answer-path.test.mjs
// checks that the copies match.

/**
 * Turns trace events into a tree per visitor message, and the tree into page markup.
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
   *   counts and nodes. setup lists failures before any message, such as a network
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
    const counts = {agents: 0, actions: 0, mcp: 0, partners: 0, modelCalls: 0};
    const consents = run.children.filter((child) => child.note && child.kind === "consent" && child.page);
    const nodes = AnswerPath.nodes(run.children, {...state, counts, consents});
    return {
      question: run.input || "",
      answer: run.answerPreview || "",
      status: run.status === "error" ? "error" : (run.endSeq === null ? "running" : "ok"),
      error: run.error || "",
      durationMs: run.durationMs ?? null,
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
    for (const child of children) {
      const node = AnswerPath.node(child, ctx);
      if (Array.isArray(node)) {
        nodes.push(...node);
      } else if (node) {
        nodes.push(node);
      }
    }
    return nodes;
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
      const partner = ctx.pageHost && item.origin && item.origin !== ctx.pageHost;
      return {
        kind: "agent",
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
    if (note.kind === "composition_limit" || note.kind === "composition_skip") {
      return {kind: "limit", title: "Stopped by the runtime", detail: note.reason || "", status: "refused", children: []};
    }
    return null;
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
    if (span.toolKind === "agent") {
      const children = AnswerPath.nodes(span.children, ctx);
      if (children.length && !refusal && status !== "error") {
        return children;
      }
      return {...base, kind: "agent", title: `Agent ${name}`, children};
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
        title: `MCP tool ${name.replace(/^mcp_/, "")}${call ? ` at ${call.peerOrigin}` : ""}`,
        detail: AnswerPath.cut(AnswerPath.argsText(span.args)),
      };
    }
    if (name.startsWith("website_")) {
      ctx.counts.actions += 1;
      return {
        ...base,
        kind: "action",
        title: `Site action ${name.slice("website_".length)} on ${span.origin}`,
        detail: AnswerPath.cut(AnswerPath.argsText(span.args)),
      };
    }
    return {...base, kind: "tool", title: `Tool ${name}${span.toolKind ? ` (${span.toolKind})` : ""}`, detail: AnswerPath.cut(AnswerPath.argsText(span.args))};
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
    for (const key of ["request", "input", "query", "text", "message"]) {
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
    add(turn.counts.agents, "agent", "agents");
    add(turn.counts.actions, "site action", "site actions");
    add(turn.counts.mcp, "MCP tool", "MCP tools");
    add(turn.counts.partners, "partner network", "partner networks");
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
        for (const extra of [node.detail, node.quote ? `“${node.quote}”` : "", node.consent, node.refusal, node.error]) {
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

  /**
   * Show every turn in a list, newest first, each as a <details> the visitor can open
   * with the keyboard. Only the newest is open. All text goes in as text, never HTML.
   *
   * :param list: The <ol> to fill.
   * :param built: The result of build().
   */
  static render(list, built) {
    const doc = list.ownerDocument;
    const open = new Set();
    for (const old of list.querySelectorAll("details")) {
      if (old.open) {
        open.add(old.dataset.turn);
      }
    }
    list.replaceChildren();
    for (const node of built.setup) {
      const item = doc.createElement("li");
      item.append(AnswerPath.tree(doc, [node]));
      list.append(item);
    }
    const turns = built.turns.map((turn, index) => ({turn, index})).reverse();
    for (const {turn, index} of turns) {
      const item = doc.createElement("li");
      const details = doc.createElement("details");
      details.dataset.turn = String(index);
      details.open = index === built.turns.length - 1 || open.has(String(index));
      const summary = doc.createElement("summary");
      const question = doc.createElement("span");
      question.className = "answer-path-question";
      question.textContent = `“${AnswerPath.cut(turn.question)}”`;
      const counts = doc.createElement("span");
      counts.className = "answer-path-counts";
      counts.textContent = AnswerPath.summary(turn);
      summary.append(question, " ", counts);
      details.append(summary, AnswerPath.tree(doc, turn.nodes));
      if (turn.error) {
        const error = doc.createElement("p");
        error.className = "answer-path-error";
        error.textContent = `Error: ${turn.error}`;
        details.append(error);
      }
      if (turn.answer) {
        const answer = doc.createElement("p");
        answer.className = "answer-path-answer";
        answer.textContent = `Answer: ${AnswerPath.cut(turn.answer)}`;
        details.append(answer);
      }
      item.append(details);
      list.append(item);
    }
  }

  /**
   * Build the nested list for some nodes.
   *
   * :param doc: The document.
   * :param nodes: The nodes.
   * :return: A <ul>.
   */
  static tree(doc, nodes) {
    const list = doc.createElement("ul");
    list.className = "answer-path-tree";
    for (const node of nodes) {
      const item = doc.createElement("li");
      item.className = `answer-path-${node.kind} answer-path-${node.status}`;
      const title = doc.createElement("span");
      title.className = "answer-path-title";
      title.textContent = node.title;
      item.append(title);
      if (node.status === "refused" || node.status === "error" || node.status === "running") {
        const badge = doc.createElement("span");
        badge.className = "answer-path-badge";
        badge.textContent = {refused: "stopped", error: "error", running: "running"}[node.status];
        item.append(" ", badge);
      }
      for (const [text, name] of [[node.detail, "detail"], [node.quote ? `Request sent: “${node.quote}”` : "", "quote"], [node.consent, "consent"], [node.refusal, "detail"], [node.error, "error"]]) {
        if (text) {
          const line = doc.createElement("span");
          line.className = `answer-path-${name}`;
          line.textContent = text;
          item.append(line);
        }
      }
      if (node.children.length) {
        item.append(AnswerPath.tree(doc, node.children));
      }
      list.append(item);
    }
    return list;
  }
}
