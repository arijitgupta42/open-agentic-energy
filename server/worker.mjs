// Cloudflare Worker for one site: /mcp is the site's MCP server, and every other path is
// the site's static folder, served by Workers static assets with its _headers file.
// deploy/cloudflare/<site>.jsonc sets SITE and the ASSETS binding.
import { MCP_PATH, MCP_SERVERS } from "./sites.mjs";

export default {
  /**
   * :param request: The incoming request.
   * :param env: The Worker's bindings: SITE (a site id) and ASSETS.
   * :return: The response.
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const server = MCP_SERVERS[env.SITE];
    if (server && url.pathname === MCP_PATH) {
      return server.handle(request);
    }
    return env.ASSETS.fetch(request);
  },
};
