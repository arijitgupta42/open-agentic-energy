// Variant C: the page opens in the light theme until the visitor chooses. js/theme.js (shared by all
// three sites, and tested as dark by default) runs first; this file then shows the light theme when
// the visitor has saved no choice. It saves nothing, so the switch still works and a saved choice wins.
import { Theme } from "./theme.js";

if (typeof document !== "undefined") {
  let saved = null;
  try {
    saved = localStorage.getItem(Theme.KEY);
  } catch {
    saved = null;
  }
  if (saved !== "light" && saved !== "dark") {
    Theme.apply(document, "light");
  }
}
