// A small, stateless MCP server for one site: JSON-RPC 2.0 over HTTP POST, answered as
// plain JSON (the "Streamable HTTP" transport without a stream or a session).
//
// It serves only read-only tools over a site's public data, so it takes no credentials,
// keeps no state between requests and lets any origin call it, like the site's
// agent-manifest.json. Spec 2.1 ("External capabilities") and 3.4: a cross-origin MCP
// server must permit the callers' origins. The runtime's client is runtime/mcp.js.
//
// It runs wherever the standard Request and Response exist: the Cloudflare Worker in
// server/worker.mjs and the local front server in scripts/serve-all.mjs.

/**
 * Answers MCP requests for one site's tools.
 */
export class McpServer {
  /** Protocol versions this server speaks, newest first. */
  static PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

  /** The largest request body read, in bytes. Tool arguments here are a few short fields. */
  static MAX_BODY_BYTES = 16 * 1024;

  /** Headers on every response. The tools are public and read-only, so any origin may call. */
  static CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };

  /**
   * :param site: {name, title, version, instructions, tools}. Each tool has name, title,
   *     description, inputSchema and run(args, context), which returns a plain object.
   */
  constructor(site) {
    this.site = site;
    this.tools = new Map(site.tools.map((tool) => [tool.name, tool]));
  }

  /**
   * Answer one HTTP request to the MCP endpoint.
   *
   * :param request: A standard Request.
   * :return: A standard Response. Unexpected failures become a JSON-RPC error, never a throw.
   */
  async handle(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {status: 204, headers: McpServer.CORS});
    }
    if (request.method !== "POST") {
      // No server-to-client stream: a GET gets 405, as the transport allows.
      return McpServer.reply(405, {error: "Use POST with a JSON-RPC 2.0 message."}, {Allow: "POST, OPTIONS"});
    }
    const declared = Number(request.headers.get("Content-Length") || 0);
    if (declared > McpServer.MAX_BODY_BYTES) {
      return McpServer.reply(413, McpServer.error(null, -32600, "The request is too large."));
    }
    let message;
    try {
      const text = await request.text();
      if (text.length > McpServer.MAX_BODY_BYTES) {
        return McpServer.reply(413, McpServer.error(null, -32600, "The request is too large."));
      }
      message = JSON.parse(text);
    } catch {
      return McpServer.reply(400, McpServer.error(null, -32700, "The body is not valid JSON."));
    }
    if (Array.isArray(message) || message === null || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return McpServer.reply(400, McpServer.error(message?.id ?? null, -32600, "Send one JSON-RPC 2.0 request or notification."));
    }
    // A notification has no id and gets no result.
    if (!("id" in message)) {
      return new Response(null, {status: 202, headers: McpServer.CORS});
    }
    try {
      const result = this.dispatch(message.method, message.params || {}, request);
      return McpServer.reply(200, {jsonrpc: "2.0", id: message.id, result: result});
    } catch (error) {
      if (error instanceof McpError) {
        return McpServer.reply(200, McpServer.error(message.id, error.code, error.message));
      }
      return McpServer.reply(200, McpServer.error(message.id, -32603, "The server could not answer that request."));
    }
  }

  /**
   * Run one JSON-RPC method.
   *
   * :param method: The method name.
   * :param params: Its params object.
   * :param request: The HTTP request, for the site's own address.
   * :return: The result object.
   * :raises McpError: For an unknown method, tool or invalid arguments.
   */
  dispatch(method, params, request) {
    if (method === "initialize") {
      const asked = params.protocolVersion;
      return {
        protocolVersion: McpServer.PROTOCOL_VERSIONS.includes(asked) ? asked : McpServer.PROTOCOL_VERSIONS[0],
        capabilities: {tools: {listChanged: false}},
        serverInfo: {name: this.site.name, title: this.site.title, version: this.site.version},
        instructions: this.site.instructions,
      };
    }
    if (method === "ping") {
      return {};
    }
    if (method === "tools/list") {
      return {tools: [...this.tools.values()].map(McpServer.describe)};
    }
    if (method === "tools/call") {
      const tool = this.tools.get(params.name);
      if (!tool) {
        throw new McpError(-32602, `Unknown tool "${params.name}". Call tools/list for the tools this site offers.`);
      }
      const args = params.arguments ?? {};
      const problem = McpServer.checkArguments(tool.inputSchema, args);
      if (problem) {
        // A bad argument is the caller's to fix, so it comes back as a tool result.
        return McpServer.toolResult({ok: false, reason: problem}, true);
      }
      const page = new URL("/", request.url).href;
      return McpServer.toolResult(tool.run(args, {page: page}), false);
    }
    throw new McpError(-32601, `This server does not support "${method}".`);
  }

  /**
   * The public description of a tool, as tools/list gives it.
   *
   * :param tool: A tool definition.
   * :return: {name, title, description, inputSchema, annotations}.
   */
  static describe(tool) {
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
    };
  }

  /**
   * Check arguments against the small JSON Schema subset the tools use: an object with
   * string enums, integers with a range, and booleans, all required and nothing extra.
   *
   * :param schema: The tool's inputSchema.
   * :param args: The arguments given.
   * :return: A sentence naming the first problem, or null when they are valid.
   */
  static checkArguments(schema, args) {
    if (args === null || typeof args !== "object" || Array.isArray(args)) {
      return "Arguments must be an object.";
    }
    const properties = schema.properties || {};
    for (const name of Object.keys(args)) {
      if (!Object.hasOwn(properties, name)) {
        return `Unknown argument "${name}".`;
      }
    }
    for (const name of schema.required || []) {
      if (!Object.hasOwn(args, name)) {
        return `Give "${name}": ${properties[name].description}`;
      }
    }
    for (const [name, value] of Object.entries(args)) {
      const property = properties[name];
      if (property.enum && !property.enum.includes(value)) {
        return `"${name}" must be one of: ${property.enum.join(", ")}.`;
      }
      if (property.type === "integer" && (!Number.isInteger(value) || value < property.minimum || value > property.maximum)) {
        return `"${name}" must be a whole number from ${property.minimum} to ${property.maximum}.`;
      }
      if (property.type === "boolean" && typeof value !== "boolean") {
        return `"${name}" must be true or false.`;
      }
    }
    return null;
  }

  /**
   * Wrap a tool's answer as an MCP tool result. The runtime passes the text to the model.
   *
   * :param value: The plain object the tool returned.
   * :param isError: Whether the call itself was wrong.
   * :return: {content, structuredContent, isError}.
   */
  static toolResult(value, isError) {
    return {
      content: [{type: "text", text: JSON.stringify(value)}],
      structuredContent: value,
      isError: isError,
    };
  }

  /**
   * A JSON-RPC error message.
   *
   * :param id: The request id, or null.
   * :param code: The JSON-RPC error code.
   * :param message: What went wrong.
   * :return: The error message object.
   */
  static error(id, code, message) {
    return {jsonrpc: "2.0", id: id, error: {code: code, message: message}};
  }

  /**
   * A JSON response with the CORS headers.
   *
   * :param status: The HTTP status.
   * :param body: The object to send.
   * :param extra: More headers.
   * :return: A standard Response.
   */
  static reply(status, body, extra = {}) {
    return new Response(JSON.stringify(body), {
      status: status,
      headers: {"Content-Type": "application/json", "Cache-Control": "no-store", ...McpServer.CORS, ...extra},
    });
  }
}

/**
 * A JSON-RPC error with its code.
 */
export class McpError extends Error {
  /**
   * :param code: The JSON-RPC error code.
   * :param message: What went wrong.
   */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
