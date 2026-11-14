// The swarm this site belongs to: the 11 agents of the three linked demo sites, grouped
// by the site that publishes them, and who may call whom.
//
// It is a fixed copy of what the three published networks say, so the page can draw the
// whole swarm without contacting a partner site before the visitor agrees (spec 3.2,
// "Consent"). sites/utility/tests/swarm-graph.test.mjs checks it against each site's
// .network.json, so a changed network fails the tests until this file follows.
//
// This file is the same on all three sites.

/**
 * The swarm's sites, agents and calls, as plain data.
 */
export class SwarmMap {
  /**
   * The three sites, in the order the graph draws them. color is each site's own brand
   * colour, as in its styles.css. glow is a lighter shade of it for the graph's dark
   * background.
   */
  static SITES = [
    {network: "emberwick_energy", name: "Emberwick Energy", icon: "⚡", color: "#9a3412", glow: "#fb923c"},
    {network: "heatwright_installers", name: "Heatwright Home Energy", icon: "🔧", color: "#0f5132", glow: "#34d399"},
    {network: "fernbrook_grants", name: "Fernbrook Retrofit Grants", icon: "🌱", color: "#3730a3", glow: "#a5b4fc"},
  ];

  /**
   * Every agent: its network, its name there, a short label for the graph and one line
   * on its job. The front agent of each network is the one other sites reach.
   */
  static AGENTS = [
    {network: "emberwick_energy", name: "emberwick_assistant", label: "Assistant", front: true, does: "Front agent: answers the customer and hands work to the specialists."},
    {network: "emberwick_energy", name: "tariff_advisor", label: "Tariffs", does: "Works out which tariff suits this account."},
    {network: "emberwick_energy", name: "usage_analyst", label: "Usage", does: "Reads the account's usage, month by month."},
    {network: "emberwick_energy", name: "retrofit_planner", label: "Retrofit", does: "Plans a heat pump or solar upgrade with the installer and grants partners."},
    {network: "heatwright_installers", name: "heatwright_assistant", label: "Assistant", front: true, does: "Front agent: answers for the installer and hands work to its engineers."},
    {network: "heatwright_installers", name: "heat_pump_engineer", label: "Heat pump", does: "Sizes and prices an air-source heat pump for one home."},
    {network: "heatwright_installers", name: "solar_designer", label: "Solar", does: "Picks and prices a solar panel system for one home."},
    {network: "fernbrook_grants", name: "fernbrook_assistant", label: "Assistant", front: true, does: "Front agent: asks each scheme's agent whether it fits (AAOSA), then combines the replies."},
    {network: "fernbrook_grants", name: "heat_pump_grant_agent", label: "Heat pump grant", does: "Knows the heat pump grant scheme and checks eligibility."},
    {network: "fernbrook_grants", name: "solar_starter_agent", label: "Solar Starter", does: "Knows the Solar Starter scheme and checks eligibility."},
    {network: "fernbrook_grants", name: "warm_walls_agent", label: "Warm Walls", does: "Knows the Warm Walls insulation scheme and checks eligibility."},
  ];

  /**
   * Who may call whom, as [caller, called] keys. A call into another network always
   * reaches its front agent, and the visitor is asked first.
   */
  static CALLS = [
    ["emberwick_energy/emberwick_assistant", "emberwick_energy/tariff_advisor"],
    ["emberwick_energy/emberwick_assistant", "emberwick_energy/usage_analyst"],
    ["emberwick_energy/emberwick_assistant", "emberwick_energy/retrofit_planner"],
    ["emberwick_energy/retrofit_planner", "emberwick_energy/usage_analyst"],
    ["emberwick_energy/retrofit_planner", "heatwright_installers/heatwright_assistant"],
    ["emberwick_energy/retrofit_planner", "fernbrook_grants/fernbrook_assistant"],
    ["heatwright_installers/heatwright_assistant", "heatwright_installers/heat_pump_engineer"],
    ["heatwright_installers/heatwright_assistant", "heatwright_installers/solar_designer"],
    ["heatwright_installers/heatwright_assistant", "fernbrook_grants/fernbrook_assistant"],
    ["heatwright_installers/heatwright_assistant", "emberwick_energy/emberwick_assistant"],
    ["fernbrook_grants/fernbrook_assistant", "fernbrook_grants/heat_pump_grant_agent"],
    ["fernbrook_grants/fernbrook_assistant", "fernbrook_grants/solar_starter_agent"],
    ["fernbrook_grants/fernbrook_assistant", "fernbrook_grants/warm_walls_agent"],
  ];

  /**
   * Name an agent across the swarm.
   *
   * :param network: The agent's network name.
   * :param name: The agent's name in that network.
   * :return: The key, such as "emberwick_energy/tariff_advisor".
   */
  static key(network, name) {
    return `${network}/${name}`;
  }

  /**
   * Find an agent by its key.
   *
   * :param key: A key from key().
   * :return: The agent, or null when the swarm has none by that key.
   */
  static agent(key) {
    return SwarmMap.AGENTS.find((agent) => SwarmMap.key(agent.network, agent.name) === key) || null;
  }

  /**
   * Find a site by its network name.
   *
   * :param network: The network name.
   * :return: The site, or null.
   */
  static site(network) {
    return SwarmMap.SITES.find((site) => site.network === network) || null;
  }

  /**
   * Give the key of a network's front agent.
   *
   * :param network: The network name.
   * :return: The key, or "" when the swarm has no such network.
   */
  static front(network) {
    const agent = SwarmMap.AGENTS.find((candidate) => candidate.network === network && candidate.front);
    return agent ? SwarmMap.key(agent.network, agent.name) : "";
  }
}
