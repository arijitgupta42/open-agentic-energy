# Architecture

## One pattern, three sites

Every site follows the hackathon's agentify-website skill
(`tools/agentify-website/SKILL.md`):

```text
visitor ── page (index.html, js/app.js) ── App.page: state + operations
              │                               ▲
              │ mounts                        │ same methods
              ▼                               │
        runtime/ (browser) ── website_* tools ── site-actions.js
              │
              ├─ reads agent-manifest.json → <network>.network.json, links.json
              ├─ calls the visitor's LLM router with the visitor's key
              ├─ calls mcp_* tools on a site's own /mcp (read-only, public data)
              └─ after the visitor agrees, fetches a partner's public files and runs
                 the partner's network here, in this browser

host (Cloudflare Worker, or scripts/serve-all.mjs locally)
  ├─ every file in sites/<site>/ ── static, with the site's _headers
  └─ /mcp ── server/ ── the same js/*-data.js and js/*-rules.js as the page
```

- **The page object** (`App.page` in `js/app.js`) holds the state, renders it, and has
  one method per operation. Buttons, forms and the assistant all call these methods.
- **Site actions** (`site-actions.js`) register those methods with the runtime. The names
  in the manifest's `actions.agentTools` become `website_<name>` tools.
- **The network** (`<network>.hocon`) says which agents exist, what they are told and
  which tools and partner networks they may call.
- **The mount** (`site.js`) boots the runtime and owns the confirmation dialog for each
  irreversible action. It also reads the runtime's trace into one tree per message
  (`js/answer-path.js`, the same file on every site): agent and site, actions, MCP
  tools, partner networks with the consent decision, model and router.
  From those turns it draws "The swarm at work" beside the chat (`js/swarm-graph.js`
  over the fixed map in `js/swarm-map.js`, both the same on every site): the 11 agents
  grouped by site, lit while they work, with what each did in a tooltip. The map is a
  copy of the three published networks, checked by a test, so drawing it contacts no
  partner. `js/dev-log.js` makes the runtime's developer log follow the answer on show in the
  graph, with filters.
  And it adds voice input (`js/voice-input.js`, also the same on every site): a small
  mic button inside the end of the runtime's chat box (a waveform while it listens) that puts the browser's own speech recognition
  into the chat box. On the first press it asks for on-device recognition
  (`SpeechRecognition.available()`, then a one-time `install()` and `processLocally`).
  Without it, it says the audio would go to the browser maker's service and listens only
  after a second press. The check waits for a press because asking on page load crashes
  the page in some Chromium builds (seen in e2e's headless Chromium). It never presses
  Send and never answers a dialog or a consent card.
  It stays hidden when the browser has no speech recognition or the runtime did not boot.
- **The MCP server** (`server/`) answers `/mcp` on each site's own origin with read-only
  tools over that site's public data. It imports the page's own data and rules modules,
  so a page, its assistant and its MCP tools give the same answers (CLAUDE.md rule 5).

## Sites, agents and actions

| Site | Agents | `read` | `write` (undoable) | `irreversible` (confirmed) |
| --- | --- | --- | --- | --- |
| utility | `emberwick_assistant`, `tariff_advisor`, `usage_analyst`, `retrofit_planner` | `get_account_state` | `compare_tariff` | `switch_tariff` |
| installer | `heatwright_assistant`, `heat_pump_engineer`, `solar_designer` | `get_installer_state` | `set_estimate` | `request_survey` |
| grants | `fernbrook_assistant`, `heat_pump_grant_agent`, `solar_starter_agent`, `warm_walls_agent` | `get_grants_state` | `set_eligibility_answers` | `start_application` |

`tariff_advisor` is a specialist with its own workflow: it reads the account, ranks the
tariffs the account can have by the site's own cost estimates, and sets apart the tariff
that needs a heat pump. That is the hook into the other two sites. It also gives the
submitted site the two-agent network that spec section 6 asks an implementation to show.

### The swarm

Each network is a small Neuro SAN swarm. Every agent runs in the visitor's browser, on
the visitor's model and key. A specialist cannot see the chat: its caller passes what it
needs in the request. Only the front agent of each site may use `write` and
`irreversible` actions; specialists read.

- **Emberwick.** `usage_analyst` reads the account's usage and asks the site's own MCP
  server what a heat pump would cost to run on each tariff
  (`estimate_heat_pump_running_cost`). `retrofit_planner` decides which of
  `heatwright_installers`, `fernbrook_grants` and `usage_analyst` a request needs and calls
  them in one step. The runtime runs them at the same time (`runner.js`,
  `executeToolCalls`, up to four), and asks for consent one partner card at a time
  (`engine.js`, `requestConsent`). The planner puts the figures side by side, each with
  its source, and adds none together. Only the planner contacts partner sites.
- **Heatwright.** `heat_pump_engineer` and `solar_designer` each read one product's
  estimate from the site's MCP server. Asked about both, the front agent calls both in
  one step.
- **Fernbrook.** One agent per grant scheme, routed with AAOSA, Neuro SAN's
  Determine and Fulfill protocol: the front agent asks every scheme agent at once whether
  its scheme fits the request (`mode: "Determine"`), then asks only those that said yes
  to check the answers given (`mode: "Fulfill"`), through `check_scheme`, which decides
  one scheme from only the answers it needs. The skill advises against AAOSA for small
  sites because each round costs model calls; here the schemes overlap (a heat pump
  question can touch the heat pump and the insulation scheme), which is the case it names.

Cost. A full heat pump question took 27 to 28 model calls across the three sites in
live runs, and about 70 seconds, against about 10 calls before. `max_steps` and the
runtime's composition budget (four third-party calls per message) still bound it. A
`website_*` action in a step makes the runtime run every call in that step one at a time
(`runner.js`, `parallelSafe: false`), so the agents that fan out keep site actions out
of those steps.

Not used. Neuro SAN's coded tools (`class`) and private context (`sly_data` allow rules)
are in the runtime, but the agentify-website build refuses `class` tools in a static
bundle, and only the runtime's own chat panel sets `sly_data`, so a site cannot hand a
field to a partner without changing the vendored runtime (CLAUDE.md rule 2).

## MCP servers

| Site | Tools at `<origin>/mcp` | Built on |
| --- | --- | --- |
| utility | `list_tariffs`, `estimate_yearly_costs`, `estimate_heat_pump_running_cost` | `AccountData.TARIFFS` and `HEAT_PUMP_ESTIMATE`, `TariffRules.annualCostPence`, `heatPumpUsage` and `electricOnlyCostPence` |
| installer | `list_products`, `estimate` | `InstallData`, `InstallRules.estimate` |
| grants | `list_grants`, `check_eligibility`, `check_scheme` | `GrantData.SCHEMES`, `GrantRules.checkAnswers`, `assess` and `assessScheme` |

- **Read-only and public.** No tool writes, takes a name, email, phone number or
  reference, or returns a customer's account: Emberwick's account lives only in the
  visitor's page. Writes stay `website_*` actions on the site's own page, with its dialog.
- **Stateless JSON-RPC over HTTP** (`server/mcp-server.mjs`): `initialize`, `ping`,
  `tools/list` and `tools/call`, answered as plain JSON. CORS is `*` because the data is
  as public as `agent-manifest.json` and no credential is accepted (spec 3.4).
- **Each front agent lists its own site's server** in its `tools`, as do the specialists that read it, and each manifest lists
  its own origin in `allowed_peers`, which the closed peer policy needs for any MCP call.
  On its own page an agent uses its `website_*` tools. Run by another site, it has none of
  those and uses its `mcp_*` tools instead: that is what gives partner replies real data.
- **Any MCP client can use them**, not only these agents. They are tested with hand-worked
  amounts and with the runtime's own MCP client in `server/tests/`.

## Cross-site calls

| Caller | Partner network | Asked for | Partner answers from |
| --- | --- | --- | --- |
| utility | `heatwright_installers` | prices and an estimate for the home | `mcp_list_products`, `mcp_estimate` |
| utility | `fernbrook_grants` | which grants could help, with eligibility answers given | `mcp_list_grants`, `mcp_check_eligibility` |
| installer | `fernbrook_grants` | which grants could help pay for a heat pump | `mcp_list_grants`, `mcp_check_eligibility` |
| installer | `emberwick_energy` | tariffs for a home with a heat pump, and running costs | `mcp_list_tariffs`, `mcp_estimate_yearly_costs` |

The runtime never offers a partner a call back to the site that called it, so the
utility ↔ installer pair cannot loop (`runtime/runner.js`, `buildToolTable`).

What happens on a call (spec section 3.2, `tools/agentify-website/references/linking.md`):

1. The calling agent proposes the call. The runtime checks the partner's origin against
   the caller's `allowed_peers`.
2. The visitor sees a consent card with the partner's name, host and the start of the
   request. Nothing is fetched before they agree.
3. The runtime fetches the partner's manifest, network and `links.json` (public, CORS),
   and runs the partner's front agent in this browser with only the request text: no
   chat history and no private context.
4. The partner's model calls go to the caller's router with the visitor's key. The
   partner site never sees the key.
5. The partner's network has none of its own site's `website_*` tools here. It calls its
   own site's `/mcp` instead, and answers with that site's real figures and rules. That
   call goes to the origin the visitor just approved, so the runtime shows no second card
   (`runtime/runner.js`, `requiresThirdPartyApproval`), and it carries only details that
   were in the request on the card. `check_partner.mjs` notes this as a warning.
6. A decline is reported as the visitor's choice, not as a partner that did not answer.
   The `partner_rules` text differs from the template in this, and in asking callers to
   pass the non-personal details a partner needs, so the build warns that it differs.

## Where to take it next

Ideas, roughly in order of value for the judging criteria:

1. **Show the path of each answer** (issue #17): which agent on which site used which
   tool, from the runtime's trace, for judges and visitors.
2. **A shared tool for the community.** `scripts/check-conformance.mjs` already checks a
   site against the rules and the spec. Turned into a hosted page that takes any agentic
   site's URL, it is the kind of shared tool the Potential Impact criterion rewards.
3. **Hand-off links.** Let a caller pass non-personal context in a link to the partner's
   page, such as home type and floor area, so the partner's own assistant starts with it.
4. **Richer presentation.** Use the runtime's chart component for monthly usage and
   tariff comparisons.
5. **Register the sites.** Add them to the upstream list of agentic websites and to the
   NANDA Index once they are hosted.
