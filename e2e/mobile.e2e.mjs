// Workflows 15 to 17: the phone layout (js/mobile.js and mobile.css), at 390 x 844 pixels,
// on the scripted router in scripted-router.mjs: no model and no real key. The chat is
// the first screen, the other parts are a tap away, and a heat pump question, its consent
// cards and its figures work with thumbs.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { TEST_KEY, useScriptedRouter } from "./scripted-router.mjs";

const PARTNERS = ["localhost:8081", "localhost:8082"];
const PHONE = {width: 390, height: 844};
const QUESTION = "I'm thinking about a heat pump for my 95 square metre semi-detached house. What would it cost to fit and to run, and is there a grant?";

/**
 * Open a site on a phone and give the assistant the test key, in the Settings screen where
 * a phone keeps it.
 *
 * :param fixtures: The test's app, screen and browser.
 * :param url: The site's address.
 */
async function connect({ app, screen, browser }, url = "/") {
  await browser.setViewport(PHONE);
  await app.open(url);
  await browser.locator('.m-tab[data-view="settings"]').click();
  await screen.getByPlaceholder("Paste your API key").fill(TEST_KEY);
  await screen.getByRole("button", "Save and start").tap();
  // The runtime starts again with the key, and a phone lands on the chat, with its greeting.
  await expect(screen.getByText(/I can explain your usage, compare tariffs/)).toBeVisible();
  await expect(browser.locator('body[data-view="ask"]')).toHaveCount(1);
}

/**
 * Whether the page is wider than the screen, so it would scroll sideways.
 *
 * :param browser: The browser fixture.
 * :return: True when it is.
 */
async function scrollsSideways(browser) {
  return browser.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

test("15. On a phone every site opens on the chat, with the page, swarm and settings one tap away", async ({ app, screen, browser }) => {
  await browser.setViewport(PHONE);
  for (const [url, page] of [["/", "Account"], ["http://localhost:8081/", "Estimate"], ["http://localhost:8082/", "Grants"]]) {
    await app.open(url);
    await expect(browser.locator('body[data-view="ask"]')).toHaveCount(1);
    await expect(browser.locator(".m-tabs .m-tab")).toHaveCount(4);
    await expect(browser.locator(`.m-tab[data-view="page"]`)).toHaveText(page);
    // The chat box is on the first screen; the site's own sections are not.
    await expect(screen.getByRole("textbox", "Your request")).toBeVisible();
    await expect(browser.locator("main > section:not(#assistant)").first()).toBeHidden();
    expect(await scrollsSideways(browser)).toBe(false);
    await browser.locator('.m-tab[data-view="page"]').click();
    await expect(browser.locator('body[data-view="page"]')).toHaveCount(1);
    await expect(browser.locator("#assistant")).toBeHidden();
    expect(await scrollsSideways(browser)).toBe(false);
    await browser.locator('.m-tab[data-view="swarm"]').click();
    await expect(browser.locator("#swarm-map")).toBeVisible();
    await browser.locator('.m-tab[data-view="settings"]').click();
    await expect(browser.locator('[data-ns-slot="settings"]')).toBeVisible();
    // What goes to the AI provider is said on the Settings screen.
    await expect(browser.locator("#assistant .assistant-note").first()).toBeVisible();
    // The site's switch is on every screen, and the page is in its first theme (design variant C: Emberwick opens light).
    await expect(browser.locator(".theme-switch")).toBeVisible();
    await expect(browser.locator(`html[data-theme="${url === "/" || url === "http://localhost:8081/" ? "light" : "dark"}"]`)).toHaveCount(1);
  }
});

test("16. A heat pump question on a phone: consent cards with thumb-sized buttons, then the chats sheet", async ({ app, screen, browser }) => {
  await useScriptedRouter(browser, PARTNERS);
  await connect({ app, screen, browser });
  await screen.getByRole("textbox", "Your request").fill(QUESTION);
  await screen.getByRole("button", "Send").tap();
  const card = screen.getByRole("group", /Contact Heatwright Home Energy on your behalf/);
  await expect(card).toBeVisible();
  // Every control a thumb has to hit on this screen is at least 44 pixels tall.
  const small = await browser.evaluate(() => [...document.querySelectorAll(".m-tab, #ns-send, .ns-consent-actions button")]
    .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height < 44).length);
  expect(small).toBe(0);
  await card.getByRole("button", "Allow").tap();
  await screen.getByRole("group", /Contact Fernbrook Retrofit Grants on your behalf/).getByRole("button", "Allow").tap();
  await expect(screen.getByText(/^Plan: /)).toContainText("Fernbrook Heat Pump Grant: £5,000");
  expect(await scrollsSideways(browser)).toBe(false);
  // The chats of this visit are a sheet: it opens over the chat, and a new chat closes it.
  await browser.locator(".m-chats").click();
  await expect(browser.locator('body[data-sheet="chats"]')).toHaveCount(1);
  await expect(browser.locator("#chat-side")).toBeVisible();
  await browser.locator("#chat-side .chat-new").click();
  await expect(browser.locator("body[data-sheet]")).toHaveCount(0);
  await expect(screen.getByText(/^Plan: /)).toBeHidden();
});

test("17. Figures on a phone fit the screen", async ({ app, screen, browser }) => {
  await useScriptedRouter(browser);
  await connect({ app, screen, browser });
  await screen.getByRole("textbox", "Your request").fill("Show my gas and electricity use by month.");
  await screen.getByRole("button", "Send").tap();
  const tiles = browser.locator("#ns-msgs .ou-root .ou-stat-value");
  await expect(tiles).toHaveCount(2);
  await expect(tiles.nth(0)).toHaveText("11,770 kWh");
  await expect(browser.locator("#ns-msgs .ou-root rect.ou-bar")).toHaveCount(24);
  expect(await scrollsSideways(browser)).toBe(false);
  // Nothing drawn sticks out past the right edge of the screen.
  const outside = await browser.evaluate(() => [...document.querySelectorAll("#ns-msgs .ou-root, #ns-msgs .ou-chart")]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth).length);
  expect(outside).toBe(0);
});
