// Copy the vendored browser runtime into every site, or check that the copies match.
//
// Usage:
//   node scripts/sync-runtime.mjs           copy tools/agentify-website/runtime into each site
//   node scripts/sync-runtime.mjs --check   fail when a site's copy differs
//
// Each site carries its own copy so that it can be hosted as a plain folder. Never edit
// a site's runtime/ by hand: update tools/agentify-website from upstream, then run this.
import { createHash } from "node:crypto";
import { cp, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Sites } from "./sites.mjs";

/**
 * Keeps each site's runtime/ identical to the vendored one.
 */
export class SyncRuntime {
  /**
   * Hash every file under a folder.
   *
   * :param folder: The folder to read.
   * :return: A map of relative path to SHA-256 digest.
   */
  static async digests(folder) {
    const found = new Map();
    const entries = await readdir(folder, {recursive: true, withFileTypes: true});
    for (const entry of entries) {
      if (entry.isFile()) {
        const file = path.join(entry.parentPath, entry.name);
        found.set(path.relative(folder, file), createHash("sha256").update(await readFile(file)).digest("hex"));
      }
    }
    return found;
  }

  /**
   * List the files that differ between a site's runtime and the vendored one.
   *
   * :param site: An entry of Sites.LIST.
   * :return: The relative paths that are missing, extra or changed.
   */
  static async differences(site) {
    const source = await SyncRuntime.digests(path.join(Sites.SKILL, "runtime"));
    let copy = new Map();
    try {
      copy = await SyncRuntime.digests(path.join(Sites.dir(site), "runtime"));
    } catch (error) {
      // A missing folder differs in every file.
    }
    const different = [];
    for (const name of new Set([...source.keys(), ...copy.keys()])) {
      if (source.get(name) !== copy.get(name)) {
        different.push(name);
      }
    }
    return different.sort();
  }

  /**
   * Copy or check the runtime for every site.
   *
   * :param argv: The command-line arguments after the script name.
   */
  static async run(argv) {
    const check = argv.includes("--check");
    let failed = false;
    for (const site of Sites.LIST) {
      const different = await SyncRuntime.differences(site);
      if (different.length === 0) {
        console.log(`${site.id}: runtime matches.`);
      } else if (check) {
        failed = true;
        console.error(`${site.id}: runtime differs from tools/agentify-website/runtime in ${different.join(", ")}.`);
      } else {
        const target = path.join(Sites.dir(site), "runtime");
        await rm(target, {recursive: true, force: true});
        await cp(path.join(Sites.SKILL, "runtime"), target, {recursive: true});
        console.log(`${site.id}: copied the runtime (${different.length} file(s) differed).`);
      }
    }
    process.exitCode = failed ? 1 : 0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  await SyncRuntime.run(process.argv.slice(2));
}
