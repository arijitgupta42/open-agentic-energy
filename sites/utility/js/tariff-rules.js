/**
 * The account page's business rules: what a tariff costs and when a switch is allowed.
 *
 * The page's own buttons and the assistant's actions both go through these functions,
 * so they follow one set of rules.
 */
export class TariffRules {
  /** Days in the year used for standing charges. */
  static DAYS = 365;

  /**
   * Work out a year's cost on a tariff for a given usage.
   *
   * :param tariff: A tariff from AccountData.TARIFFS.
   * :param electricityKwh: Electricity used in the year.
   * :param gasKwh: Gas used in the year.
   * :return: The cost in whole pence, rounded half up.
   */
  static annualCostPence(tariff, electricityKwh, gasKwh) {
    const tenths = electricityKwh * tariff.electricityUnit
      + gasKwh * tariff.gasUnit
      + (tariff.electricityStanding + tariff.gasStanding) * TariffRules.DAYS;
    return Math.round(tenths / 10);
  }

  /**
   * Work out a year's cost on a tariff for a home with no gas supply: electricity only,
   * with no gas standing charge.
   *
   * :param tariff: A tariff from AccountData.TARIFFS.
   * :param electricityKwh: Electricity used in the year.
   * :return: The cost in whole pence, rounded half up.
   */
  static electricOnlyCostPence(tariff, electricityKwh) {
    const tenths = electricityKwh * tariff.electricityUnit + tariff.electricityStanding * TariffRules.DAYS;
    return Math.round(tenths / 10);
  }

  /**
   * Work out a year's electricity if a heat pump took over the heating a gas boiler does.
   * The heat the boiler gave (gas times its efficiency) comes instead from the heat
   * pump, which uses one unit of electricity for each `heatPumpEfficiencyTenths / 10`
   * units of heat.
   *
   * :param electricityKwh: Electricity used in the year now.
   * :param gasKwh: Gas used in the year now.
   * :param estimate: AccountData.HEAT_PUMP_ESTIMATE.
   * :return: {extraElectricityKwh, electricityKwh}, whole kWh rounded half up.
   */
  static heatPumpUsage(electricityKwh, gasKwh, estimate) {
    const heatTimesTen = gasKwh * estimate.boilerEfficiencyPercent / 10;
    const extra = Math.round(heatTimesTen / estimate.heatPumpEfficiencyTenths);
    return {extraElectricityKwh: extra, electricityKwh: electricityKwh + extra};
  }

  /**
   * Check a switch without changing anything.
   *
   * :param account: The account, with hasHeatPump.
   * :param current: The tariff the account is on.
   * :param target: The tariff to switch to, or undefined when the id is unknown.
   * :return: {ok: true} or {ok: false, reason, field}.
   */
  static checkSwitch(account, current, target) {
    if (!target) {
      return {
        ok: false,
        reason: "Choose one of the tariffs on this page.",
        field: "tariffId",
      };
    }
    if (target.id === current.id) {
      return {
        ok: false,
        reason: `This account is already on ${current.name}.`,
        field: "tariffId",
      };
    }
    if (target.requiresHeatPump && !account.hasHeatPump) {
      return {
        ok: false,
        reason: `${target.name} needs a heat pump at the property, and this account has none on record.`,
        field: "tariffId",
      };
    }
    return {ok: true};
  }

  /**
   * Format pence as pounds, such as "£1,840.81".
   *
   * :param pence: A whole number of pence, zero or more.
   * :return: The amount as the page shows it.
   */
  static pounds(pence) {
    const whole = Math.floor(pence / 100);
    const rest = String(pence % 100).padStart(2, "0");
    return `£${whole.toLocaleString("en-GB")}.${rest}`;
  }

  /**
   * Format a rate kept in tenths of a penny, such as "26.4p".
   *
   * :param tenths: The rate in tenths of a penny.
   * :return: The rate in pence with one decimal place.
   */
  static pence(tenths) {
    return `${Math.floor(tenths / 10)}.${tenths % 10}p`;
  }
}
