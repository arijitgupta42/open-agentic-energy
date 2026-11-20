// Workflow 20: a form the assistant draws in the chat is only dropdowns, with no personal
// field, on every site. The form is drawn in the runtime's own markup (ui.js renderWidget
// and renderField) with the boxes a model might ask for, and js/chat-forms.js fixes it.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

/** A form as the runtime draws it: personal boxes, number and text boxes, and a dropdown. */
const FORM = `<div class="ns-w-head"><b>Your home</b></div><form class="ns-w-form">
  <div class="ns-w-row"><label class="ns-w-label">Full name *</label><input type="text" data-field="f0" required></div>
  <div class="ns-w-row"><label class="ns-w-label">Email</label><input type="text" data-field="f1"></div>
  <div class="ns-w-row"><label class="ns-w-label">Home address</label><textarea data-field="f2"></textarea></div>
  <div class="ns-w-row"><label class="ns-w-label">Floor area (m²) *</label><input type="number" data-field="f3" min="20" max="400" required></div>
  <div class="ns-w-row"><label class="ns-w-label">Home type</label><input type="text" data-field="f4"></div>
  <div class="ns-w-row"><label class="ns-w-label">Rooms</label><input type="number" data-field="f5" min="1" max="8"></div>
  <div class="ns-w-row"><label class="ns-w-label">Anything else?</label><input type="text" data-field="f6"></div>
  <div class="ns-w-row"><label class="ns-w-label">Already a choice</label><select data-field="f7"><option>Yes</option></select></div>
  <div class="ns-w-actions"><button type="submit" class="ns-w-btn">Send</button></div></form>`;

test("20. A form the assistant draws is dropdowns only, with no personal field, on every site", async ({ app, browser }) => {
  for (const url of ["/", "http://localhost:8081/", "http://localhost:8082/"]) {
    await app.open(url);
    const result = await browser.evaluate(async (html) => {
      for (let i = 0; i < 80 && !document.querySelector("#agent-app #ns-msgs"); i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const card = document.createElement("div");
      card.className = "ns-widget";
      card.innerHTML = html;
      document.querySelector("#agent-app #ns-msgs").append(card);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const labels = [...card.querySelectorAll(".ns-w-label")].map((label) => label.textContent.replace(/\s*\*$/, ""));
      const select = (field) => card.querySelector(`select[data-field="${field}"]`);
      return {
        labels,
        boxes: card.querySelectorAll("input[type=text], input[type=number], input[type=date], textarea").length,
        floor: [...(select("f3")?.options || [])].map((option) => option.value),
        floorRequired: select("f3")?.required,
        home: [...(select("f4")?.options || [])].map((option) => option.value),
        rooms: [...(select("f5")?.options || [])].map((option) => option.value),
      };
    }, FORM);
    // The personal fields and the open question are gone; everything left is a dropdown.
    expect(result.labels).toEqual(["Floor area (m²)", "Home type", "Rooms", "Already a choice"]);
    expect(result.boxes).toBe(0);
    expect(result.floor).toEqual(["", "40 m²", "50 m²", "60 m²", "70 m²", "80 m²", "95 m²", "110 m²", "130 m²", "150 m²", "180 m²", "220 m²"]);
    expect(result.floorRequired).toBe(true);
    expect(result.home).toEqual(["", "Flat", "Terraced house", "Semi-detached house", "Detached house"]);
    expect(result.rooms).toEqual(["", "1", "2", "3", "4", "5", "6", "7", "8"]);
  }
});
