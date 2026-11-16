// A small menu under the chat box. A choice for the visitor: be asked before each contact with a partner site, or let the
// assistant go ahead on its own. The default is to ask, on every page load, so the
// relaxed setting is always something the visitor chose in this visit (spec 3.2: any
// relaxation of the consent default must result from an explicit user choice).
//
// It governs only the contact with a partner site. A change that cannot be undone, such
// as switching a tariff, keeps its own confirmation dialog whatever is chosen here
// (spec 3.1 and 5). With automatic approval each contact is still listed in the chat,
// with the partner and the whole request that went there, and in "The swarm at work".
//
// site.js reads PartnerApproval.auto in its consent() and, when it is true, answers the
// runtime's consent hook without showing a card. This file is the same on all three
// sites. Each page's markup is in index.html.

/**
 * The visitor's choice, and the line the chat shows for each automatic approval.
 */
export class PartnerApproval {
  /** True while the visitor has chosen automatic approval. */
  static auto = false;

  /**
   * Wire the choice in the page, if it exists. The page always starts on "ask me".
   *
   * :param doc: The document.
   * :return: The element holding the choice, or null when the page has none.
   */
  static attach(doc) {
    const group = doc.querySelector("#partner-approval");
    if (!group) {
      return null;
    }
    PartnerApproval.auto = false;
    // A browser can bring back the choice made before a reload. Start from "ask me".
    const menu = group.querySelector("select");
    if (menu) {
      menu.value = "ask";
    }
    group.addEventListener("change", (event) => {
      PartnerApproval.auto = event?.target?.value === "auto";
    });
    // The menu sits under the chat box, in the runtime's chat, where it takes little room.
    const chat = doc.querySelector("#agent-app .ns-chat");
    if (chat) {
      chat.append(group);
      group.hidden = false;
    }
    return group;
  }

  /**
   * Show that a partner was contacted without a card, with the whole request, so the
   * visitor still sees what was sent. All text goes in as text, never HTML.
   *
   * :param doc: The document.
   * :param info: The runtime's consent information: peerLabel, peerOrigin and requestText.
   * :return: The line added to the chat, or null when the chat is missing.
   */
  static announce(doc, info) {
    const msgs = doc.querySelector("#agent-app #ns-msgs");
    if (!msgs) {
      return null;
    }
    const line = doc.createElement("div");
    line.className = "ns-msg bot ns-auto-approved";
    line.setAttribute("role", "status");
    const title = doc.createElement("div");
    title.className = "ns-auto-approved-title";
    title.textContent = `✓ Contacted ${info?.peerLabel || "a partner site"} automatically`;
    const origin = doc.createElement("div");
    origin.className = "ns-auto-approved-origin";
    origin.textContent = String(info?.peerOrigin || "");
    line.append(title, origin);
    if (typeof info?.requestText === "string" && info.requestText) {
      const request = doc.createElement("div");
      request.className = "ns-auto-approved-request";
      request.textContent = `“${info.requestText}”`;
      line.append(request);
    }
    msgs.append(line);
    msgs.scrollTop = msgs.scrollHeight;
    return line;
  }
}
