// Fernbrook Retrofit Grants: read-only MCP tools over the site's own data and rules.
// The page's eligibility check and these tools call the same GrantRules functions.
import { GrantData } from "../../sites/grants/js/grant-data.js";
import { GrantRules } from "../../sites/grants/js/grant-rules.js";

/** Said with every answer, as the page says it (CLAUDE.md rule 10). */
const DISCLAIMER = "Fictional demo data: Fernbrook and its schemes are not real grants.";

/**
 * The ids a question allows, for an input schema.
 *
 * :param options: A data list with ids.
 * :return: The ids.
 */
function ids(options) {
  return options.map((option) => option.id);
}

/**
 * The schemes, their amounts and the conditions behind them.
 *
 * :param args: None.
 * :param context: {page}, this site's page address.
 * :return: The public scheme list and the eligibility questions.
 */
function listGrants(args, context) {
  const names = new Map();
  for (const question of GrantRules.QUESTIONS) {
    names.set(question.answer, new Map(question.options.map((option) => [option.id, option.name])));
  }
  return {
    ok: true,
    disclaimer: DISCLAIMER,
    schemes: GrantData.SCHEMES.map((scheme) => ({
      id: scheme.id,
      name: scheme.name,
      amount: scheme.amountWords,
      summary: scheme.summary,
      conditions: scheme.rules.map((rule) => ({
        answer: rule.answer,
        allowed: rule.allowed.map((id) => names.get(rule.answer).get(id)),
        otherwise: rule.failure,
      })),
    })),
    eligibilityQuestions: GrantRules.QUESTIONS.map((question) => ({
      answer: question.answer,
      options: question.options.map((option) => ({id: option.id, name: option.name})),
    })),
    howToApply: "Check eligibility, then start an application on Fernbrook's own page. An application needs the applicant's name and email, which only that page takes.",
    page: context.page,
  };
}

/**
 * Which schemes a household could apply for, from four answers. Changes nothing.
 *
 * :param args: tenure, currentHeating, epcBand and incomeBand, as ids.
 * :param context: {page}, this site's page address.
 * :return: Each scheme with eligible and its reasons, or the page's refusal.
 */
function checkEligibility(args, context) {
  const checked = GrantRules.checkAnswers(args);
  if (!checked.ok) {
    return checked;
  }
  return {
    ok: true,
    disclaimer: DISCLAIMER,
    answers: {
      tenure: checked.answers.tenureName,
      currentHeating: checked.answers.currentHeatingName,
      epcBand: checked.answers.epcBandName,
      incomeBand: checked.answers.incomeBandName,
    },
    results: GrantData.SCHEMES.map((scheme) => {
      const outcome = GrantRules.assess(scheme, checked.answers);
      return {
        scheme: scheme.name,
        amount: scheme.amountWords,
        eligible: outcome.eligible,
        reasons: outcome.reasons,
      };
    }),
    note: "This check is not an application and nothing is saved. To apply, use Fernbrook's own page.",
    page: context.page,
  };
}

export const GRANTS = {
  name: "fernbrook-grants",
  title: "Fernbrook Retrofit Grants",
  version: "1.0.0",
  instructions: `${DISCLAIMER} Read-only: lists the schemes and checks eligibility from four answers. Applications are made on the site's own page.`,
  tools: [
    {
      name: "list_grants",
      title: "List grants",
      description: "Lists Fernbrook's grant schemes with each amount, what it pays towards and the conditions, plus the four eligibility questions and their allowed answers. Fictional demo data.",
      inputSchema: {type: "object", properties: {}, additionalProperties: false},
      run: listGrants,
    },
    {
      name: "check_eligibility",
      title: "Check eligibility",
      description: "Checks which Fernbrook schemes a household could apply for, from four answers given as ids from list_grants. Saves nothing and takes no name or contact details.",
      inputSchema: {
        type: "object",
        properties: {
          tenure: {type: "string", enum: ids(GrantData.TENURES), description: "Who owns or rents the home."},
          currentHeating: {type: "string", enum: ids(GrantData.HEATING), description: "How the home is heated now."},
          epcBand: {type: "string", enum: ids(GrantData.EPC_BANDS), description: "The home's EPC band, or unknown."},
          incomeBand: {type: "string", enum: ids(GrantData.INCOME_BANDS), description: "The household's yearly income band, or not-given."},
        },
        required: ["tenure", "currentHeating", "epcBand", "incomeBand"],
        additionalProperties: false,
      },
      run: checkEligibility,
    },
  ],
};
