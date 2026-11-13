// This site's values and checks for tests/agentified.test.mjs.
// The amounts below are worked out by hand from js/account-data.js, not by calling the
// site's own functions, so a wrong sum in the site fails the test.
//
// Usage over 12 months: 2,975 kWh electricity and 11,770 kWh gas.
// Standard Variable: 2,975 x 26.4p + 11,770 x 6.3p + 365 x (55.0p + 31.0p) = 184,081p.
// Fixed 12 Month:    2,975 x 24.9p + 11,770 x 5.9p + 365 x (58.0p + 32.0p) = 176,370.5p,
//                    rounded half up to 176,371p. That is 7,710p less than Standard Variable.
// Green Flex:        2,975 x 25.8p + 11,770 x 6.1p + 365 x (56.0p + 31.0p) = 180,307p,
//                    which is 3,936p more than Fixed 12 Month.
import assert from "node:assert/strict";

/**
 * What the shared test file needs to know about the Emberwick Energy site.
 */
export class SiteConfig {
  static NETWORK_NAME = "emberwick_energy";

  static READ_ACTION = "get_account_state";

  static WRITE_ACTION = "compare_tariff";

  static IRREVERSIBLE_ACTION = "switch_tariff";

  /** A phrase from the instructions' line that lists what the site cannot do. */
  static CANNOT_DO = "This site cannot take payments, change a direct debit, take meter readings";

  /**
   * Arguments for the write action that change something on the page.
   *
   * :return: The arguments.
   */
  static writeArguments() {
    return {tariffId: "green-flex"};
  }

  /**
   * Arguments the write action's schema refuses.
   *
   * :return: The arguments.
   */
  static invalidWriteArguments() {
    return {tariffId: "no-such-tariff"};
  }

  /**
   * Arguments for the write that runs before each irreversible test. The switch takes
   * all it acts on as arguments, so this only moves the page's version on.
   *
   * :return: The arguments.
   */
  static arrangeArguments() {
    return {tariffId: "fixed-12"};
  }

  /**
   * Valid arguments for the irreversible action.
   *
   * :param state: The page state from the read action.
   * :return: The arguments.
   */
  static irreversibleArguments(state) {
    return {
      tariffId: "fixed-12",
      expectedVersion: state.version,
    };
  }

  /**
   * Arguments the site's own check refuses: one set for each rule.
   *
   * :param state: The page state from the read action.
   * :return: A list of argument sets.
   */
  static refusedCalls(state) {
    return [
      {
        tariffId: "fixed-12",
        expectedVersion: state.version + 1,
      },
      {
        tariffId: "fixed-12",
        expectedVersion: state.version - 1,
      },
      {
        // The account is already on this tariff.
        tariffId: state.currentTariffId,
        expectedVersion: state.version,
      },
      {
        // This tariff needs a heat pump, and the account has none.
        tariffId: "heat-pump-saver",
        expectedVersion: state.version,
      },
    ];
  }

  /**
   * Check the exact change the write made, in the state and on the page.
   *
   * :param before: The state before the write.
   * :param after: The state after it.
   * :param document: The page's document stand-in.
   */
  static checkWrite(before, after, document) {
    assert.equal(after.version, before.version + 1);
    assert.equal(after.currentTariffId, before.currentTariffId);
    assert.equal(after.comparison.id, "green-flex");
    assert.equal(after.comparison.estimatedAnnualCost, "£1,803.07");
    assert.equal(after.comparison.comparedWithCurrent, "£37.74 less per year");
    const panel = document.getElementById("comparison-panel").textContent;
    assert.ok(panel.includes("Green Flex") && panel.includes("£1,803.07") && panel.includes("£37.74 less per year"), panel);
    assert.equal(document.getElementById("comparison-clear").hidden, false);
  }

  /**
   * Check each detail the confirmation dialog shows against the call's arguments.
   *
   * :param details: The dialog's details by label.
   * :param args: The call's arguments.
   */
  static checkDialogDetails(details, args) {
    assert.equal(args.tariffId, "fixed-12");
    assert.deepEqual(details, {
      "From": "Standard Variable",
      "To": "Fixed 12 Month",
      "Term": "12 months",
      "Estimated yearly cost": "£1,763.71 (£77.10 less per year)",
      "Exit fee to leave your current tariff": "£0.00",
      "Exit fee if you leave the new tariff early": "£50.00",
    });
  }

  /**
   * Check what an approved switch stored, then make a second switch through the page's
   * own form and check that it stores the same kind of record.
   *
   * :param result: The approved call's result.
   * :param before: The state before the call.
   * :param after: The state after it.
   * :param document: The page's document stand-in.
   */
  static checkApprovedCall(result, before, after, document) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.receipt, {
      reference: "EW-SW-0001",
      from: "Standard Variable",
      to: "Fixed 12 Month",
      exitFeeCharged: "£0.00",
      estimatedAnnualCost: "£1,763.71",
    });
    assert.deepEqual(after.latestSwitch, result.receipt);
    assert.deepEqual(result.state, after);
    assert.equal(after.currentTariffId, "fixed-12");
    assert.equal(after.comparison, null);
    assert.equal(after.version, before.version + 1);
    const shown = document.getElementById("switch-result");
    assert.equal(shown.hidden, false);
    assert.ok(shown.textContent.includes("EW-SW-0001") && shown.textContent.includes("Fixed 12 Month"), shown.textContent);
    assert.ok(document.getElementById("current-tariff-name").textContent.startsWith("Fixed 12 Month"));

    // The page's own form goes through the same function. Leaving the fixed tariff
    // early costs its exit fee.
    document.getElementById("switch-tariff").value = "green-flex";
    assert.equal(document.getElementById("switch-form").dispatch("submit"), 1);
    assert.equal(document.getElementById("switch-message").textContent, "");
    const text = document.getElementById("switch-result").textContent;
    assert.ok(text.includes("EW-SW-0002") && text.includes("from Fixed 12 Month to Green Flex") && text.includes("£50.00"), text);
    assert.ok(document.getElementById("current-tariff-name").textContent.startsWith("Green Flex · about £1,803.07"));
  }
}
