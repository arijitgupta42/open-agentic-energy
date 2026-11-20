// Registers this website's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
//
// Every action wraps a method of the running page (App.page in js/app.js), which the
// page's own buttons and forms also call. No business rule is copied here.
import { App } from "./js/app.js";
import { GrantData } from "./js/grant-data.js";

/**
 * Describes the grants page's operations as actions the agents can call.
 *
 * The runtime validates arguments against inputSchema before execute runs, and asks the
 * visitor to confirm "irreversible" actions first.
 */
class SiteActions {
  /**
   * Register every site action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(SiteActions.readStateAction());
    actions.register(SiteActions.setAnswersAction());
    actions.register(SiteActions.startApplicationAction());
  }

  /**
   * Describe the read action that returns the schemes, answers, results and applications.
   *
   * :return: The action definition.
   */
  static readStateAction() {
    return {
      name: "get_grants_state",
      description: "Read this page: every scheme with its amount, summary and conditions, the eligibility questions with their allowed answers, the visitor's answers, the result for each scheme, the applications started here, the installer partner's link, the signed-in customer, and the page version. The visitor is signed in: their name and address are here, so never ask for them. When you ask for answers with a form, make every field a dropdown: give each property an enum of the allowed values listed here (for a number, a few likely values).",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.readState,
    };
  }

  /**
   * Return a fresh copy of the page state.
   *
   * :return: The page state as plain JSON data.
   */
  static readState() {
    return App.page.getState();
  }

  /**
   * Describe the reversible write that records the eligibility answers.
   *
   * :return: The action definition.
   */
  static setAnswersAction() {
    return {
      name: "set_eligibility_answers",
      description: "Record the visitor's four eligibility answers and show the result for every scheme on the page, replacing earlier answers. Returns the updated state with each scheme's result and the new version. Does not start an application.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["tenure", "currentHeating", "epcBand", "incomeBand"],
        properties: {
          tenure: {
            type: "string",
            enum: App.page.ids(GrantData.TENURES),
            description: "Who owns or rents the home, from the visitor.",
          },
          currentHeating: {
            type: "string",
            enum: App.page.ids(GrantData.HEATING),
            description: "How the home is heated now, from the visitor.",
          },
          epcBand: {
            type: "string",
            enum: App.page.ids(GrantData.EPC_BANDS),
            description: "The home's EPC band, or unknown when the visitor does not know it.",
          },
          incomeBand: {
            type: "string",
            enum: App.page.ids(GrantData.INCOME_BANDS),
            description: "The household's income band, or not-given when the visitor would rather not say.",
          },
        },
      },
      execute: SiteActions.setAnswers,
    };
  }

  /**
   * Record the answers through the page's own function.
   *
   * :param args: The validated arguments.
   * :return: The updated page state, or {ok: false, reason}.
   */
  static setAnswers(args) {
    return App.page.setAnswers(args);
  }

  /**
   * Describe the irreversible application that the visitor must confirm.
   *
   * :return: The action definition.
   */
  static startApplicationAction() {
    return {
      name: "start_application",
      description: "Start an application for one scheme with the answers on the page, in the name of the signed-in customer: their name and email are known, so ask only which scheme. The browser asks the visitor to confirm first. The site refuses when there are no answers, when the answers do not qualify, when that scheme already has an application, when a detail is missing or malformed, and a stale expectedVersion. Returns the receipt with its reference.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["schemeId", "expectedVersion"],
        properties: {
          schemeId: {
            type: "string",
            enum: App.page.ids(GrantData.SCHEMES),
            description: "Scheme id from website_get_grants_state that the visitor chose.",
          },
          expectedVersion: {
            type: "integer",
            minimum: 0,
            description: "The latest version in this turn: from website_get_grants_state, or from answers recorded after that read.",
          },
        },
      },
      execute: SiteActions.startApplication,
    };
  }

  /**
   * Start the application through the same function the page's own form uses.
   *
   * :param args: The validated, visitor-confirmed arguments.
   * :return: The receipt, or {ok: false, reason} when the site refuses the application.
   */
  static startApplication(args) {
    return App.page.startApplication(args);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
