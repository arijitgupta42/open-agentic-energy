// Registers this website's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
//
// Every action wraps a method of the running page (App.page in js/app.js), which the
// page's own buttons and forms also call. No business rule is copied here.
import { App } from "./js/app.js";

/**
 * Describes the account page's operations as actions the agents can call.
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
    actions.register(SiteActions.compareTariffAction());
    actions.register(SiteActions.switchTariffAction());
  }

  /**
   * Describe the read action that returns the account, usage and tariffs.
   *
   * :return: The action definition.
   */
  static readStateAction() {
    return {
      name: "get_account_state",
      description: "Read this page: the demo account, 12 months of usage, every tariff with its rates, exit fee and estimated yearly cost at this usage, the comparison panel, the latest switch, the partner sites' links, the signed-in account holder, and the page version. The visitor is signed in: their name and address are here, so never ask for them. When you ask for answers with a form, make every field a dropdown: give each property an enum of the allowed values listed here or a partner gave (for a number, a few likely values).",
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
   * Describe the reversible write that fills the comparison panel.
   *
   * :return: The action definition.
   */
  static compareTariffAction() {
    return {
      name: "compare_tariff",
      description: "Show one tariff next to the current one in the page's comparison panel. Returns the updated state with the new version, or ok false with a reason. Does not switch tariff.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["tariffId"],
        properties: {
          tariffId: {
            type: "string",
            enum: App.page.tariffIds(),
            description: "Tariff id from website_get_account_state. Not the current tariff.",
          },
        },
      },
      execute: SiteActions.compareTariff,
    };
  }

  /**
   * Fill the comparison panel through the page's own function.
   *
   * :param args: The validated arguments with tariffId.
   * :return: The updated page state, or {ok: false, reason}.
   */
  static compareTariff(args) {
    return App.page.compareTariff(args.tariffId);
  }

  /**
   * Describe the irreversible switch that the visitor must confirm.
   *
   * :return: The action definition.
   */
  static switchTariffAction() {
    return {
      name: "switch_tariff",
      description: "Switch the demo account to another tariff. The browser asks the visitor to confirm first. The site refuses the current tariff, a tariff whose rule the account does not meet, and a stale expectedVersion. Returns the receipt and the new state.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["tariffId", "expectedVersion"],
        properties: {
          tariffId: {
            type: "string",
            enum: App.page.tariffIds(),
            description: "Tariff id from website_get_account_state that the visitor chose.",
          },
          expectedVersion: {
            type: "integer",
            minimum: 0,
            description: "The latest version in this turn: from website_get_account_state, or from a comparison made after that read.",
          },
        },
      },
      execute: SiteActions.switchTariff,
    };
  }

  /**
   * Switch through the same function the page's own form uses.
   *
   * :param args: The validated, visitor-confirmed arguments.
   * :return: The receipt, or {ok: false, reason} when the site refuses the switch.
   */
  static switchTariff(args) {
    return App.page.switchTariff(args);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
