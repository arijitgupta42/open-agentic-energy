/**
 * Demo data for the Fernbrook Retrofit Grants site.
 *
 * Everything here is fictional: the grant body, the schemes, the amounts and the rules.
 * They are not real grants and say nothing about any real scheme. Amounts are whole pence.
 */
export class GrantData {
  /**
   * The customer signed in to this demo site. Fictional: the same household is signed in
   * on all three demo sites, so nobody is asked for a name, an email or an address.
   */
  static CUSTOMER = {
    fullName: "Ana Silva",
    email: "ana.silva@example.com",
    address: "14 Larkspur Close",
    postcodeArea: "LS6",
  };

  /**
   * The answers a form in the chat offers about the home, as dropdowns (js/chat-forms.js):
   * a partner may need them, and the visitor never types them.
   */
  static HOME_CHOICES = {
    homeTypes: ["Flat", "Terraced house", "Semi-detached house", "Detached house"],
    floorAreasM2: [40, 50, 60, 70, 80, 95, 110, 130, 150, 180, 220],
  };

  /** Who lives in or owns the home. */
  static TENURES = [
    {id: "owner-occupier", name: "I own the home and live in it"},
    {id: "private-landlord", name: "I am a private landlord"},
    {id: "private-tenant", name: "I rent from a private landlord"},
    {id: "social-tenant", name: "I rent from a council or housing association"},
  ];

  /** How the home is heated now. */
  static HEATING = [
    {id: "gas-boiler", name: "Gas boiler"},
    {id: "oil-boiler", name: "Oil boiler"},
    {id: "lpg-boiler", name: "LPG boiler"},
    {id: "electric-heaters", name: "Electric heaters"},
    {id: "heat-pump", name: "Heat pump"},
    {id: "other", name: "Something else"},
  ];

  /** The home's energy performance certificate band. */
  static EPC_BANDS = [
    {id: "A", name: "A"},
    {id: "B", name: "B"},
    {id: "C", name: "C"},
    {id: "D", name: "D"},
    {id: "E", name: "E"},
    {id: "F", name: "F"},
    {id: "G", name: "G"},
    {id: "unknown", name: "I don't know"},
  ];

  /** The household's yearly income before tax. */
  static INCOME_BANDS = [
    {id: "under-31000", name: "Under £31,000"},
    {id: "31000-or-more", name: "£31,000 or more"},
    {id: "not-given", name: "I'd rather not say"},
  ];

  /**
   * The schemes. Each rule names an answer, the values that pass, and what to tell a
   * visitor whose answer does not.
   */
  static SCHEMES = [
    {
      id: "heat-pump-grant",
      name: "Fernbrook Heat Pump Grant",
      amountPence: 500000,
      amountWords: "£5,000",
      summary: "Towards replacing a boiler or electric heaters with an air-source heat pump.",
      rules: [
        {
          answer: "tenure",
          allowed: ["owner-occupier", "private-landlord"],
          failure: "Only owner-occupiers and private landlords can apply.",
        },
        {
          answer: "currentHeating",
          allowed: ["gas-boiler", "oil-boiler", "lpg-boiler", "electric-heaters"],
          failure: "The home must be heated now by a gas, oil or LPG boiler or by electric heaters.",
        },
      ],
    },
    {
      id: "solar-starter",
      name: "Fernbrook Solar Starter",
      amountPence: 120000,
      amountWords: "£1,200",
      summary: "Towards a first solar panel system for lower-income households.",
      rules: [
        {
          answer: "tenure",
          allowed: ["owner-occupier"],
          failure: "Only owner-occupiers can apply.",
        },
        {
          answer: "incomeBand",
          allowed: ["under-31000"],
          failure: "The household's income must be under £31,000 a year.",
        },
      ],
    },
    {
      id: "warm-walls",
      name: "Warm Walls Insulation Voucher",
      amountPence: 200000,
      amountWords: "Up to £2,000",
      summary: "Towards wall or loft insulation for homes that are costly to heat. Tenants need their landlord's agreement.",
      rules: [
        {
          answer: "epcBand",
          allowed: ["D", "E", "F", "G"],
          failure: "The home's EPC band must be D, E, F or G.",
        },
      ],
    },
  ];
}
