import { GrantData } from "./grant-data.js";
import { GrantRules } from "./grant-rules.js";
import { PartnerLinks } from "./partner-links.js";

/**
 * The Fernbrook Retrofit Grants page.
 *
 * It keeps the visitor's eligibility answers and applications in memory, renders them,
 * and offers one method per operation. The page's own forms and the assistant's actions
 * (site-actions.js) call the same methods. Operations refuse bad input by returning
 * {ok: false, reason, field} and change nothing; they never move focus or reset a form.
 */
export class GrantsPage {
  /** The eligibility form's selects, by answer name. */
  static ANSWER_FIELDS = {
    tenure: "answer-tenure",
    currentHeating: "answer-heating",
    epcBand: "answer-epc",
    incomeBand: "answer-income",
  };

  /**
   * Create the page.
   *
   * :param doc: The page's document.
   */
  constructor(doc) {
    this.doc = doc;
    this.answers = null;
    this.applications = [];
    this.version = 0;
  }

  /**
   * Fill the forms' lists, render the page and connect its forms and buttons.
   */
  start() {
    for (const question of GrantRules.QUESTIONS) {
      this.fillSelect(GrantsPage.ANSWER_FIELDS[question.answer], question.options);
    }
    this.fillSelect("application-scheme", GrantData.SCHEMES);
    this.doc.getElementById("eligibility-form").addEventListener("submit", this.onEligibilitySubmit.bind(this));
    this.doc.getElementById("eligibility-clear").addEventListener("click", this.onClearAnswers.bind(this));
    this.doc.getElementById("application-form").addEventListener("submit", this.onApplicationSubmit.bind(this));
    this.render();
  }

  /**
   * Fill a select with one option per entry and choose the first.
   *
   * :param id: The select's id.
   * :param entries: Entries with id and name.
   */
  fillSelect(id, entries) {
    const options = [];
    for (const entry of entries) {
      options.push(new Option(entry.name, entry.id));
    }
    const select = this.doc.getElementById(id);
    select.replaceChildren(...options);
    select.value = entries[0].id;
  }

  /**
   * List the ids in one of the data lists, for the actions' schemas.
   *
   * :param entries: Entries with ids.
   * :return: The ids, in page order.
   */
  ids(entries) {
    const ids = [];
    for (const entry of entries) {
      ids.push(entry.id);
    }
    return ids;
  }

  /**
   * Keep an entry's id and name only.
   *
   * :param entry: An entry from a data list.
   * :return: Its id and name.
   */
  static idAndName(entry) {
    return {
      id: entry.id,
      name: entry.name,
    };
  }

  /**
   * Decide every scheme for the current answers.
   *
   * :return: One result per scheme, or null when there are no answers yet.
   */
  results() {
    if (this.answers === null) {
      return null;
    }
    const results = [];
    for (const scheme of GrantData.SCHEMES) {
      const outcome = GrantRules.assess(scheme, this.answers);
      results.push({
        schemeId: scheme.id,
        scheme: scheme.name,
        amount: scheme.amountWords,
        eligible: outcome.eligible,
        reasons: outcome.reasons,
      });
    }
    return results;
  }

  /**
   * Return a fresh copy of everything the page shows, as plain JSON data.
   *
   * :return: The page state.
   */
  getState() {
    const schemes = [];
    for (const scheme of GrantData.SCHEMES) {
      const conditions = [];
      for (const rule of scheme.rules) {
        conditions.push(rule.failure);
      }
      schemes.push({
        id: scheme.id,
        name: scheme.name,
        amount: scheme.amountWords,
        summary: scheme.summary,
        conditions: conditions,
      });
    }
    const applications = [];
    for (const application of this.applications) {
      const copy = {...application};
      // The state reader and the page leave the email address out.
      delete copy.email;
      applications.push(copy);
    }
    // The visitor is signed in: applications are in their name. The email address stays out.
    const customer = {fullName: GrantData.CUSTOMER.fullName, address: GrantData.CUSTOMER.address, postcodeArea: GrantData.CUSTOMER.postcodeArea};
    return {
      demoNote: "Fictional demo data. These are not real grants and say nothing about any real scheme.",
      questions: {
        tenure: GrantData.TENURES.map(GrantsPage.idAndName),
        currentHeating: GrantData.HEATING.map(GrantsPage.idAndName),
        epcBand: GrantData.EPC_BANDS.map(GrantsPage.idAndName),
        incomeBand: GrantData.INCOME_BANDS.map(GrantsPage.idAndName),
      },
      schemes: schemes,
      partners: PartnerLinks.LINKS.map((link) => ({...link})),
      answers: this.answers === null ? null : {...this.answers},
      results: this.results(),
      applications: applications,
      customer: customer,
      version: this.version,
    };
  }

  /**
   * Record the visitor's eligibility answers and show the result for every scheme, with
   * the form set to the same answers.
   *
   * :param input: The answers, with tenure, currentHeating, epcBand and incomeBand.
   * :return: The updated state, or {ok: false, reason, field}.
   */
  setAnswers(input) {
    const check = GrantRules.checkAnswers(input);
    if (!check.ok) {
      return check;
    }
    this.answers = check.answers;
    this.version += 1;
    for (const [answer, id] of Object.entries(GrantsPage.ANSWER_FIELDS)) {
      this.doc.getElementById(id).value = check.answers[answer];
    }
    this.doc.getElementById("eligibility-message").textContent = "";
    this.render();
    return this.getState();
  }

  /**
   * Remove the answers and the results from the page.
   *
   * :return: The updated state.
   */
  clearAnswers() {
    if (this.answers !== null) {
      this.answers = null;
      this.version += 1;
      this.render();
    }
    return this.getState();
  }

  /**
   * Check an application without changing anything. The application itself and the
   * assistant's confirmation dialog both call this first.
   *
   * :param args: The application, with schemeId and expectedVersion. The applicant is the
   *   signed-in customer.
   * :return: {ok: true, ...} with what the visitor agrees to, or {ok: false, reason, field}.
   */
  checkApplication(args) {
    if (this.answers === null) {
      return {
        ok: false,
        reason: "Answer the eligibility questions first.",
        field: "answers",
      };
    }
    const scheme = GrantRules.find(GrantData.SCHEMES, args.schemeId);
    if (!scheme) {
      return {
        ok: false,
        reason: "Choose one of the schemes on this page.",
        field: "schemeId",
      };
    }
    for (const application of this.applications) {
      if (application.schemeId === scheme.id) {
        return {
          ok: false,
          reason: `An application for the ${scheme.name} has already been started: reference ${application.reference}.`,
          field: "schemeId",
        };
      }
    }
    const outcome = GrantRules.assess(scheme, this.answers);
    if (!outcome.eligible) {
      return {
        ok: false,
        reason: `These answers do not qualify for the ${scheme.name}. ${outcome.reasons.join(" ")}`,
        field: "schemeId",
      };
    }
    const contact = GrantRules.applicant();
    if (args.expectedVersion !== this.version) {
      return {
        ok: false,
        reason: "The page has changed since it was last read. Read it again, then retry.",
        field: "expectedVersion",
      };
    }
    return {
      ...contact,
      schemeId: scheme.id,
      scheme: scheme.name,
      amount: scheme.amountWords,
      answers: `${this.answers.tenureName}; ${this.answers.currentHeatingName}; EPC band ${this.answers.epcBandName}; income ${this.answers.incomeBandName}`,
    };
  }

  /**
   * Start an application. This cannot be undone on the page.
   *
   * :param args: The application, with schemeId and expectedVersion.
   * :return: The receipt with the new state, or {ok: false, reason, field}.
   */
  startApplication(args) {
    const check = this.checkApplication(args);
    if (!check.ok) {
      return check;
    }
    const application = {
      reference: `FB-AP-${String(this.applications.length + 1).padStart(4, "0")}`,
      schemeId: check.schemeId,
      scheme: check.scheme,
      amount: check.amount,
      fullName: check.fullName,
      email: check.email,
      answers: check.answers,
    };
    this.applications.push(application);
    this.version += 1;
    this.doc.getElementById("application-message").textContent = "";
    this.render();
    return {
      ok: true,
      receipt: {...application},
      state: this.getState(),
    };
  }

  /**
   * Handle the page's own eligibility form.
   *
   * :param event: The submit event.
   */
  onEligibilitySubmit(event) {
    event.preventDefault();
    const input = {};
    for (const [answer, id] of Object.entries(GrantsPage.ANSWER_FIELDS)) {
      input[answer] = this.doc.getElementById(id).value;
    }
    const result = this.setAnswers(input);
    if (result.ok === false) {
      this.doc.getElementById("eligibility-message").textContent = result.reason;
    }
  }

  /**
   * Handle the page's own "Clear my answers" button.
   */
  onClearAnswers() {
    this.clearAnswers();
  }

  /**
   * Handle the page's own application form: a scheme, for the signed-in customer.
   *
   * :param event: The submit event.
   */
  onApplicationSubmit(event) {
    event.preventDefault();
    const result = this.startApplication({
      schemeId: this.doc.getElementById("application-scheme").value,
      expectedVersion: this.version,
    });
    if (result.ok === false) {
      this.doc.getElementById("application-message").textContent = result.reason;
    }
  }

  /**
   * Draw every panel from the current state.
   */
  render() {
    const state = this.getState();
    this.renderSchemes(state);
    this.renderResults(state);
    this.renderApplications(state);
    this.renderPartners(state);
  }

  /**
   * Draw the partner links.
   *
   * :param state: The page state.
   */
  renderPartners(state) {
    const items = [];
    for (const partner of state.partners) {
      const item = this.doc.createElement("li");
      const link = this.element("a", partner.name);
      link.href = partner.url;
      item.append(link, this.element("span", ` ${partner.what}`));
      items.push(item);
    }
    this.doc.getElementById("partner-list").replaceChildren(...items);
  }

  /**
   * Make an element with text.
   *
   * :param tag: The tag name.
   * :param text: The text to show.
   * :param className: An optional class name.
   * :return: The element.
   */
  element(tag, text, className) {
    const node = this.doc.createElement(tag);
    node.textContent = text;
    if (className) {
      node.className = className;
    }
    return node;
  }

  /**
   * Draw the scheme cards.
   *
   * :param state: The page state.
   */
  renderSchemes(state) {
    const cards = [];
    for (const scheme of state.schemes) {
      const card = this.doc.createElement("article");
      card.className = "card";
      card.append(
        this.element("h3", scheme.name),
        this.element("p", scheme.amount, "strong"),
        this.element("p", scheme.summary),
      );
      for (const condition of scheme.conditions) {
        card.append(this.element("p", condition, "rule"));
      }
      cards.push(card);
    }
    this.doc.getElementById("scheme-list").replaceChildren(...cards);
  }

  /**
   * Draw the eligibility results.
   *
   * :param state: The page state.
   */
  renderResults(state) {
    const list = this.doc.getElementById("eligibility-result");
    const clear = this.doc.getElementById("eligibility-clear");
    if (state.results === null) {
      list.replaceChildren();
      list.hidden = true;
      clear.hidden = true;
      return;
    }
    const items = [];
    for (const result of state.results) {
      const words = result.eligible
        ? `${result.scheme}: you can apply (${result.amount}).`
        : `${result.scheme}: not with these answers. ${result.reasons.join(" ")}`;
      items.push(this.element("li", words, result.eligible ? "eligible" : "ineligible"));
    }
    list.replaceChildren(...items);
    list.hidden = false;
    clear.hidden = false;
  }

  /**
   * Draw the applications started on this page.
   *
   * :param state: The page state.
   */
  renderApplications(state) {
    const applicant = this.doc.getElementById("application-customer");
    if (applicant) {
      applicant.textContent = `Applications are made in the name of ${state.customer.fullName}, ${state.customer.address}, ${state.customer.postcodeArea}. You are signed in to this demo as ${state.customer.fullName}.`;
    }
    const list = this.doc.getElementById("application-list");
    const items = [];
    for (const application of state.applications) {
      items.push(this.element("li", `${application.scheme} (${application.amount}) for ${application.fullName}. Reference ${application.reference}.`));
    }
    list.replaceChildren(...items);
    list.hidden = items.length === 0;
  }
}

/**
 * Starts the grants page. index.html loads this module.
 *
 * It keeps the one running page in App.page. The assistant's actions (site-actions.js)
 * and its confirmation dialog (site.js) import this module by the same URL and use that
 * page, so they share its state.
 */
export class App {
  /** The running grants page. */
  static page = null;

  /**
   * Create and start the page.
   *
   * :param doc: The page's document.
   * :return: The running page.
   */
  static start(doc) {
    const page = new GrantsPage(doc);
    page.start();
    return page;
  }
}

App.page = App.start(document);
