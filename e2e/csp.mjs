// Watches for Content-Security-Policy violations, so a workflow fails when the pages'
// policy (each site's _headers, which npm run serve sends too) blocks something the page
// or the runtime needs, or when no policy is in force at all.
import { expect } from "e2e";

/**
 * Record, in each page the browser opens from now on, every violation
 * (window.__cspViolations) and whether a policy is in force (window.__cspActive). The
 * test adds a data: script, which the policy must refuse: the pages never load one, so
 * its violation is the probe's own. (eval would not do: the test's own scripts are
 * exempt from the policy.)
 *
 * :param browser: The e2e browser fixture.
 */
export async function watchCsp(browser) {
  await browser.addInitScript(() => {
    window.__cspViolations = [];
    window.__cspActive = false;
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.blockedURI === "data" && event.effectiveDirective.startsWith("script-src")) {
        window.__cspActive = true;
        return;
      }
      window.__cspViolations.push(`${event.effectiveDirective} blocked ${event.blockedURI || "inline"} (${event.sourceFile || "page"}:${event.lineNumber || 0})`);
    });
    document.addEventListener("DOMContentLoaded", () => {
      const probe = document.createElement("script");
      probe.src = "data:text/javascript,window.__cspProbeRan=true";
      document.head.append(probe);
    });
  });
}

/**
 * Check that the page on show runs under a policy and that the policy blocked nothing.
 *
 * :param browser: The e2e browser fixture.
 */
export async function expectNoCspViolations(browser) {
  await expect.poll(() => browser.evaluate(() => window.__cspActive === true)).toBe(true);
  const violations = await browser.evaluate(() => window.__cspViolations || []);
  expect(violations).toEqual([]);
}
