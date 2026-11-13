// Serve the three sites on this machine, each on its own host name, with the headers a
// host must send. Stop them with Ctrl+C.
//
// Usage: node scripts/serve-all.mjs [environment]
//
// The environment is a key of origins.json whose hosts are all on this machine. The
// default is "local". Host names matter here: on 127.0.0.1, localhost and [::1] the
// runtime keeps a saved API key in a cookie for the host name, on every port, so two
// sites on one host name share it. "local" puts the installer and the grants site on
// localhost, which every machine has. "local-ipv6" gives each site its own host name,
// for machines where [::1] works. See docs/development.md.
import { spawn } from "node:child_process";
import path from "node:path";
import { Sites } from "./sites.mjs";

/**
 * Starts one tools/agentify-website/scripts/serve_site.mjs per site.
 */
class ServeAll {
  /**
   * Start every server and stop them all when this process is interrupted.
   *
   * :param argv: The command-line arguments after the script name.
   * :raises Error: When origins.json has no such environment.
   */
  static async run(argv) {
    const environment = argv[0] || "local";
    const origins = (await Sites.origins())[environment];
    if (!origins) {
      throw new Error(`origins.json has no "${environment}" environment.`);
    }
    const script = path.join(Sites.SKILL, "scripts", "serve_site.mjs");
    const children = [];
    for (const site of Sites.LIST) {
      const url = new URL(origins[site.id]);
      // URL.hostname keeps the brackets of an IPv6 address; the server wants it bare.
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const listen = host === "localhost" ? "127.0.0.1" : host;
      const args = [script, Sites.dir(site), "--host", listen, "--port", url.port, "--open-as", url.hostname];
      children.push(spawn(process.execPath, args, {stdio: "inherit"}));
    }
    const stop = ServeAll.stop.bind(null, children);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }

  /**
   * Stop every server.
   *
   * :param children: The server processes.
   */
  static stop(children) {
    for (const child of children) {
      child.kill();
    }
  }
}

await ServeAll.run(process.argv.slice(2));
