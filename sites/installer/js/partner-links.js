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
      url: "http://localhost:8082/",
    },
    {
      name: "Emberwick Energy",
      what: "Energy tariffs, including one with a lower electricity rate for homes heated by a heat pump.",
      url: "http://127.0.0.1:8080/",
    },
  ];
}
