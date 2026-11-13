// Build every site's published network files with the vendored agentify-website build.
//
// Usage:
//   node scripts/build-all.mjs            write <network>.network.json, discovery files and bridge/
//   node scripts/build-all.mjs --check    fail when a generated file is out of date
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Sites } from "./sites.mjs";

/**
 * Runs tools/agentify-website/scripts/build_network.mjs once per site.
 */
class BuildAll {
  /**
   * Build every site and exit with code 1 when any build fails.
   *
   * :param argv: The command-line arguments after the script name.
   */
  static run(argv) {
    const script = path.join(Sites.SKILL, "scripts", "build_network.mjs");
    let failed = false;
    for (const site of Sites.LIST) {
      const dir = Sites.dir(site);
      const args = [script, path.join(dir, `${site.network}.hocon`), "--manifest", path.join(dir, "agent-manifest.json")];
      if (argv.includes("--check")) {
        args.push("--check");
      }
      console.log(`\n== ${site.id} ==`);
      const result = spawnSync(process.execPath, args, {stdio: "inherit"});
      failed = failed || result.status !== 0;
    }
    process.exitCode = failed ? 1 : 0;
  }
}

BuildAll.run(process.argv.slice(2));
