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
      what: "Heat pump and solar panel estimates for your home, and survey requests.",
      url: "https://heatwright-installers.open-agentic-energy.workers.dev/",
    },
  ];
}
