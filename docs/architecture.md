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
  irreversible action. It also draws "How each answer was made" under the chat from
  the runtime's trace (`js/answer-path.js`, the same file on every site): agent and site,
  actions, MCP tools, partner networks with the consent decision, model and router.
- **The MCP server** (`server/`) answers `/mcp` on each site's own origin with read-only
  tools over that site's public data. It imports the page's own data and rules modules,
  so a page, its assistant and its MCP tools give the same answers (CLAUDE.md rule 5).

## Sites, agents and actions

| Site | Agents | `read` | `write` (undoable) | `irreversible` (confirmed) |
| --- | --- | --- | --- | --- |
| utility | `emberwick_assistant`, `tariff_advisor` | `get_account_state` | `compare_tariff` | `switch_tariff` |
| installer | `heatwright_assistant` | `get_installer_state` | `set_estimate` | `request_survey` |
| grants | `fernbrook_assistant` | `get_grants_state` | `set_eligibility_answers` | `start_application` |

`tariff_advisor` is a specialist with its own workflow: it reads the account, ranks the
tariffs the account can have by the site's own cost estimates, and sets apart the tariff
that needs a heat pump. That is the hook into the other two sites. It also gives the
submitted site the two-agent network that spec section 6 asks an implementation to show.

## MCP servers

| Site | Tools at `<origin>/mcp` | Built on |
| --- | --- | --- |
| utility | `list_tariffs`, `estimate_yearly_costs` | `AccountData.TARIFFS`, `TariffRules.annualCostPence` |
| installer | `list_products`, `estimate` | `InstallData`, `InstallRules.estimate` |
| grants | `list_grants`, `check_eligibility` | `GrantData.SCHEMES`, `GrantRules.checkAnswers` and `assess` |

- **Read-only and public.** No tool writes, takes a name, email, phone number or
  reference, or returns a customer's account: Emberwick's account lives only in the
  visitor's page. Writes stay `website_*` actions on the site's own page, with its dialog.
- **Stateless JSON-RPC over HTTP** (`server/mcp-server.mjs`): `initialize`, `ping`,
  `tools/list` and `tools/call`, answered as plain JSON. CORS is `*` because the data is
  as public as `agent-manifest.json` and no credential is accepted (spec 3.4).
- **Each front agent lists its own site's server** in its `tools`, and each manifest lists
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
