import { AccountData } from "./account-data.js";
import { PartnerLinks } from "./partner-links.js";
import { TariffRules } from "./tariff-rules.js";

/**
 * The Emberwick Energy account page.
 *
 * It keeps the demo account in memory, renders it, and offers one method per operation.
 * The page's own buttons and the assistant's actions (site-actions.js) call the same
 * methods. Operations refuse bad input by returning {ok: false, reason, field} and
 * change nothing; they never move focus or reset a form.
 */
export class AccountPage {
  /**
   * Create the page.
   *
   * :param doc: The page's document.
   */
  constructor(doc) {
    this.doc = doc;
    this.currentTariffId = AccountData.STARTING_TARIFF;
    this.comparisonId = null;
    this.latestSwitch = null;
    this.switchCount = 0;
    this.version = 0;
  }

  /**
   * Render the page and connect its buttons and forms.
   */
  start() {
    this.doc.getElementById("comparison-clear").addEventListener("click", this.onClearComparison.bind(this));
    this.doc.getElementById("switch-form").addEventListener("submit", this.onSwitchSubmit.bind(this));
    this.render();
  }

  /**
   * List the tariff ids, for the actions' schemas.
   *
   * :return: The ids, in page order.
   */
  tariffIds() {
    const ids = [];
    for (const tariff of AccountData.TARIFFS) {
      ids.push(tariff.id);
    }
    return ids;
  }

  /**
   * Find a tariff by id.
   *
   * :param id: The tariff id.
   * :return: The tariff, or undefined.
   */
  tariff(id) {
    for (const tariff of AccountData.TARIFFS) {
      if (tariff.id === id) {
        return tariff;
      }
    }
    return undefined;
  }

  /**
   * Add up the year's usage.
   *
   * :return: The electricity and gas totals in kWh.
   */
  usageTotals() {
    let electricityKwh = 0;
    let gasKwh = 0;
    for (const month of AccountData.USAGE) {
      electricityKwh += month.electricityKwh;
      gasKwh += month.gasKwh;
    }
    return {
      electricityKwh: electricityKwh,
      gasKwh: gasKwh,
    };
  }

  /**
   * Work out a tariff's yearly cost at this account's usage.
   *
   * :param tariff: The tariff.
   * :return: The cost in pence.
   */
  annualCostPence(tariff) {
    const totals = this.usageTotals();
    return TariffRules.annualCostPence(tariff, totals.electricityKwh, totals.gasKwh);
  }

  /**
   * Say how a yearly cost compares with the current tariff's.
   *
   * :param costPence: The other tariff's yearly cost in pence.
   * :return: Words such as "£77.10 less per year".
   */
  differenceWords(costPence) {
    const currentPence = this.annualCostPence(this.tariff(this.currentTariffId));
    if (costPence === currentPence) {
      return "The same as now";
    }
    if (costPence < currentPence) {
      return `${TariffRules.pounds(currentPence - costPence)} less per year`;
    }
    return `${TariffRules.pounds(costPence - currentPence)} more per year`;
  }

  /**
   * Describe one tariff as plain data, with the words and amounts the page shows.
   *
   * :param tariff: The tariff.
   * :return: The tariff as JSON data.
   */
  describeTariff(tariff) {
    const costPence = this.annualCostPence(tariff);
    return {
      id: tariff.id,
      name: tariff.name,
      term: tariff.term,
      electricityUnitRate: `${TariffRules.pence(tariff.electricityUnit)} per kWh`,
      gasUnitRate: `${TariffRules.pence(tariff.gasUnit)} per kWh`,
      electricityStandingCharge: `${TariffRules.pence(tariff.electricityStanding)} per day`,
      gasStandingCharge: `${TariffRules.pence(tariff.gasStanding)} per day`,
      exitFee: TariffRules.pounds(tariff.exitFeePence),
      requiresHeatPump: tariff.requiresHeatPump,
      note: tariff.note,
      current: tariff.id === this.currentTariffId,
      estimatedAnnualCost: TariffRules.pounds(costPence),
      estimatedAnnualCostPence: costPence,
      comparedWithCurrent: this.differenceWords(costPence),
    };
  }

  /**
   * Return a fresh copy of everything the page shows, as plain JSON data.
   *
   * :return: The page state.
   */
  getState() {
    const tariffs = [];
    for (const tariff of AccountData.TARIFFS) {
      tariffs.push(this.describeTariff(tariff));
    }
    const months = [];
    for (const month of AccountData.USAGE) {
      months.push({...month});
    }
    const partners = [];
    for (const link of PartnerLinks.LINKS) {
      partners.push({...link});
    }
    const totals = this.usageTotals();
    return {
      demoNote: "Fictional demo data. No real account, tariff or price.",
      account: {...AccountData.ACCOUNT},
      currentTariffId: this.currentTariffId,
      usage: {
        period: "The last 12 months",
        electricityKwh: totals.electricityKwh,
        gasKwh: totals.gasKwh,
        months: months,
      },
      tariffs: tariffs,
      comparison: this.comparisonId === null ? null : this.describeTariff(this.tariff(this.comparisonId)),
      latestSwitch: this.latestSwitch === null ? null : {...this.latestSwitch},
      partners: partners,
      version: this.version,
    };
  }

  /**
   * Show one tariff next to the current one in the comparison panel.
   *
   * :param tariffId: The tariff to compare with the current one.
   * :return: The updated state, or {ok: false, reason, field}.
   */
  compareTariff(tariffId) {
    const tariff = this.tariff(tariffId);
    if (!tariff) {
      return {
        ok: false,
        reason: "Choose one of the tariffs on this page.",
        field: "tariffId",
      };
    }
    if (tariff.id === this.currentTariffId) {
      return {
        ok: false,
        reason: `This account is already on ${tariff.name}. Choose another tariff to compare.`,
        field: "tariffId",
      };
    }
    this.comparisonId = tariff.id;
    this.version += 1;
    this.render();
    return this.getState();
  }

  /**
   * Empty the comparison panel.
   *
   * :return: The updated state.
   */
  clearComparison() {
    if (this.comparisonId !== null) {
      this.comparisonId = null;
      this.version += 1;
      this.render();
    }
    return this.getState();
  }

  /**
   * Check a tariff switch without changing anything. The switch itself and the
   * assistant's confirmation dialog both call this first.
   *
   * :param args: The switch, with tariffId and expectedVersion.
   * :return: {ok: true, from, to, ...} with what the visitor agrees to, or
   *   {ok: false, reason, field}.
   */
  checkSwitch(args) {
    const current = this.tariff(this.currentTariffId);
    const target = this.tariff(args.tariffId);
    const check = TariffRules.checkSwitch(AccountData.ACCOUNT, current, target);
    if (!check.ok) {
      return check;
    }
    if (args.expectedVersion !== this.version) {
      return {
        ok: false,
        reason: "The account page has changed since it was last read. Read it again, then retry.",
        field: "expectedVersion",
      };
    }
    const costPence = this.annualCostPence(target);
    return {
      ok: true,
      from: current.name,
      to: target.name,
      term: target.term,
      estimatedAnnualCost: TariffRules.pounds(costPence),
      comparedWithCurrent: this.differenceWords(costPence),
      exitFeeToLeaveCurrent: TariffRules.pounds(current.exitFeePence),
      exitFeeOnNewTariff: TariffRules.pounds(target.exitFeePence),
    };
  }

  /**
   * Switch the demo account to another tariff. This cannot be undone on the page.
   *
   * :param args: The switch, with tariffId and expectedVersion.
   * :return: The receipt with the new state, or {ok: false, reason, field}.
   */
  switchTariff(args) {
    const check = this.checkSwitch(args);
    if (!check.ok) {
      return check;
    }
    this.switchCount += 1;
    this.latestSwitch = {
      reference: `EW-SW-${String(this.switchCount).padStart(4, "0")}`,
      from: check.from,
      to: check.to,
      exitFeeCharged: check.exitFeeToLeaveCurrent,
      estimatedAnnualCost: check.estimatedAnnualCost,
    };
    this.currentTariffId = args.tariffId;
    this.comparisonId = null;
    this.version += 1;
    this.doc.getElementById("switch-message").textContent = "";
    this.render();
    return {
      ok: true,
      receipt: {...this.latestSwitch},
      state: this.getState(),
    };
  }

  /**
   * Handle the page's own "Clear comparison" button.
   */
  onClearComparison() {
    this.clearComparison();
  }

  /**
   * Handle the page's own switch form.
   *
   * :param event: The submit event.
   */
  onSwitchSubmit(event) {
    event.preventDefault();
    const result = this.switchTariff({
      tariffId: this.doc.getElementById("switch-tariff").value,
      expectedVersion: this.version,
    });
    if (result.ok === false) {
      this.doc.getElementById("switch-message").textContent = result.reason;
    }
  }

  /**
   * Draw every panel from the current state.
   */
  render() {
    const state = this.getState();
    this.renderAccount(state);
    this.renderUsage(state);
    this.renderTariffs(state);
    this.renderComparison(state);
    this.renderSwitch(state);
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
   * Draw the account summary.
   *
   * :param state: The page state.
   */
  renderAccount(state) {
    let currentName = "";
    for (const tariff of state.tariffs) {
      if (tariff.current) {
        currentName = `${tariff.name} · about ${tariff.estimatedAnnualCost} a year at your usage`;
      }
    }
    this.doc.getElementById("account-reference").textContent = state.account.reference;
    this.doc.getElementById("account-household").textContent = state.account.household;
    this.doc.getElementById("account-heat-pump").textContent = state.account.hasHeatPump ? "Yes" : "None on record";
    this.doc.getElementById("current-tariff-name").textContent = currentName;
  }

  /**
   * Draw the usage totals and the monthly bars.
   *
   * :param state: The page state.
   */
  renderUsage(state) {
    this.doc.getElementById("usage-summary").textContent = `${state.usage.period}: `
      + `${state.usage.electricityKwh.toLocaleString("en-GB")} kWh of electricity and `
      + `${state.usage.gasKwh.toLocaleString("en-GB")} kWh of gas.`;
    let peak = 1;
    for (const month of state.usage.months) {
      peak = Math.max(peak, month.electricityKwh + month.gasKwh);
    }
    const bars = [];
    for (const month of state.usage.months) {
      const column = this.doc.createElement("div");
      const bar = this.doc.createElement("div");
      bar.className = "bar";
      bar.style.height = `${Math.round(((month.electricityKwh + month.gasKwh) / peak) * 100)}%`;
      bar.setAttribute("title", `${month.month}: ${month.electricityKwh} kWh electricity, ${month.gasKwh} kWh gas`);
      column.append(bar, this.element("span", month.month));
      bars.push(column);
    }
    this.doc.getElementById("usage-chart").replaceChildren(...bars);
  }

  /**
   * Draw the tariff cards, each with its own "Compare" button.
   *
   * :param state: The page state.
   */
  renderTariffs(state) {
    const cards = [];
    for (const tariff of state.tariffs) {
      const card = this.doc.createElement("article");
      card.className = tariff.current ? "card current" : "card";
      card.append(
        this.element("h3", tariff.current ? `${tariff.name} (your tariff)` : tariff.name),
        this.element("p", tariff.note),
        this.element("p", `Electricity ${tariff.electricityUnitRate}, ${tariff.electricityStandingCharge}`),
        this.element("p", `Gas ${tariff.gasUnitRate}, ${tariff.gasStandingCharge}`),
        this.element("p", `${tariff.term} · exit fee ${tariff.exitFee}`),
        this.element("p", `About ${tariff.estimatedAnnualCost} a year at your usage`, "strong"),
      );
      if (tariff.requiresHeatPump) {
        card.append(this.element("p", "Needs a heat pump at the property.", "rule"));
      }
      if (!tariff.current) {
        const button = this.element("button", `Compare ${tariff.name}`);
        button.type = "button";
        button.addEventListener("click", this.compareTariff.bind(this, tariff.id));
        card.append(button);
      }
      cards.push(card);
    }
    this.doc.getElementById("tariff-list").replaceChildren(...cards);
  }

  /**
   * Draw the comparison panel.
   *
   * :param state: The page state.
   */
  renderComparison(state) {
    const panel = this.doc.getElementById("comparison-panel");
    const clear = this.doc.getElementById("comparison-clear");
    if (state.comparison === null) {
      panel.textContent = "Choose \"Compare\" on a tariff to see it next to yours.";
      clear.hidden = true;
      return;
    }
    const difference = state.comparison.comparedWithCurrent === "The same as now"
      ? "the same as your current tariff"
      : `${state.comparison.comparedWithCurrent} than your current tariff`;
    panel.textContent = `${state.comparison.name}: about ${state.comparison.estimatedAnnualCost} a year at your usage, `
      + `${difference}. ${state.comparison.term}, exit fee ${state.comparison.exitFee}.`;
    clear.hidden = false;
  }

  /**
   * Draw the switch form's options and the latest switch.
   *
   * :param state: The page state.
   */
  renderSwitch(state) {
    const select = this.doc.getElementById("switch-tariff");
    const chosen = select.value;
    const options = [];
    let keep = "";
    for (const tariff of state.tariffs) {
      if (!tariff.current) {
        options.push(new Option(tariff.name, tariff.id));
        if (tariff.id === chosen) {
          keep = chosen;
        }
      }
    }
    select.replaceChildren(...options);
    select.value = keep || options[0].value;
    const result = this.doc.getElementById("switch-result");
    if (state.latestSwitch === null) {
      result.textContent = "";
      result.hidden = true;
      return;
    }
    result.textContent = `Switched from ${state.latestSwitch.from} to ${state.latestSwitch.to}. `
      + `Reference ${state.latestSwitch.reference}. Exit fee charged: ${state.latestSwitch.exitFeeCharged}.`;
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
 * Starts the account page. index.html loads this module.
 *
 * It keeps the one running page in App.page. The assistant's actions (site-actions.js)
 * and its confirmation dialog (site.js) import this module by the same URL and use that
 * page, so they share its state.
 */
export class App {
  /** The running account page. */
  static page = null;

  /**
   * Create and start the page.
   *
   * :param doc: The page's document.
   * :return: The running page.
   */
  static start(doc) {
    const page = new AccountPage(doc);
    page.start();
    return page;
  }
}

App.page = App.start(document);
