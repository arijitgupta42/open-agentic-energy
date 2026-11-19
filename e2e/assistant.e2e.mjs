// Workflows 4 to 7: the assistant and its swarm, in a real browser, on the scripted
// router in scripted-router.mjs. The runtime, the three published networks, the consent
// cards, the partner sites and their MCP servers are all real.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { TEST_KEY, useScriptedRouter } from "./scripted-router.mjs";
import { expectNoCspViolations } from "./csp.mjs";

const PARTNERS = ["localhost:8081", "localhost:8082"];
const QUESTION = "I'm thinking about a heat pump for my 95 square metre semi-detached house. What would it cost to fit and to run, and is there a grant?";

/**
 * Open Emberwick, give the assistant the test key in its settings, and wait until it is
 * connected.
 *
 * :param fixtures: The test's app, screen and browser.
 */
async function connect({ app, screen }) {
  await app.open("/");
  await screen.getByPlaceholder("Paste your API key").fill(TEST_KEY);
  await screen.getByRole("button", "Save and start").tap();
  await expect(screen.getByText("Assistant connected to this page.")).toBeVisible();
}

/**
 * Ask the assistant something.
 *
 * :param screen: The screen fixture.
 * :param text: The message.
 */
async function ask(screen, text) {
  await screen.getByRole("textbox", "Your request").fill(text);
  await screen.getByRole("button", "Send").tap();
}

/**
 * Answer the consent card for one partner.
 *
 * :param screen: The screen fixture.
 * :param partner: The partner's name, as the card's title gives it.
 * :param choice: "Allow" or "Decline".
 */
async function answerCard(screen, partner, choice) {
  const card = screen.getByRole("group", new RegExp(`Contact ${partner} on your behalf`));
  await expect(card).toBeVisible();
  await card.getByRole("button", choice).tap();
}

test("4. Without a key the page says how to set one up, and shows Emberwick's own icon", async ({ app, screen, browser }) => {
  await app.open("/");
  await expect(screen.getByText("Assistant needs your AI provider key. Add it in AI model settings below.")).toBeVisible();
  // The swarm graph is drawn before any key is set, with this site first.
  expect((await browser.locator(".swarm-site-name").allTextContents())[0]).toBe("Emberwick Energy");
  // The title in the chat header shows the ember logo, not an emoji.
  await expect(browser.locator(".ns-title .brand-logo-ember")).toHaveCount(1);
  await expect(browser.locator(".swarm-node")).toHaveCount(11);
  // The page itself still works.
  await screen.getByRole("button", "Compare Green Flex").tap();
  await expect(screen.getByRole("status").filter({hasText: "Green Flex"})).toBeVisible();
});

test("5. The swarm answers a heat pump question from all three sites, after the visitor allows each partner", async ({ app, screen, browser }) => {
  const seen = await useScriptedRouter(browser, PARTNERS);
  await connect({ app, screen });
  await ask(screen, QUESTION);
  // The planner asks both partners in one step: two cards, one after the other.
  await answerCard(screen, "Heatwright Home Energy", "Allow");
  await answerCard(screen, "Fernbrook Retrofit Grants", "Allow");
  // Figures from each site's own rules, carried through the swarm.
  const answer = screen.getByText(/^Plan: /);
  await expect(answer).toContainText("8 kW air-source heat pump, £9,200 to £11,200");
  await expect(answer).toContainText("Fernbrook Heat Pump Grant: £5,000");
  await expect(answer).toContainText("Heat Pump Saver, £145.92 less per year");
  // Each site has its own logo in the swarm graph: an ember, a fan and a leaf beside the site's name.
  const map = (await browser.locator(".swarm-site-name").allTextContents()).join(" ");
  for (const name of ["Emberwick", "Heatwright", "Fernbrook"]) {
    expect(map).toContain(name);
  }
  for (const kind of ["ember", "fan", "leaf"]) {
    await expect(browser.locator(`.swarm-site-label .brand-logo-${kind}`)).toHaveCount(1);
    await expect(browser.locator(`.swarm-front .brand-logo-${kind}`)).toHaveCount(1);
  }
  // The swarm graph beside the chat: agents on all three sites worked on the answer.
  const swarm = browser.locator("#swarm-map");
  await expect(swarm).toContainText("3 sites");
  for (const agent of ["emberwick_assistant", "retrofit_planner", "heatwright_assistant", "fernbrook_assistant", "heat_pump_grant_agent"]) {
    await expect(browser.locator(`.swarm-node[data-state="ok"][aria-label^="${agent},"]`)).toHaveCount(1);
  }
  await expect(browser.locator('.swarm-node[data-state="idle"][aria-label^="tariff_advisor,"]')).toHaveCount(1);
  // The scheme agent's tooltip is plain: its job, who asked it what and what it did. No tool names, no AAOSA, no timings.
  await browser.locator('.swarm-node[aria-label^="heat_pump_grant_agent,"]').click();
  const tip = browser.locator("#swarm-tip");
  await expect(tip).toContainText("Heat pump grant");
  await expect(tip).toContainText("asked: “");
  await expect(tip).toContainText("said whether it could help");
  await expect(tip).toContainText("(you allowed it).");
  await expect(tip).not.toContainText("check_scheme");
  await expect(tip).not.toContainText("AAOSA");
  await expect(tip).not.toContainText("model call");
  // The key went only to the router; partner sites got public files and /mcp only.
  const partnerRequests = seen.filter((request) => PARTNERS.includes(request.host));
  expect(partnerRequests.length).toBeGreaterThan(0);
  for (const request of partnerRequests) {
    expect(request.headers.authorization).toBeUndefined();
    expect(JSON.stringify(request.headers)).not.toContain(TEST_KEY);
  }
  const routerCalls = seen.filter((request) => request.host === "openrouter.ai" && request.url.endsWith("/chat/completions"));
  for (const request of routerCalls) {
    expect(request.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
  }
  // The page's Content-Security-Policy let the runtime, both partners and the router through.
  await expectNoCspViolations(browser);
});

test("6. A declined partner is never contacted, and the answer says the visitor declined", async ({ app, screen, browser }) => {
  const seen = await useScriptedRouter(browser, PARTNERS);
  await connect({ app, screen });
  await ask(screen, QUESTION);
  await answerCard(screen, "Heatwright Home Energy", "Allow");
  await answerCard(screen, "Fernbrook Retrofit Grants", "Decline");
  const answer = screen.getByText(/^Plan: /);
  await expect(answer).toContainText("£9,200 to £11,200");
  await expect(answer).toContainText("The user declined to contact localhost:8082");
  // Each card carries its answer, so "✕ Declined" reads in red and "✓ Allowed" in green.
  await expect(browser.locator('#ns-msgs .ns-consent[data-decision="decline"] .ns-consent-done')).toHaveText("✕ Declined");
  await expect(browser.locator('#ns-msgs .ns-consent[data-decision="allow"] .ns-consent-done')).toHaveText("✓ Allowed");
  // The graph shows the grants site as declined, and its agents never ran.
  await expect(browser.locator('.swarm-node[data-state="refused"][aria-label^="fernbrook_assistant,"]')).toHaveCount(1);
  expect((await browser.locator(".swarm-site-status").allTextContents()).join(" | ")).toContain("partner · declined");
  await browser.locator('.swarm-node[aria-label^="fernbrook_assistant,"]').click();
  await expect(browser.locator("#swarm-tip")).toContainText("You chose not to contact this site.");
  expect(seen.filter((request) => request.host === "localhost:8082")).toEqual([]);
});

test("7. A tariff switch through the assistant waits for the page's own dialog", async ({ app, screen, browser }) => {
  await useScriptedRouter(browser);
  await connect({ app, screen });
  await ask(screen, "Switch me to the Fixed 12 Month tariff.");
  const dialog = screen.getByRole("dialog", /Switch tariff\?/);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Fixed 12 Month");
  // Nothing has changed before the visitor confirms.
  await expect(screen.getByText(/Switched from/)).toBeHidden();
  await dialog.getByRole("button", "Switch tariff").tap();
  await expect(screen.getByText(/^Switch succeeded: EW-SW-0001\./)).toBeVisible();
  await expect(screen.getByText(/Switched from Standard Variable to Fixed 12 Month/)).toContainText("EW-SW-0001");
  await expectNoCspViolations(browser);
});
