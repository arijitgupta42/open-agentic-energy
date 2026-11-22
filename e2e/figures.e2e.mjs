// Workflows 11 and 14: figures in the chat, and the dark and light themes.
// Workflow 11: figures in the chat. The assistant answers with an openui block
// (js/openui.js) and the chat draws stat tiles and a chart from it, on the scripted router
// in scripted-router.mjs: no model and no real key. The figures come from the account
// state the assistant read in the same turn.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { TEST_KEY, useScriptedRouter } from "./scripted-router.mjs";
import { expectNoCspViolations } from "./csp.mjs";

test("11. A usage answer is drawn as stat tiles and a chart, with its numbers in a table", async ({ app, screen, browser }) => {
  await useScriptedRouter(browser);
  await app.open("/");
  await screen.getByPlaceholder("Paste your API key").fill(TEST_KEY);
  await screen.getByRole("button", "Save and start").tap();
  await expect(screen.getByText("Assistant connected to this page.")).toBeVisible();
  await screen.getByRole("textbox", "Your request").fill("Show my gas and electricity use by month.");
  await screen.getByRole("button", "Send").tap();
  // The yearly totals of the demo account, drawn as tiles.
  const tiles = browser.locator("#ns-msgs .ou-root .ou-stat-value");
  await expect(tiles).toHaveCount(2);
  await expect(tiles.nth(0)).toHaveText("11,770 kWh");
  await expect(tiles.nth(1)).toHaveText("2,975 kWh");
  // A chart with two bars for each of 12 months, and no code left in the chat.
  await expect(browser.locator("#ns-msgs .ou-root rect.ou-bar")).toHaveCount(24);
  // The numbers are in a table for anyone who cannot see the picture.
  await expect(browser.locator("#ns-msgs .ou-data table tbody tr")).toHaveCount(12);
  // Only what was drawn is shown: no code, and no copy of what the assistant wrote.
  await expect(browser.locator("#ns-msgs pre")).toHaveCount(0);
  // Drawing the figures needs no inline script and nothing the page's policy blocks.
  await expectNoCspViolations(browser);
});

test("14. Every site is dark until the visitor flips the switch, and keeps the choice", async ({ app, screen, browser }) => {
  for (const url of ["/", "http://localhost:8081/", "http://localhost:8082/"]) {
    // Design variant C: the Emberwick page opens in the light theme (js/light-first.js); the others open dark.
    const first = url === "/" ? "light" : "dark";
    const other = first === "light" ? "dark" : "light";
    await app.open(url);
    await expect(browser.locator(`html[data-theme="${first}"]`)).toHaveCount(1);
    const toggle = screen.getByRole("switch", "Dark mode");
    await expect(toggle).toBeVisible();
    await toggle.tap();
    await expect(browser.locator(`html[data-theme="${other}"]`)).toHaveCount(1);
    // The choice is kept for the next visit to the same site.
    await app.open(url);
    await expect(browser.locator(`html[data-theme="${other}"]`)).toHaveCount(1);
    await screen.getByRole("switch", "Dark mode").tap();
    await expect(browser.locator(`html[data-theme="${first}"]`)).toHaveCount(1);
  }
});
