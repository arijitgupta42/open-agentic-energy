// Keeps <meta name="theme-color"> (the colour of the browser's own bar on a phone) the same as the header's
// green in the theme on show. js/theme.js changes data-theme on <html>; this file follows it. Without script the
// meta keeps its dark value, which is the page's default theme.
const meta = document.querySelector('meta[name="theme-color"]');
const header = document.querySelector("header");

/** Copy the header's own background into the meta. */
function sync() {
  if (meta && header) {
    meta.setAttribute("content", getComputedStyle(header).backgroundColor);
  }
}

if (meta && header) {
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  sync();
}
