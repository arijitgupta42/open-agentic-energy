# Open Agentic Energy

Deciding on a heat pump means asking an installer what it costs to fit, a grants body
what help there is, and your energy supplier what it would cost to run on your tariff.
Each answer sits on a different website, and each website's assistant knows only its own
site.

Open Agentic Energy is three linked open agentic websites for the
[Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/): an energy
supplier, a heat pump and solar installer, and a retrofit grants body. Each publishes a
Neuro SAN agent network. When a customer asks their supplier "should I get a heat pump?",
the supplier's assistant loads the installer's and the grants body's networks into the
customer's own browser, after the customer agrees, and answers with figures from all
three sites. The companies, tariffs, prices and grants are fictional.

| Logo | Site | Live | Network |
| --- | --- | --- | --- |
| <img src="sites/utility/favicon.svg" width="28" height="28" alt="Emberwick's ember logo"> | Emberwick Energy, the supplier (the site entered) | [emberwick-energy](https://emberwick-energy.open-agentic-energy.workers.dev/) | `emberwick_energy`, 4 agents |
| <img src="sites/installer/favicon.svg" width="28" height="28" alt="Heatwright's fan logo"> | Heatwright Home Energy, the installer | [heatwright-installers](https://heatwright-installers.open-agentic-energy.workers.dev/) | `heatwright_installers`, 3 agents |
| <img src="sites/grants/favicon.svg" width="28" height="28" alt="Fernbrook's leaf logo"> | Fernbrook Retrofit Grants, the grants body | [fernbrook-grants](https://fernbrook-grants.open-agentic-energy.workers.dev/) | `fernbrook_grants`, 4 agents |

## Try it

1. Open [Emberwick Energy](https://emberwick-energy.open-agentic-energy.workers.dev/).
   Scroll to "Ask Emberwick Energy" and open AI model settings. Paste an OpenRouter key,
   preferably one with a low spending limit, and choose Save and start. The key stays in
   your browser and goes only to OpenRouter.
2. Ask: *I'm thinking about a heat pump for my 95 square metre semi-detached house. What
   would it cost to fit and to run, and is there a grant?*
3. Two cards ask before Heatwright and Fernbrook are contacted. Each shows the whole
   request the partner will read. Choose Allow on both.
4. In about a minute you get the price to fit (£9,200 to £11,200 for an 8 kW pump), the
   £5,000 heat pump grant and what Fernbrook still needs to know, and the running cost:
   Heat Pump Saver at £1,617.79 a year, £145.92 less than the cheapest tariff now.
5. Watch "The swarm at work" beside the chat while the answer is made: a live graph of
   all 11 agents, grouped by site, where the agents and calls working on your message
   light up, with sparks moving along the calls until the answer is done. Point at an
   agent or a call for a few plain lines on what it did for that answer: who asked it
   what, what it looked up or worked out, whom it asked, and your consent decision.
   Point at a chat message to see its path again.

**Other AI providers.** OpenRouter is only the default. Under Advanced settings, any
OpenAI-compatible provider that allows browser calls works, and so does Claude on
Azure AI Foundry. For Foundry, paste your resource's base URL
(`https://<resource>.services.ai.azure.com/anthropic`), your Foundry API key and your
deployment name as the model. The **Provider protocol** setting detects the Anthropic
Messages protocol from that URL, or you can choose it yourself. It uses key
authentication, not Microsoft Entra ID tokens, and your key goes only to your Azure
endpoint. A visitor has confirmed this against a live Foundry endpoint.

Without a key, the [Safety checks page](https://emberwick-energy.open-agentic-energy.workers.dev/lab/)
runs on an in-page mock model and shows the runtime stopping an invalid network, a
composition cycle, an over-budget request and a denied origin.

## What a visitor can do

Every page works on its own, with no assistant and no key. The assistant uses the same
functions as the page's buttons, so the page and the assistant follow one set of rules.

On all three sites the visitor is the same signed-in fictional customer, Ana Silva, so
nothing asks for a name, an email or an address: a survey or an application is made in
the account's name. The assistant's forms in the chat offer dropdowns only.

| Site | On the page | Ask the assistant |
| --- | --- | --- |
| Emberwick | See 12 months of usage, compare tariffs, switch tariff | "Which tariff would be cheapest for me?", "Which months did I use the most gas?", "What would a heat pump cost to run?", "Switch me to Fixed 12 Month" |
| Heatwright | Get an estimate for a heat pump or solar panels, request a free survey | "What heat pump would suit a 95 m² semi?", "Could I have solar panels on a flat?", "Is there a grant?" |
| Fernbrook | Check eligibility for three schemes, start an application | "Is there a grant for a heat pump?", "Could I get help with insulation?" |

A switch, a survey request or an application cannot be undone. The assistant cannot do
any of them by itself: the site's own dialog shows the real figures and fees first, and
nothing happens unless the visitor confirms. Writes that can be undone, such as showing a
comparison or an estimate, run straight away.

Every assistant also takes spoken requests. Press the small mic at the end of the chat box and say
the request: the mic becomes a moving waveform, the words appear in the chat box as they are spoken, listening goes on
through pauses until the visitor presses the mic again, and nothing is sent until they press Send. Speech never answers a confirmation dialog or a partner's
consent card. The page uses only the browser's own speech recognition, so it loads no
other script and needs no extra key. On the first press the page asks the browser
whether it can recognise speech on the device. If it can, the audio stays there, after a
one-time language download. If not, the page says the audio would go to the browser
maker's speech service, as Chrome's goes to Google's, and listens only after a second
press. Firefox has no speech recognition, so the button does not appear there. Brave has
the interface but no speech service, so the page says to use Chrome or Edge there.

## The 11 agents

All 11 run in the visitor's browser. The front agent of each site talks to the visitor.
Specialists never see the chat: whoever calls them passes what they need. Only front
agents change anything on a page; specialists read.

| Site | Agent | What it does | Reads from |
| --- | --- | --- | --- |
| Emberwick | `emberwick_assistant` | Talks to the customer. Reads the account, shows comparisons, switches tariff after the dialog, and hands work to the three specialists. | The page's site actions |
| Emberwick | `tariff_advisor` | Ranks the tariffs this account can have by the site's own yearly cost estimates, with exit fees, and names the tariff a heat pump would open up. | The account |
| Emberwick | `usage_analyst` | Finds the highest and lowest months, and works out what a heat pump would cost to run on each tariff. | The account; Emberwick's `estimate_heat_pump_running_cost` |
| Emberwick | `retrofit_planner` | Asks Heatwright, Fernbrook and `usage_analyst` in one step, so all three run at once, then sets their figures side by side with each source named. It never adds figures from different sites together. It is the only Emberwick agent that contacts another site. | Partner networks |
| Heatwright | `heatwright_assistant` | Talks to the visitor. Shows estimates on the page and sends survey requests after the dialog. Asks Fernbrook about grants and Emberwick about running costs. | The page's site actions |
| Heatwright | `heat_pump_engineer` | Works out the home's heat loss and the pump size and price that cover it. | Heatwright's `estimate` |
| Heatwright | `solar_designer` | Picks a solar system and price, or says why the home does not suit panels, such as a flat's shared roof. | Heatwright's `estimate` |
| Fernbrook | `fernbrook_assistant` | Talks to the visitor. Records eligibility answers on the page and starts applications after the dialog. Routes grant questions to the scheme agents with AAOSA, and asks Heatwright what fitting costs. | The page's site actions |
| Fernbrook | `heat_pump_grant_agent` | Answers for the £5,000 Heat Pump Grant. | Fernbrook's `check_scheme` |
| Fernbrook | `solar_starter_agent` | Answers for the £1,200 Solar Starter grant. | Fernbrook's `check_scheme` |
| Fernbrook | `warm_walls_agent` | Answers for the Warm Walls insulation voucher, up to £2,000. | Fernbrook's `check_scheme` |

Fernbrook's three schemes overlap: a heat pump question can touch both the heat pump
grant and the insulation voucher. So the front agent uses AAOSA, Neuro SAN's Determine
and Fulfill protocol. It asks every scheme agent at once whether its scheme fits the
request, then asks only those that said yes to check the visitor's answers.
`check_scheme` decides one scheme from only the answers it needs, and says which are
missing, so a visitor who has given one answer still gets a useful reply.

On a live run of the heat pump question, the view counted 11 agent runs on 3 sites,
4 parallel steps, 3 AAOSA Determines and 1 Fulfill, 10 MCP calls and 27 model calls, in
68 seconds.

## Why Neuro SAN suits this

A heat pump decision needs knowledge held by three organisations, and none of them
should hand its data or logic to the others. Neuro SAN lets each one publish what it
knows as a network of agents, and lets another site run that network on request.

- Each network is declarative data: agents, their instructions, the tools each may call,
  and JSON Schemas for their inputs. Each site writes it in HOCON (`sites/*/*.hocon`) and
  publishes it as resolved JSON. A partner network is fetched, validated and run in the
  caller's browser with the caller's model and step limits, so a partner never receives
  the visitor's key and cannot choose what the visitor pays for.
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

## Compliance with the hackathon rules

**Last checked: 22 November 2026**, on `production` after `fix/thin-text-weight` (the small, quiet text a little heavier and brighter on all three sites; no row affected), `feat/fluted-glass-ground` (a fluted-glass page ground and heavier text on all three sites, no box behind the hero panel; no row affected), `fix/chat-hold-last-message` (chat scroll), `fix/scroll-hidden-status`, `fix/phone-question-box` (phone question box), `fix/phone-settings-scroll` (phone Settings scroll, tab bar), following the C-style redesign of all three sites, against the
[official rules](https://cognizant-agenticweb.devpost.com/rules) and
[updates](https://cognizant-agenticweb.devpost.com/updates) as read that day, and the
specification as it stood when the submission period opened.

**In short:** the hosted sites meet every requirement the rules set for the submitted
URL, and every check in section 6 of the specification. Stage one of judging is a pass
or fail on exactly those. What remains is outside the code: the video and the Devpost
entry. Two MUSTs in specification section 3.1 are met only in part because of how the
reference runtime works. They are listed below rather than hidden.

How it was checked:

- `npm run check`: 54 conformance checks on the built files, all passing.
- `npm run conformance:live -- --env production`: 72 checks on the hosted sites (CORS,
  manifests, networks, bridge, each page's Content-Security-Policy), all passing.
- `check_partner.mjs` on all five cross-site calls from their real callers, all passing.
- `npm test` (323 tests) and `npm run test:e2e` (21 browser workflows), all passing. Four
  of the workflows also fail on any Content-Security-Policy violation, and check that a
  policy is in force.
- The browser checks with a live key, recorded on issues #4 to #8, all closed.
- The Devpost rules page and updates page, read again on 19 November 2026. The only
  update is an office-hour notice, with no change to the rules.

### What the rules require

| Rule | Status | Evidence |
| --- | --- | --- |
| A working open agentic website built with standard open web technologies | Met | Plain HTML, CSS and JavaScript modules, no dependencies, no bundler |
| Conforms to the specification as at the start of the submission period | Met | Our copy in `docs/hackathon/` is identical to upstream commit `fd872b9` (MVP Profile 0.2), the version in force on 11 November 2026. Upstream's Profile 0.3 (19 November) only fixes links and typos. See the next table |
| Publicly accessible, runs consistently in a current browser | Met | Hosted over HTTPS on Cloudflare Workers; 21 browser workflows pass in Chromium |
| The URL holds a public, conforming `.json` describing the network | Met | `agent-manifest.json` and `emberwick_energy.network.json`, served with CORS |
| The URL holds a runtime file that runs the network in the browser | Met | `runtime/`, an unchanged copy of the reference runtime (`sync-runtime --check`) |
| The URL holds an interface to the network | Met | "Ask Emberwick Energy" on the page |
| Optional: an interface to choose LLMs and keys | Met | The runtime's AI model settings, with a protocol picker for Anthropic Messages endpoints |
| The network works with the website, and optionally with other agentic websites | Met | `website_*` site actions on the page; it calls Heatwright and Fernbrook, and both call it |
| New, or significantly updated in the submission period | Met | The first commit is dated 13 November 2026 |
| Third-party code and APIs used under their terms | Met | The reference runtime is Apache 2.0, credited in `NOTICE`. No page loads a third-party script. A model provider is reached only with the visitor's own key, under the visitor's own terms |
| Original work, open source, builds on what it uses | Met | Apache 2.0, public at github.com/arijitgupta42/open-agentic-energy. Our own: three sites, 11 agents, three MCP servers, the swarm graph, the answer-path reader, the Anthropic protocol adapter, the Safety checks page |
| Free to test, without restriction, until judging ends | Met, with a note | The sites are free and every page works without the assistant. Chatting needs a model key the tester supplies (the specification allows BYOK); the Safety checks page needs no key. The description must say so plainly |
| Fictional, with no third-party marks in the product | Met | Every page says it is a fictional demo; the logos are drawn in SVG here; the companies, tariffs and grants are invented. The redesign adds one self-hosted font, Schibsted Grotesk (SIL OFL, listed in `NOTICE`); no page loads a font or script from another origin |
| All materials in English | Met | |
| No financial or preferential support from the sponsor | The entrant's own declaration | Not something the code can show |
| Text description and screenshots | Drafted | `docs/devpost/description.md` (issue #11) |
| A demo video under two minutes, narrated by the entrant, public on YouTube, no third-party marks or music | **Not done yet** | Issue #10; `docs/devpost/demo_script.md` is the script |
| The Devpost entry itself, by 11 January 2027 16:00 UTC | **Not done yet** | Issues #12 and #13 |

### What the specification requires

| Spec section 6 check | Status | Where it happens |
| --- | --- | --- |
| A two-agent network and manifest on an HTTPS host | Met | Emberwick publishes four agents, `agent-manifest.json` and `links.json` on Cloudflare Workers |
| Runs in a browser on the site's router; BYOK shown | Met | OpenRouter with `openai/gpt-6-luna` by default; any OpenAI-compatible provider that allows browser calls; Anthropic Messages endpoints such as Claude on Azure AI Foundry |
| An internal agent and a grounded capability | Met | `emberwick_assistant` → `usage_analyst` → MCP `estimate_heat_pump_running_cost` |
| An exact named network from a second origin, after approval | Met | `retrofit_planner` → `heatwright_installers` and `fernbrook_grants`, each after its own card |
| The second site never gets the key or changes the router | Met | Checked live in the browser's network log (issue #7), and by browser workflow 5 |
| Private context absent at the peer | Met | No network declares a private-context allow rule; partners receive only the request text the card showed |
| Visible errors for an invalid network, a cycle, an over-budget request, a denied origin | Met | The [Safety checks page](https://emberwick-energy.open-agentic-energy.workers.dev/lab/), and browser workflow 8 |

Peer policy is closed on every site: each manifest lists the partner origins it may
contact, and the runtime refuses any other. Each network sets `max_steps`. Irreversible
actions (a tariff switch, a survey request, an application) open the site's own
confirmation dialog first. After the visitor allows a partner, that partner's agents
reach its own `/mcp` without a second card. Spec section 5 scopes a remembered approval
to the destination origin for the session, so this is within the rules.

Every page sends a Content-Security-Policy (spec section 4): scripts and workers only
from the site, no eval, no plugins, requests only to the site, `https:` (the visitor's
model provider and the partners) and loopback, frames only from the partners in
`allowed_peers`, and no framing by other sites. Styles allow inline, because the
reference runtime adds a `<style>` element. It is in each site's `_headers`, and
`npm run serve` sends the same headers.

### Met only in part

Both come from the reference runtime, which the rules ask us to build on and which this
project does not edit.

| Spec | What it asks | Where we stand |
| --- | --- | --- |
| 3.1, MUST | Show the destination and arguments before a write | Irreversible actions do. Writes the visitor can undo on the page (show a comparison, show an estimate, record answers) run without a preview |
| 3.1, MUST | Finite limits on elapsed time | Steps, calls and concurrency are bounded. A partner that accepts the connection and never answers leaves the chat waiting until the page is reloaded |

The full mapping, including what needs a browser to check, is in
[docs/hackathon/conformance_checklist.md](docs/hackathon/conformance_checklist.md).

### Keeping this section current

Every pull request updates this section before it is merged into `dev`: the date, the
branch, and any row the change affects. A change that adds a gap, closes one or changes
a count changes the table in the same pull request. Before submitting, read the Devpost
rules and updates pages again and compare the specification with upstream.

## Shared with the community

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

## Tests

`npm test` runs 319 tests with no LLM. They load the real runtime and page code against a
scripted model, and check the MCP servers against amounts worked out by hand.

`npm run test:e2e` runs 21 user workflows in Chromium with
[e2e](https://github.com/e2e-inc/e2e). A scripted router inside the browser stands in for
the model, so the real runtime, networks, consent cards, partner sites and MCP servers
all run, with no key:

1. Compare and switch a tariff on Emberwick's page.
2. Get a heat pump estimate on Heatwright's page.
3. Check eligibility on Fernbrook's page.
4. Open Emberwick with no key: the page says how to add one and still works.
5. Ask the heat pump question and allow both partners: figures from all three sites,
   distinct icons, parallel calls and AAOSA in the view, and the key sent only to the
   router.
6. Decline Fernbrook: it is never contacted, and the answer says so.
7. Ask the assistant to switch tariff: nothing changes until the page's dialog is
   confirmed.
8. Run all four Safety checks.
9. Speak a request on each site: it fills the chat box, on the device, and is not
   sent until the visitor presses Send.
10. Suggested requests: a starter in each chat box, the agent's own next request, taken from the last line of its answer, shown with
    the answer, and Tab to take it. Each site's starter
    needs another site, so the first request already runs across the swarm.
11. A usage answer is drawn as stat tiles and a chart, with its numbers in a table.
12. Several chats in one visit: the swarm follows the chat on show, and partners can be
    approved automatically.
13. The chat box grows as a long request wraps, and shrinks back once it is sent.
14. Enter sends; Shift+Enter and pasted text make new lines, and the message keeps them.
15. Every site starts dark and keeps the visitor's light or dark choice.
16. On a phone, every site opens on the chat, with the page, swarm and settings one tap
    away.
17. The heat pump question on a phone: thumb-sized consent cards, then the chats sheet.
18. Figures fit a phone's screen.
19. Every element the chat can show (replies, figures, forms, choices, consent cards,
    badges, the developer log, dialogs) is readable on all three sites in both themes:
    each piece of text is measured against what is behind it (WCAG 4.5:1). Every consent
    card is one width on every site, and a declined one reads in red.
20. A form the assistant draws in the chat is dropdowns only, with no field for a
    personal detail: the visitor is a signed-in demo customer, so the account holds them.
21. While a long answer is written, the chat stays on the visitor's latest message instead    of scrolling to the answer's end, until the visitor scrolls; a message sent while an    answer streams is held the same way.

## Known limits

These come from the reference runtime, which this project does not edit.

- Writes that can be undone run without a preview; only irreversible actions open a
  dialog.
- A partner network runs without the partner's site actions, so it answers from the
  partner's public MCP tools and cannot see a visitor's records there.
- A partner that accepts the connection but never answers leaves the chat waiting until
  the page is reloaded.
- The model provider must allow calls from a browser.
- A swarm answer costs more than a single assistant: the heat pump question took 27 model
  calls.
- Neuro SAN's coded tools and private-context allow rules are not used. The static build
  refuses coded tools, and the runtime gives a page no way to set private context.

## Quick start

Node.js 22 or newer. The sites, their tests and the MCP servers have no dependencies.
Only the browser workflow tests need `npm install` (e2e, a development dependency).

```shell
npm run build      # write the published network files
npm test           # 319 tests: real runtime and page code, scripted model, no LLM, plus the MCP servers
npm run test:e2e   # 21 user workflows in a real browser, on a scripted model (docs/development.md)
npm run check      # generated files, runtime copies and conformance checks
npm run serve      # serve the three sites, each with its /mcp
```

Then open http://127.0.0.1:8080/ (supplier), http://localhost:8081/ (installer) and
http://localhost:8082/ (grants). To chat, open AI model settings under the assistant and
add your own key. See [docs/development.md](docs/development.md) before you do.

## Documentation

- [CLAUDE.md](CLAUDE.md): the rules for working in this repository. It loads the
  hackathon rules and the specification into every coding-agent session.
- [docs/hackathon/](docs/hackathon/README.md): the rules digest, the MVP specification
  and the conformance checklist.
- [docs/architecture.md](docs/architecture.md): sites, agents, actions, cross-site calls.
- [docs/development.md](docs/development.md): local setup and how to change things.
- [docs/deployment.md](docs/deployment.md): hosting and going to production.

## Status

The three sites are hosted on Cloudflare Workers and pass the live conformance and
partner checks. Browser checks with a live key (OpenRouter, `openai/gpt-6-luna`) are
recorded on the repository's issues. Work left before the submission is tracked in the
"Devpost submission" milestone.

## Licence

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). The browser runtime, build
scripts and templates under `tools/agentify-website/` and each site's `runtime/` come
from [cognizant-ai-labs/agentic-web](https://github.com/cognizant-ai-labs/agentic-web)
and [nsdeploy](https://github.com/cognizant-ai-lab/nsdeploy), both Apache 2.0.
