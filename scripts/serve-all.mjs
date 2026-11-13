// Serve the three sites on this machine, each on its own host name, with the headers a
// host must send, and each site's MCP server at /mcp. Stop them with Ctrl+C.
//
// Usage: node scripts/serve-all.mjs [environment]
//
// The environment is a key of origins.json whose hosts are all on this machine. The
// default is "local". Host names matter here: on 127.0.0.1, localhost and [::1] the
// runtime keeps a saved API key in a cookie for the host name, on every port, so two
// sites on one host name share it. "local" puts the installer and the grants site on
// localhost, which every machine has. "local-ipv6" gives each site its own host name,
// for machines where [::1] works. See docs/development.md.
//
// Each site's static files come from the vendored tools/agentify-website/scripts/
// serve_site.mjs, on an internal port. A small front server on the site's own port sends
// /mcp to server/ (as the Cloudflare Worker in server/worker.mjs does) and passes every
// other request through unchanged, so the MCP URL is the same origin as the site.
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { MCP_PATH, MCP_SERVERS } from "../server/sites.mjs";
import { Sites } from "./sites.mjs";

/**
 * Starts one serve_site.mjs and one front server per site.
 */
class ServeAll {
  /** Added to a site's port for its internal static server. */
  static INTERNAL_PORT_OFFSET = 10000;

  /** The largest MCP request body read, in bytes. server/mcp-server.mjs refuses more. */
  static MAX_BODY_BYTES = 64 * 1024;

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
    const fronts = [];
    for (const site of Sites.LIST) {
      const url = new URL(origins[site.id]);
      // URL.hostname keeps the brackets of an IPv6 address; the server wants it bare.
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const listen = host === "localhost" ? "127.0.0.1" : host;
      const internal = Number(url.port) + ServeAll.INTERNAL_PORT_OFFSET;
      const args = [script, Sites.dir(site), "--host", listen, "--port", String(internal), "--open-as", url.hostname];
      // Its own banner names the internal port, so only its errors are shown.
      children.push(spawn(process.execPath, args, {stdio: ["ignore", "ignore", "inherit"]}));
      const front = http.createServer(ServeAll.route.bind(null, site, listen, internal, url.origin));
      front.listen(Number(url.port), listen);
      fronts.push(front);
      console.log(`${site.id}: ${url.origin}/  (MCP: ${url.origin}${MCP_PATH})`);
    }
    const stop = ServeAll.stop.bind(null, children, fronts);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }

  /**
   * Answer one request: /mcp here, anything else from the static server.
   *
   * :param site: An entry of Sites.LIST.
   * :param listen: The host both servers listen on.
   * :param internal: The static server's port.
   * :param origin: The site's public origin, for the MCP request URL.
   * :param req: The incoming request.
   * :param res: The response.
   */
  static route(site, listen, internal, origin, req, res) {
    const pathname = new URL(req.url, origin).pathname;
    if (pathname === MCP_PATH) {
      ServeAll.mcp(MCP_SERVERS[site.id], origin, req, res).catch((error) => {
        res.writeHead(500, {"Content-Type": "text/plain"});
        res.end(`MCP server failed: ${error.message}`);
      });
      return;
    }
    const upstream = http.request({host: listen, port: internal, method: req.method, path: req.url, headers: req.headers}, (reply) => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    });
    upstream.on("error", () => {
      res.writeHead(502, {"Content-Type": "text/plain"});
      res.end("The static server is not answering.");
    });
    req.pipe(upstream);
  }

  /**
   * Hand one request to a site's MCP server, as a standard Request.
   *
   * :param server: The site's McpServer.
   * :param origin: The site's public origin.
   * :param req: The incoming request.
   * :param res: The response.
   */
  static async mcp(server, origin, req, res) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > ServeAll.MAX_BODY_BYTES) {
        res.writeHead(413, {"Content-Type": "text/plain"});
        res.end("The request is too large.");
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
    const request = new Request(new URL(req.url, origin), {method: req.method, headers: headers, body: hasBody ? Buffer.concat(chunks) : undefined});
    const response = await server.handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  /**
   * Stop every server.
   *
   * :param children: The static server processes.
   * :param fronts: The front servers.
   */
  static stop(children, fronts) {
    for (const child of children) {
      child.kill();
    }
    for (const front of fronts) {
      front.close();
    }
  }
}

await ServeAll.run(process.argv.slice(2));
