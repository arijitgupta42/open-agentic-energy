// Workflow 21: while a long answer is written, the chat stays on the visitor's latest message.
// The real runtime draws a scripted answer taller than the chat and scrolls to the bottom as
// it always does; js/chat-scroll.js holds the chat at the message that was answered. Once the
// visitor scrolls, the chat is theirs.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { TEST_KEY, useScriptedRouter } from "./scripted-router.mjs";

/**
 * Where the visitor's latest message and the newest answer are, against the chat's visible area.
 *
 * :param browser: The e2e browser fixture.
 * :return: {userTop, answerTop, chatHeight, answerHeight, scrollTop, atBottom}.
 */
function measure(browser) {
  return browser.evaluate(() => {
    const msgs = document.querySelector("#agent-app #ns-msgs");
    const answer = [...msgs.querySelectorAll(".ns-msg.bot")].filter((bubble) => bubble.textContent.includes("month by month")).at(-1);
    const box = msgs.getBoundingClientRect();
    const user = [...msgs.querySelectorAll(".ns-msg.user")].filter((bubble) => bubble.textContent.includes("month by month")).at(-1);
    return {
      userTop: user ? Math.round(user.getBoundingClientRect().top - box.top) : null,
      answerTop: Math.round(answer.getBoundingClientRect().top - box.top),
      chatHeight: Math.round(msgs.clientHeight),
      answerHeight: Math.round(answer.getBoundingClientRect().height),
      scrollTop: Math.round(msgs.scrollTop),
      atBottom: Math.abs(msgs.scrollHeight - msgs.clientHeight - msgs.scrollTop) < 2,
    };
  });
}

test("21. The chat stays on the visitor's latest message while a long answer is written, until the visitor scrolls", async ({ app, screen, browser }) => {
  await useScriptedRouter(browser);
  await app.open("/");
  await screen.getByPlaceholder("Paste your API key").fill(TEST_KEY);
  await screen.getByRole("button", "Save and start").tap();
  await expect(screen.getByText("Assistant connected to this page.")).toBeVisible();
  await screen.getByRole("textbox", "Your request").fill("Show my usage month by month in detail.");
  await screen.getByRole("button", "Send").tap();
  await expect(screen.getByText("That is the whole year.")).toBeVisible();
  // Let the runtime's own scroll to the bottom run after the answer is drawn.
  await browser.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const held = await measure(browser);
  // The answer is taller than the chat, so the runtime alone would leave it at its end.
  expect(held.answerHeight).toBeGreaterThan(held.chatHeight);
  // The visitor's message is at the top of the chat, not scrolled away above it, and the
  // answer starts right below it.
  expect(held.userTop).toBeGreaterThanOrEqual(0);
  expect(held.userTop).toBeLessThan(40);
  expect(held.answerTop).toBeGreaterThan(held.userTop);
  expect(held.atBottom).toBe(false);
  // A message sent while an answer streams (a steering message) is added the way the
  // runtime adds it: its bubble, then a scroll to the bottom. The chat shows it and is not
  // pulled back to the answer above it.
  await browser.evaluate(() => {
    const msgs = document.querySelector("#agent-app #ns-msgs");
    const bubble = document.createElement("div");
    bubble.className = "ns-msg user ns-steering-message";
    bubble.textContent = "Also tell me the cheapest tariff.";
    msgs.append(bubble);
    msgs.scrollTop = msgs.scrollHeight;
  });
  await browser.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
  expect((await measure(browser)).atBottom).toBe(true);
  // The runtime adds a "Working…" status line after a message and the sites hide it. It is
  // never the answer to hold: the chat must stay on the message, not jump to its top.
  await browser.evaluate(() => {
    const msgs = document.querySelector("#agent-app #ns-msgs");
    const status = document.createElement("div");
    status.className = "ns-msg bot ns-turn-status";
    status.textContent = "Working…";
    msgs.append(status);
    msgs.scrollTop = msgs.scrollHeight;
  });
  await browser.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  expect((await measure(browser)).atBottom).toBe(true);
  // The visitor scrolls down to read on: the chat follows them and is not pulled back.
  await browser.locator("#agent-app #ns-msgs").hover();
  await browser.mouse.wheel(0, 5000);
  await expect.poll(async () => (await measure(browser)).atBottom).toBe(true);
  await browser.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
  expect((await measure(browser)).atBottom).toBe(true);
  // A second long answer is held at its own question, never at the earlier one.
  await screen.getByRole("textbox", "Your request").fill("Show my usage month by month in detail, again.");
  await screen.getByRole("button", "Send").tap();
  await expect.poll(() => browser.evaluate(() => [...document.querySelectorAll("#ns-msgs .ns-msg.bot")].filter((bubble) => bubble.textContent.includes("That is the whole year.")).length)).toBe(2);
  await browser.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const second = await measure(browser);
  expect(second.userTop).toBeGreaterThanOrEqual(0);
  expect(second.userTop).toBeLessThan(40);
});
