// This site's values and checks for tests/agentified.test.mjs.
// The results below are worked out by hand from the rules in js/grant-data.js, not by
// calling the site's own functions, so a wrong rule in the site fails the test.
//
// Owner-occupier, gas boiler, EPC band D, income £31,000 or more:
//   heat pump grant yes; solar starter no (income); warm walls yes.
// Owner-occupier, oil boiler, EPC band C, income under £31,000:
//   heat pump grant yes; solar starter yes; warm walls no (EPC band).
import assert from "node:assert/strict";

/**
 * What the shared test file needs to know about the Fernbrook Retrofit Grants site.
 */
export class SiteConfig {
  static NETWORK_NAME = "fernbrook_grants";

  static READ_ACTION = "get_grants_state";

  static WRITE_ACTION = "set_eligibility_answers";

  static IRREVERSIBLE_ACTION = "start_application";

  /** A phrase from the instructions' line that lists what the site cannot do. */
  static CANNOT_DO = "This site cannot approve, pay, change or withdraw an application";

  /**
   * Arguments for the write action that change something on the page.
   *
   * :return: The arguments.
   */
  static writeArguments() {
    return {
      tenure: "owner-occupier",
      currentHeating: "gas-boiler",
      epcBand: "D",
      incomeBand: "31000-or-more",
    };
  }

  /**
   * Arguments the write action's schema refuses.
   *
   * :return: The arguments.
   */
  static invalidWriteArguments() {
    return {
      ...SiteConfig.writeArguments(),
      tenure: "lodger",
    };
  }

  /**
   * Arguments for the write that runs before each irreversible test: an application
   * needs answers on the page that qualify.
   *
   * :return: The arguments.
   */
  static arrangeArguments() {
    return {
      tenure: "owner-occupier",
      currentHeating: "oil-boiler",
      epcBand: "C",
      incomeBand: "under-31000",
    };
  }

  /**
   * Valid arguments for the irreversible action, with spaces around the visitor's
   * values, which the site tidies.
   *
   * :param state: The page state from the read action.
   * :return: The arguments.
   */
  static irreversibleArguments(state) {
    return {
      schemeId: "heat-pump-grant",
      fullName: "  Ana Silva ",
      email: " ana.silva@example.com ",
      expectedVersion: state.version,
    };
  }

  /**
   * Arguments the site's own check refuses: one set for each rule, each with one problem.
   *
   * :param state: The page state from the read action.
   * :return: A list of argument sets.
   */
  static refusedCalls(state) {
    const valid = SiteConfig.irreversibleArguments(state);
    return [
      {...valid, expectedVersion: state.version + 1},
      {...valid, expectedVersion: state.version - 1},
      // EPC band C does not qualify for the insulation voucher.
      {...valid, schemeId: "warm-walls"},
      {...valid, fullName: "   "},
      {...valid, email: "ana.silva.example.com"},
      {...valid, email: "ana.silva@example"},
      {...valid, email: "ana silva@example.com"},
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
    assert.deepEqual(after.answers, {
      tenure: "owner-occupier",
      tenureName: "I own the home and live in it",
      currentHeating: "gas-boiler",
      currentHeatingName: "Gas boiler",
      epcBand: "D",
      epcBandName: "D",
      incomeBand: "31000-or-more",
      incomeBandName: "£31,000 or more",
    });
    assert.deepEqual(after.results, [
      {
        schemeId: "heat-pump-grant",
        scheme: "Fernbrook Heat Pump Grant",
        amount: "£5,000",
        eligible: true,
        reasons: [],
      },
      {
        schemeId: "solar-starter",
        scheme: "Fernbrook Solar Starter",
        amount: "£1,200",
        eligible: false,
        reasons: ["The household's income must be under £31,000 a year."],
      },
      {
        schemeId: "warm-walls",
        scheme: "Warm Walls Insulation Voucher",
        amount: "Up to £2,000",
        eligible: true,
        reasons: [],
      },
    ]);
    const list = document.getElementById("eligibility-result");
    assert.equal(list.hidden, false);
    assert.equal(list.children.length, 3);
    assert.equal(list.children[0].textContent, "Fernbrook Heat Pump Grant: you can apply (£5,000).");
    assert.equal(list.children[1].textContent, "Fernbrook Solar Starter: not with these answers. The household's income must be under £31,000 a year.");
    // The page's own form shows the answers the result is for.
    assert.equal(document.getElementById("answer-tenure").value, "owner-occupier");
    assert.equal(document.getElementById("answer-heating").value, "gas-boiler");
    assert.equal(document.getElementById("answer-epc").value, "D");
    assert.equal(document.getElementById("answer-income").value, "31000-or-more");
    assert.equal(document.getElementById("eligibility-clear").hidden, false);
  }

  /**
   * Check each detail the confirmation dialog shows against the call's arguments.
   *
   * :param details: The dialog's details by label.
   * :param args: The call's arguments.
   */
  static checkDialogDetails(details, args) {
    assert.equal(args.schemeId, "heat-pump-grant");
    assert.deepEqual(details, {
      "Scheme": "Fernbrook Heat Pump Grant",
      "Grant": "£5,000",
      "Applicant": "Ana Silva",
      "Email": "ana.silva@example.com",
      "Your answers": "I own the home and live in it; Oil boiler; EPC band C; income Under £31,000",
    });
  }

  /**
   * Check what an approved application stored, then apply through the page's own form
   * and check that it stores the same kind of record and follows the same rules.
   *
   * :param result: The approved call's result.
   * :param before: The state before the call.
   * :param after: The state after it.
   * :param document: The page's document stand-in.
   */
  static async checkApprovedCall(result, before, after, document) {
    const stored = {
      reference: "FB-AP-0001",
      schemeId: "heat-pump-grant",
      scheme: "Fernbrook Heat Pump Grant",
      amount: "£5,000",
      fullName: "Ana Silva",
      email: "ana.silva@example.com",
      answers: "I own the home and live in it; Oil boiler; EPC band C; income Under £31,000",
    };
    assert.equal(result.ok, true);
    assert.deepEqual(result.receipt, stored);
    assert.deepEqual(result.state, after);
    assert.equal(after.version, before.version + 1);
    // The state reader and the page leave the email address out.
    const shown = {...stored};
    delete shown.email;
    assert.deepEqual(after.applications, [shown]);
    const list = document.getElementById("application-list");
    assert.equal(list.hidden, false);
    assert.equal(list.children[0].textContent, "Fernbrook Heat Pump Grant (£5,000) for Ana Silva. Reference FB-AP-0001.");

    // The page's own form, given the same applicant, stores the same kind of record and
    // then empties the visitor's details.
    const { App } = await import("../js/app.js");
    const form = document.getElementById("application-form");
    document.getElementById("application-scheme").value = "solar-starter";
    document.getElementById("application-name").value = "  Ana Silva ";
    document.getElementById("application-email").value = " ana.silva@example.com ";
    assert.equal(form.dispatch("submit"), 1);
    assert.equal(document.getElementById("application-message").textContent, "");
    assert.deepEqual(App.page.applications[1], {
      ...stored,
      reference: "FB-AP-0002",
      schemeId: "solar-starter",
      scheme: "Fernbrook Solar Starter",
      amount: "£1,200",
    });
    assert.equal(document.getElementById("application-name").value, "");
    assert.equal(document.getElementById("application-email").value, "");

    // A second application for the same scheme is refused, and nothing is stored.
    document.getElementById("application-scheme").value = "heat-pump-grant";
    document.getElementById("application-name").value = "Ana Silva";
    document.getElementById("application-email").value = "ana.silva@example.com";
    form.dispatch("submit");
    assert.equal(document.getElementById("application-message").textContent, "An application for the Fernbrook Heat Pump Grant has already been started: reference FB-AP-0001.");
    assert.equal(App.page.applications.length, 2);

    // Without answers, the page refuses an application and says why.
    assert.equal(document.getElementById("eligibility-clear").dispatch("click"), 1);
    document.getElementById("application-scheme").value = "warm-walls";
    form.dispatch("submit");
    assert.equal(document.getElementById("application-message").textContent, "Answer the eligibility questions first.");
    assert.equal(App.page.applications.length, 2);
  }
}
