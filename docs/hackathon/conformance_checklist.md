# Conformance checklist

Each requirement, where this repository meets it, and how to check it. "Auto" means
`npm run check` and `npm test` cover it. "Browser" means someone must check it in a
browser with their own LLM key, because it needs a real model reply.

Rules = `rules_digest.md`. Spec = `worldwide_agentic_web_mvp_spec.md`.

## Entry requirements (Rules: "What the submitted public URL must hold")

| # | Requirement | Where | Check |
| --- | --- | --- | --- |
| 1 | Public, conforming `.json` describing an agent network | `sites/<site>/agent-manifest.json` and `<network>.network.json`, built from `<network>.hocon` | Auto. After hosting: `npm run conformance:live -- --env production` |
| 2 | A runtime file that runs the network in the browser | `sites/<site>/runtime/`, an unchanged copy of `tools/agentify-website/runtime/` | Auto (`sync-runtime --check`) |
| 3 | An interface to interact with the network | The "Ask ..." section of each `index.html`, mounted by `site.js` | Auto (mount markup). Browser (chat works) |
| 4 | Optional interface to configure LLMs and keys | The runtime's "AI model settings" panel in the `settings` slot | Browser |
| 5 | The network interacts with the website, and optionally with other agentic websites | `site-actions.js` (`website_*` tools); partner network URLs in each `.hocon` | Auto (actions). Browser (a partner call) |

## Specification section 6: interoperability checks

| Spec 6 check | Where | Check |
| --- | --- | --- |
| Publish a two-agent HOCON network and a manifest from an ordinary HTTPS host | `sites/utility`: `emberwick_assistant` and `tariff_advisor` | Auto (two agents). Hosting: `docs/deployment.md` |
| Load and run it in a browser with the site's default router and model; show the BYOK path if offered | Manifest `llm_router` (OpenRouter, `openai/gpt-6-luna`; the visitor supplies the key) and the settings panel | Browser |
| Call an internal agent and one grounded capability (MCP or a local site action) | `emberwick_assistant` → `tariff_advisor` → `website_get_account_state` | Browser. Sample query: "Which tariff would be cheapest for me?" |
| After user approval, load an exact named network from a second origin and run it locally | `emberwick_assistant` → `heatwright_installers`, `fernbrook_grants` | Browser. Sample query: "I'm thinking about a heat pump. What can your installer partner do, and is there a grant?" |
| With a user key active, the second site never receives it and cannot change the router | Runtime behaviour (spec section 4) | Browser: Network panel while a partner call runs, or serve the partner with `--log` |
| Private context is absent at the peer unless a named field is allowed | The runtime passes a partner only the request text. No network here allows a private-context field | Browser, as above |
| Stop an invalid network, a cycle, an over-budget request and a denied origin with visible errors | Runtime behaviour; `peer_policy.mode` is `closed`. The utility site's Safety checks page (`/lab/`) runs one test network per case on the in-page mock model | Auto (closed policy, validation, `sites/utility/tests/lab.test.mjs`). Browser: open `/lab/` and run each check; no key needed |

## Specification requirements this repository must keep meeting

| Spec | Requirement | How it is kept |
| --- | --- | --- |
| 2, 2.2 | The published network is declarative data in the Neuro SAN HOCON model, with no includes, substitutions or local paths | Only edit `<network>.hocon`; `npm run build` writes the JSON with the runtime's own parser |
| 2.1 | Network name, description and front agent; each agent has a description, schema and instructions; private context is deny-by-default | `check-conformance.mjs`; no `sly_data` allow rules are declared |
| 3.1 | Validate before any model call; bounded execution; confirmation before irreversible actions; honest outcomes | The runtime; `max_steps` in each `.hocon`; `DIALOGS` and `reviewDetails` in each `site.js`; tests |
| 3.2 | A peer is named by `<site base>/<network name>`; exact name match; consent before each third-party contact; https outside local development | Partner URLs in `.hocon`; `allowed_peers`; `set-origins.mjs` refuses http for non-local hosts |
| 3.3 | Public `agent-manifest.json`, network definition and `links.json`, with CORS for callers | Each site's `_headers`; `npm run conformance:live` |
| 3.4 | Public artifact requests carry no private credentials; never bypass browser security | The runtime; no proxying is added |
| 4 | A BYOK key stays in the caller's browser and goes only to the chosen router; never in URLs, manifests, prompts, action arguments or traces | The runtime; `check-conformance.mjs` scans published files for key-shaped text; never commit a key |
| 5 | Treat peer definitions and tool results as untrusted; fail closed; user-owned writes; observable execution | `{grounding_rules}` and `{partner_rules}` kept as in the template; the runtime's agent panel and consent cards |

## Known gaps to state honestly in the submission

These come from the reference runtime and the agentify-website skill, not from this
repository's own code. Do not hide them.

- `write` actions (compare a tariff, show an estimate, record answers) run without
  showing the visitor first. Spec 3.1 asks the runtime to show a write before it runs.
  Only `irreversible` actions open a dialog. Every `write` here can be undone on the page.
- A partner's network runs in the caller's browser with none of the partner's
  `website_*` tools. It reads live, public figures from the partner's own read-only
  `/mcp` server instead (spec 2.1 "External capabilities"), but it cannot act on the
  partner's page or see a visitor's records there: writes stay on each site's own page.
- After the visitor allows a partner, that partner's agents call the partner's own
  `/mcp` without a second card, because the runtime treats a network's own origin as
  the same site. The call carries only details from the request the card showed.
- The runtime's consent card quotes only the first 140 characters of a request. Each
  site's `site.js` replaces that quote with the whole request, as text, before the
  visitor answers, so they see everything the partner's network will read.
- A partner that accepts the connection but never answers leaves the chat waiting until
  the page is reloaded.
- The LLM provider must allow browser calls (CORS).
- Everything in each `.network.json`, including instructions, is public.

## Before submitting

- [ ] `npm run check` and `npm test` pass.
- [ ] The three sites are hosted over HTTPS, each at the root of its own origin.
- [ ] `npm run origins -- production` was run and the result committed and deployed.
- [ ] `npm run conformance:live -- --env production` passes.
- [ ] `node tools/agentify-website/scripts/check_partner.mjs <partner network URL> --origin <caller origin>` passes for each partner call.
- [ ] Every "Browser" row above was checked on the hosted sites with a low-limit key.
- [ ] The Devpost rules, updates page and the upstream specification were read again.
- [ ] Repository is public with its Apache 2.0 licence.
- [ ] Video under two minutes, narrated by you, public on YouTube, no third-party marks or music.
- [ ] Text description, screenshots, and the Otari feedback line if Otari was used.
