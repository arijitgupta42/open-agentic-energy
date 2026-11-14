/**
 * Demo data for the Emberwick Energy account page.
 *
 * Everything here is fictional: the supplier, the household, the usage and the tariffs.
 * Rates are kept as whole numbers of tenths of a penny, so no sum uses fractions.
 */
export class AccountData {
  /** The demo account the page shows. */
  static ACCOUNT = {
    reference: "EW-DEMO-1042",
    household: "Demo household, 3-bed semi-detached",
    fuel: "Electricity and gas",
    hasHeatPump: false,
  };

  /**
   * How a heat pump estimate turns a year's gas into electricity: the gas boiler's
   * efficiency in percent, and the heat pump's seasonal efficiency (heat out for each
   * unit of electricity in) in tenths. Fictional round figures for the demo.
   */
  static HEAT_PUMP_ESTIMATE = {
    boilerEfficiencyPercent: 90,
    heatPumpEfficiencyTenths: 30,
  };

  /** The tariff the demo account starts on. */
  static STARTING_TARIFF = "standard-variable";

  /** Twelve months of fictional usage, oldest first, in kWh. */
  static USAGE = [
    {month: "Dec", electricityKwh: 320, gasKwh: 1850},
    {month: "Jan", electricityKwh: 310, gasKwh: 1900},
    {month: "Feb", electricityKwh: 280, gasKwh: 1650},
    {month: "Mar", electricityKwh: 265, gasKwh: 1400},
    {month: "Apr", electricityKwh: 230, gasKwh: 900},
    {month: "May", electricityKwh: 210, gasKwh: 500},
    {month: "Jun", electricityKwh: 195, gasKwh: 250},
    {month: "Jul", electricityKwh: 190, gasKwh: 200},
    {month: "Aug", electricityKwh: 200, gasKwh: 220},
    {month: "Sep", electricityKwh: 225, gasKwh: 450},
    {month: "Oct", electricityKwh: 260, gasKwh: 950},
    {month: "Nov", electricityKwh: 290, gasKwh: 1500},
  ];

  /**
   * The tariffs on offer. Unit rates are tenths of a penny per kWh, standing charges are
   * tenths of a penny per day, and the exit fee is in pence.
   */
  static TARIFFS = [
    {
      id: "standard-variable",
      name: "Standard Variable",
      term: "No fixed term",
      electricityUnit: 264,
      gasUnit: 63,
      electricityStanding: 550,
      gasStanding: 310,
      exitFeePence: 0,
      requiresHeatPump: false,
      note: "Rates can go up or down. Leave at any time.",
    },
    {
      id: "fixed-12",
      name: "Fixed 12 Month",
      term: "12 months",
      electricityUnit: 249,
      gasUnit: 59,
      electricityStanding: 580,
      gasStanding: 320,
      exitFeePence: 5000,
      requiresHeatPump: false,
      note: "Rates stay the same for 12 months.",
    },
    {
      id: "green-flex",
      name: "Green Flex",
      term: "No fixed term",
      electricityUnit: 258,
      gasUnit: 61,
      electricityStanding: 560,
      gasStanding: 310,
      exitFeePence: 0,
      requiresHeatPump: false,
      note: "Electricity matched with renewable generation.",
    },
    {
      id: "heat-pump-saver",
      name: "Heat Pump Saver",
      term: "12 months",
      electricityUnit: 215,
      gasUnit: 66,
      electricityStanding: 600,
      gasStanding: 310,
      exitFeePence: 3000,
      requiresHeatPump: true,
      note: "A lower electricity rate for homes heated by a heat pump.",
    },
  ];
}
