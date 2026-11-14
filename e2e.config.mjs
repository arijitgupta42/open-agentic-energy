// Browser workflow tests with e2e (https://github.com/e2e-inc/e2e, Apache 2.0).
// Run: npm run test:e2e. Every test is deterministic: no agent steps and no model. The
// assistant's model is e2e/scripted-router.mjs, routed in the browser, so no key is
// needed and nothing goes to a real provider. See docs/development.md.
import { web } from "@e2e-dev/web";

/** @type {import('e2e').E2EConfig} */
export default {
  tests: "e2e/**/*.e2e.mjs",
  // The three sites, served together as `npm run serve` serves them. Emberwick is the
  // app under test; its partners answer on ports 8081 and 8082.
  targets: [{
    engine: web(),
    app: {
      url: "http://127.0.0.1:8080",
      command: {executable: "node", args: ["scripts/serve-all.mjs"], reuseExisting: true, log: ".e2e/logs/sites.log"},
    },
  }],
  // A swarm answer runs about 30 scripted model calls across three sites.
  timeout: 90000,
  assertionTimeout: 15000,
  workers: 2,
  // No agent steps, so nothing to record or replay.
  cache: "off",
};
