// The sites in this repository and where each one runs. Every script reads this list.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Describes the repository's layout for the scripts in this folder.
 */
export class Sites {
  /** The repository root. */
  static ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  /** The vendored agentify-website skill: build scripts, templates and the runtime. */
  static SKILL = path.join(Sites.ROOT, "tools", "agentify-website");

  /**
   * Each site's folder under sites/, its network name, and the files that hold other
   * sites' origins. The first site is the one submitted to the hackathon.
   */
  static LIST = [
    {
      id: "utility",
      network: "emberwick_energy",
      originFiles: [
        "emberwick_energy.hocon", "agent-manifest.json", "js/partner-links.js",
        // The Safety checks page's test networks (lab/) name this site's own origin.
        "lab/invalid/agent-manifest.json",
        "lab/cycle/agent-manifest.json", "lab/cycle/lab_cycle_a.network.json", "lab/cycle/lab_cycle_b.network.json",
        "lab/budget/agent-manifest.json", "lab/budget/lab_budget.network.json",
        "lab/denied/agent-manifest.json",
      ],
    },
    {
      id: "installer",
      network: "heatwright_installers",
      originFiles: ["heatwright_installers.hocon", "agent-manifest.json", "js/partner-links.js"],
    },
    {
      id: "grants",
      network: "fernbrook_grants",
      originFiles: ["fernbrook_grants.hocon", "agent-manifest.json"],
    },
  ];

  /**
   * Give a site's folder.
   *
   * :param site: An entry of LIST.
   * :return: The absolute path of sites/<id>.
   */
  static dir(site) {
    return path.join(Sites.ROOT, "sites", site.id);
  }

  /**
   * Read origins.json: each environment's origin for each site.
   *
   * :return: The parsed file.
   */
  static async origins() {
    return JSON.parse(await readFile(path.join(Sites.ROOT, "origins.json"), "utf8"));
  }
}
