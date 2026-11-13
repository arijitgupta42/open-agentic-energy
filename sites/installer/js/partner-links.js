/**
 * The partner sites this page links to.
 *
 * The page renders these links and the assistant reads them through the state reader,
 * so both give the same address. scripts/set-origins.mjs rewrites the origins when the
 * sites move from local hosts to their production hosts.
 */
export class PartnerLinks {
  static LINKS = [
    {
      name: "Fernbrook Retrofit Grants",
      what: "Grants towards heat pumps, solar panels and insulation, with an eligibility check.",
      url: "https://fernbrook-grants.open-agentic-energy.workers.dev/",
    },
    {
      name: "Emberwick Energy",
      what: "Energy tariffs, including one with a lower electricity rate for homes heated by a heat pump.",
      url: "https://emberwick-energy.open-agentic-energy.workers.dev/",
    },
  ];
}
