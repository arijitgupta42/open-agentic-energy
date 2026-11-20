// Mounts the assistant inside the existing page. index.html loads it with:
//   <script type="module" src="site.js"></script>
// It is the agentify-website skill's templates/site.js with this site's greeting,
// dialog words and review details filled in.
import { AnswerPath } from "./js/answer-path.js";
import { BrandLogos } from "./js/brand-logos.js";
import { ChatBox } from "./js/chat-box.js";
import { ChatSessions } from "./js/chat-sessions.js";
import { DevLog } from "./js/dev-log.js";
import { SwarmGraph } from "./js/swarm-graph.js";
import { PromptHints } from "./js/prompt-hints.js";
import { ChatForms } from "./js/chat-forms.js";
import { ChatScroll } from "./js/chat-scroll.js";
import { InstallData } from "./js/install-data.js";
import { LiveChat } from "./js/live-chat.js";
import { OpenUi } from "./js/openui.js";
import { LlmProtocol } from "./js/llm-protocol.js";
import { PartnerApproval } from "./js/partner-approval.js";
import { VoiceInput } from "./js/voice-input.js";
import { App } from "./js/app.js";

/**
 * Boots the browser runtime in the page's assistant section.
 *
 * It points the runtime at this folder, so the manifest, network and actions load from
 * the same place as the page. Before each irreversible action, it shows its own
 * confirmation dialog, written for the visitor.
 */
export class AssistantMount {
  /**
   * The first chat message once the visitor has a key: what the assistant can do here.
   */
  static GREETING = "I can explain what we fit, work out an estimate for your home and request a free survey. I can also ask our grants partner what it offers.";

  /**
   * Suggested requests for the chat box (js/prompt-hints.js): the starter shown before
   * the first message, and fixed follow-ups for answers that bring none of their own. None holds a
   * name, an email address or a reference.
   */
  /**
   * The dropdowns a form in the chat may offer, by the topic of its label
   * (js/chat-forms.js). Nothing here asks for a personal detail: the account holds those.
   */
  static FORM_CHOICES = [
    {match: /floor area|square met|m²|m2|size of (your )?home/i, values: InstallData.FLOOR_AREA_CHOICES.map((area) => `${area} m²`)},
    {match: /home type|type of (home|house|property)|property type|kind of home/i, values: InstallData.HOME_TYPES.map((type) => type.name)},
    {match: /what to fit|measure|heat pump or solar|solar or heat pump/i, values: InstallData.MEASURES.map((measure) => measure.name)},
    {match: /visit|survey|when|time|date|day/i, values: InstallData.SURVEY_WINDOWS.map((window) => window.name)},
  ];

  static HINTS = {
    starter: "What would a heat pump cost for my 95 m² semi-detached house, and is there a grant to help?",
    followUps: [
      "How much would solar panels cost for my roof?",
      "What would a heat pump cost to run on my Emberwick tariff?",
      "What happens at a survey, and can I request one?",
      "How long does a heat pump installation take?",
    ],
  };

  /**
   * The confirmation dialog's words for each irreversible action. Name each button after
   * what it does, so that "Cancel" never has two meanings. With no irreversible action,
   * leave this empty.
   */
  static DIALOGS = {
    "request_survey": {
      title: "Request this survey?",
      sentence: "We will send the survey request below. You cannot withdraw it on this page.",
      confirm: "Request the survey",
      decline: "Don't send it",
    },
  };

  /**
   * Boot the runtime and report the result in the status line.
   *
   * :return: The runtime engine, or null when boot failed.
   */
  static async start() {
    const status = document.querySelector("#assistant-status");
    const siteBase = new URL("./", import.meta.url).href;
    try {
      // Load the runtime here, so a missing or broken runtime is reported too.
      // Model calls follow the visitor's protocol choice (js/llm-protocol.js). It is an
      // extra: with it off, the runtime talks the OpenAI protocol as before.
      try {
        LlmProtocol.install(window);
      } catch (error) {
        console.error("Provider protocol choice is off", error);
      }
      const { boot } = await import("./runtime/index.js");
      const booted = await boot("#agent-app", {
        originUrl: siteBase,
        sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase).href,
      });
      AssistantMount.engine = booted.engine;
      AssistantMount.watchTrace(booted.trace, booted.engine.top?.network?.name || "");
      // The growing chat box, suggested requests and voice input are extras: the chat
      // works without them. The growing box goes first, so the others join it.
      try {
        ChatBox.attach(document);
      } catch (error) {
        console.error("The growing chat box is off", error);
      }
      try {
        AssistantMount.hints = PromptHints.attach(document, AssistantMount.HINTS);
      } catch (error) {
        console.error("Suggestions are off", error);
      }
      try {
        ChatForms.attach(document, AssistantMount.FORM_CHOICES);
      } catch (error) {
        console.error("Chat forms are not checked", error);
      }
      try {
        ChatScroll.attach(document);
      } catch (error) {
        console.error("The chat does not hold long answers at their start", error);
      }
      // The logo of each site replaces the plain character its brand text starts with.
      try {
        BrandLogos.watch(document.querySelector("#agent-app"));
      } catch (error) {
        console.error("Site logos are off", error);
      }
      // Steps and the answer as it is written, while the runtime works.
      try {
        LiveChat.attach(document, booted.engine, booted.trace);
      } catch (error) {
        console.error("Live progress is off", error);
      }
      // Figures the assistant writes as an openui block become stat tiles, tables and charts.
      try {
        OpenUi.attach(document);
      } catch (error) {
        console.error("Drawing figures is off", error);
      }
      try {
        LlmProtocol.attachPicker(document, window);
      } catch (error) {
        console.error("Provider protocol picker is off", error);
      }
      VoiceInput.attach(document, window)
        .then((voice) => {
          AssistantMount.voice = voice;
        })
        .catch((error) => console.error("Voice input is off", error));
      AssistantMount.mountChats(booted.engine, booted.trace);
      AssistantMount.defaultReview = booted.engine.onActionConfirm;
      booted.engine.onActionConfirm = AssistantMount.review;
      AssistantMount.defaultConsent = booted.engine.onConsent;
      booted.engine.onConsent = AssistantMount.consent;
      // Without a key the chat cannot answer yet. This is the same test as the
      // runtime's "API key required" badge in runtime/ui.js.
      const needsKey = !booted.engine.mockLLM
        && (!booted.engine.byokKey || booted.engine.byokKey === "demo");
      status.textContent = needsKey
        ? "Assistant needs your AI provider key. Add it in AI model settings below."
        : "Assistant connected to this page.";
      if (!needsKey) {
        AssistantMount.greet();
      }
      return booted.engine;
    } catch (error) {
      // The page must keep working without the assistant.
      status.textContent = "The assistant could not load. You can still use the page directly.";
      console.error("Assistant startup failed", error);
      return null;
    }
  }

  /**
   * Add the list of this visit's chats and the choice of how a partner site is approved,
   * in the panel to the left of the chat. Both are extra: the chat works without them.
   *
   * :param engine: The runtime's engine.
   * :param trace: The runtime's trace.
   */
  static mountChats(engine, trace) {
    try {
      PartnerApproval.attach(document);
    } catch (error) {
      console.error("The partner approval choice is off", error);
    }
    try {
      AssistantMount.sessions = ChatSessions.attach(document, engine, trace, {
        hints: AssistantMount.hints,
        // Dictation belongs to the chat it started in.
        beforeChange: () => AssistantMount.voice?.sent(),
        onChange: AssistantMount.showChat,
      });
    } catch (error) {
      console.error("The list of chats is off", error);
    }
    const side = document.querySelector("#chat-side");
    if (side && AssistantMount.sessions) {
      side.hidden = false;
    }
  }

  /**
   * The answers of the chat on show, from the trace. The trace holds every chat's.
   *
   * :return: The turns, oldest first.
   */
  static turns() {
    const all = AnswerPath.build(AssistantMount.trace.events, location.host).turns;
    return AssistantMount.sessions ? AssistantMount.sessions.turnsOf(all) : all;
  }

  /**
   * The visitor picked another chat: "The swarm at work" shows that chat's answers only.
   */
  static showChat() {
    try {
      AssistantMount.graph?.replace(AssistantMount.turns());
    } catch (error) {
      console.error("Could not show how the answers were made", error);
    }
  }

  /**
   * Replace the runtime's general first chat message with GREETING. "New chat" keeps the
   * first message, so the greeting stays for the whole visit.
   */
  static greet() {
    const first = document.querySelector("#ns-msgs .ns-msg.bot");
    if (first) {
      first.textContent = AssistantMount.GREETING;
    }
  }

  /**
   * Ask the visitor to confirm actions before they run. One of this page's actions listed
   * in DIALOGS gets this page's dialog. Anything else, such as a partner site's action,
   * gets the runtime's own dialog.
   *
   * :param items: The actions waiting for confirmation, each with action, origin, effect
   *   and arguments.
   * :return: True when the visitor confirms.
   * :raises Error: The site's reason, when its own check refuses the action, or when a
   *   chat form bundles one of this page's DIALOGS actions with other actions.
   */
  static async review(items) {
    let confirmed = false;
    const pageOrigin = new URL(document.URL).origin;
    // This page's dialog shows one action with its details and runs the site's own check.
    // A chat form that bundles such an action with others would skip both, so nothing
    // runs.
    if (items.length > 1) {
      for (const item of items) {
        if (item.origin === pageOrigin && Object.hasOwn(AssistantMount.DIALOGS, item.action)) {
          throw new Error(`Nothing ran. "${AssistantMount.DIALOGS[item.action].confirm}" needs its own confirmation, so ask the assistant to do that on its own.`);
        }
      }
    }
    // A partner's action can have the same name as one of this page's. It gets the
    // runtime's dialog, which names the partner's origin, and this page's check never runs.
    const own = items.length === 1 && items[0].origin === pageOrigin;
    if (own && Object.hasOwn(AssistantMount.DIALOGS, items[0].action)) {
      const content = AssistantMount.dialogContent(items[0]);
      if (content.refusal) {
        // A dialog would offer a button that cannot work. The runtime runs nothing
        // and gives the agent this reason as an "Error from tool" message.
        throw new Error(content.refusal);
      }
      confirmed = await new Promise(AssistantMount.openDialog.bind(null, content));
    } else {
      confirmed = await AssistantMount.defaultReview(items);
    }
    AssistantMount.keepFocusInChat();
    return confirmed;
  }

  /**
   * Ask the visitor, with the runtime's consent card, whether to contact a partner site.
   * Focus the card while it waits, then put focus back in the chat.
   *
   * :param info: What the card shows, such as the partner's label and host and the request.
   * :return: The card's answer, unchanged: "allow", "always" or "decline". The runtime
   *   allows the call when this returns nothing.
   */
  static async consent(info) {
    // The visitor chose automatic approval for partner sites: no card.
    if (PartnerApproval.auto) {
      return AssistantMount.approveAutomatically(info);
    }
    // defaultConsent() adds the card at once. The card has no role, and the stylesheet
    // hides the status line while it waits, so name the card and focus its title.
    const answer = AssistantMount.defaultConsent(info);
    const cards = document.querySelectorAll("#ns-msgs .ns-consent");
    const card = cards[cards.length - 1];
    AssistantMount.showWholeRequest(info);
    AssistantMount.focusConsentCard();
    const decision = await answer;
    // The runtime writes "✓ Allowed" and "✕ Declined" with the same class. Mark the card
    // with the answer, so the stylesheet can show a decline in red.
    if (card) {
      card.dataset.decision = decision || "allow";
    }
    // The runtime's trace records only a declined card. Record every answer, so the
    // swarm graph can say what the visitor decided (spec 5).
    AssistantMount.trace?.note("consent", {page: true, peerOrigin: info?.peerOrigin, decision: decision || "allow", consentFor: info?.kind});
    // Answering the card removes its buttons, so focus may fall to the page body.
    AssistantMount.keepFocusInChat();
    return decision;
  }

  /**
   * Allow a partner contact without a card, because the visitor chose automatic approval.
   * The page still records the decision, so the swarm graph can say so (spec 5), and
   * shows the whole request in the chat.
   *
   * :param info: What the card would have shown, such as the partner's label and host and
   *   the request.
   * :return: "allow": this one contact. The next contact is checked again, so switching
   *   back to asking takes effect at once.
   */
  static approveAutomatically(info) {
    AssistantMount.trace?.note("consent", {page: true, peerOrigin: info?.peerOrigin, decision: "allow", auto: true, consentFor: info?.kind});
    PartnerApproval.announce(document, info);
    return "allow";
  }

  /**
   * Keep "The swarm at work" up to date from the runtime's trace, while a message runs
   * and when it ends. The trace stays in this browser: nothing here sends it.
   *
   * :param trace: The runtime's trace, from boot().
   * :param network: This site's network name, so the graph can mark this site.
   */
  static watchTrace(trace, network) {
    if (!trace) {
      return;
    }
    AssistantMount.trace = trace;
    const graph = AssistantMount.mountSwarm(trace, network);
    if (!graph) {
      return;
    }
    AssistantMount.graph = graph;
    let pending = false;
    const draw = () => {
      pending = false;
      try {
        graph.update(AssistantMount.turns());
      } catch (error) {
        // The view is extra: the chat and the page keep working without it.
        console.error("Could not show how the answer was made", error);
      }
    };
    trace.addEventListener("event", () => {
      if (!pending) {
        pending = true;
        setTimeout(draw, 200);
      }
    });
    draw();
  }

  /**
   * Draw the swarm graph beside the chat, link it to the chat's messages, and add the
   * developer log's filter buttons. All three are extra: the chat works without them.
   *
   * :param trace: The runtime's trace, from boot().
   * :param network: This site's network name.
   * :return: The graph, or null when it could not be drawn.
   */
  static mountSwarm(trace, network) {
    try {
      DevLog.attach(document, trace);
      const panel = document.querySelector("#swarm-map");
      if (!panel) {
        return null;
      }
      const graph = new SwarmGraph(panel, network);
      // The developer log shows the answer on show in the graph.
      graph.onSelect = DevLog.scope.bind(null, document);
      const messages = document.querySelector("#ns-msgs");
      if (messages) {
        graph.linkChat(messages);
      }
      panel.hidden = false;
      return graph;
    } catch (error) {
      console.error("Could not draw the swarm graph", error);
      return null;
    }
  }

  /**
   * Show the whole request on the newest consent card. The runtime's card quotes only its
   * first 140 characters, but the partner's network reads all of it, so the visitor would
   * agree to text they cannot see (spec 3.2 and 5: the card names the nature of the
   * request). Set as text, never as HTML, so a request cannot add markup to the page.
   *
   * :param info: What the card shows, with requestText.
   */
  static showWholeRequest(info) {
    const text = info && typeof info.requestText === "string" ? info.requestText : "";
    const cards = document.querySelectorAll("#ns-msgs .ns-consent");
    const card = cards[cards.length - 1];
    const quote = card ? card.querySelector(".ns-consent-req") : null;
    if (!quote || !text) {
      return;
    }
    quote.textContent = `“${text}”`;
  }

  /**
   * Name the newest consent card after its title, for screen readers. Move focus to that
   * title when focus is in the chat or on the page body, not from the page's own form.
   */
  static focusConsentCard() {
    const cards = document.querySelectorAll("#ns-msgs .ns-consent");
    const card = cards[cards.length - 1];
    const title = card ? card.querySelector(".ns-consent-title") : null;
    if (!title) {
      return;
    }
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", title.textContent);
    // A visitor typing in the page's own form keeps focus, and their keystrokes.
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest("#agent-app")) {
      return;
    }
    // tabIndex -1 lets the title take focus. Enter cannot activate a title, so a stray
    // Enter answers nothing.
    title.tabIndex = -1;
    title.focus();
  }

  /**
   * Work out what the dialog says for one action: its words from DIALOGS, the readable
   * details and the exact call. This is plain data, so tests can check it.
   *
   * :param item: An action waiting for confirmation, with action, origin, effect and
   *   arguments.
   * :return: The title, sentence, button labels, details, exact call text and the
   *   site's refusal, if any.
   */
  static dialogContent(item) {
    let details = {};
    try {
      details = AssistantMount.reviewDetails(item.action, item.arguments) || {};
    } catch (error) {
      // The dialog then opens the exact call, and the visitor decides.
      console.error("Could not add details to the confirmation dialog", error);
    }
    return {
      ...AssistantMount.DIALOGS[item.action],
      details: details,
      refusal: details.refusal,
      exact: `${item.action} on ${item.origin} (${item.effect})\n${JSON.stringify(item.arguments, null, 2)}`,
    };
  }

  /**
   * Give the readable details of one irreversible action, such as items, total, name,
   * email and what undoing it would cost, from the page's own read-only operations, so
   * no rule is copied here. When the operation's own check refuses the call, return
   * {refusal: reason}, and review() opens no dialog.
   *
   * :param action: The action name.
   * :param args: The action's arguments.
   * :return: Details by label, {refusal: reason}, or {} when the action has none.
   */
  static reviewDetails(action, args) {
    if (action === "request_survey") {
      const check = App.page.checkSurvey(args);
      if (!check.ok) {
        return {refusal: check.reason};
      }
      return {
        "Name": check.fullName,
        "Email": check.email,
        "Postcode area": check.postcodeArea,
        "Visit": check.window,
        "Home": check.home,
        "Survey for": check.surveyFor,
        "Indicative price": check.indicativePrice,
      };
    }
    return {};
  }

  /**
   * Open the confirmation dialog: a question, a plain sentence, the readable details,
   * the exact call under "Technical details", and two buttons.
   *
   * :param content: What the dialog says, from dialogContent().
   * :param resolve: Receives true when the visitor confirms, and false otherwise.
   */
  static openDialog(content, resolve) {
    const dialog = document.createElement("dialog");
    dialog.className = "assistant-review";
    dialog.setAttribute("aria-labelledby", "assistant-review-title");
    const heading = document.createElement("h2");
    heading.id = "assistant-review-title";
    heading.textContent = content.title;
    // Start on the heading, which Enter cannot activate, so a stray Enter confirms nothing.
    heading.tabIndex = -1;
    heading.autofocus = true;
    const sentence = document.createElement("p");
    sentence.textContent = content.sentence;
    dialog.append(heading, sentence);
    const exact = document.createElement("details");
    const exactLabel = document.createElement("summary");
    exactLabel.textContent = "Technical details";
    const exactText = document.createElement("pre");
    exactText.textContent = content.exact;
    exact.append(exactLabel, exactText);
    const entries = Object.entries(content.details);
    if (entries.length) {
      const list = document.createElement("dl");
      for (const [label, value] of entries) {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = String(value);
        list.append(term, description);
      }
      dialog.append(list);
    } else {
      // Without readable details, open the exact call, so the visitor still sees it.
      exact.open = true;
    }
    const confirmButton = document.createElement("button");
    confirmButton.textContent = content.confirm;
    confirmButton.addEventListener("click", dialog.close.bind(dialog, "confirm"));
    const declineButton = document.createElement("button");
    declineButton.className = "assistant-decline";
    declineButton.textContent = content.decline;
    declineButton.addEventListener("click", dialog.close.bind(dialog, "decline"));
    // Escape also closes the dialog, without "confirm".
    dialog.addEventListener("close", AssistantMount.finishDialog.bind(null, dialog, resolve));
    dialog.append(exact, confirmButton, declineButton);
    document.body.append(dialog);
    dialog.showModal();
  }

  /**
   * Remove the closed dialog and report the visitor's choice.
   *
   * :param dialog: The dialog that just closed.
   * :param resolve: Receives true when the visitor pressed the confirm button.
   */
  static finishDialog(dialog, resolve) {
    dialog.remove();
    resolve(dialog.returnValue === "confirm");
  }

  /**
   * Put focus back in the chat input when a dialog or the consent card left it on the
   * page body. A chat form disables its controls when it is sent, so focus can fall to
   * the body, and the next Tab would start at the top of the page.
   */
  static keepFocusInChat() {
    if (document.activeElement === document.body || document.activeElement === null) {
      document.querySelector("#ns-input")?.focus();
    }
  }
}

// Boot only in a browser. Node tests import this file to check the dialog's words.
if (typeof window !== "undefined") {
  await AssistantMount.start();
}
