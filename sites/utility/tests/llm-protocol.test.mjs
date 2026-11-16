// Checks js/llm-protocol.js, the same file on all three sites: choosing between the
// OpenAI and Anthropic Messages protocols, with a stand-in provider and no network.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LlmProtocol } from "../js/llm-protocol.js";

const AZURE = "https://demo-res.services.ai.azure.com/anthropic";

/** A window with a fetch that records its calls and answers with `reply`. */
function fakeWindow(saved, reply) {
  const calls = [];
  const store = new Map(saved ? [[LlmProtocol.STORE_KEY, saved]] : []);
  const win = {
    localStorage: {getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)},
    fetch: async (url, init) => {
      calls.push({url: String(url), init});
      return reply();
    },
  };
  return {win, calls};
}

/** A Messages event stream as the provider would send it. */
function messagesStream(events) {
  const text = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(text, {status: 200, headers: {"Content-Type": "text/event-stream"}});
}

/** Read the OpenAI chunks a translated response holds. */
async function chunksOf(response) {
  const text = await response.text();
  assert.ok(text.trimEnd().endsWith("data: [DONE]"), "stream ends with [DONE]");
  return text.split("\n").filter((l) => l.startsWith("data:") && !l.includes("[DONE]")).map((l) => JSON.parse(l.slice(5)));
}

test("detect reads the protocol from the Provider URL", () => {
  assert.equal(LlmProtocol.detect(AZURE), "anthropic");
  assert.equal(LlmProtocol.detect(`${AZURE}/v1/messages`), "anthropic");
  assert.equal(LlmProtocol.detect("https://api.anthropic.com/v1"), "openai");
  assert.equal(LlmProtocol.detect("https://openrouter.ai/api/v1"), "openai");
  assert.equal(LlmProtocol.detect("https://api.openai.com/v1"), "openai");
  assert.equal(LlmProtocol.detect("not a url"), "openai");
});

test("messagesUrl accepts the Azure base, a /v1 base or the full endpoint", () => {
  const want = `${AZURE}/v1/messages`;
  assert.equal(LlmProtocol.messagesUrl(AZURE), want);
  assert.equal(LlmProtocol.messagesUrl(`${AZURE}/`), want);
  assert.equal(LlmProtocol.messagesUrl(`${AZURE}/v1`), want);
  assert.equal(LlmProtocol.messagesUrl(want), want);
});

test("the key moves to x-api-key, and only api.anthropic.com gets the browser header", () => {
  const headers = LlmProtocol.anthropicHeaders({"Content-Type": "application/json", Authorization: "Bearer k-test"}, AZURE);
  assert.deepEqual(headers, {"Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": "k-test"});
  const direct = LlmProtocol.anthropicHeaders({Authorization: "Bearer k-test"}, "https://api.anthropic.com/v1");
  assert.equal(direct["anthropic-dangerous-direct-browser-access"], "true");
});

test("an OpenAI request becomes a Messages request", () => {
  const request = LlmProtocol.toAnthropicRequest({
    model: "claude-sonnet-4-6",
    stream: true,
    tool_choice: "auto",
    tools: [{type: "function", function: {name: "lookup", description: "Find it", parameters: {type: "object", properties: {q: {type: "string"}}}}}],
    messages: [
      {role: "system", content: "Be brief."},
      {role: "user", content: "Hi"},
      {role: "assistant", content: "", tool_calls: [
        {id: "t1", type: "function", function: {name: "lookup", arguments: "{\"q\":\"a\"}"}},
        {id: "t2", type: "function", function: {name: "lookup", arguments: "not json"}},
      ]},
      {role: "tool", tool_call_id: "t1", content: "A"},
      {role: "tool", tool_call_id: "t2", content: "B"},
    ],
  });
  assert.equal(request.system, "Be brief.");
  assert.equal(request.max_tokens, 4096);
  assert.equal(request.stream, true);
  assert.deepEqual(request.tool_choice, {type: "auto"});
  assert.deepEqual(request.tools, [{name: "lookup", description: "Find it", input_schema: {type: "object", properties: {q: {type: "string"}}}}]);
  assert.equal(request.messages.length, 3);
  assert.deepEqual(request.messages[1].content, [
    {type: "tool_use", id: "t1", name: "lookup", input: {q: "a"}},
    {type: "tool_use", id: "t2", name: "lookup", input: {}},
  ]);
  // Both tool results sit in one user turn.
  assert.deepEqual(request.messages[2], {role: "user", content: [
    {type: "tool_result", tool_use_id: "t1", content: "A"},
    {type: "tool_result", tool_use_id: "t2", content: "B"},
  ]});
});

test("a Messages text stream becomes OpenAI chunks", async () => {
  const response = LlmProtocol.toOpenAiResponse(messagesStream([
    {type: "message_start", message: {model: "claude-sonnet-4-6", usage: {input_tokens: 12}}},
    {type: "content_block_start", index: 0, content_block: {type: "text", text: ""}},
    {type: "content_block_delta", index: 0, delta: {type: "text_delta", text: "Hel"}},
    {type: "content_block_delta", index: 0, delta: {type: "text_delta", text: "lo"}},
    {type: "content_block_stop", index: 0},
    {type: "message_delta", delta: {stop_reason: "end_turn"}, usage: {output_tokens: 3}},
    {type: "message_stop"},
  ]));
  const chunks = await chunksOf(response);
  assert.equal(chunks.map((c) => c.choices[0].delta.content || "").join(""), "Hello");
  assert.equal(chunks[0].model, "claude-sonnet-4-6");
  const last = chunks[chunks.length - 1];
  assert.equal(last.choices[0].finish_reason, "stop");
  assert.deepEqual(last.usage, {prompt_tokens: 12, completion_tokens: 3, total_tokens: 15});
});

test("a Messages tool call becomes an OpenAI tool call", async () => {
  const response = LlmProtocol.toOpenAiResponse(messagesStream([
    {type: "message_start", message: {model: "m", usage: {input_tokens: 1}}},
    {type: "content_block_start", index: 1, content_block: {type: "tool_use", id: "toolu_1", name: "lookup", input: {}}},
    {type: "content_block_delta", index: 1, delta: {type: "input_json_delta", partial_json: "{\"q\":"}},
    {type: "content_block_delta", index: 1, delta: {type: "input_json_delta", partial_json: "\"a\"}"}},
    {type: "message_delta", delta: {stop_reason: "tool_use"}, usage: {output_tokens: 5}},
  ]));
  const chunks = await chunksOf(response);
  const calls = chunks.flatMap((c) => c.choices[0].delta.tool_calls || []);
  assert.equal(calls[0].id, "toolu_1");
  assert.equal(calls[0].function.name, "lookup");
  assert.equal(calls.map((c) => c.function.arguments).join(""), "{\"q\":\"a\"}");
  assert.equal(chunks[chunks.length - 1].choices[0].finish_reason, "tool_calls");
});

test("a stream error fails the read", async () => {
  const response = LlmProtocol.toOpenAiResponse(messagesStream([
    {type: "message_start", message: {model: "m", usage: {}}},
    {type: "error", error: {type: "overloaded_error", message: "Overloaded"}},
  ]));
  await assert.rejects(response.text(), /Overloaded/);
});

test("fetch is translated for the Anthropic protocol and the key stays on that request", async () => {
  const {win, calls} = fakeWindow("anthropic", () => messagesStream([
    {type: "message_start", message: {model: "m", usage: {input_tokens: 1}}},
    {type: "message_delta", delta: {stop_reason: "end_turn"}, usage: {output_tokens: 1}},
  ]));
  assert.equal(LlmProtocol.install(win), true);
  assert.equal(LlmProtocol.install(win), false, "installs once");
  const body = {model: "d", stream: true, messages: [{role: "user", content: "Hi"}]};
  const response = await win.fetch(`${AZURE}/chat/completions`, {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: "Bearer k-test"},
    body: JSON.stringify(body),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${AZURE}/v1/messages`);
  assert.equal(calls[0].init.headers["x-api-key"], "k-test");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[0].init.body).max_tokens, 4096);
  assert.ok((await chunksOf(response)).length > 0);
});

test("auto mode follows the URL, and OpenAI calls and other requests pass through", async () => {
  const reply = () => new Response("{}", {status: 200});
  const {win, calls} = fakeWindow(null, reply);
  LlmProtocol.install(win);
  const init = {method: "POST", headers: {Authorization: "Bearer k"}, body: JSON.stringify({model: "m", messages: []})};
  await win.fetch("https://openrouter.ai/api/v1/chat/completions", init);
  await win.fetch(`${AZURE}/agent-manifest.json`);
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[0].init, init, "an OpenAI call is untouched");
  assert.equal(calls[1].url, `${AZURE}/agent-manifest.json`);
  // Auto sends an Azure-shaped URL as Messages.
  await win.fetch(`${AZURE}/chat/completions`, init).catch(() => {});
  assert.equal(calls[2].url, `${AZURE}/v1/messages`);
});

test("a chosen OpenAI protocol overrides the URL, and a provider error passes through", async () => {
  const {win, calls} = fakeWindow("openai", () => new Response("no", {status: 404}));
  LlmProtocol.install(win);
  const init = {method: "POST", headers: {}, body: "{}"};
  await win.fetch(`${AZURE}/chat/completions`, init);
  assert.equal(calls[0].url, `${AZURE}/chat/completions`);
  const again = fakeWindow("anthropic", () => new Response("bad", {status: 401}));
  LlmProtocol.install(again.win);
  const response = await again.win.fetch(`${AZURE}/chat/completions`, {method: "POST", headers: {Authorization: "Bearer k"}, body: "{\"model\":\"m\",\"messages\":[]}"});
  assert.equal(response.status, 401);
  assert.equal(await response.text(), "bad");
});

test("describe names the endpoint the key will go to", () => {
  assert.match(LlmProtocol.describe("auto", AZURE), /Anthropic Messages \(detected\).*\/anthropic\/v1\/messages$/);
  assert.match(LlmProtocol.describe("openai", AZURE), /OpenAI-compatible.*\/anthropic\/chat\/completions$/);
  assert.match(LlmProtocol.describe("auto", ""), /Enter the Provider URL/);
});

test("the module is the same file on all three sites", async () => {
  const first = await readFile(new URL("../js/llm-protocol.js", import.meta.url), "utf8");
  for (const site of ["installer", "grants"]) {
    assert.equal(await readFile(new URL(`../../${site}/js/llm-protocol.js`, import.meta.url), "utf8"), first, `${site} differs`);
  }
});
