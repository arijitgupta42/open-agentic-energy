import { InstallData } from "./install-data.js";
import { InstallRules } from "./install-rules.js";
import { PartnerLinks } from "./partner-links.js";

/**
 * The Heatwright Home Energy page.
 *
 * It keeps the visitor's estimate and survey request in memory, renders them, and offers
 * one method per operation. The page's own forms and the assistant's actions
 * (site-actions.js) call the same methods. Operations refuse bad input by returning
 * {ok: false, reason, field} and change nothing; they never move focus or reset a form.
 */
export class InstallerPage {
  /**
   * Create the page.
   *
   * :param doc: The page's document.
   */
  constructor(doc) {
    this.doc = doc;
    this.estimate = null;
    this.latestSurveyRequest = null;
    this.requestCount = 0;
    this.version = 0;
  }

  /**
   * Fill the forms' lists, render the page and connect its forms and buttons.
   */
  start() {
    this.fillSelect("estimate-measure", InstallData.MEASURES);
    this.fillSelect("estimate-home-type", InstallData.HOME_TYPES);
    this.fillSelect("survey-window", InstallData.SURVEY_WINDOWS);
    this.doc.getElementById("estimate-form").addEventListener("submit", this.onEstimateSubmit.bind(this));
    this.doc.getElementById("estimate-clear").addEventListener("click", this.onClearEstimate.bind(this));
    this.doc.getElementById("survey-form").addEventListener("submit", this.onSurveySubmit.bind(this));
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
   * Return a fresh copy of everything the page shows, as plain JSON data.
   *
   * :return: The page state.
   */
  getState() {
    const products = [];
    for (const product of InstallData.PRODUCTS) {
      products.push({
        id: product.id,
        measure: product.measure,
        name: product.name,
        priceRange: InstallRules.priceRange(product),
      });
    }
    const partners = [];
    for (const link of PartnerLinks.LINKS) {
      partners.push({...link});
    }
    return {
      demoNote: "Fictional demo data. No real installer, product or price.",
      measures: InstallData.MEASURES.map(InstallerPage.idAndName),
      homeTypes: InstallData.HOME_TYPES.map(InstallerPage.idAndName),
      surveyWindows: InstallData.SURVEY_WINDOWS.map(InstallerPage.idAndName),
      floorAreaLimits: `${InstallData.MIN_AREA_M2} to ${InstallData.MAX_AREA_M2} square metres`,
      products: products,
      notes: [...InstallData.NOTES],
      estimate: this.estimate === null ? null : {...this.estimate},
      latestSurveyRequest: this.latestSurveyRequest === null ? null : InstallerPage.withoutEmail(this.latestSurveyRequest),
      partners: partners,
      version: this.version,
    };
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
   * Copy a survey request without its email address, for the page and the state reader.
   *
   * :param request: The stored request.
   * :return: The copy.
   */
  static withoutEmail(request) {
    const copy = {...request};
    delete copy.email;
    return copy;
  }

  /**
   * Work out an estimate and show it on the page, with the form set to the same home.
   *
   * :param input: The home, with measure, homeType and floorAreaM2.
   * :return: The updated state, or {ok: false, reason, field}.
   */
  setEstimate(input) {
    const result = InstallRules.estimate(input);
    if (!result.ok) {
      return result;
    }
    this.estimate = result.estimate;
    this.version += 1;
    this.doc.getElementById("estimate-measure").value = result.estimate.measure;
    this.doc.getElementById("estimate-home-type").value = result.estimate.homeType;
    this.doc.getElementById("estimate-floor-area").value = String(result.estimate.floorAreaM2);
    this.doc.getElementById("estimate-message").textContent = "";
    this.render();
    return this.getState();
  }

  /**
   * Remove the estimate from the page.
   *
   * :return: The updated state.
   */
  clearEstimate() {
    if (this.estimate !== null) {
      this.estimate = null;
      this.version += 1;
      this.render();
    }
    return this.getState();
  }

  /**
   * Check a survey request without changing anything. The request itself and the
   * assistant's confirmation dialog both call this first.
   *
   * :param args: The request, with fullName, email, postcodeArea, window and
   *   expectedVersion.
   * :return: {ok: true, ...} with what the visitor agrees to, or {ok: false, reason, field}.
   */
  checkSurvey(args) {
    if (this.estimate === null) {
      return {
        ok: false,
        reason: "Make an estimate first, so the surveyor knows what to look at.",
        field: "estimate",
      };
    }
    const contact = InstallRules.checkContact(args);
    if (!contact.ok) {
      return contact;
    }
    if (args.expectedVersion !== this.version) {
      return {
        ok: false,
        reason: "The page has changed since it was last read. Read it again, then retry.",
        field: "expectedVersion",
      };
    }
    return {
      ...contact,
      surveyFor: this.estimate.product,
      home: `${this.estimate.homeTypeName}, ${this.estimate.floorAreaM2} square metres`,
      indicativePrice: this.estimate.priceRange,
    };
  }

  /**
   * Send the survey request. This cannot be undone on the page.
   *
   * :param args: The request, with fullName, email, postcodeArea, window and
   *   expectedVersion.
   * :return: The receipt with the new state, or {ok: false, reason, field}.
   */
  requestSurvey(args) {
    const check = this.checkSurvey(args);
    if (!check.ok) {
      return check;
    }
    this.requestCount += 1;
    this.latestSurveyRequest = {
      reference: `HW-SV-${String(this.requestCount).padStart(4, "0")}`,
      fullName: check.fullName,
      email: check.email,
      postcodeArea: check.postcodeArea,
      window: check.window,
      surveyFor: check.surveyFor,
      home: check.home,
      indicativePrice: check.indicativePrice,
    };
    this.version += 1;
    this.doc.getElementById("survey-message").textContent = "";
    this.render();
    return {
      ok: true,
      receipt: {...this.latestSurveyRequest},
      state: this.getState(),
    };
  }

  /**
   * Handle the page's own estimate form.
   *
   * :param event: The submit event.
   */
  onEstimateSubmit(event) {
    event.preventDefault();
    const result = this.setEstimate({
      measure: this.doc.getElementById("estimate-measure").value,
      homeType: this.doc.getElementById("estimate-home-type").value,
      floorAreaM2: Number(this.doc.getElementById("estimate-floor-area").value),
    });
    if (result.ok === false) {
      this.doc.getElementById("estimate-message").textContent = result.reason;
    }
  }

  /**
   * Handle the page's own "Clear estimate" button.
   */
  onClearEstimate() {
    this.clearEstimate();
  }

  /**
   * Handle the page's own survey form. On success it empties the visitor's details.
   *
   * :param event: The submit event.
   */
  onSurveySubmit(event) {
    event.preventDefault();
    const result = this.requestSurvey({
      fullName: this.doc.getElementById("survey-name").value,
      email: this.doc.getElementById("survey-email").value,
      postcodeArea: this.doc.getElementById("survey-postcode").value,
      window: this.doc.getElementById("survey-window").value,
      expectedVersion: this.version,
    });
    if (result.ok === false) {
      this.doc.getElementById("survey-message").textContent = result.reason;
      return;
    }
    for (const id of ["survey-name", "survey-email", "survey-postcode"]) {
      this.doc.getElementById(id).value = "";
    }
  }

  /**
   * Draw every panel from the current state.
   */
  render() {
    const state = this.getState();
    this.renderProducts(state);
    this.renderEstimate(state);
    this.renderSurvey(state);
    this.renderPartners(state);
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
   * Draw the product cards and the notes.
   *
   * :param state: The page state.
   */
  renderProducts(state) {
    const cards = [];
    for (const product of state.products) {
      const card = this.doc.createElement("article");
      card.className = state.estimate !== null && state.estimate.productId === product.id ? "card current" : "card";
      card.append(
        this.element("h3", product.name),
        this.element("p", `Fitted from ${product.priceRange}`, "strong"),
      );
      cards.push(card);
    }
    this.doc.getElementById("product-list").replaceChildren(...cards);
    const notes = [];
    for (const note of state.notes) {
      notes.push(this.element("li", note));
    }
    this.doc.getElementById("product-notes").replaceChildren(...notes);
  }

  /**
   * Draw the estimate panel.
   *
   * :param state: The page state.
   */
  renderEstimate(state) {
    const panel = this.doc.getElementById("estimate-result");
    const clear = this.doc.getElementById("estimate-clear");
    if (state.estimate === null) {
      panel.textContent = "";
      panel.hidden = true;
      clear.hidden = true;
      return;
    }
    const estimate = state.estimate;
    const heat = estimate.estimatedHeatLoss === null ? "" : ` It loses about ${estimate.estimatedHeatLoss} of heat on a cold day.`;
    panel.textContent = `${estimate.homeTypeName}, ${estimate.floorAreaM2} square metres.${heat} `
      + `We suggest the ${estimate.product}: ${estimate.priceRange} fitted. ${estimate.note}`;
    panel.hidden = false;
    clear.hidden = false;
  }

  /**
   * Draw the latest survey request.
   *
   * :param state: The page state.
   */
  renderSurvey(state) {
    const result = this.doc.getElementById("survey-result");
    if (state.latestSurveyRequest === null) {
      result.textContent = "";
      result.hidden = true;
      return;
    }
    const request = state.latestSurveyRequest;
    result.textContent = `Survey requested for ${request.fullName} in ${request.postcodeArea}, ${request.window.toLowerCase()}, `
      + `for the ${request.surveyFor}. Reference ${request.reference}.`;
    result.hidden = false;
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
}

/**
 * Starts the installer page. index.html loads this module.
 *
 * It keeps the one running page in App.page. The assistant's actions (site-actions.js)
 * and its confirmation dialog (site.js) import this module by the same URL and use that
 * page, so they share its state.
 */
export class App {
  /** The running installer page. */
  static page = null;

  /**
   * Create and start the page.
   *
   * :param doc: The page's document.
   * :return: The running page.
   */
  static start(doc) {
    const page = new InstallerPage(doc);
    page.start();
    return page;
  }
}

App.page = App.start(document);
