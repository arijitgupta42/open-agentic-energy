// Registers this website's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
//
// Every action wraps a method of the running page (App.page in js/app.js), which the
// page's own buttons and forms also call. No business rule is copied here.
import { App } from "./js/app.js";
import { InstallData } from "./js/install-data.js";

/**
 * Describes the installer page's operations as actions the agents can call.
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
    actions.register(SiteActions.setEstimateAction());
    actions.register(SiteActions.requestSurveyAction());
  }

  /**
   * Describe the read action that returns the products, the estimate and the request.
   *
   * :return: The action definition.
   */
  static readStateAction() {
    return {
      name: "get_installer_state",
      description: "Read this page: what the site fits with indicative price ranges, the home types and survey windows it accepts, its notes, the visitor's current estimate, the latest survey request, the grants partner's link, and the page version.",
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
   * Describe the reversible write that works out and shows an estimate.
   *
   * :return: The action definition.
   */
  static setEstimateAction() {
    return {
      name: "set_estimate",
      description: "Work out an indicative estimate for a home and show it on the page, replacing any earlier estimate. Returns the updated state with the suggested product, price range and new version, or ok false with a reason. Does not request a survey.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["measure", "homeType", "floorAreaM2"],
        properties: {
          measure: {
            type: "string",
            enum: App.page.ids(InstallData.MEASURES),
            description: "What the visitor wants fitted.",
          },
          homeType: {
            type: "string",
            enum: App.page.ids(InstallData.HOME_TYPES),
            description: "The visitor's type of home.",
          },
          floorAreaM2: {
            type: "integer",
            minimum: InstallData.MIN_AREA_M2,
            maximum: InstallData.MAX_AREA_M2,
            description: "The home's floor area in square metres, from the visitor.",
          },
        },
      },
      execute: SiteActions.setEstimate,
    };
  }

  /**
   * Show an estimate through the page's own function.
   *
   * :param args: The validated arguments.
   * :return: The updated page state, or {ok: false, reason}.
   */
  static setEstimate(args) {
    return App.page.setEstimate(args);
  }

  /**
   * Describe the irreversible survey request that the visitor must confirm.
   *
   * :return: The action definition.
   */
  static requestSurveyAction() {
    return {
      name: "request_survey",
      description: "Send a request for a free home survey for the estimate on the page. The browser asks the visitor to confirm first. The site refuses when there is no estimate, when a detail is missing or malformed, and a stale expectedVersion. Returns the receipt with its reference.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["fullName", "email", "postcodeArea", "window", "expectedVersion"],
        properties: {
          fullName: {
            type: "string",
            maxLength: 80,
            description: "The name the visitor gave.",
          },
          email: {
            type: "string",
            maxLength: 120,
            description: "The email address the visitor gave.",
          },
          postcodeArea: {
            type: "string",
            maxLength: 8,
            description: "The first part of the visitor's postcode only, such as LS6.",
          },
          window: {
            type: "string",
            enum: App.page.ids(InstallData.SURVEY_WINDOWS),
            description: "When the surveyor can visit, from the visitor.",
          },
          expectedVersion: {
            type: "integer",
            minimum: 0,
            description: "The latest version in this turn: from website_get_installer_state, or from an estimate made after that read.",
          },
        },
      },
      execute: SiteActions.requestSurvey,
    };
  }

  /**
   * Send the request through the same function the page's own form uses.
   *
   * :param args: The validated, visitor-confirmed arguments.
   * :return: The receipt, or {ok: false, reason} when the site refuses the request.
   */
  static requestSurvey(args) {
    return App.page.requestSurvey(args);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
