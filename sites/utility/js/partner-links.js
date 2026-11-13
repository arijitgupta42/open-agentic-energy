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
      name: "Heatwright Home Energy",
      what: "Heat pump and solar panel installation, estimates and home surveys.",
      url: "https://heatwright-installers.open-agentic-energy.workers.dev/",
    },
    {
      name: "Fernbrook Retrofit Grants",
      what: "Grants towards heat pumps, solar panels and insulation, with an eligibility check.",
      url: "https://fernbrook-grants.open-agentic-energy.workers.dev/",
    },
  ];
}
