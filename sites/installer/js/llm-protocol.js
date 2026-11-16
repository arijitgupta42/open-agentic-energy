// Lets the visitor choose how the assistant talks to their AI provider, so it works with
// endpoints that do not speak the OpenAI chat-completions protocol, such as Claude on
// Azure AI Foundry (https://<resource>.services.ai.azure.com/anthropic/v1/messages).
//
// The runtime in runtime/ always posts OpenAI-style requests to <Provider URL>/chat/completions.
// We do not edit that vendored runtime. Instead this file wraps the page's fetch: when
// the visitor picks (or the URL implies) the Anthropic Messages protocol, it turns that
// one request into a Messages API call and turns the streamed reply back into OpenAI
// chunks, so the runtime reads it as it always does.
//
// The key is moved from the Authorization header to the x-api-key header of the same
// request to the same provider. It is never stored, logged or sent anywhere else. Only the
// protocol choice is saved, in this browser.
// This file is the same on all three sites.

/**
 * The protocol choice, the request and stream translation, and the picker.
 */
export class LlmProtocol {
  /** Where the visitor's choice is kept in this browser. It holds no key. */
  static STORE_KEY = "oae-llm-protocol";

  /** The Messages API version header every Anthropic-protocol endpoint expects. */
  static VERSION = "2023-06-01";

  /** The reply length asked for when the runtime sets none (the Messages API requires one). */
  static DEFAULT_MAX_TOKENS = 4096;

  /** The choices, as [value, label]. "auto" decides from the Provider URL. */
  static CHOICES = [
    ["auto", "Detect from the Provider URL"],
    ["openai", "OpenAI-compatible (/chat/completions)"],
    ["anthropic", "Anthropic Messages (/v1/messages)"],
  ];

  /**
   * Wrap the window's fetch so model calls follow the chosen protocol. Everything else,
   * including OpenAI-protocol model calls, goes through unchanged. Install it once, before
   * the runtime boots.
   *
   * :param win: The window.
   * :return: True when installed, false when there is no fetch or it was already wrapped.
   */
  static install(win) {
    if (typeof win?.fetch !== "function" || win.fetch.llmProtocol) {
      return false;
    }
    const original = win.fetch.bind(win);
    const wrapped = (input, init) => LlmProtocol.route(original, win, input, init);
    wrapped.llmProtocol = true;
    win.fetch = wrapped;
    return true;
  }

  /**
   * Send one fetch, translated when it is a model call that needs the Messages protocol.
   *
   * :param original: The unwrapped fetch.
   * :param win: The window, for the saved choice.
   * :param input: The fetch's URL (a string or URL).
   * :param init: The fetch's options.
   * :return: The response, in OpenAI form for a translated call.
   */
  static async route(original, win, input, init) {
    const url = typeof input === "string" || input instanceof URL ? String(input) : "";
    const base = LlmProtocol.baseOf(url);
    const method = String(init?.method || "GET").toUpperCase();
    if (!base || method !== "POST" || typeof init?.body !== "string") {
      return original(input, init);
    }
    if (LlmProtocol.resolve(LlmProtocol.choice(win), base) !== "anthropic") {
      return original(input, init);
    }
    let body;
    try {
      body = JSON.parse(init.body);
    } catch {
      return original(input, init);
    }
    const headers = LlmProtocol.anthropicHeaders(init.headers, base);
    const response = await original(LlmProtocol.messagesUrl(base), {
      ...init,
      headers,
      body: JSON.stringify(LlmProtocol.toAnthropicRequest(body)),
    });
    // An error keeps its own status and text, which the runtime shows to the visitor.
    return response.ok && response.body ? LlmProtocol.toOpenAiResponse(response) : response;
  }

  /**
   * The Provider URL a runtime model call was made to.
   *
   * :param url: The fetch URL.
   * :return: The URL without /chat/completions, or "" when it is not a model call.
   */
  static baseOf(url) {
    const match = /^(.*?)\/chat\/completions\/?(?:\?.*)?$/.exec(url);
    return match ? match[1] : "";
  }

  /**
   * The saved choice.
   *
   * :param win: The window.
   * :return: "auto", "openai" or "anthropic".
   */
  static choice(win) {
    try {
      const saved = win.localStorage.getItem(LlmProtocol.STORE_KEY);
      return LlmProtocol.CHOICES.some(([value]) => value === saved) ? saved : "auto";
    } catch {
      return "auto";
    }
  }

  /**
   * Save the choice. Browser storage can be blocked, so a failure is ignored and the
   * choice lasts only until the page reloads.
   *
   * :param win: The window.
   * :param value: "auto", "openai" or "anthropic".
   */
  static save(win, value) {
    try {
      win.localStorage.setItem(LlmProtocol.STORE_KEY, value);
    } catch {
      /* the picker still works for this page view */
    }
  }

  /**
   * Turn a choice into a protocol.
   *
   * :param choice: "auto", "openai" or "anthropic".
   * :param base: The Provider URL.
   * :return: "openai" or "anthropic".
   */
  static resolve(choice, base) {
    return choice === "auto" ? LlmProtocol.detect(base) : choice;
  }

  /**
   * Guess the protocol from the Provider URL. A URL ending in /messages, or with an
   * /anthropic path (Azure AI Foundry), is Anthropic. api.anthropic.com stays OpenAI,
   * because its OpenAI-compatible endpoint is what the preset uses. Anything else is OpenAI.
   *
   * :param base: The Provider URL.
   * :return: "openai" or "anthropic".
   */
  static detect(base) {
    let url;
    try {
      url = new URL(base);
    } catch {
      return "openai";
    }
    if (url.hostname === "api.anthropic.com") {
      return "openai";
    }
    const path = url.pathname.replace(/\/+$/, "");
    return /\/messages$/.test(path) || /(^|\/)anthropic(\/|$)/.test(path) ? "anthropic" : "openai";
  }

  /**
   * The Messages endpoint for a Provider URL. It accepts the Azure base
   * (…/anthropic), a /v1 base, or the whole …/v1/messages.
   *
   * :param base: The Provider URL.
   * :return: The URL to post to.
   */
  static messagesUrl(base) {
    const url = new URL(base);
    const path = url.pathname.replace(/\/+$/, "");
    if (path.endsWith("/messages")) {
      url.pathname = path;
    } else {
      url.pathname = `${path}${path.endsWith("/v1") ? "" : "/v1"}/messages`;
    }
    return url.href;
  }

  /**
   * The headers for a Messages call: the runtime's key moved to x-api-key, and the API
   * version. Only api.anthropic.com gets its browser-access header, because another
   * provider may not allow an extra header in its CORS preflight.
   *
   * :param original: The runtime's headers, an object.
   * :param base: The Provider URL.
   * :return: The headers to send.
   */
  static anthropicHeaders(original, base) {
    const headers = {"Content-Type": "application/json", "anthropic-version": LlmProtocol.VERSION};
    for (const [name, value] of Object.entries(original || {})) {
      if (name.toLowerCase() === "authorization") {
        headers["x-api-key"] = String(value).replace(/^Bearer\s+/i, "");
      }
    }
    if (new URL(base).hostname === "api.anthropic.com") {
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    }
    return headers;
  }

  /**
   * Turn an OpenAI chat request into a Messages request.
   *
   * :param body: The runtime's body: model, messages, tools, tool_choice, stream.
   * :return: The Messages body.
   */
  static toAnthropicRequest(body) {
    const {system, messages} = LlmProtocol.convertMessages(body.messages || []);
    const request = {
      model: body.model,
      max_tokens: body.max_tokens || body.max_completion_tokens || LlmProtocol.DEFAULT_MAX_TOKENS,
      messages,
      stream: body.stream !== false,
    };
    if (system) {
      request.system = system;
    }
    if (typeof body.temperature === "number") {
      request.temperature = body.temperature;
    }
    if (Array.isArray(body.tools) && body.tools.length) {
      request.tools = body.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description || "",
        input_schema: tool.function.parameters || {type: "object", properties: {}},
      }));
      const choice = LlmProtocol.toolChoice(body.tool_choice);
      if (choice) {
        request.tool_choice = choice;
      }
    }
    return request;
  }

  /**
   * :param choice: An OpenAI tool_choice.
   * :return: The Messages tool_choice, or null for the default.
   */
  static toolChoice(choice) {
    if (choice === "required") {
      return {type: "any"};
    }
    if (choice === "none") {
      return {type: "none"};
    }
    if (choice && typeof choice === "object" && choice.function?.name) {
      return {type: "tool", name: choice.function.name};
    }
    return choice === "auto" ? {type: "auto"} : null;
  }

  /**
   * Turn OpenAI messages into a system prompt and alternating Messages turns. Tool results
   * become tool_result blocks in a user turn, and neighbours with one role are merged.
   *
   * :param messages: OpenAI messages.
   * :return: {system, messages}.
   */
  static convertMessages(messages) {
    const system = [];
    const turns = [];
    const push = (role, blocks) => {
      if (!blocks.length) {
        return;
      }
      const last = turns[turns.length - 1];
      if (last && last.role === role) {
        last.content.push(...blocks);
      } else {
        turns.push({role, content: [...blocks]});
      }
    };
    for (const message of messages) {
      if (message.role === "system" || message.role === "developer") {
        const text = LlmProtocol.textOf(message.content);
        if (text) {
          system.push(text);
        }
      } else if (message.role === "tool") {
        push("user", [{type: "tool_result", tool_use_id: message.tool_call_id, content: LlmProtocol.textOf(message.content)}]);
      } else if (message.role === "assistant") {
        const blocks = [];
        const text = LlmProtocol.textOf(message.content);
        if (text) {
          blocks.push({type: "text", text});
        }
        for (const call of message.tool_calls || []) {
          blocks.push({type: "tool_use", id: call.id, name: call.function.name, input: LlmProtocol.parseArguments(call.function.arguments)});
        }
        push("assistant", blocks);
      } else {
        push("user", LlmProtocol.userBlocks(message.content));
      }
    }
    return {system: system.join("\n\n"), messages: turns};
  }

  /**
   * :param content: An OpenAI message's content: text or a list of parts.
   * :return: Its text.
   */
  static textOf(content) {
    if (typeof content === "string") {
      return content;
    }
    if (!Array.isArray(content)) {
      return "";
    }
    return content.map((part) => (typeof part === "string" ? part : part?.type === "text" ? part.text : "")).join("");
  }

  /**
   * :param content: A user message's content.
   * :return: Messages content blocks: text, and images given as data URLs.
   */
  static userBlocks(content) {
    if (typeof content === "string") {
      return content ? [{type: "text", text: content}] : [];
    }
    const blocks = [];
    for (const part of Array.isArray(content) ? content : []) {
      if (part?.type === "text" && part.text) {
        blocks.push({type: "text", text: part.text});
      } else if (part?.type === "image_url") {
        const match = /^data:([^;]+);base64,(.*)$/s.exec(part.image_url?.url || "");
        if (match) {
          blocks.push({type: "image", source: {type: "base64", media_type: match[1], data: match[2]}});
        }
      }
    }
    return blocks;
  }

  /**
   * :param text: A tool call's JSON arguments.
   * :return: The parsed object, or {} when they are empty or not JSON.
   */
  static parseArguments(text) {
    try {
      const value = JSON.parse(text || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  /**
   * Wrap a Messages event stream as an OpenAI chunk stream.
   *
   * :param response: The provider's response.
   * :return: A response whose body the runtime reads as OpenAI server-sent events.
   */
  static toOpenAiResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const state = {model: "", inputTokens: 0, tools: new Map()};
    let buffer = "";
    const stream = new ReadableStream({
      async pull(controller) {
        // Read until at least one chunk is ready, or the provider ends.
        for (;;) {
          const {value, done} = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
          buffer += decoder.decode(value, {stream: true});
          let ready = false;
          let newline;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith("data:")) {
              continue;
            }
            let event;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            if (event.type === "error") {
              controller.error(new Error(`LLM stream error: ${event.error?.message || "the provider stopped the answer"}`));
              return;
            }
            for (const chunk of LlmProtocol.toChunks(event, state)) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              ready = true;
            }
          }
          if (ready) {
            return;
          }
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(stream, {status: 200, headers: {"Content-Type": "text/event-stream"}});
  }

  /**
   * Turn one Messages event into OpenAI chunks.
   *
   * :param event: A parsed Messages stream event.
   * :param state: What the stream has seen: model, input tokens and tool-call numbering.
   * :return: A list of OpenAI chat.completion.chunk objects, possibly empty.
   */
  static toChunks(event, state) {
    const chunk = (delta, finish, usage) => {
      const out = {object: "chat.completion.chunk", model: state.model, choices: [{index: 0, delta, finish_reason: finish || null}]};
      if (usage) {
        out.usage = usage;
      }
      return out;
    };
    if (event.type === "message_start") {
      state.model = event.message?.model || state.model;
      state.inputTokens = event.message?.usage?.input_tokens || 0;
      return [chunk({role: "assistant", content: ""})];
    }
    if (event.type === "content_block_start") {
      const block = event.content_block || {};
      if (block.type === "tool_use") {
        const index = state.tools.size;
        state.tools.set(event.index, index);
        return [chunk({tool_calls: [{index, id: block.id, type: "function", function: {name: block.name, arguments: ""}}]})];
      }
      return block.type === "text" && block.text ? [chunk({content: block.text})] : [];
    }
    if (event.type === "content_block_delta") {
      const delta = event.delta || {};
      if (delta.type === "text_delta" && delta.text) {
        return [chunk({content: delta.text})];
      }
      if (delta.type === "input_json_delta" && state.tools.has(event.index)) {
        return [chunk({tool_calls: [{index: state.tools.get(event.index), function: {arguments: delta.partial_json || ""}}]})];
      }
      return [];
    }
    if (event.type === "message_delta") {
      const output = event.usage?.output_tokens || 0;
      const input = event.usage?.input_tokens || state.inputTokens;
      const reasons = {tool_use: "tool_calls", max_tokens: "length", refusal: "content_filter"};
      const stop = event.delta?.stop_reason;
      return [chunk({}, reasons[stop] || "stop", {prompt_tokens: input, completion_tokens: output, total_tokens: input + output})];
    }
    return [];
  }

  /**
   * Add the protocol picker under the runtime's Provider URL field, and show the exact
   * endpoint that will be called. It is an extra: the chat works without it.
   *
   * :param doc: The document.
   * :param win: The window, for storage.
   * :return: The select element, or null when the settings panel is missing.
   */
  static attachPicker(doc, win) {
    const router = doc.querySelector("#agent-app #ns-router");
    const hint = doc.querySelector("#agent-app #ns-router-hint");
    if (!router || !hint || doc.querySelector("#oae-protocol")) {
      return null;
    }
    const label = doc.createElement("label");
    label.append("Provider protocol ");
    const select = doc.createElement("select");
    select.id = "oae-protocol";
    for (const [value, text] of LlmProtocol.CHOICES) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.value = LlmProtocol.choice(win);
    label.append(select);
    const note = doc.createElement("div");
    note.className = "ns-hint";
    note.id = "oae-protocol-hint";
    const refresh = () => {
      note.textContent = LlmProtocol.describe(select.value, router.value.trim());
    };
    select.addEventListener("change", () => {
      LlmProtocol.save(win, select.value);
      refresh();
    });
    router.addEventListener("input", refresh);
    hint.after(label, note);
    refresh();
    return select;
  }

  /**
   * Say which endpoint model calls will go to.
   *
   * :param choice: The picker's value.
   * :param base: The Provider URL field's text.
   * :return: A sentence for the settings panel.
   */
  static describe(choice, base) {
    if (!/^https?:\/\//i.test(base)) {
      return "Choose Anthropic Messages for providers such as Claude on Azure AI Foundry. Enter the Provider URL above first.";
    }
    const protocol = LlmProtocol.resolve(choice, base);
    let endpoint;
    try {
      endpoint = protocol === "anthropic" ? LlmProtocol.messagesUrl(base) : `${base.replace(/\/+$/, "")}/chat/completions`;
    } catch {
      return "The Provider URL above is not a valid address yet.";
    }
    const auto = choice === "auto" ? " (detected)" : "";
    return `${protocol === "anthropic" ? "Anthropic Messages" : "OpenAI-compatible"}${auto}: your browser will send your key to ${endpoint}`;
  }
}
