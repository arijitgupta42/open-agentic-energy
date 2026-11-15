// Workflow 9: voice input on every site's assistant (issue #15). A stand-in for the
// browser's SpeechRecognition hears a fixed sentence, so the test needs no microphone.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { TEST_KEY, useScriptedRouter } from "./scripted-router.mjs";

const SITES = ["http://127.0.0.1:8080/", "http://localhost:8081/", "http://localhost:8082/"];
const HEARD = "What heat pump would suit a 95 square metre semi-detached house?";

/**
 * Replace the browser's speech recognition with one that "hears" a sentence, on the
 * device, a moment after it starts, and keeps listening until stopped, as a continuous
 * session does.
 *
 * :param heard: The sentence.
 */
function fakeSpeech(heard) {
  class FakeRecognition {
    static async available() {
      return "available";
    }

    start() {
      window.__speechStarts = (window.__speechStarts || 0) + 1;
      window.__processLocally = this.processLocally;
      window.__continuous = this.continuous;
      setTimeout(() => {
        this.onresult?.({results: [[{transcript: heard}]]});
      }, 50);
    }

    stop() {
      this.onend?.();
    }
  }
  window.SpeechRecognition = FakeRecognition;
}

test("9. Every assistant takes a spoken request into the chat box, on the device, and never sends it by itself", async ({ app, screen, browser }) => {
  await browser.addInitScript(fakeSpeech, HEARD);
  for (const url of SITES) {
    await app.open(url);
    await expect(screen.getByRole("button", "🎤 Speak")).toBeVisible();
    await expect(browser.locator("#voice-note")).toContainText("the page tells you first");
  }

  // On Heatwright, with a key set: speak, check, and see that nothing went to the model.
  const seen = await useScriptedRouter(browser);
  await app.open("http://localhost:8081/");
  await screen.getByPlaceholder("Paste your API key").fill(TEST_KEY);
  await screen.getByRole("button", "Save and start").tap();
  await expect(screen.getByText("Assistant connected to this page.")).toBeVisible();
  await screen.getByRole("button", "🎤 Speak").tap();
  await expect(browser.locator("#voice-note")).toContainText("on this device and does not leave it");
  // The words appear while it is still listening; only Stop ends it.
  await expect(screen.getByRole("textbox", "Your request")).toHaveValue(HEARD);
  await expect(screen.getByRole("button", "■ Stop")).toBeVisible();
  await screen.getByRole("button", "■ Stop").tap();
  await expect(screen.getByText("Check the request in the chat box, then press Send.")).toBeVisible();
  await expect(screen.getByRole("textbox", "Your request")).toHaveValue(HEARD);
  expect(await browser.evaluate(() => window.__processLocally)).toBe(true);
  expect(await browser.evaluate(() => window.__continuous)).toBe(true);
  expect(await browser.evaluate(() => window.__speechStarts)).toBe(1);
  expect(seen.filter((request) => request.url.endsWith("/chat/completions"))).toEqual([]);
});

test("10. Every assistant suggests a request in its chat box, Tab takes it, and the next one follows the answer", async ({ app, screen, browser }) => {
  const STARTERS = [
    ["http://127.0.0.1:8080/", "Which tariff would be cheapest for me?"],
    ["http://localhost:8081/", "What would a heat pump cost for a 95 square metre semi-detached house?"],
    ["http://localhost:8082/", "Which grants could I get for a heat pump?"],
  ];
  const box = () => screen.getByRole("textbox", "Your request");
  for (const [url, starter] of STARTERS) {
    await app.open(url);
    await expect(box()).toHaveAttribute("placeholder", starter);
    await expect(screen.getByText("Press Tab to use this suggestion")).toBeVisible();
  }
  // On Fernbrook, with a key: Tab fills the starter, and nothing is sent until Send.
  const seen = await useScriptedRouter(browser);
  await app.open("http://localhost:8082/");
  await screen.getByPlaceholder("Paste your API key").fill(TEST_KEY);
  await screen.getByRole("button", "Save and start").tap();
  await expect(screen.getByText("Assistant connected to this page.")).toBeVisible();
  await box().press("Tab");
  await expect(box()).toHaveValue("Which grants could I get for a heat pump?");
  expect(seen.filter((request) => request.url.endsWith("/chat/completions"))).toEqual([]);
  await screen.getByRole("button", "Send").tap();
  // After the answer, the model's own suggestion is in the box, and Tab takes it.
  await expect(box()).toHaveAttribute("placeholder", "What do I need to apply for it?");
  await box().press("Tab");
  await expect(box()).toHaveValue("What do I need to apply for it?");
  // The visitor can type something else instead.
  await box().fill("Something of my own");
  await expect(box()).toHaveValue("Something of my own");
});
