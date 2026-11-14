# Devpost submission draft

A draft of the text for the Devpost form (issue #11). Check it against the Devpost rules,
the updates page and the live sites before pasting it in. Facts here come from the
repository on 14 November 2026: change them here when the sites change.

## Form fields

| Field | Value |
| --- | --- |
| Public URL | https://emberwick-energy.open-agentic-energy.workers.dev/ |
| Repository | https://github.com/arijitgupta42/open-agentic-energy (public before submitting, issue #9) |
| Video | YouTube link, under two minutes, narrated by the entrant (issue #10) |
| Screenshots | `docs/screenshots/` (see the list below) |
| Mozilla Otari | Not used. Leave the Otari email and feedback fields blank. |

## Description

### Open Agentic Energy

Three small, linked energy websites, each with an assistant that runs in the visitor's
own browser on the visitor's own LLM key. The companies, tariffs, prices and grants are
all fictional.

- **Emberwick Energy** (the site entered) is an energy supplier. A customer sees their
  usage, compares tariffs and switches tariff.
- **Heatwright Home Energy** is a heat pump and solar installer. A visitor gets an
  estimate for their home and requests a survey.
- **Fernbrook Retrofit Grants** is a grants body. A visitor checks which grants they
  could get and starts an application.

### The problem

Deciding on a heat pump means asking three organisations three questions: what it would
cost to run on my tariff, what it would cost to fit, and what help I could get. Each
answer sits on a different website, and each assistant only knows its own site.
Here, a customer asks their supplier "should I get a heat pump?". The supplier's assistant
already knows their usage and tariffs. After the customer agrees on a card, it loads the
installer's and the grants body's published agent networks into the customer's browser.
Those agents answer with figures from their own sites' read-only MCP servers, and the
supplier's assistant puts the answers together. Nothing about the customer leaves the
page except the short request the card showed them.

### How it works

- **Published networks.** Each site publishes its agent network as a resolved Neuro SAN
  network file, with `agent-manifest.json` and `links.json`, from static hosting with
  CORS. Emberwick's network has four agents: `emberwick_assistant`, `tariff_advisor`
  (ranks the tariffs), `usage_analyst` (usage and heat pump running costs) and
  `retrofit_planner` (asks both partners and the analyst at once).
- **A swarm across three sites.** Eleven Neuro SAN agents on three origins, all in the
  visitor's browser. When a step needs several specialists or partners, the agent asks
  for them together and the runtime runs them in parallel. Fernbrook routes between its
  scheme agents with AAOSA, Neuro SAN's Determine and Fulfill protocol: every scheme
  agent says whether it fits, then only those that do check the visitor's answers.
- **Browser runtime.** The hackathon's reference runtime runs each network in the page.
  The agents read the page through `website_*` actions that call the same methods as the
  page's own buttons, so the page and the assistant follow one set of rules.
- **Confirmation.** An action that cannot be undone, such as switching tariff or sending a
  survey request, opens the site's own dialog with the real figures and exit fees, and
  runs only if the visitor confirms.
- **Cross-site calls.** Partner networks are named by exact URL and allowed by a closed
  peer policy. The runtime asks before each new partner, and the card shows the whole
  request. Partner agents run on the caller's router and key; the partner site never
  receives the key and cannot change the router.
- **Read-only MCP servers.** Each site answers `/mcp` with public tools (tariffs and yearly
  costs, products and estimates, grants and eligibility) built on the same data and rules
  as its page. Any MCP client can use them.
- **How each answer was made.** Under the chat, each reply has a tree built from the
  runtime's trace: which agent ran on which site, the site actions and MCP tools it used,
  which calls ran at the same time, each AAOSA Determine and Fulfill with its reply,
  each partner network with the visitor's consent decision, and the model and router,
  with the key shown only as "not shown".
- **Safety checks page.** `/lab/` shows the runtime stopping an invalid network, a
  composition cycle, an over-budget request and a denied origin, on the in-page mock
  model. No key is needed.
- **Bring your own key.** The default router is OpenRouter with `openai/gpt-6-luna`; any
  OpenAI-compatible provider that allows browser calls works. The key stays in the
  visitor's browser.

### Built with

Plain HTML, CSS and JavaScript modules, with no dependencies and no bundler; the
agentic-web reference runtime and agentify-website skill (Apache 2.0); Cloudflare Workers
for static hosting and `/mcp`; Node's test runner. 88 tests run the real runtime and page
code against a scripted model, and the MCP servers against hand-worked amounts.

### Known gaps

These come from the reference runtime, which this project does not edit.

- `write` actions (compare a tariff, show an estimate, record eligibility answers) run
  without a preview. Each can be undone on the page. Only irreversible actions open a
  dialog.
- A partner's network runs without the partner's `website_*` tools. It answers from the
  partner's public MCP tools, so it cannot act on the partner's page or see a visitor's
  records there.
- After the visitor allows a partner, that partner's agents call the partner's own `/mcp`
  without a second card, because the runtime treats a network's own origin as the same
  site.
- A partner that accepts the connection but never answers leaves the chat waiting until
  the page is reloaded.
- The LLM provider must allow browser calls (CORS).
- Everything in each published network file, including the instructions, is public.
- There is no publisher-funded model: every visitor brings their own key.
- A swarm costs more: a full heat pump question took 27 to 28 model calls and about
  70 seconds in live runs.
- Neuro SAN's coded tools and `sly_data` allow rules are not used: the static build
  refuses coded tools, and the runtime gives a page no way to set private context.

### Shared with the community

- Three read-only MCP servers, one per site, usable by any MCP client.
- Three published agent networks that any conforming runtime can load as partners.
- The Safety checks page and its four test networks (`sites/utility/lab/`), a quick way to
  see a runtime meet the spec's failure cases.
- `js/answer-path.js`: builds a readable "How this answer was made" tree from the
  reference runtime's trace, with no runtime changes.

## Screenshots

At least one is required. In `docs/screenshots/` now:

- `05-internal-agent-call.jpg`: Emberwick's assistant asking `tariff_advisor`.
- `06-partner-consent-card.jpg`: the consent card before a partner is contacted.
- `18-composed-answer-with-mcp.jpg`: an answer composed from both partners' MCP figures.

Still to take: "How each answer was made" after a partner call, a confirmation dialog,
and the Safety checks page.
