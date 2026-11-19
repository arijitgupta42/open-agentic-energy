// Workflow 8: the Safety checks page shows the runtime stopping the four failure cases
// spec section 6 names, on the in-page mock model. No key is needed.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { expectNoCspViolations, watchCsp } from "./csp.mjs";

const CASES = [
  ["invalid", /Stopped before any model call: .*ghost_agent/],
  ["cycle", /Stopped a cycle: /],
  ["budget", /Stopped over budget: /],
  ["denied", /Requests to not-allowed\.example: 0\./],
];

test("8. The Safety checks page stops an invalid network, a cycle, an over-budget request and a denied origin", async ({ app, screen, browser }) => {
  await watchCsp(browser);
  for (const [name, stopped] of CASES) {
    await app.open(`/lab/?case=${name}`);
    await screen.getByRole("button", "Run the check").tap();
    if (name === "denied") {
      // The card names the outside site first; the closed policy refuses it either way.
      await screen.getByRole("button", "Allow").tap();
    }
    await expect(browser.locator("#lab-events")).toContainText(stopped);
    await expectNoCspViolations(browser);
  }
});
