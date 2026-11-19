// Checks the pages' Content-Security-Policy (spec section 4: "deploy a restrictive
// Content Security Policy"): each site's _headers sends it on every page, it stays
// restrictive, it still lets the runtime reach the model provider and the partner
// sites, and npm run serve reads the same file. It reads all three sites, so it lives
// here once. The browser workflows check that it blocks nothing the pages need.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SiteHeaders } from "../../../scripts/site-headers.mjs";

const SITES = ["utility", "installer", "grants"];

/**
 * Read a file of the repository.
 *
 * :param file: The path from the repository root.
 * :return: The text.
 */
function read(file) {
  return readFile(new URL(`../../../${file}`, import.meta.url), "utf8");
}

/**
 * Each page of a site, as a visitor's browser asks for it.
 *
 * :param site: The site's folder name.
 * :return: The paths.
 */
function pages(site) {
  return ["/", "/index.html", ...(site === "utility" ? ["/lab/", "/lab/index.html"] : [])];
}

/**
 * The page policy a site sends for one path.
 *
 * :param site: The site's folder name.
 * :param pathname: The path.
 * :return: The directives, from SiteHeaders.directives().
 */
async function policy(site, pathname) {
  const rules = SiteHeaders.parse(await read(`sites/${site}/_headers`));
  return SiteHeaders.directives(SiteHeaders.forPath(rules, pathname)["content-security-policy"]);
}

test("_headers is read as the host reads it: paths, headers, wildcards and repeats", () => {
  const rules = SiteHeaders.parse("# note\n/a.json\n  Access-Control-Allow-Origin: *\n/lab/*\n  X-One: 1\n/lab/x\n  X-One: 2\n");
  assert.deepEqual(rules[0], {path: "/a.json", headers: [["Access-Control-Allow-Origin", "*"]]});
  assert.deepEqual(SiteHeaders.forPath(rules, "/a.json"), {"access-control-allow-origin": "*"});
  assert.deepEqual(SiteHeaders.forPath(rules, "/lab/x"), {"x-one": "1, 2"});
  assert.deepEqual(SiteHeaders.forPath(rules, "/a.jsonx"), {});
  assert.throws(() => SiteHeaders.parse("  X-Orphan: 1"), /under a path/);
});

test("every page of every site sends one restrictive Content-Security-Policy", async () => {
  const seen = new Set();
  for (const site of SITES) {
    for (const pathname of pages(site)) {
      const csp = await policy(site, pathname);
      assert.ok(csp.size > 0, `${site} ${pathname}: no Content-Security-Policy.`);
      assert.deepEqual(csp.get("default-src"), ["'self'"], `${site} ${pathname}: default-src`);
      assert.deepEqual(csp.get("script-src"), ["'self'"], `${site} ${pathname}: scripts come only from the site, with no inline code or eval.`);
      assert.deepEqual(csp.get("object-src"), ["'none'"]);
      assert.deepEqual(csp.get("base-uri"), ["'self'"]);
      assert.deepEqual(csp.get("form-action"), ["'self'"]);
      assert.deepEqual(csp.get("frame-ancestors"), ["'self'"], `${site} ${pathname}: another site may not frame the page.`);
      assert.deepEqual(csp.get("worker-src"), ["'self'"], "The runtime's coded-tool worker comes from the site.");
      for (const [name, sources] of csp) {
        assert.ok(!sources.includes("'unsafe-eval'"), `${site} ${pathname}: ${name} allows eval.`);
        assert.ok(!sources.includes("*"), `${site} ${pathname}: ${name} allows any source.`);
      }
      // Only frame-src differs between sites: it names each site's own partners.
      seen.add([...csp].filter(([name]) => name !== "frame-src").map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; "));
    }
  }
  assert.equal(seen.size, 1, "The page policy differs between pages or sites. Keep it the same everywhere.");
});

test("frame-src names exactly the partners in allowed_peers, whose bridges the runtime frames", async () => {
  // The site's own origin in any environment, so this holds on dev and on production.
  const own = (site) => Object.values(JSON.parse(origins)).map((environment) => environment[site]);
  const origins = await read("origins.json");
  for (const site of SITES) {
    const manifest = JSON.parse(await read(`sites/${site}/agent-manifest.json`));
    const partners = manifest.allowed_peers.filter((origin) => !own(site).includes(origin)).sort();
    for (const pathname of [...pages(site), "/bridge/action-bridge.html", "/bridge/action-bridge"]) {
      const frames = (await policy(site, pathname)).get("frame-src");
      assert.deepEqual(frames.slice(1).sort(), partners, `${site} ${pathname}: frame-src should be 'self' and the partners.`);
      assert.equal(frames[0], "'self'");
    }
  }
  const sites = (await read("scripts/sites.mjs")).match(/originFiles: \[[^\]]*\]/g);
  assert.ok(sites.every((list) => list.includes('"_headers"')), "npm run origins must rewrite each _headers.");
});

test("the policy lets the runtime reach any https model provider, every partner and loopback", async () => {
  const origins = JSON.parse(await read("origins.json"));
  const csp = await policy("utility", "/");
  const connect = csp.get("connect-src");
  assert.ok(connect.includes("https:"), "The visitor may pick any https model provider (spec 4, BYOK).");
  const allowed = (origin) => {
    const url = new URL(origin);
    return connect.includes(`${url.protocol}`) || connect.includes(`${url.protocol}//${url.hostname}:*`);
  };
  for (const [environment, sites] of Object.entries(origins)) {
    for (const origin of Object.values(sites)) {
      if (!new URL(origin).hostname.startsWith("[")) {
        assert.ok(allowed(origin), `${environment}: connect-src does not allow ${origin}.`);
      }
    }
  }
});

test("a site on an IPv6 address gets a policy that still reaches it, and only then", () => {
  const rules = SiteHeaders.parse("/\n  Content-Security-Policy: default-src 'self'; connect-src 'self' https:; frame-src 'self'\n");
  const local = SiteHeaders.forOrigins(rules, ["http://127.0.0.1:8080", "http://localhost:8081"]);
  assert.equal(local.widened, false);
  assert.equal(local.rules, rules);
  const ipv6 = SiteHeaders.forOrigins(rules, ["http://127.0.0.1:8080", "http://[::1]:8082"]);
  assert.equal(ipv6.widened, true);
  const csp = SiteHeaders.directives(SiteHeaders.forPath(ipv6.rules, "/")["content-security-policy"]);
  assert.deepEqual(csp.get("connect-src"), ["'self'", "https:", "http:"]);
  assert.deepEqual(csp.get("frame-src"), ["'self'", "http:"]);
});

test("callers may frame the bridge, and the coded-tool worker keeps its own strict policy", async () => {
  for (const site of SITES) {
    // Workers serves a .html path without its extension, so both paths need the policy.
    for (const pathname of ["/bridge/action-bridge.html", "/bridge/action-bridge"]) {
      const bridge = await policy(site, pathname);
      assert.deepEqual(bridge.get("script-src"), ["'self'"], `${site} ${pathname}`);
      assert.equal(bridge.has("frame-ancestors"), false, `${site}: callers load the bridge in a frame (bundle_and_hosting.md).`);
    }
    const rules = SiteHeaders.parse(await read(`sites/${site}/_headers`));
    assert.equal(SiteHeaders.forPath(rules, "/runtime/sandbox-worker.js")["content-security-policy"],
      "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'", `${site}: the worker gets only its own policy.`);
  }
});

test("no page loads a script or stylesheet from another site, or holds inline script", async () => {
  for (const file of ["sites/utility/index.html", "sites/installer/index.html", "sites/grants/index.html", "sites/utility/lab/index.html"]) {
    const html = await read(file);
    for (const [, url] of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
      assert.doesNotMatch(url, /^(https?:)?\/\//, `${file} loads ${url} from another site.`);
    }
    assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>/, `${file} has an inline script, which the policy blocks.`);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${file} has an inline event handler, which the policy blocks.`);
  }
});

test("npm run serve sends each site's _headers, so local runs and the browser tests get the same policy", async () => {
  const serve = await read("scripts/serve-all.mjs");
  assert.match(serve, /SiteHeaders\.load\(Sites\.dir\(site\)\)/);
  assert.match(serve, /SiteHeaders\.forPath\(rules, pathname\)/);
});
