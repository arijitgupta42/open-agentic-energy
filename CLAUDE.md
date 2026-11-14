# Open Agentic Energy

Three linked open agentic websites for the
[Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/) (Cognizant, on
Devpost). **Submission deadline: 11 January 2027, 16:00 UTC.**

Everything built here must conform to the hackathon's rules and to the Minimum Viable
Specification for a Worldwide Agentic Web. Both are loaded at the end of this file. When
a change touches agents, manifests, the runtime, linking, keys or hosting, check it
against them before you write code, and say which rule or spec section applies.

## The sites

| Folder | Site (fictional) | Network URL path | Agents | Calls |
| --- | --- | --- | --- | --- |
| `sites/utility` | Emberwick Energy: account, usage, tariffs, switching. **The site to submit.** | `/emberwick_energy` | `emberwick_assistant` (front), `tariff_advisor`, `usage_analyst`, `retrofit_planner` | installer, grants (from `retrofit_planner`) |
| `sites/installer` | Heatwright Home Energy: heat pump and solar estimates, survey requests | `/heatwright_installers` | `heatwright_assistant` (front), `heat_pump_engineer`, `solar_designer` | grants, utility |
| `sites/grants` | Fernbrook Retrofit Grants: eligibility check, applications | `/fernbrook_grants` | `fernbrook_assistant` (front), `heat_pump_grant_agent`, `solar_starter_agent`, `warm_walls_agent` (AAOSA) | none |

Each site is a self-contained static folder: plain HTML, CSS and JavaScript modules, no
dependencies and no bundler. All data is fictional and lives in page memory. Each site
also answers `/mcp` on its own origin: a read-only MCP server in `server/` over the same
`js/*-data.js` and `js/*-rules.js`, run by the site's Cloudflare Worker and, locally, by
`npm run serve`. Its tools are public data only and never a visitor's own records.

## Commands

Run from the repository root. Node.js 22 or newer.

| Command | What it does |
| --- | --- |
| `npm run build` | Writes each site's `<network>.network.json`, discovery files and `bridge/` from its `.hocon` and manifest |
| `npm test` | Runs every site's tests (real runtime, real page code, scripted model, no LLM) and the MCP servers' tests |
| `npm run test:e2e` | Runs the nine browser workflow tests in `e2e/` with e2e, on a scripted router: no key, no model |
| `npm run check` | Fails when generated files are stale, a runtime copy differs, or a conformance check fails |
| `npm run serve` | Serves the three sites locally with the headers a host must send, and each site's `/mcp` |
| `npm run conformance:live` | Fetches the served sites and checks CORS and the bridge |
| `npm run origins -- <local\|local-ipv6\|production>` | Rewrites partner origins everywhere from `origins.json`, then builds |
| `npm run sync-runtime` | Copies `tools/agentify-website/runtime` into each site |

After any change to a `.hocon`, an `agent-manifest.json`, a `site-actions.js` or page
code, run `npm run build && npm test && npm run check`. All three must pass before a
commit.

## Rules for working in this repository

1. **Follow the skill.** `tools/agentify-website/SKILL.md` and its `references/` are the
   hackathon's own method for building these sites. Read the relevant reference before
   changing a network (`network_design.md`), an action (`site_actions.md`), linking
   (`linking.md`) or hosting (`bundle_and_hosting.md`).
2. **Never edit generated or vendored files by hand:** `sites/*/runtime/`,
   `sites/*/bridge/`, `sites/*/*.network.json`, `sites/*/agent-mcp.json`,
   `sites/*/.well-known/`, and everything under `tools/agentify-website/`. Change the
   `.hocon` or the manifest and rebuild. To update the runtime, replace
   `tools/agentify-website` from upstream and run `npm run sync-runtime`.
3. **The `.hocon` is the source of truth** for a network. Its name is the file name, and
   it must match the manifest, `links.json`, `scripts/sites.mjs` and the tests. Keep the
   template's `{grounding_rules}`, `{peer_rules}`, `{partner_rules}` and `{cruse_rules}`
   wording: the build and the tests check it. Keep each agent's instructions under
   5,000 characters.
4. **Never fabricate.** No `demo_mode`, no invented prices, IDs or statuses in
   instructions. Agents read facts through a `website_*` read action. Site data stays in
   `js/*-data.js`, rules in `js/*-rules.js`, never in instructions or `site-actions.js`.
5. **One set of rules per site.** The page's own buttons and the assistant's actions call
   the same methods of `App.page`. Operations refuse by returning
   `{ok: false, reason, field}` and change nothing; they throw only on unexpected
   failures; they never move focus or reset a form.
6. **Effects.** `read` changes nothing. `write` is only for changes the visitor can undo
   on the page. Anything else is `irreversible`: it needs a read-only check function, a
   `DIALOGS` entry and `reviewDetails` in `site.js`, and `expectedVersion`. When unsure,
   use `irreversible`.
7. **Partners.** A partner is its exact network URL in the calling agent's `tools`, a
   `link_labels` entry, and its origin in `allowed_peers`. Keep `peer_policy.mode`
   `"closed"`. Change origins only through `origins.json` and `npm run origins`. A
   request to a partner never holds a name, email, phone number or reference code, and
   stays under 140 characters. A partner's network gets none of its own site's
   `website_*` tools here; it answers from its own site's read-only `/mcp` tools instead.
   Two sentences of `partner_rules` differ from the template on purpose (non-personal
   details in the request; a decline is the visitor's choice), so the build warns.
13. **MCP tools.** A site's MCP tools live in `server/tools/<site>.mjs`, are read-only,
   take no name, email, phone number or reference, return no visitor's records, and call
   the site's own data and rules modules. Each front agent lists its own `<origin>/mcp`
   in `tools` and each manifest its own origin in `allowed_peers`. Put hand-worked
   amounts in `server/tests/`.
8. **Keys and privacy.** Never put a key, token or personal data in any file, URL,
   prompt, action argument or log. Never ask the user to paste a key into a chat. The
   visitor's key belongs in the runtime's settings panel only. Load no third-party
   scripts on any page.
9. **Each page must work without the assistant.** If the runtime fails to boot, the page
   says so and stays usable.
10. **Stay honest in the product.** Every site says it is a fictional demo. Do not use
    real company names, logos, real tariffs or real grant schemes. Do not present the
    fictional grants as real ones.
11. **Tests are part of every change.** Put a site's values and hand-worked expected
    amounts in `sites/<site>/tests/site_config.mjs`. `agentified.test.mjs` is the same
    file on every site: change all three copies together, or not at all.
12. **Open source.** The repository is Apache 2.0, as the rules require open source.
    Keep `NOTICE` up to date when third-party code is added.

## Layout

```text
CLAUDE.md                     this file
origins.json                  each site's origin per environment
scripts/                      build-all, serve-all, set-origins, sync-runtime, check-conformance
server/                       each site's read-only MCP server (/mcp) and the Cloudflare Worker entry
deploy/cloudflare/            one Worker config per site: static assets plus /mcp
docs/hackathon/               the rules digest, the specification and the checklist (loaded below)
docs/architecture.md          sites, agents, actions and cross-site calls
docs/development.md           local setup, trying with a key, adding a site or an action
docs/deployment.md            hosting, headers and going to production
tools/agentify-website/       vendored hackathon skill: runtime, build scripts, templates, references
sites/<site>/
  index.html, styles.css      the page, with the assistant section
  js/app.js                   the page object (App.page): state reader and operations
  js/*-data.js, js/*-rules.js demo data and business rules
  site-actions.js             registers the operations as website_* tools
  site.js                     boots the runtime; greeting and confirmation dialogs
  <network>.hocon             the agent network's source
  agent-manifest.json         the public manifest
  links.json                  the public peer-link map
  _headers                    CORS and CSP headers for static hosts
  tests/                      Node tests
  (generated) <network>.network.json, agent-mcp.json, .well-known/, bridge/
  (copied) runtime/
```

## What a conforming submission needs

The short form. The full text is in the three files loaded below.

- The submitted public URL holds: a public conforming `.json` describing the agent
  network; a runtime that runs it in the browser; an interface to use it; optionally an
  LLM and key settings interface; and the network working with the website and,
  optionally, with other agentic websites.
- Spec section 6 asks an implementation to show: a two-agent network and manifest on an
  HTTPS host; the network running in a browser on the default router, and BYOK if
  offered; an internal agent call and a grounded capability; a named network loaded from
  a second origin after the visitor agrees; that the second site never gets the key or
  changes the router; that private context does not reach the peer unless allowed; and
  visible errors for an invalid network, a cycle, an over-budget request and a denied
  origin.
- Judges score technology, design, potential impact (shared tools count) and the quality
  of the idea, equally.
- The video is under two minutes, narrated by the entrant, with no third-party
  trademarks or music.

Known gaps to state openly are listed in `docs/hackathon/conformance_checklist.md`.

## Hackathon rules and specification

The rules say an entry conforms to the specification as it stood when the submission
period opened on 11 November 2026. The copy below is upstream commit `512d948` of
12 November 2026. Upstream changes often: see `docs/hackathon/README.md` before relying
on a detail that may have moved.

@docs/hackathon/rules_digest.md

@docs/hackathon/conformance_checklist.md

@docs/hackathon/worldwide_agentic_web_mvp_spec.md
