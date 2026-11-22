// Keeps the browser's theme-colour meta (the phone's address bar) in step with the page's theme.
// js/theme.js sets data-theme on <html>, from the visitor's saved choice or the dark default;
// this file only follows it. The two colours are the themes' --paper values in variant.css.
const COLOURS = {dark: "#16110d", light: "#f4f2ef"};

if (typeof document !== "undefined") {
  const meta = document.querySelector('meta[name="theme-color"]');
  const root = document.documentElement;
  const sync = () => {
    if (meta) {
      meta.setAttribute("content", COLOURS[root.getAttribute("data-theme")] || COLOURS.dark);
    }
  };
  sync();
  new MutationObserver(sync).observe(root, {attributes: true, attributeFilter: ["data-theme"]});
}
