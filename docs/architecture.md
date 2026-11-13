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
              └─ after the visitor agrees, fetches a partner's public files and runs
                 the partner's network here, in this browser
```

- **The page object** (`App.page` in `js/app.js`) holds the state, renders it, and has
  one method per operation. Buttons, forms and the assistant all call these methods.
- **Site actions** (`site-actions.js`) register those methods with the runtime. The names
  in the manifest's `actions.agentTools` become `website_<name>` tools.
- **The network** (`<network>.hocon`) says which agents exist, what they are told and
  which tools and partner networks they may call.
- **The mount** (`site.js`) boots the runtime and owns the confirmation dialog for each
  irreversible action.

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

## Cross-site calls

| Caller | Partner network | Asked for |
| --- | --- | --- |
| utility | `heatwright_installers` | what the installer offers and how to get an estimate |
| utility | `fernbrook_grants` | what grants exist and how to check eligibility |
| installer | `fernbrook_grants` | what grants exist and how to check eligibility |

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
5. The partner's network has none of its own site's `website_*` tools here. It answers
   from its instructions: what the site offers, and that its page has the details.

## Where to take it next

Ideas, roughly in order of value for the judging criteria:

1. **Live partner answers through MCP.** Give the installer and grants sites a small MCP
   server on their own origin (a serverless function is enough) that exposes read-only
   tools such as `estimate` and `check_eligibility`. List it in the network's `tools` and
   in `allowed_peers`. A partner's network can then give real results when another site
   runs it. This is the largest step from "says what it offers" to "works across sites".
2. **A shared tool for the community.** `scripts/check-conformance.mjs` already checks a
   site against the rules and the spec. Turned into a hosted page that takes any agentic
   site's URL, it is the kind of shared tool the Potential Impact criterion rewards.
3. **Hand-off links.** Let a caller pass non-personal context in a link to the partner's
   page, such as home type and floor area, so the partner's own assistant starts with it.
4. **Richer presentation.** Use the runtime's chart component for monthly usage and
   tariff comparisons.
5. **Register the sites.** Add them to the upstream list of agentic websites and to the
   NANDA Index once they are hosted.
