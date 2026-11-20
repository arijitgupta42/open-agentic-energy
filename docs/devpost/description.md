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

Paste everything from "Open Agentic Energy" down to the end of "Known limits". It
follows the README's order. Devpost renders Markdown headings, lists and links, but not
always tables, so the README's tables are lists here.

### Open Agentic Energy

Deciding on a heat pump means asking an installer what it costs to fit, a grants body
what help there is, and your energy supplier what it would cost to run on your tariff.
Each answer sits on a different website, and each website's assistant knows only its own
site.

Open Agentic Energy is three linked open agentic websites: an energy supplier, a heat
pump and solar installer, and a retrofit grants body. Each publishes a Neuro SAN agent
network. When a customer asks their supplier "should I get a heat pump?", the supplier's
assistant loads the installer's and the grants body's networks into the customer's own
browser, after the customer agrees, and answers with figures from all three sites. The
companies, tariffs, prices and grants are fictional.

- [Emberwick Energy](https://emberwick-energy.open-agentic-energy.workers.dev/), the
  supplier and the site entered: 4 agents, with an ember for its logo.
- [Heatwright Home Energy](https://heatwright-installers.open-agentic-energy.workers.dev/),
  the installer: 3 agents, with a fan for its logo.
- [Fernbrook Retrofit Grants](https://fernbrook-grants.open-agentic-energy.workers.dev/),
  the grants body: 4 agents, with a leaf for its logo.

### Try it

1. Open Emberwick Energy. Scroll to "Ask Emberwick Energy" and open AI model settings.
   Paste an OpenRouter key, preferably one with a low spending limit, and choose Save and
   start. The key stays in your browser and goes only to OpenRouter.
2. Ask: "I'm thinking about a heat pump for my 95 square metre semi-detached house. What
   would it cost to fit and to run, and is there a grant?"
3. Two cards ask before Heatwright and Fernbrook are contacted. Each shows the whole
   request the partner will read. Choose Allow on both.
4. In about a minute you get the price to fit (£9,200 to £11,200 for an 8 kW pump), the
   £5,000 heat pump grant and what Fernbrook still needs to know, and the running cost:
   Heat Pump Saver at £1,617.79 a year, £145.92 less than the cheapest tariff now.
5. Watch "The swarm at work" beside the chat while the answer is made: a live graph of
   all 11 agents, grouped by site, where the agents and calls working on your message
   light up. Point at an agent or a call for a few lines on what it did for that answer:
   who asked it what, the tools it used, its reply and your consent decision. Point at a
   chat message to see its path again. The key is
   listed only as "not shown".

Without a key, the [Safety checks page](https://emberwick-energy.open-agentic-energy.workers.dev/lab/)
runs on an in-page mock model and shows the runtime stopping an invalid network, a
composition cycle, an over-budget request and a denied origin.

### What a visitor can do

Every page works on its own, with no assistant and no key. The assistant uses the same
functions as the page's buttons, so the page and the assistant follow one set of rules.

- Emberwick: see 12 months of usage, compare tariffs and switch tariff. Ask "Which tariff
  would be cheapest for me?", "Which months did I use the most gas?" or "What would a
  heat pump cost to run?"
- Heatwright: get an estimate for a heat pump or solar panels and request a free survey.
  Ask "What heat pump would suit a 95 m² semi?" or "Could I have solar panels on a flat?"
- Fernbrook: check eligibility for three schemes and start an application. Ask "Is there
  a grant for a heat pump?" or "Could I get help with insulation?"

A switch, a survey request or an application cannot be undone. The assistant cannot do
any of them by itself: the site's own dialog shows the real figures and fees first, and
nothing happens unless the visitor confirms. Writes that can be undone, such as showing a
comparison or an estimate, run straight away.

Every assistant also takes spoken requests. Press the small mic at the end of the chat box and say
the request: the words appear in the chat box for the visitor to check, and nothing is
sent until they press Send. Speech never answers a confirmation dialog or a partner's
consent card. The page uses only the browser's own speech recognition, so it loads no
other script and needs no extra key. On the first press the page asks the browser
whether it can recognise speech on the device. If it can, the audio stays there, after a
one-time language download. If not, the page says the audio would go to the browser
maker's speech service, as Chrome's goes to Google's, and listens only after a second
press. Firefox has no speech recognition, so the button does not appear there.

### The 11 agents

All 11 run in the visitor's browser. The front agent of each site talks to the visitor.
Specialists never see the chat: whoever calls them passes what they need. Only front
agents change anything on a page; specialists read.

Emberwick:

- `emberwick_assistant` talks to the customer. It reads the account, shows comparisons,
  switches tariff after the dialog, and hands work to the three specialists.
- `tariff_advisor` ranks the tariffs this account can have by the site's own yearly cost
  estimates, with exit fees, and names the tariff a heat pump would open up.
- `usage_analyst` finds the highest and lowest months, and works out what a heat pump
  would cost to run on each tariff, from Emberwick's MCP tool
  `estimate_heat_pump_running_cost`.
- `retrofit_planner` asks Heatwright, Fernbrook and `usage_analyst` in one step, so all
  three run at once, then sets their figures side by side with each source named. It
  never adds figures from different sites together, and it is the only Emberwick agent
  that contacts another site.

Heatwright:

- `heatwright_assistant` talks to the visitor. It shows estimates on the page, sends
  survey requests after the dialog, and asks Fernbrook about grants and Emberwick about
  running costs.
- `heat_pump_engineer` works out the home's heat loss and the pump size and price that
  cover it.
- `solar_designer` picks a solar system and price, or says why the home does not suit
  panels, such as a flat's shared roof.

Fernbrook:

- `fernbrook_assistant` talks to the visitor. It records eligibility answers on the page,
  starts applications after the dialog, and routes grant questions to the scheme agents
  with AAOSA.
- `heat_pump_grant_agent`, `solar_starter_agent` and `warm_walls_agent` each answer for
  one scheme: the £5,000 Heat Pump Grant, the £1,200 Solar Starter grant and the Warm
  Walls insulation voucher of up to £2,000.

Fernbrook's schemes overlap: a heat pump question can touch both the heat pump grant and
the insulation voucher. So the front agent uses AAOSA, Neuro SAN's Determine and Fulfill
protocol. It asks every scheme agent at once whether its scheme fits the request, then
asks only those that said yes to check the visitor's answers. The MCP tool `check_scheme`
decides one scheme from only the answers it needs, and says which are missing, so a
visitor who has given one answer still gets a useful reply.

On a live run of the heat pump question, the view counted 11 agent runs on 3 sites,
4 parallel steps, 3 AAOSA Determines and 1 Fulfill, 10 MCP calls and 27 model calls, in
68 seconds.

### Why Neuro SAN suits this

A heat pump decision needs knowledge held by three organisations, and none of them
should hand its data or logic to the others. Neuro SAN lets each one publish what it
knows as a network of agents, and lets another site run that network on request.

- Each network is declarative data: agents, their instructions, the tools each may call,
  and JSON Schemas for their inputs. Each site writes it in HOCON and publishes it as
  resolved JSON. A partner network is fetched, validated and run in the caller's browser
  with the caller's model and step limits, so a partner never receives the visitor's key
  and cannot choose what the visitor pays for.
- Agents call agents the same way they call tools, so a swarm needs no code of its own.
  `retrofit_planner` calls two partner networks and an internal agent as one step's tool
  calls, and the runtime runs them in parallel, up to four at once.
- The same graph format holds plain delegation (Emberwick, Heatwright) and AAOSA routing
  (Fernbrook), so each site uses the pattern its problem needs.
- Agents read facts only through registered site actions or MCP tools, which call the
  same rules as the page. Prices, amounts and statuses never appear in an agent's
  instructions.
- The runtime records every agent, tool call, consent decision and model call in a trace.
  "The swarm at work" (a live graph, plain SVG with no library) is built from that
  trace, with no change to the runtime.

### How it meets the specification

- A two-agent network and manifest on an HTTPS host: Emberwick publishes four agents,
  `agent-manifest.json` and `links.json` on Cloudflare Workers.
- Runs in a browser on the site's router, with BYOK: OpenRouter with `openai/gpt-6-luna`
  by default, or any OpenAI-compatible provider that allows browser calls.
- An internal agent and a grounded capability: `emberwick_assistant` asks
  `usage_analyst`, which calls the MCP tool `estimate_heat_pump_running_cost`.
- An exact named network from a second origin, after approval: `retrofit_planner` loads
  `heatwright_installers` and `fernbrook_grants`, each after its own card.
- The second site never gets the key or changes the router: checked live in the browser's
  network log, and by browser workflow test 5.
- Private context stays away from the peer: no network declares a private-context allow
  rule, and partners receive only the request text the card showed.
- Visible errors for an invalid network, a cycle, an over-budget request and a denied
  origin: the Safety checks page, and browser workflow test 8.

Peer policy is closed on every site: each manifest lists the partner origins it may
contact, and the runtime refuses any other.

### Shared with the community

- Three read-only MCP servers, one on each site's own origin at `/mcp`. They use the same
  data and rules modules as the pages, so a page, its assistant and any MCP client give
  the same figures. They take no name, email or reference and never return a customer's
  account.
- Three published agent networks that any conforming runtime can load as partners.
- `js/swarm-graph.js` and `js/swarm-map.js`, which draw a swarm as a live graph from the
  same trace: fixed layout, inline SVG, no dependency.
- `js/answer-path.js`, which reads the reference runtime's trace into a tree of
  how an answer was made.
- The Safety checks page and its test networks (`sites/utility/lab/`).
- `e2e/scripted-router.mjs`, a way to run a whole multi-site agent swarm in a real browser
  with no model and no key, by answering the runtime's model calls from a script.

### Built with

Plain HTML, CSS and JavaScript modules, with no runtime dependencies and no bundler; the
agentic-web reference runtime and agentify-website skill (Apache 2.0); Cloudflare Workers
for static hosting and `/mcp`; Node's test runner; and [e2e](https://github.com/e2e-inc/e2e)
for browser tests.

97 tests run the real runtime and page code against a scripted model, and the MCP
servers against hand-worked amounts. Nine browser workflow tests run in Chromium on a
scripted router, so the real runtime, networks, consent cards, partner sites and MCP
servers all run with no key. They cover the three pages on their own, the no-key state,
the heat pump question with both partners allowed, a declined partner, a switch that
waits for the page's dialog, the four Safety checks, and a spoken request on each site.

### Known limits

These come from the reference runtime, which this project does not edit.

- Writes that can be undone (compare a tariff, show an estimate, record eligibility
  answers) run without a preview; only irreversible actions open a dialog.
- A partner network runs without the partner's site actions, so it answers from the
  partner's public MCP tools and cannot see a visitor's records there.
- After the visitor allows a partner, that partner's agents call the partner's own `/mcp`
  without a second card, because the runtime treats a network's own origin as the same
  site.
- A partner that accepts the connection but never answers leaves the chat waiting until
  the page is reloaded.
- The model provider must allow calls from a browser.
- Everything in each published network file, including the instructions, is public.
- There is no publisher-funded model: every visitor brings their own key.
- A swarm answer costs more than a single assistant: the heat pump question took 27 model
  calls.
- Neuro SAN's coded tools and private-context allow rules are not used. The static build
  refuses coded tools, and the runtime gives a page no way to set private context.

## Screenshots

At least one is required. In `docs/screenshots/` now:

- `05-internal-agent-call.jpg`: Emberwick's assistant asking `tariff_advisor`.
- `06-partner-consent-card.jpg`: the consent card before a partner is contacted.
- `18-composed-answer-with-mcp.jpg`: an answer composed from both partners' MCP figures.

Still to take, to match the description: "The swarm at work" with all three sites lit after a
partner call, an agent's tooltip showing the AAOSA round,
a confirmation dialog, and the Safety checks page.
