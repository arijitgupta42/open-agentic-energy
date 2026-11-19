// Check every site against the hackathon's entry requirements and the parts of the
// MVP specification that can be checked without a browser or an LLM.
//
// Usage:
//   node scripts/check-conformance.mjs                 check the files on disk
//   node scripts/check-conformance.mjs --production    also refuse local and http partner URLs
//   node scripts/check-conformance.mjs --live          also fetch each site and check its headers
//   node scripts/check-conformance.mjs --live --env production
//
// Each check names the rule it comes from: "Rules" is the Devpost entry requirements
// (docs/hackathon/rules_digest.md) and "Spec" is the MVP specification
// (docs/hackathon/worldwide_agentic_web_mvp_spec.md). The checks that need a browser and
// a key are listed in docs/hackathon/conformance_checklist.md.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AgentNetwork, validateNetwork } from "../tools/agentify-website/runtime/kernel.js";
import { SiteHeaders } from "./site-headers.mjs";
import { Sites } from "./sites.mjs";
import { SyncRuntime } from "./sync-runtime.mjs";

/**
 * Collects passes, failures and notes for all sites.
 */
class Conformance {
  /** Hosts that only this machine can reach. */
  static LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

  /** Shapes of secrets that must never be in a published file. */
  static SECRETS = [/sk-[A-Za-z0-9_-]{20,}/, /Bearer\s+[A-Za-z0-9._-]{20,}/, /"(api_?key|apiKey|secret|password)"\s*:\s*"[^"]+"/i];

  /**
   * Create an empty report.
   *
   * :param options: The parsed options, with production, live and env.
   */
  constructor(options) {
    this.options = options;
    this.failures = 0;
    this.agentCounts = [];
    this.remoteCalls = 0;
  }

  /**
   * Record one check's outcome.
   *
   * :param ok: Whether the check passed.
   * :param rule: Where the requirement comes from, such as "Spec 3.3".
   * :param message: What was checked.
   */
  report(ok, rule, message) {
    if (!ok) {
      this.failures += 1;
    }
    console.log(`  ${ok ? "ok  " : "FAIL"} [${rule}] ${message}`);
  }

  /**
   * Read a file as text, or return null when it is missing.
   *
   * :param file: The file's path.
   * :return: The text, or null.
   */
  static async text(file) {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse JSON, or return null when it is missing or malformed.
   *
   * :param text: The text, or null.
   * :return: The parsed value, or null.
   */
  static json(text) {
    if (text === null) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check one site's files.
   *
   * :param site: An entry of Sites.LIST.
   */
  async checkSite(site) {
    const dir = Sites.dir(site);
    console.log(`\n== ${site.id} (${site.network}) ==`);
    const manifestText = await Conformance.text(path.join(dir, "agent-manifest.json"));
    const manifest = Conformance.json(manifestText);
    this.report(manifest !== null, "Rules: public .json; Spec 3.3", "agent-manifest.json exists and is valid JSON");
    if (manifest === null) {
      return;
    }
    const entry = (manifest.networks || [])[0] || {};
    this.report(entry.name === site.network && Boolean(entry.front_man) && Boolean(entry.hocon), "Spec 3.3", "the manifest lists the network with name, front_man and hocon");
    this.report(Boolean(manifest.llm_router?.base_url), "Spec 3.3, 4", "the manifest names the site's default LLM router");
    this.report(manifest.peer_policy?.mode === "closed" && Array.isArray(manifest.allowed_peers), "Spec 3.3, 5", "the manifest has a closed peer policy and an allowed_peers list");

    const networkFile = path.join(dir, String(entry.hocon || ""));
    const networkText = await Conformance.text(networkFile);
    const config = Conformance.json(networkText);
    this.report(config !== null, "Spec 2.2", `${entry.hocon} is resolved, data-only JSON`);
    if (config === null) {
      return;
    }
    const network = new AgentNetwork(config, site.network);
    const errors = validateNetwork(network).errors;
    this.report(errors.length === 0, "Spec 3.1", `the network passes the runtime's validation${errors.length ? `: ${errors.join("; ")}` : ""}`);
    this.report(network.findFrontMan() === entry.front_man, "Spec 2.1", "the manifest's front_man is the network's front agent");
    let described = true;
    const remotes = [];
    for (const agent of config.tools || []) {
      const spec = network.getAgentSpec(agent.name);
      described = described && Boolean(agent.function?.description) && Boolean(agent.function?.parameters) && typeof spec.instructions === "string";
      for (const ref of agent.tools || []) {
        if (network.classifyTool(ref).kind === "remote") {
          remotes.push(typeof ref === "string" ? ref : ref.url);
        }
      }
    }
    this.report(described, "Spec 2.1", "every agent has a description, an invocation schema and instructions");
    this.agentCounts.push((config.tools || []).length);
    this.remoteCalls += remotes.length;
    for (const ref of remotes) {
      const url = new URL(ref);
      this.report(manifest.allowed_peers.includes(url.origin), "Spec 3.2, 5", `partner ${ref} is in allowed_peers`);
      const local = Conformance.LOOPBACK.includes(url.hostname);
      this.report(url.protocol === "https:" || local, "Spec 3.2", `partner ${ref} uses https, or http on this machine only`);
      if (this.options.production) {
        this.report(!local, "Rules: public URL", `partner ${ref} is not a local address`);
      }
    }

    const links = Conformance.json(await Conformance.text(path.join(dir, "links.json")));
    this.report(links !== null && links.version === 1 && Object.hasOwn(links.networks || {}, site.network), "Spec 3.3", "links.json exists and names the network");

    const different = await SyncRuntime.differences(site);
    this.report(different.length === 0, "Rules: runtime file", "runtime/ is present and matches the vendored runtime");

    const page = await Conformance.text(path.join(dir, "index.html")) || "";
    const slots = ["header", "chat", "agents", "settings"].every(Conformance.hasSlot.bind(null, page));
    this.report(page.includes('id="agent-app"') && slots && page.includes('src="site.js"'), "Rules: interface; LLM settings", "index.html mounts the chat and the AI model settings");

    const bridge = await Conformance.text(path.join(dir, "bridge", "action-bridge.html"));
    this.report(bridge !== null, "Spec 7 (linking)", "bridge/action-bridge.html exists, so other agent sites can run this network");

    let clean = true;
    for (const text of [manifestText, networkText]) {
      for (const pattern of Conformance.SECRETS) {
        clean = clean && !pattern.test(text);
      }
    }
    this.report(clean, "Spec 4", "the published manifest and network hold nothing that looks like a key");

    const headers = await Conformance.text(path.join(dir, "_headers")) || "";
    const publicFiles = ["/agent-manifest.json", `/${site.network}.network.json`, "/links.json"];
    this.report(publicFiles.every(Conformance.hasCorsRule.bind(null, headers)), "Spec 3.3, 3.4", "_headers sends the CORS header on the public agent files");
  }

  /**
   * Say whether a page has a runtime mount slot.
   *
   * :param page: The page's HTML.
   * :param slot: The slot name.
   * :return: True when the slot is in the page.
   */
  static hasSlot(page, slot) {
    return page.includes(`data-ns-slot="${slot}"`);
  }

  /**
   * Say whether a _headers file gives a path the CORS header.
   *
   * :param headers: The _headers file's text.
   * :param file: The path, such as "/links.json".
   * :return: True when the path's block has Access-Control-Allow-Origin: *.
   */
  static hasCorsRule(headers, file) {
    const lines = headers.split(/\r?\n/);
    const at = lines.indexOf(file);
    return at !== -1 && (lines[at + 1] || "").trim() === "Access-Control-Allow-Origin: *";
  }

  /**
   * Check what the sites show together.
   */
  checkTogether() {
    console.log("\n== all sites ==");
    this.report(Math.max(...this.agentCounts) >= 2, "Spec 6", "at least one site publishes a network of two or more agents");
    this.report(this.remoteCalls >= 1, "Spec 6; Rules: other agentic websites", "at least one network calls a network on another origin");
  }

  /**
   * Fetch each site's public files and check the headers a caller needs.
   */
  async checkLive() {
    const origins = (await Sites.origins())[this.options.env];
    for (const site of Sites.LIST) {
      const origin = origins[site.id];
      console.log(`\n== ${site.id} live at ${origin} ==`);
      for (const file of ["agent-manifest.json", `${site.network}.network.json`, "links.json"]) {
        let ok = false;
        let note = "";
        try {
          const response = await fetch(`${origin}/${file}`, {headers: {Origin: "https://caller.example"}});
          ok = response.ok && response.headers.get("access-control-allow-origin") === "*";
          note = `status ${response.status}, Access-Control-Allow-Origin ${response.headers.get("access-control-allow-origin")}`;
        } catch (error) {
          note = error.cause?.code || error.message;
        }
        this.report(ok, "Spec 3.3, 3.4", `${file} is public with CORS (${note})`);
      }
      let pageOk = false;
      let policy = "";
      try {
        const response = await fetch(`${origin}/`);
        policy = response.headers.get("content-security-policy") || "";
        pageOk = response.ok && (await response.text()).includes('id="agent-app"');
      } catch (error) {
        // Reported below as a failure.
      }
      this.report(pageOk, "Rules: public URL", "the page loads and holds the assistant");
      const scripts = SiteHeaders.directives(policy).get("script-src") || [];
      this.report(scripts.length === 1 && scripts[0] === "'self'" && !policy.includes("'unsafe-eval'"), "Spec 4",
        `the page sends a Content-Security-Policy that runs scripts only from the site (${policy ? `script-src ${scripts.join(" ")}` : "none sent"})`);
      let bridgeOk = false;
      try {
        const response = await fetch(`${origin}/bridge/action-bridge.html`);
        const policy = response.headers.get("content-security-policy") || "";
        bridgeOk = response.ok && !response.headers.has("x-frame-options") && !policy.includes("frame-ancestors");
      } catch (error) {
        // Reported below as a failure.
      }
      this.report(bridgeOk, "Spec 7 (linking)", "bridge/action-bridge.html loads and may be framed by callers");
    }
  }

  /**
   * Run every check and set the exit code.
   *
   * :param argv: The command-line arguments after the script name.
   */
  static async run(argv) {
    const options = {
      production: argv.includes("--production"),
      live: argv.includes("--live"),
      env: argv.includes("--env") ? argv[argv.indexOf("--env") + 1] : "local",
    };
    const conformance = new Conformance(options);
    for (const site of Sites.LIST) {
      await conformance.checkSite(site);
    }
    conformance.checkTogether();
    if (options.live) {
      await conformance.checkLive();
    }
    console.log(conformance.failures ? `\n${conformance.failures} check(s) failed.` : "\nAll checks passed. See docs/hackathon/conformance_checklist.md for the checks that need a browser.");
    process.exitCode = conformance.failures ? 1 : 0;
  }
}

await Conformance.run(process.argv.slice(2));
