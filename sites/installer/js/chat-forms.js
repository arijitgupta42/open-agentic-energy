// Keeps the forms the assistant draws in the chat to dropdowns, with no personal details.
//
// The front agent may answer with a form (the runtime's CRUSE form widget, drawn from a
// JSON Schema the model writes). Each site's read action tells it to make every field a
// dropdown and never to ask for the visitor's name or address, because the visitor is a
// signed-in customer whose details are on the account. A model does not always follow
// that, so this page enforces it on every form as it appears:
//
// - a field for a personal detail (name, email, phone, address, postcode, date of birth)
//   is removed: the account already holds it;
// - a number box becomes a dropdown: the site's own values for that topic, such as floor
//   areas, or else evenly spaced values across the field's own limits;
// - a text or date box becomes a dropdown of the site's own choices for that topic, such
//   as heating types or visit times;
// - any other free-text box is removed, so the visitor never types into one: the agent can
//   ask in the chat.
//
// The runtime reads each field back by its data-field mark, so a dropdown that keeps the
// mark sends its choice like the box would have, and a removed field sends nothing. This
// file never reads or sends what the visitor chooses. It is the same on all three sites;
// each site's choices are in its site.js (AssistantMount.FORM_CHOICES).

/**
 * Turns the assistant's forms into dropdowns and removes personal fields.
 */
export class ChatForms {
  /** A label that asks for a personal detail, which the signed-in account already holds. */
  static PERSONAL = /\b(full name|first name|last name|surname|your name|name|e-?mail|phone|mobile|telephone|address|postcode|post code|zip|date of birth|birthday|dob)\b/i;

  /** The most options a number dropdown gets when it is spread across the field's limits. */
  static STEPS = 8;

  /**
   * Watch the chat and fix each form the assistant draws.
   *
   * :param doc: The document.
   * :param choices: The site's choices: a list of {match: RegExp, values: [text]}, tried in
   *   order against each field's label.
   * :return: The message list it watches, or null when the chat is missing.
   */
  static attach(doc, choices) {
    const msgs = doc.querySelector("#agent-app #ns-msgs");
    const Observer = doc.defaultView?.MutationObserver;
    if (!msgs || !Observer) {
      return null;
    }
    const scan = () => {
      for (const form of msgs.querySelectorAll(".ns-widget form.ns-w-form:not([data-chat-form])")) {
        ChatForms.fix(doc, form, choices);
      }
    };
    new Observer(scan).observe(msgs, {childList: true, subtree: true});
    scan();
    return msgs;
  }

  /**
   * Fix one form: remove personal fields and turn the rest into dropdowns.
   *
   * :param doc: The document.
   * :param form: The form element the runtime drew.
   * :param choices: As for attach().
   * :return: {removed, converted}: how many fields were removed and turned into dropdowns.
   */
  static fix(doc, form, choices) {
    form.setAttribute("data-chat-form", "checked");
    let removed = 0;
    let converted = 0;
    for (const row of [...form.querySelectorAll(".ns-w-row")]) {
      const control = row.querySelector("input[type=text], input[type=number], input[type=date], input[type=time], textarea");
      if (!control) {
        // Already a dropdown, radio buttons or checkboxes.
        continue;
      }
      const label = (row.querySelector(".ns-w-label")?.textContent || "").replace(/\*\s*$/, "").trim();
      const values = ChatForms.PERSONAL.test(label) ? null : ChatForms.choicesFor(label, control, choices);
      if (!values || !values.length) {
        row.remove();
        removed += 1;
        continue;
      }
      control.replaceWith(ChatForms.dropdown(doc, control, values));
      converted += 1;
    }
    // A form left with no field asks nothing: drop it, and the agent's text still stands.
    if (!form.querySelector(".ns-w-row")) {
      form.closest(".ns-widget")?.remove();
    }
    return {removed, converted};
  }

  /**
   * Find the options for a field: the site's list for its topic, or for a number, evenly
   * spaced values across its limits.
   *
   * :param label: The field's label, without the required mark.
   * :param control: The box the runtime drew.
   * :param choices: As for attach().
   * :return: The option texts, or null when there are none.
   */
  static choicesFor(label, control, choices) {
    const known = (choices || []).find((choice) => choice.match.test(label));
    if (known) {
      return known.values.map(String);
    }
    if (control.type === "number") {
      return ChatForms.spread(Number(control.getAttribute("min")), Number(control.getAttribute("max")));
    }
    return null;
  }

  /**
   * Evenly spaced round values between two limits.
   *
   * :param low: The smallest value, or NaN when the field gives none.
   * :param high: The largest value, or NaN.
   * :return: Up to STEPS values, or null when a limit is missing.
   */
  static spread(low, high) {
    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
      return null;
    }
    const raw = (high - low) / (ChatForms.STEPS - 1);
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((s) => s * magnitude).find((s) => s >= raw);
    const values = [];
    for (let value = Math.ceil(low / step) * step; value <= high + 1e-9; value += step) {
      values.push(String(Number(value.toPrecision(12))));
    }
    return values;
  }

  /**
   * Make a dropdown that takes a box's place: the same id, data-field mark, required flag
   * and description, an empty first choice, then the options.
   *
   * :param doc: The document.
   * :param control: The box it replaces.
   * :param values: The option texts.
   * :return: The <select>.
   */
  static dropdown(doc, control, values) {
    const select = doc.createElement("select");
    for (const name of ["id", "data-field", "aria-describedby"]) {
      if (control.hasAttribute(name)) {
        select.setAttribute(name, control.getAttribute(name));
      }
    }
    select.required = control.required;
    const empty = doc.createElement("option");
    empty.value = "";
    empty.textContent = "—";
    select.append(empty);
    for (const value of values) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    return select;
  }
}
