// Point every site at its partners' origins for one environment, then rebuild.
//
// Usage:
//   node scripts/set-origins.mjs local        the hosts scripts/serve-all.mjs uses
//   node scripts/set-origins.mjs production   the https origins in origins.json
//
// A site names its partners in three places: the partner network URLs in its .hocon
// ("tools" and "link_labels"), the origins in agent-manifest.json ("allowed_peers") and
// the page links in js/partner-links.js. This script rewrites all three from
// origins.json, so they never disagree. Each site must sit at the root of its own
// origin: the partner tool's name comes from the URL's path.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Sites } from "./sites.mjs";

/**
 * Rewrites partner origins in the sites' source files.
 */
class SetOrigins {
  /**
   * Rewrite the origins and rebuild every site.
   *
   * :param argv: The command-line arguments after the script name.
   * :raises Error: When the environment is unknown or an origin is not usable.
   */
  static async run(argv) {
    const origins = await Sites.origins();
    const target = argv[0];
    if (!target || !Object.hasOwn(origins, target)) {
      throw new Error(`Give an environment from origins.json: ${Object.keys(origins).join(" or ")}.`);
    }
    for (const site of Sites.LIST) {
      SetOrigins.checkOrigin(site.id, origins[target][site.id], target);
    }
    let changed = 0;
    for (const site of Sites.LIST) {
      for (const name of site.originFiles) {
        const file = path.join(Sites.dir(site), name);
        const before = await readFile(file, "utf8");
        const after = SetOrigins.rewrite(before, origins, target);
        if (after !== before) {
          await writeFile(file, after);
          changed += 1;
          console.log(`Updated ${path.relative(Sites.ROOT, file)}`);
        }
      }
    }
    console.log(changed ? `Rewrote ${changed} file(s) for "${target}". Rebuilding.` : `Already set for "${target}". Rebuilding.`);
    const build = spawnSync(process.execPath, [path.join(Sites.ROOT, "scripts", "build-all.mjs")], {stdio: "inherit"});
    process.exitCode = build.status === 0 ? 0 : 1;
  }

  /**
   * Refuse an origin the sites cannot be published under.
   *
   * :param id: The site's id.
   * :param origin: The origin from origins.json.
   * :param target: The environment's name.
   * :raises Error: When the origin is missing, a placeholder, or not a bare origin.
   */
  static checkOrigin(id, origin, target) {
    if (typeof origin !== "string" || origin.includes("REPLACE-ME")) {
      throw new Error(`Set the "${target}" origin of "${id}" in origins.json first. It is still a placeholder.`);
    }
    const url = new URL(origin);
    if (url.origin !== origin) {
      throw new Error(`"${origin}" is not a bare origin. Give the scheme, host and port only, such as https://energy.example, with no path and no "/" at the end.`);
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !loopback) {
      throw new Error(`"${origin}" must use https: only this machine's own hosts may use http.`);
    }
  }

  /**
   * Replace every environment's origin of each site with the target environment's.
   *
   * :param text: A source file's text.
   * :param origins: The parsed origins.json.
   * :param target: The environment to switch to.
   * :return: The rewritten text.
   */
  static rewrite(text, origins, target) {
    let result = text;
    for (const site of Sites.LIST) {
      for (const environment of Object.keys(origins)) {
        const from = origins[environment][site.id];
        if (environment !== target && typeof from === "string" && !from.includes("REPLACE-ME")) {
          result = result.split(from).join(origins[target][site.id]);
        }
      }
    }
    return result;
  }
}

try {
  await SetOrigins.run(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
