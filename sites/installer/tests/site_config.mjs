// This site's values and checks for tests/agentified.test.mjs.
// The amounts below are worked out by hand from js/install-data.js, not by calling the
// site's own functions, so a wrong sum in the site fails the test.
//
// Heat pump for a 95 m2 semi-detached house: 95 x 70 W = 6,650 W, shown as 6.7 kW. The
// smallest heat pump that gives at least 6,650 W is the 8 kW one: £9,200 to £11,200.
// Solar panels for a 120 m2 detached house: 120 m2 is at least 90 m2, so the larger
// system: £6,900 to £8,300.
import assert from "node:assert/strict";

/**
 * What the shared test file needs to know about the Heatwright Home Energy site.
 */
export class SiteConfig {
  static NETWORK_NAME = "heatwright_installers";

  static READ_ACTION = "get_installer_state";

  static WRITE_ACTION = "set_estimate";

  static IRREVERSIBLE_ACTION = "request_survey";

  /** A phrase from the instructions' line that lists what the site cannot do. */
  static CANNOT_DO = "This site cannot give a final price without a survey, book a survey date or time";

  /**
   * Arguments for the write action that change something on the page.
   *
   * :return: The arguments.
   */
  static writeArguments() {
    return {
      measure: "heat-pump",
      homeType: "semi-detached",
      floorAreaM2: 95,
    };
  }

  /**
   * Arguments the write action's schema refuses.
   *
   * :return: The arguments.
   */
  static invalidWriteArguments() {
    return {
      measure: "wind-turbine",
      homeType: "semi-detached",
      floorAreaM2: 95,
    };
  }

  /**
   * Arguments for the write that runs before each irreversible test: a survey request
   * needs an estimate on the page.
   *
   * :return: The arguments.
   */
  static arrangeArguments() {
    return {
      measure: "solar",
      homeType: "detached",
      floorAreaM2: 120,
    };
  }

  /**
   * Valid arguments for the irreversible action, with spaces around the visitor's
   * values and a lower-case postcode, which the site tidies.
   *
   * :param state: The page state from the read action.
   * :return: The arguments.
   */
  static irreversibleArguments(state) {
    return {
      fullName: "  Ana Silva ",
      email: " ana.silva@example.com ",
      postcodeArea: " ls6 ",
      window: "saturday-morning",
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
      {...valid, fullName: "   "},
      {...valid, email: "ana.silva.example.com"},
      {...valid, email: "ana.silva@example"},
      {...valid, email: "ana silva@example.com"},
      {...valid, postcodeArea: "123"},
      {...valid, postcodeArea: "LS"},
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
    assert.deepEqual(after.estimate, {
      measure: "heat-pump",
      measureName: "Heat pump",
      homeType: "semi-detached",
      homeTypeName: "Semi-detached house",
      floorAreaM2: 95,
      estimatedHeatLoss: "6.7 kW",
      productId: "ashp-8",
      product: "8 kW air-source heat pump",
      priceRange: "£9,200 to £11,200",
      note: "Estimates are indicative. A free home survey sets the final price.",
    });
    const panel = document.getElementById("estimate-result");
    assert.equal(panel.hidden, false);
    assert.ok(panel.textContent.includes("6.7 kW") && panel.textContent.includes("8 kW air-source heat pump: £9,200 to £11,200"), panel.textContent);
    // The page's own form shows the home the estimate is for.
    assert.equal(document.getElementById("estimate-measure").value, "heat-pump");
    assert.equal(document.getElementById("estimate-home-type").value, "semi-detached");
    assert.equal(document.getElementById("estimate-floor-area").value, "95");
    assert.equal(document.getElementById("estimate-clear").hidden, false);
  }

  /**
   * Check each detail the confirmation dialog shows against the call's arguments.
   *
   * :param details: The dialog's details by label.
   * :param args: The call's arguments.
   */
  static checkDialogDetails(details, args) {
    assert.equal(args.fullName, "  Ana Silva ");
    assert.deepEqual(details, {
      "Name": "Ana Silva",
      "Email": "ana.silva@example.com",
      "Postcode area": "LS6",
      "Visit": "Saturday morning",
      "Home": "Detached house, 120 square metres",
      "Survey for": "4.8 kWp solar panel system (12 panels)",
      "Indicative price": "£6,900 to £8,300",
    });
  }

  /**
   * Check what an approved request stored, then send the same request through the
   * page's own form and check that it stores the same record.
   *
   * :param result: The approved call's result.
   * :param before: The state before the call.
   * :param after: The state after it.
   * :param document: The page's document stand-in.
   */
  static async checkApprovedCall(result, before, after, document) {
    const stored = {
      reference: "HW-SV-0001",
      fullName: "Ana Silva",
      email: "ana.silva@example.com",
      postcodeArea: "LS6",
      window: "Saturday morning",
      surveyFor: "4.8 kWp solar panel system (12 panels)",
      home: "Detached house, 120 square metres",
      indicativePrice: "£6,900 to £8,300",
    };
    assert.equal(result.ok, true);
    assert.deepEqual(result.receipt, stored);
    assert.deepEqual(result.state, after);
    assert.equal(after.version, before.version + 1);
    // The state reader and the page leave the email address out.
    const shown = {...stored};
    delete shown.email;
    assert.deepEqual(after.latestSurveyRequest, shown);
    const text = document.getElementById("survey-result").textContent;
    assert.ok(text.includes("HW-SV-0001") && text.includes("Ana Silva in LS6, saturday morning"), text);
    assert.ok(!text.includes("@"), text);

    // The page's own form, given the same input, stores the same record and then
    // empties the visitor's details.
    const { App } = await import("../js/app.js");
    document.getElementById("survey-name").value = "  Ana Silva ";
    document.getElementById("survey-email").value = " ana.silva@example.com ";
    document.getElementById("survey-postcode").value = " ls6 ";
    document.getElementById("survey-window").value = "saturday-morning";
    assert.equal(document.getElementById("survey-form").dispatch("submit"), 1);
    assert.equal(document.getElementById("survey-message").textContent, "");
    assert.deepEqual(App.page.latestSurveyRequest, {...stored, reference: "HW-SV-0002"});
    for (const id of ["survey-name", "survey-email", "survey-postcode"]) {
      assert.equal(document.getElementById(id).value, "");
    }

    // Without an estimate, the page refuses a request and says why.
    assert.equal(document.getElementById("estimate-clear").dispatch("click"), 1);
    document.getElementById("survey-name").value = "Ana Silva";
    document.getElementById("survey-email").value = "ana.silva@example.com";
    document.getElementById("survey-postcode").value = "LS6";
    document.getElementById("survey-form").dispatch("submit");
    assert.equal(document.getElementById("survey-message").textContent, "Make an estimate first, so the surveyor knows what to look at.");
    assert.equal(App.page.latestSurveyRequest.reference, "HW-SV-0002");
  }
}
