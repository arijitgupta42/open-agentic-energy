import { InstallData } from "./install-data.js";

/**
 * The installer's business rules: which product suits a home, and when a survey request
 * is complete.
 *
 * The page's own forms and the assistant's actions both go through these functions.
 */
export class InstallRules {
  /**
   * Find an entry by id in one of the data lists.
   *
   * :param list: A list of entries with ids.
   * :param id: The id to find.
   * :return: The entry, or undefined.
   */
  static find(list, id) {
    for (const entry of list) {
      if (entry.id === id) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Work out an indicative estimate without changing anything.
   *
   * :param input: The home, with measure, homeType and floorAreaM2.
   * :return: {ok: true, estimate} or {ok: false, reason, field}.
   */
  static estimate(input) {
    const measure = InstallRules.find(InstallData.MEASURES, input.measure);
    if (!measure) {
      return {ok: false, reason: "Choose a heat pump or solar panels.", field: "measure"};
    }
    const home = InstallRules.find(InstallData.HOME_TYPES, input.homeType);
    if (!home) {
      return {ok: false, reason: "Choose the type of home.", field: "homeType"};
    }
    const area = input.floorAreaM2;
    if (!Number.isInteger(area) || area < InstallData.MIN_AREA_M2 || area > InstallData.MAX_AREA_M2) {
      return {
        ok: false,
        reason: `Give the floor area as a whole number from ${InstallData.MIN_AREA_M2} to ${InstallData.MAX_AREA_M2} square metres.`,
        field: "floorAreaM2",
      };
    }
    let product = null;
    let heatLoss = null;
    if (measure.id === "heat-pump") {
      const watts = area * home.wattsPerM2;
      heatLoss = InstallRules.kilowatts(watts);
      for (const candidate of InstallData.PRODUCTS) {
        if (product === null && candidate.measure === "heat-pump" && candidate.outputWatts >= watts) {
          product = candidate;
        }
      }
      if (product === null) {
        return {
          ok: false,
          reason: `A home this size loses about ${heatLoss} of heat on a cold day, which is more than our largest heat pump gives.`,
          field: "floorAreaM2",
        };
      }
    } else {
      if (home.id === "flat") {
        return {ok: false, reason: "We do not fit solar panels on flats, because the roof is usually shared.", field: "homeType"};
      }
      product = InstallRules.find(InstallData.PRODUCTS, area >= InstallData.LARGE_ROOF_FROM_M2 ? "solar-5" : "solar-3");
    }
    return {
      ok: true,
      estimate: {
        measure: measure.id,
        measureName: measure.name,
        homeType: home.id,
        homeTypeName: home.name,
        floorAreaM2: area,
        estimatedHeatLoss: heatLoss,
        productId: product.id,
        product: product.name,
        priceRange: InstallRules.priceRange(product),
        note: InstallData.NOTES[0],
      },
    };
  }

  /**
   * Check a survey visit, without changing anything. The surveyor visits the signed-in
   * customer, so only the time is chosen.
   *
   * :param args: The request, with window.
   * :return: {ok: true, fullName, email, postcodeArea, window} with the customer's
   *   details, or {ok: false, reason, field}.
   */
  static checkVisit(args) {
    const window = InstallRules.find(InstallData.SURVEY_WINDOWS, args.window);
    if (!window) {
      return {ok: false, reason: "Choose when the surveyor can visit.", field: "window"};
    }
    const customer = InstallData.CUSTOMER;
    return {
      ok: true,
      fullName: customer.fullName,
      email: customer.email,
      postcodeArea: customer.postcodeArea,
      window: window.name,
    };
  }

  /**
   * Format watts as kilowatts with one decimal place, such as "6.7 kW".
   *
   * :param watts: The power in watts.
   * :return: The power as the page shows it.
   */
  static kilowatts(watts) {
    const tenths = Math.round(watts / 100);
    return `${Math.floor(tenths / 10)}.${tenths % 10} kW`;
  }

  /**
   * Format pence as whole pounds, such as "£9,200".
   *
   * :param pence: A whole number of pence.
   * :return: The amount as the page shows it.
   */
  static pounds(pence) {
    return `£${Math.round(pence / 100).toLocaleString("en-GB")}`;
  }

  /**
   * Format a product's indicative price range.
   *
   * :param product: The product.
   * :return: Words such as "£9,200 to £11,200".
   */
  static priceRange(product) {
    return `${InstallRules.pounds(product.fromPence)} to ${InstallRules.pounds(product.toPence)}`;
  }
}
