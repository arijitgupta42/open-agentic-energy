// Heatwright Home Energy: read-only MCP tools over the site's own data and rules.
// The page's estimate form and these tools call the same InstallRules functions.
import { InstallData } from "../../sites/installer/js/install-data.js";
import { InstallRules } from "../../sites/installer/js/install-rules.js";

/** Said with every answer, as the page says it (CLAUDE.md rule 10). */
const DISCLAIMER = "Fictional demo data: Heatwright, its products and its prices are not real.";

/**
 * What Heatwright fits and its indicative prices.
 *
 * :param args: None.
 * :param context: {page}, this site's page address.
 * :return: The products, the home types and the estimate's limits.
 */
function listProducts(args, context) {
  return {
    ok: true,
    disclaimer: DISCLAIMER,
    products: InstallData.PRODUCTS.map((product) => ({
      id: product.id,
      measure: InstallRules.find(InstallData.MEASURES, product.measure).name,
      name: product.name,
      priceRange: InstallRules.priceRange(product),
    })),
    measures: InstallData.MEASURES.map((measure) => ({id: measure.id, name: measure.name})),
    homeTypes: InstallData.HOME_TYPES.map((home) => ({id: home.id, name: home.name})),
    floorAreaM2: {min: InstallData.MIN_AREA_M2, max: InstallData.MAX_AREA_M2},
    notes: InstallData.NOTES,
    howToBook: "A free home survey sets the final price. Surveys are requested on Heatwright's own page, which takes the name and contact details.",
    page: context.page,
  };
}

/**
 * An indicative estimate for one home. Changes nothing.
 *
 * :param args: measure, homeType and floorAreaM2.
 * :param context: {page}, this site's page address.
 * :return: The page's estimate, or its refusal.
 */
function estimate(args, context) {
  const result = InstallRules.estimate(args);
  if (!result.ok) {
    return result;
  }
  return {ok: true, disclaimer: DISCLAIMER, estimate: result.estimate, notes: InstallData.NOTES, page: context.page};
}

export const INSTALLER = {
  name: "heatwright-installers",
  title: "Heatwright Home Energy",
  version: "1.0.0",
  instructions: `${DISCLAIMER} Read-only: lists what Heatwright fits with indicative prices, and estimates for one home. Surveys are requested on the site's own page.`,
  tools: [
    {
      name: "list_products",
      title: "List products",
      description: "Lists the heat pumps and solar panel systems Heatwright fits, with indicative price ranges including fitting, the home types and the floor areas an estimate covers. Fictional demo data.",
      inputSchema: {type: "object", properties: {}, additionalProperties: false},
      run: listProducts,
    },
    {
      name: "estimate",
      title: "Estimate for a home",
      description: "Gives an indicative estimate for one home: the product that suits it and its price range, from what to fit, the type of home and its floor area. Saves nothing and takes no contact details.",
      inputSchema: {
        type: "object",
        properties: {
          measure: {type: "string", enum: InstallData.MEASURES.map((measure) => measure.id), description: "What to fit."},
          homeType: {type: "string", enum: InstallData.HOME_TYPES.map((home) => home.id), description: "The type of home."},
          floorAreaM2: {type: "integer", minimum: InstallData.MIN_AREA_M2, maximum: InstallData.MAX_AREA_M2, description: "The home's floor area in square metres."},
        },
        required: ["measure", "homeType", "floorAreaM2"],
        additionalProperties: false,
      },
      run: estimate,
    },
  ],
};
