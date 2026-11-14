// Makes the runtime's developer log (⚙ Developer) short enough to read: it shows the
// events of one answer at a time, the one on show in the swarm graph, and by default
// only the steps (agents, tools, partner calls and errors), one line each. Buttons
// switch to the model calls, the errors, or everything, and to all answers.
//
// It only marks the runtime's rows; the stylesheet hides the rows that do not match.
// Nothing in the runtime is changed and no row is removed: "Export JSON" still gives
// the whole trace.
//
// This file is the same on all three sites.

/**
 * The filters above the runtime's execution log.
 */
export class DevLog {
  /**
   * Each filter: its id, as the stylesheet knows it, and its label.
   */
  static FILTERS = [
    ["steps", "Steps"],
    ["model", "Model"],
    ["errors", "Errors"],
    ["all", "Everything"],
  ];

  /**
   * Add the buttons above the log's rows, and note on each new row which trace event
   * made it, so scope() can tell which answer a row belongs to.
   *
   * :param doc: The page's document.
   * :param trace: The runtime's trace, from boot().
   * :return: True when the buttons were added. False when the runtime's log is not on
   *   the page, or the buttons are already there.
   */
  static attach(doc, trace) {
    const rows = doc.querySelector("#ns-rows");
    if (!rows || doc.querySelector(".dev-log-filters")) {
      return false;
    }
    const bar = doc.createElement("div");
    bar.className = "dev-log-filters";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Show these log events");
    for (const [id, label] of DevLog.FILTERS) {
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.show = id;
      button.setAttribute("aria-pressed", String(id === "steps"));
      button.addEventListener("click", DevLog.show.bind(null, rows, bar, id));
      bar.append(button);
    }
    const scope = doc.createElement("button");
    scope.type = "button";
    scope.className = "dev-log-scope";
    scope.setAttribute("aria-pressed", "false");
    scope.textContent = "All answers";
    scope.addEventListener("click", () => {
      const all = rows.dataset.scope !== "all";
      rows.dataset.scope = all ? "all" : "answer";
      scope.setAttribute("aria-pressed", String(all));
    });
    bar.append(scope);
    rows.before(bar);
    rows.dataset.show = "steps";
    rows.dataset.scope = "answer";
    // The runtime's own listener was added first, so by now it has added the row of
    // this event, if the event gets one.
    trace?.addEventListener("event", (event) => DevLog.tag(rows, event.detail));
    return true;
  }

  /**
   * Note on the newest row the sequence number of the event that made it.
   *
   * :param rows: The log's rows element.
   * :param event: The trace event just recorded.
   */
  static tag(rows, event) {
    const row = rows.lastElementChild;
    if (row && row.dataset.seq === undefined && event && Number.isFinite(event.seq)) {
      row.dataset.seq = String(event.seq);
    }
  }

  /**
   * Show one kind of event.
   *
   * :param rows: The log's rows element.
   * :param bar: The buttons' element.
   * :param id: The filter's id.
   */
  static show(rows, bar, id) {
    rows.dataset.show = id;
    for (const button of bar.querySelectorAll("button[data-show]")) {
      button.setAttribute("aria-pressed", String(button.dataset.show === id));
    }
  }

  /**
   * Say whether an event with this sequence number belongs to a turn.
   *
   * :param seq: The event's sequence number.
   * :param turn: A turn from AnswerPath.build(), with seq and endSeq, or null.
   * :return: True when it does, or when there is no turn to compare with.
   */
  static inTurn(seq, turn) {
    if (!turn) {
      return true;
    }
    return Number.isFinite(seq) && seq >= turn.seq && (turn.endSeq === null || seq <= turn.endSeq);
  }

  /**
   * Mark the rows that belong to another answer than the one on show, so the
   * stylesheet hides them unless "All answers" is on.
   *
   * :param doc: The page's document.
   * :param turn: The turn on show, or null before the first message.
   */
  static scope(doc, turn) {
    const rows = doc.querySelector("#ns-rows");
    if (!rows) {
      return;
    }
    for (const row of rows.children) {
      const seq = row.dataset.seq === undefined ? NaN : Number(row.dataset.seq);
      row.classList.toggle("dev-log-other", !DevLog.inTurn(seq, turn));
    }
  }
}
