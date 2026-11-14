# Development

## Run it

Node.js 22 or newer. There is nothing to install.

```shell
npm run build
npm test
npm run check
npm run serve
```

| Site | Local address | Network URL |
| --- | --- | --- |
| Emberwick Energy | http://127.0.0.1:8080/ | `http://127.0.0.1:8080/emberwick_energy` |
| Heatwright Home Energy | http://localhost:8081/ | `http://localhost:8081/heatwright_installers` |
| Fernbrook Retrofit Grants | http://localhost:8082/ | `http://localhost:8082/fernbrook_grants` |

Each site also answers `/mcp` with its read-only MCP server (`server/`), as the
Cloudflare Worker does in production. `npm run serve` puts a small front server on each
site's port: `/mcp` goes to `server/`, and everything else to the skill's
`serve_site.mjs` on the same port plus 10000. Try one from a terminal:

```shell
curl -s -X POST -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}" http://localhost:8082/mcp
```

To add or change a tool, edit `server/tools/<site>.mjs`, call only that site's
`js/*-data.js` and `js/*-rules.js`, keep it read-only with no personal fields, list it in
the front agent's MCP entry in the `.hocon`, and add hand-worked amounts to
`server/tests/mcp.test.mjs`.

Open each site at exactly the address above. `127.0.0.1` and `localhost` are different
origins to a browser, and the partner URLs in the networks use these host names.

With the servers running, `npm run conformance:live` checks the CORS headers, and this
checks a partner call the way a caller makes it:

```shell
node tools/agentify-website/scripts/check_partner.mjs http://localhost:8081/heatwright_installers --origin http://127.0.0.1:8080
```

## Try it with a key

1. Use a key with a low spending limit. The default router is
   [OpenRouter](https://openrouter.ai) with `openai/gpt-6-luna`. That is only what the
   settings panel fills in: a visitor can choose any router, model and key there, such as
   OpenAI, Anthropic or a local server. The provider must allow browser calls (CORS), and
   the model must make tool calls. See
   `tools/agentify-website/references/bundle_and_hosting.md`.
2. On a site, open **AI model settings** under the assistant, paste the key and select
   **Save and start**. Never paste a key into a chat, a file or a terminal.
3. Try the sample queries in the site's `agent-manifest.json`.
4. Afterwards, select **Delete setup** under **Advanced settings (optional)** and close
   the tab.

On `127.0.0.1` and `localhost` the runtime also keeps saved setups, key included, in a
cookie for the host name, on every port. With the default hosts, the installer and the
grants site share `localhost`, so a key saved on one reaches the other. Both are your own
sites on your own machine, but if you want each site on its own host name and your
machine has an IPv6 loopback address:

```shell
npm run origins -- local-ipv6    # the grants site moves to http://[::1]:8082
node scripts/serve-all.mjs local-ipv6
```

Run `npm run origins -- local` to go back. Commit only the `local` state.

## Change things

Always finish with `npm run build && npm test && npm run check`.

**An agent's instructions or tools.** Edit `sites/<site>/<network>.hocon`. Keep the
shared rule blocks as they are. The build prints each agent's instruction length; stay
under 5,000 characters. If you change `metadata.sample_queries`, copy them to
`agent-manifest.json`: the build fails when the two lists differ.

**Site data or a business rule.** Edit `js/*-data.js` or `js/*-rules.js`. Update the
hand-worked amounts in `tests/site_config.mjs`.

**A new action.**
1. Add the operation as a method of the page class in `js/app.js`, and make the page's
   own button or form call it.
2. Register it in `site-actions.js` with a schema and the right effect.
3. Add its name to `actions.agentTools` in `agent-manifest.json`.
4. Add a "How to work" line that names `website_<name>` in the `.hocon`. For a `write`,
   the line must say to call it "only when the visitor asks".
5. For an `irreversible` action, add its read-only check, its `DIALOGS` words and its
   `reviewDetails` in `site.js`.
6. Add tests. `tools/agentify-website/references/site_actions.md` lists what to test.

**A new partner call.** Follow "Call a partner site" in
`tools/agentify-website/references/linking.md`: the exact network URL in the agent's
`tools`, a `link_labels` entry, the origin in `allowed_peers`, a "How to work" line, and
a link to the partner's page in `js/partner-links.js`. Add the file to the site's
`originFiles` in `scripts/sites.mjs` if it is new.

**A new site.** Copy the smallest site (`sites/grants`), rename the network everywhere
(the `.hocon` file name, the manifest, `links.json`, `_headers`, `tests/site_config.mjs`),
add it to `scripts/sites.mjs` and to every environment in `origins.json`, and run
`npm run sync-runtime`.

**The runtime or the skill.** Do not edit them here. Replace `tools/agentify-website`
with the upstream folder, update the commit in `NOTICE` and `docs/hackathon/README.md`,
run `npm run sync-runtime`, then build and test.

## Tests

`sites/<site>/tests/agentified.test.mjs` is the skill's test template with its blanks
filled from `site_config.mjs`. It loads the real runtime and the real page code against
a small DOM stand-in, and drives them with a scripted model. It checks, among other
things, that the network is valid and keeps its safety rules, that each write changes
exactly what it should, that the irreversible action is hidden without a confirmation
handler, that declining changes nothing, that the dialog shows the real call, that a call
the site would refuse opens no dialog, and that an approved call stores the same record
as the page's own form.

The tests do not call an LLM, so they do not show how well a model follows the
instructions. That needs the browser check above.

### Browser workflow tests

`npm run test:e2e` runs nine user workflows in Chromium with
[e2e](https://github.com/e2e-inc/e2e) (a development dependency, Apache 2.0). It starts
`npm run serve` itself, or reuses it, and turns e2e's usage telemetry off
(`scripts/run-e2e.mjs`). The first time, install its browser with
`npx @e2e-dev/web install chromium`. e2e documents Windows support through WSL; the suite
also runs natively on Windows.

The tests have no agent steps and call no model. The assistant's model is
`e2e/scripted-router.mjs`, routed inside the browser in place of OpenRouter: it answers
each agent from a fixed script, and repeats only figures that came back from real tool
calls. So the real runtime, the three published networks, the consent cards, the partner
sites and the MCP servers all run, with no key and no cost.

| # | Workflow | Breaks when |
| --- | --- | --- |
| 1 | Emberwick: compare a tariff and switch on the page | the page or its rules break without the assistant |
| 2 | Heatwright: a heat pump estimate on the page | the estimate form or rules break |
| 3 | Fernbrook: an eligibility check on the page | the eligibility form or rules break |
| 4 | No key: the status line says how to set one up, the page still works, Emberwick has its own icon | boot, the settings path or the brand icon breaks |
| 5 | The heat pump question: two consent cards, then an answer with figures from all three sites; distinct icons and lit agents on all three sites in the swarm graph; the AAOSA round in a scheme agent's tooltip; the key goes only to the router | anything in the swarm, linking, consent, MCP, the answer view or key handling |
| 6 | Decline one partner: it is never contacted, and the answer and the view say so | consent stops being enforced or reported |
| 7 | A tariff switch through the assistant waits for the page's own dialog | irreversible actions stop needing confirmation |
| 8 | The Safety checks page stops all four failure cases | the runtime stops failing closed |
| 9 | Each site's mic, on a stand-in for speech recognition, fills the chat box on the device and sends nothing | voice input breaks, or a runtime update renames the chat box |

The scripted router knows each agent by a phrase from its instructions. If you rename an
agent or reword its first line, update `e2e/scripted-router.mjs`.
