# Open Agentic Energy

Three linked open agentic websites for the
[Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/): an energy
supplier, a heat pump and solar installer, and a retrofit grants body. Each site has an
assistant that runs in the visitor's browser, on the visitor's own LLM key, reads the
page's real data and calls the page's own functions. The assistants can ask each other's
sites, after the visitor agrees.

All three companies, and every tariff, price and grant, are fictional.

Live: [Emberwick Energy](https://emberwick-energy.open-agentic-energy.workers.dev/) (the site entered) ·
[Heatwright Home Energy](https://heatwright-installers.open-agentic-energy.workers.dev/) ·
[Fernbrook Retrofit Grants](https://fernbrook-grants.open-agentic-energy.workers.dev/)

[Safety checks](https://emberwick-energy.open-agentic-energy.workers.dev/lab/), no key needed: the runtime
refusing an invalid network, a composition cycle, an over-budget request and a denied
origin (spec section 6), each on a small test network in `sites/utility/lab/`.

| Site | What a visitor does | Network |
| --- | --- | --- |
| [Emberwick Energy](sites/utility) | Sees usage, compares tariffs, switches tariff | `emberwick_energy` (two agents) |
| [Heatwright Home Energy](sites/installer) | Gets a heat pump or solar estimate, requests a survey | `heatwright_installers` |
| [Fernbrook Retrofit Grants](sites/grants) | Checks eligibility, starts an application | `fernbrook_grants` |

A customer asks their energy supplier "should I get a heat pump?". The supplier's
assistant knows their usage and tariffs. After the customer agrees, it runs the
installer's and the grants body's agents in the customer's own browser, and those agents
answer with figures from their own sites' read-only MCP servers: an estimate for the
home, and which grants the household could get. The installer's assistant can ask the
supplier about heat pump tariffs the same way.

## Quick start

Node.js 22 or newer. No install step: there are no dependencies. Each site also serves a
read-only MCP server at `/mcp` (`server/`).

```shell
npm run build      # write the published network files
npm test           # 80 tests: real runtime and page code, scripted model, no LLM, plus the MCP servers
npm run check      # generated files, runtime copies and conformance checks
npm run serve      # serve the three sites, each with its /mcp
```

Then open http://127.0.0.1:8080/ (supplier), http://localhost:8081/ (installer) and
http://localhost:8082/ (grants). To chat, open **AI model settings** under the assistant
and add your own key. See [docs/development.md](docs/development.md) before you do.

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
"Devpost submission" milestone, and the known gaps are listed in
[docs/hackathon/conformance_checklist.md](docs/hackathon/conformance_checklist.md).

## Licence

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). The browser runtime, build
scripts and templates under `tools/agentify-website/` and each site's `runtime/` come
from [cognizant-ai-labs/agentic-web](https://github.com/cognizant-ai-labs/agentic-web)
and [nsdeploy](https://github.com/cognizant-ai-lab/nsdeploy), both Apache 2.0.
