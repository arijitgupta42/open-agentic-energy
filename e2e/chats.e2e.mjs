// Workflow 11: several chats in one visit, and the choice between being asked before a
// partner is contacted and approving automatically. The real runtime, swarm and partner
// networks run on the scripted router in scripted-router.mjs.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { TEST_KEY, useScriptedRouter } from "./scripted-router.mjs";

const PARTNERS = ["localhost:8081", "localhost:8082"];
const QUESTION = "I'm thinking about a heat pump for my 95 square metre semi-detached house. What would it cost to fit and to run, and is there a grant?";
const SWITCH = "Switch me to the Fixed 12 Month tariff.";

/**
 * Open Emberwick, give the assistant the test key, and wait until it is connected.
 *
 * :param fixtures: The test's app and screen.
 */
async function connect({ app, screen }) {
  await app.open("/");
  await screen.getByPlaceholder("Paste your API key").fill(TEST_KEY);
  await screen.getByRole("button", "Save and start").tap();
  await expect(screen.getByText("Assistant connected to this page.")).toBeVisible();
}

/**
 * Send a message and wait for the agents to finish.
 *
 * :param screen: The screen fixture.
 * :param browser: The browser fixture.
 * :param text: The message.
 */
async function ask(screen, browser, text) {
  await screen.getByRole("textbox", "Your request").fill(text);
  await screen.getByRole("button", "Send").tap();
}

/** Wait until no turn is running, so the list of chats is open for switching. */
async function settled(browser) {
  await expect(browser.locator(".ns-inputbar")).toHaveAttribute("data-turn-active", "false");
}

test("11. A visitor keeps several chats, the swarm follows the one on show, and can let partners be approved automatically", async ({ app, screen, browser }) => {
  const seen = await useScriptedRouter(browser, PARTNERS);
  await connect({ app, screen });

  // The list is to the left of the chat, with one empty chat, and asking is the default.
  const picks = browser.locator("#chat-list .chat-pick");
  await expect(picks).toHaveCount(1);
  await expect(picks.first()).toHaveText("New chat");
  await expect(browser.locator("#partner-approval-mode")).toHaveValue("ask");

  // First chat: a switch the visitor declines. No partner is involved.
  await ask(screen, browser, SWITCH);
  const dialog = screen.getByRole("dialog", /Switch tariff\?/);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", "Stay on my tariff").tap();
  await settled(browser);
  await expect(picks.first()).toHaveText(SWITCH);
  await expect(browser.locator('.swarm-site-status').filter({hasText: "partner · ran here"})).toHaveCount(0);

  // A new chat opens with the greeting only, and the swarm has nothing on show for it.
  await screen.getByRole("button", "+ New chat").tap();
  await expect(picks).toHaveCount(2);
  await expect(browser.locator("#ns-msgs .ns-msg.user")).toHaveCount(0);
  await expect(browser.locator("#swarm-map")).toContainText("Ask something");

  // Automatic approval: no card, the partners are contacted, and the chat lists each contact.
  await browser.locator("#partner-approval-mode").selectOption("Approve automatically");
  await ask(screen, browser, QUESTION);
  await expect(screen.getByText(/^Plan: /)).toContainText("Fernbrook Heat Pump Grant: £5,000");
  await settled(browser);
  await expect(browser.locator("#ns-msgs .ns-consent-actions")).toHaveCount(0);
  await expect(browser.locator("#ns-msgs .ns-auto-approved")).toHaveCount(2);
  await expect(browser.locator("#ns-msgs")).toContainText("Contacted Heatwright Home Energy automatically");
  await expect(browser.locator("#ns-msgs")).toContainText("Contacted Fernbrook Retrofit Grants automatically");
  await expect(browser.locator("#swarm-map")).toContainText("3 sites");
  await browser.locator('.swarm-node[aria-label^="heatwright_assistant,"]').click();
  await expect(browser.locator("#swarm-tip")).toContainText("approved automatically");
  // The key still goes only to the router.
  for (const request of seen.filter((item) => PARTNERS.includes(item.host))) {
    expect(request.headers.authorization).toBeUndefined();
  }

  // A change that cannot be undone still asks, whatever is chosen for partners.
  await ask(screen, browser, SWITCH);
  const again = screen.getByRole("dialog", /Switch tariff\?/);
  await expect(again).toBeVisible();
  await again.getByRole("button", "Stay on my tariff").tap();
  await settled(browser);

  // Back to the first chat: its messages return, and the swarm shows only its answer.
  await picks.first().tap();
  await expect(picks.first()).toHaveAttribute("aria-current", "true");
  await expect(browser.locator("#ns-msgs .ns-msg.user")).toHaveCount(1);
  await expect(browser.locator("#ns-msgs")).toContainText(SWITCH);
  await expect(browser.locator("#ns-msgs")).not.toContainText("Contacted Heatwright");
  await expect(browser.locator("#swarm-map")).not.toContainText("3 sites");
  await expect(browser.locator(".swarm-turns")).toBeHidden();

  // And forward again to the second chat, with its two answers.
  await picks.nth(1).tap();
  await expect(browser.locator("#ns-msgs")).toContainText("Contacted Heatwright Home Energy automatically");
  await expect(browser.locator(".swarm-turn")).toHaveCount(2);

  // Back to asking: the next contact opens the card again.
  await browser.locator("#partner-approval-mode").selectOption("Ask me before each contact");
  await screen.getByRole("button", "+ New chat").tap();
  await ask(screen, browser, QUESTION);
  await expect(screen.getByRole("group", /Contact Heatwright Home Energy on your behalf/)).toBeVisible();
});

test("12. The chat box grows upward as a long request wraps, keeps its bottom edge, and shrinks back once the request is sent", async ({ app, screen, browser }) => {
  await useScriptedRouter(browser, PARTNERS);
  await connect({ app, screen });
  const measure = () => browser.evaluate(() => {
    const box = document.querySelector("#agent-app textarea.ns-grow").getBoundingClientRect();
    const bar = document.querySelector("#agent-app .ns-inputbar").getBoundingClientRect();
    // Measured from the input bar's own bottom edge, so scrolling the page changes nothing.
    return { height: box.height, bottom: bar.bottom - box.bottom };
  });
  const box = () => screen.getByRole("textbox", "Your request");
  const before = await measure();
  const long = `${SWITCH} ${"Please do it soon, ".repeat(25)}`;
  await box().fill(long);
  const grown = await measure();
  expect(grown.height).toBeGreaterThan(before.height * 2);
  expect(Math.abs(grown.bottom - before.bottom)).toBeLessThan(2);
  await expect(box()).toHaveValue(long);
  // Sending it empties the box and puts it back to one line.
  await screen.getByRole("button", "Send").tap();
  await expect(box()).toHaveValue("");
  const after = await measure();
  expect(Math.abs(after.height - before.height)).toBeLessThan(2);
  const dialog = screen.getByRole("dialog", /Switch tariff\?/);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", "Stay on my tariff").tap();
});
