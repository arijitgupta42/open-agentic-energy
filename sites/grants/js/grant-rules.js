import { GrantData } from "./grant-data.js";

/**
 * The grant site's business rules: which schemes a household can apply for, and when an
 * application has what it needs.
 *
 * The page's own forms and the assistant's actions both go through these functions.
 */
export class GrantRules {
  /** The eligibility answers and the list each one is chosen from. */
  static QUESTIONS = [
    {answer: "tenure", options: GrantData.TENURES, missing: "Say who owns or rents the home."},
    {answer: "currentHeating", options: GrantData.HEATING, missing: "Say how the home is heated now."},
    {answer: "epcBand", options: GrantData.EPC_BANDS, missing: "Give the home's EPC band, or say you don't know it."},
    {answer: "incomeBand", options: GrantData.INCOME_BANDS, missing: "Choose an income band, or say you'd rather not say."},
  ];

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
   * Check a set of eligibility answers without changing anything.
   *
   * :param input: The answers, with tenure, currentHeating, epcBand and incomeBand.
   * :return: {ok: true, answers} with ids and readable names, or {ok: false, reason, field}.
   */
  static checkAnswers(input) {
    const answers = {};
    for (const question of GrantRules.QUESTIONS) {
      const chosen = GrantRules.find(question.options, input[question.answer]);
      if (!chosen) {
        return {ok: false, reason: question.missing, field: question.answer};
      }
      answers[question.answer] = chosen.id;
      answers[`${question.answer}Name`] = chosen.name;
    }
    return {ok: true, answers: answers};
  }

  /**
   * Decide one scheme for a set of answers.
   *
   * :param scheme: A scheme from GrantData.SCHEMES.
   * :param answers: Checked answers, by id.
   * :return: {eligible, reasons}, with one reason for each rule the answers do not meet.
   */
  static assess(scheme, answers) {
    const reasons = [];
    for (const rule of scheme.rules) {
      if (!rule.allowed.includes(answers[rule.answer])) {
        reasons.push(rule.failure);
      }
    }
    return {
      eligible: reasons.length === 0,
      reasons: reasons,
    };
  }

  /**
   * Check an applicant's contact details, without changing anything.
   *
   * :param args: The application, with fullName and email.
   * :return: {ok: true, fullName, email} with tidied values, or {ok: false, reason, field}.
   */
  static checkContact(args) {
    const fullName = String(args.fullName ?? "").trim();
    if (!fullName) {
      return {ok: false, reason: "Give the applicant's full name.", field: "fullName"};
    }
    const email = String(args.email ?? "").trim();
    if (!GrantRules.looksLikeEmail(email)) {
      return {ok: false, reason: "Give an email address such as name@example.com.", field: "email"};
    }
    return {
      ok: true,
      fullName: fullName,
      email: email,
    };
  }

  /**
   * Say whether text has the shape of an email address.
   *
   * :param text: The trimmed text.
   * :return: True for one "@" with a name before it and a dotted domain after it.
   */
  static looksLikeEmail(text) {
    const parts = text.split("@");
    if (parts.length !== 2 || !parts[0] || /\s/.test(text)) {
      return false;
    }
    const domain = parts[1].split(".");
    return domain.length >= 2 && domain.every(Boolean);
  }
}
