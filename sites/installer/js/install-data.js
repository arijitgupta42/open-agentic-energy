/**
 * Demo data for the Heatwright Home Energy site.
 *
 * Everything here is fictional: the installer, the products and the prices. Prices are
 * whole pence.
 */
export class InstallData {
  /** What the site installs. */
  static MEASURES = [
    {id: "heat-pump", name: "Heat pump"},
    {id: "solar", name: "Solar panels"},
  ];

  /** Home types, each with the heat it loses per square metre on a cold day, in watts. */
  static HOME_TYPES = [
    {id: "flat", name: "Flat", wattsPerM2: 50},
    {id: "terraced", name: "Terraced house", wattsPerM2: 60},
    {id: "semi-detached", name: "Semi-detached house", wattsPerM2: 70},
    {id: "detached", name: "Detached house", wattsPerM2: 80},
  ];

  /** Products, smallest first within each measure. outputWatts is for heat pumps only. */
  static PRODUCTS = [
    {id: "ashp-5", measure: "heat-pump", name: "5 kW air-source heat pump", outputWatts: 5000, fromPence: 780000, toPence: 940000},
    {id: "ashp-8", measure: "heat-pump", name: "8 kW air-source heat pump", outputWatts: 8000, fromPence: 920000, toPence: 1120000},
    {id: "ashp-12", measure: "heat-pump", name: "12 kW air-source heat pump", outputWatts: 12000, fromPence: 1150000, toPence: 1420000},
    {id: "solar-3", measure: "solar", name: "3.2 kWp solar panel system (8 panels)", fromPence: 520000, toPence: 640000},
    {id: "solar-5", measure: "solar", name: "4.8 kWp solar panel system (12 panels)", fromPence: 690000, toPence: 830000},
  ];

  /** Homes at or above this floor area get the larger solar system. */
  static LARGE_ROOF_FROM_M2 = 90;

  /** The smallest and largest floor area the estimate covers, in square metres. */
  static MIN_AREA_M2 = 20;

  static MAX_AREA_M2 = 400;

  /** When a surveyor can visit. */
  static SURVEY_WINDOWS = [
    {id: "weekday-morning", name: "Weekday morning"},
    {id: "weekday-afternoon", name: "Weekday afternoon"},
    {id: "saturday-morning", name: "Saturday morning"},
  ];

  /** What the page says about its estimates. */
  static NOTES = [
    "Estimates are indicative. A free home survey sets the final price.",
    "We do not fit solar panels on flats, because the roof is usually shared.",
    "Prices include fitting and exclude any grant.",
  ];
}
