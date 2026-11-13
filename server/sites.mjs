// Each site's MCP tools, by the site id that scripts/sites.mjs and origins.json use.
import { McpServer } from "./mcp-server.mjs";
import { GRANTS } from "./tools/grants.mjs";
import { INSTALLER } from "./tools/installer.mjs";
import { UTILITY } from "./tools/utility.mjs";

/** The path of the MCP endpoint on every site. Networks name it as <origin>/mcp. */
export const MCP_PATH = "/mcp";

/** One server per site id. */
export const MCP_SERVERS = {
  utility: new McpServer(UTILITY),
  installer: new McpServer(INSTALLER),
  grants: new McpServer(GRANTS),
};
