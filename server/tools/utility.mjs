// Emberwick Energy: read-only MCP tools over the tariffs on offer, with the site's own
// cost rules. They never read or return a customer's account: that lives only in the
// visitor's own page (js/account-data.js holds the demo account, which is not used here).
import { AccountData } from "../../sites/utility/js/account-data.js";
import { TariffRules } from "../../sites/utility/js/tariff-rules.js";

/** Said with every answer, as the page says it (CLAUDE.md rule 10). */
const DISCLAIMER = "Fictional demo data: Emberwick and its tariffs are not real.";

/**
 * The public side of a tariff.
 *
 * :param tariff: A tariff from AccountData.TARIFFS.
 * :return: Its name, rates, term, exit fee and conditions, formatted as the page shows them.
 */
function describe(tariff) {
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
  };
}

/**
 * The tariffs on offer.
 *
 * :param args: None.
 * :param context: {page}, this site's page address.
 * :return: Every tariff's public details.
 */
function listTariffs(args, context) {
  return {
    ok: true,
    disclaimer: DISCLAIMER,
    tariffs: AccountData.TARIFFS.map(describe),
    note: "A customer's own usage, tariff and switch are only on Emberwick's page.",
    page: context.page,
  };
}

/**
 * Each tariff's yearly cost for a usage the caller gives. Changes nothing.
 *
 * :param args: electricityKwh, gasKwh and hasHeatPump.
 * :param context: {page}, this site's page address.
 * :return: The tariffs from cheapest to dearest, which ones the home can have, and the
 *     cheapest of those.
 */
function estimateYearlyCosts(args, context) {
  const rows = AccountData.TARIFFS.map((tariff) => {
    const pence = TariffRules.annualCostPence(tariff, args.electricityKwh, args.gasKwh);
    return {
      tariff: tariff.name,
      estimatedYearlyCost: TariffRules.pounds(pence),
      estimatedYearlyCostPence: pence,
      available: !tariff.requiresHeatPump || args.hasHeatPump,
      requiresHeatPump: tariff.requiresHeatPump,
      term: tariff.term,
      exitFee: TariffRules.pounds(tariff.exitFeePence),
    };
  });
  rows.sort((a, b) => a.estimatedYearlyCostPence - b.estimatedYearlyCostPence);
  const cheapest = rows.find((row) => row.available);
  return {
    ok: true,
    disclaimer: DISCLAIMER,
    usage: {electricityKwh: args.electricityKwh, gasKwh: args.gasKwh, hasHeatPump: args.hasHeatPump},
    tariffs: rows,
    cheapestAvailable: cheapest.tariff,
    note: "Estimates from the usage given, with each tariff's unit rates and 365 days of standing charges. Switching is done on Emberwick's own page.",
    page: context.page,
  };
}

export const UTILITY = {
  name: "emberwick-energy",
  title: "Emberwick Energy",
  version: "1.0.0",
  instructions: `${DISCLAIMER} Read-only: lists the tariffs on offer and estimates their yearly cost for a usage you give. It never returns a customer's account.`,
  tools: [
    {
      name: "list_tariffs",
      title: "List tariffs",
      description: "Lists Emberwick's tariffs with unit rates, standing charges, term, exit fee and whether a heat pump is needed. Fictional demo data.",
      inputSchema: {type: "object", properties: {}, additionalProperties: false},
      run: listTariffs,
    },
    {
      name: "estimate_yearly_costs",
      title: "Estimate yearly costs",
      description: "Estimates each tariff's yearly cost for a year's electricity and gas use, cheapest first, and says which tariffs a home without or with a heat pump can have. Saves nothing.",
      inputSchema: {
        type: "object",
        properties: {
          electricityKwh: {type: "integer", minimum: 0, maximum: 100000, description: "Electricity used in a year, in kWh."},
          gasKwh: {type: "integer", minimum: 0, maximum: 200000, description: "Gas used in a year, in kWh. Use 0 for a home with no gas."},
          hasHeatPump: {type: "boolean", description: "Whether the home is heated by a heat pump."},
        },
        required: ["electricityKwh", "gasKwh", "hasHeatPump"],
        additionalProperties: false,
      },
      run: estimateYearlyCosts,
    },
  ],
};
