# Demo script

How to show Open Agentic Energy to a judge or in the demo video. The video must be under
two minutes, narrated by you (not AI-generated), public on YouTube, and free of
third-party trademarks and music (`docs/hackathon/rules_digest.md`).

## The one workflow to show

**Show the heat pump question on Emberwick.** That single run covers almost every spec
section 6 check and every Neuro SAN feature in the project:

- an internal agent call
- a grounded MCP tool and site action
- two named networks from other origins, each loaded after a consent card
- a parallel swarm
- AAOSA routing
- BYOK, with a key the partners never see
- a full trace of how the answer was made

Add the Safety checks page for the four required errors, and you've covered stage one
and the technology criterion in under two minutes.

## Before recording

- **Set the key first, off camera.** The settings panel shows other companies' names
  (Google AI Studio, Groq, OpenAI, Anthropic), and the rules forbid third-party
  trademarks in the video. Paste a low-limit OpenRouter key, choose Save and start, and
  collapse AI model settings. Avoid filming the browser's own logo or toolbar too:
  record just the page area, or use full screen.
- **Use the live HTTPS sites**, not localhost. The spec check asks for "an ordinary HTTPS
  host", and judges will test the same URLs.
- **Use Edge if you show voice.** Brave can't do it, and Chrome sends audio to Google.
- **Do one full run before recording.** It warms the sites and confirms the key works.
  The answer takes about a minute, so plan a jump cut while it runs and say on camera
  that you've shortened the wait.
- **Have three tabs ready:** Emberwick, its `/lab/` Safety checks page, and
  `emberwick_energy.network.json`.

## Two-minute script

Narrate it yourself. The lines below are suggestions to put in your own words.

| Time | On screen | What to say |
| --- | --- | --- |
| 0:00–0:12 | Emberwick home page | The problem: the fitting cost, the grant and the running cost sit on three different websites. Each site's assistant knows only its own site. |
| 0:12–0:25 | Scroll to "Ask Emberwick Energy". Press the mic at the end of the chat box and say the heat pump question (or paste it), then press Send. | *"I'm thinking about a heat pump for my 95 square metre semi-detached house. What would it cost to fit and to run, and is there a grant?"* Speech only fills the box; you press Send. |
| 0:25–0:40 | Two consent cards appear. Pause on one, then Allow both. | The supplier wants to load the installer's and the grants body's agent networks. Each card names the origin and shows the whole request, with nothing personal in it. Nothing contacts them until you agree. |
| 0:40–0:50 | The agent panel lighting up (jump cut here) | Those partner networks now run in my browser, on my model and my key. The partners never receive the key and can't change which model I pay for. |
| 0:50–1:10 | The answer: £9,200 to £11,200 to fit, the £5,000 grant, Heat Pump Saver at £1,617.79 a year | Each figure names its source site. The grant agent says what it still needs to know rather than guessing. No figure comes from a prompt; agents read them through MCP tools and site actions that use the same rules as the pages. |
| 1:10–1:35 | Point at "The swarm at work" beside the chat: the ⚡ 🔧 🌱 sites lit, the calls between them. Hover retrofit_planner and a Fernbrook scheme agent for the parallel step, the AAOSA round and the MCP calls. | This is Neuro SAN: 11 agents on 3 sites. `retrofit_planner` calls two partner networks and an internal agent in one step, and they run at the same time. Fernbrook uses AAOSA: every scheme agent says whether it fits, and only those that do check your details. The key shows only as "not shown". |
| 1:35–1:50 | Flash the `.network.json`, then `/lab/`: run all four checks | Each network is public, declarative data written in HOCON. The runtime stops an invalid network, a cycle, an over-budget request and a denied origin, with visible errors. |
| 1:50–2:00 | Back on the page | Three organisations share expertise without sharing data or code, and the visitor stays in control. It's open source, with three public MCP servers anyone can use. |

Leave out the tariff switch dialog and the decline path. They're good but don't fit in
two minutes. Put them in the Devpost text instead.

## For a judge exploring live (5 minutes)

If a judge is clicking through with you, or in a longer walkthrough, add these after the
main workflow:

1. **Decline a partner.** Ask the heat pump question again and press Decline on
   Fernbrook. Fernbrook is never contacted, and the answer says you declined. This shows
   consent has teeth.
2. **The irreversible-action dialog.** Ask "Switch me to Fixed 12 Month". The assistant
   can't do it by itself: the page's own dialog shows the real fees first. This is spec
   3.1 and "user-owned writes".
3. **The key never reaches a partner.** Open DevTools → Network while a partner call
   runs. Requests to Heatwright and Fernbrook are public file fetches and `/mcp` calls
   with no `Authorization` header; only the router gets the key.
4. **The pages work alone.** Compare tariffs on the page with no key at all. One set of
   rules serves both the buttons and the agents.
5. **The installer's view.** Open Heatwright and ask "Is there a grant?". The same
   partnering works from another site, in the other direction.

## Why this workflow scores on all four criteria

- **Technology:** in one run it covers cross-origin network loading, consent, BYOK
  isolation, parallel delegation, AAOSA, MCP and the trace.
- **Design:** a real three-site product flow with dialogs and plain-language answers,
  not a protocol demo.
- **Impact:** a real decision people struggle with, plus shared tools: three public MCP
  servers, `answer-path.js` and the scripted router.
- **Idea:** the agentic web removes the "three websites, three assistants" problem
  without any company handing its data or logic to another.
