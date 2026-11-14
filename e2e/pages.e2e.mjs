// Workflows 1 to 3: each page works on its own, with no assistant and no key
// (CLAUDE.md rule 9). The figures are worked out by hand in sites/*/tests/site_config.mjs
// and server/tests/mcp.test.mjs.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("1. Emberwick: a customer compares a tariff and switches on the page", async ({ app, screen }) => {
  await app.open("/");
  await expect(screen.getByText(/2,975 kWh of electricity and 11,770 kWh of gas/)).toBeVisible();
  await screen.getByRole("button", "Compare Green Flex").tap();
  await expect(screen.getByRole("status").filter({hasText: "Green Flex"})).toContainText("£37.74 less per year");
  await screen.getByLabel("Switch this account to").selectOption("Fixed 12 Month");
  await screen.getByRole("button", "Switch the demo account").tap();
  await expect(screen.getByText(/Switched from Standard Variable to Fixed 12 Month/)).toContainText("Reference EW-SW-0001");
});

test("2. Heatwright: a visitor gets a heat pump estimate on the page", async ({ app, screen }) => {
  await app.open("http://localhost:8081/");
  await screen.getByLabel("What would you like?").selectOption("Heat pump");
  await screen.getByLabel("Type of home").selectOption("Semi-detached house");
  await screen.getByLabel("Floor area in square metres").fill("95");
  await screen.getByRole("button", "Show my estimate").tap();
  await expect(screen.getByText(/We suggest the 8 kW air-source heat pump/)).toContainText("£9,200 to £11,200");
});

test("3. Fernbrook: a visitor checks which grants they could get on the page", async ({ app, screen }) => {
  await app.open("http://localhost:8082/");
  await screen.getByLabel("Who owns or rents the home?").selectOption("I own the home and live in it");
  await screen.getByLabel("How is the home heated now?").selectOption("Gas boiler");
  await screen.getByLabel("What is the home's EPC band?").selectOption("D");
  await screen.getByLabel("Household income before tax").selectOption("£31,000 or more");
  await screen.getByRole("button", "Check my eligibility").tap();
  await expect(screen.getByText("Fernbrook Heat Pump Grant: you can apply (£5,000).")).toBeVisible();
  await expect(screen.getByText(/Fernbrook Solar Starter: not with these answers/)).toBeVisible();
});
