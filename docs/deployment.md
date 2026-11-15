# Deployment

## What the sites need from a host

Each site is a static folder: `sites/utility`, `sites/installer`, `sites/grants`. There
is no build step on the host. Each site also answers `/mcp` with its read-only MCP
server (`server/`), so the host must run a little code: the Cloudflare Worker in
`server/worker.mjs` does. A host must give each site:

1. **Its own origin, at the root.** Three origins, such as three subdomains. Not three
   folders of one domain: sites on one origin are not "another origin" to a browser, so
   no consent card appears and the cross-origin checks in spec section 6 are not shown.
   The partner tool's name also comes from the URL's path, and `.well-known/` files are
   only found at a root.
2. **HTTPS.**
3. **`Access-Control-Allow-Origin: *` on the public agent files only:**
   `agent-manifest.json`, `<network>.network.json`, `links.json`, `agent-mcp.json` and
   the two files in `.well-known/`.
4. **This header on `runtime/sandbox-worker.js`:**
   `Content-Security-Policy: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'`
5. **No `X-Frame-Options` and no `frame-ancestors` policy on `bridge/`**, because calling
   sites load `bridge/action-bridge.html` in a hidden frame.
6. **Dot-folders served**, for `.well-known/`.

Each site has a `_headers` file with points 3 and 4, in the format Netlify and Cloudflare
Pages read. For Apache, `tools/agentify-website/references/bundle_and_hosting.md` has the
`.htaccess` equivalent.

## Hosts

- **Cloudflare (what this repository uses).** Cloudflare Pages is now part of Workers:
  each site is a Worker that serves only static assets, at
  `https://<worker>.open-agentic-energy.workers.dev`. The configs are in
  `deploy/cloudflare/`, outside the site folders, so nothing Cloudflare-specific is
  published with a site. Workers reads each site's `_headers`. Deploy from the
  repository root after `npx wrangler@4 login` (on Windows PowerShell, `npx.cmd`):

  ```shell
  npx wrangler@4 deploy --config deploy/cloudflare/utility.jsonc
  npx wrangler@4 deploy --config deploy/cloudflare/installer.jsonc
  npx wrangler@4 deploy --config deploy/cloudflare/grants.jsonc
  ```

  Each Worker runs `server/worker.mjs`: requests that match a file get the static
  file, and `/mcp` gets the site's MCP server (the config's `SITE` variable picks which).
  Workers redirects a `.html` path to the same path without `.html`, on the same
  origin. Do not run `wrangler pages project create` inside a site folder: it writes a
  `wrangler.jsonc` and an `.assetsignore` there, which would then be published.
- **Netlify.** Create three projects from this repository, one per site, each with its
  base or output directory set to `sites/<site>` and no build command. Netlify reads
  `_headers`. This is the route the upstream skill documents.
- **GitHub Pages.** It cannot set custom headers, so it cannot send the worker's
  Content-Security-Policy, and all project sites of one account share one origin. To use
  it you would need a custom subdomain per site, and you would have to confirm with
  `npm run conformance:live -- --env production` that the public files arrive with the
  CORS header. Treat it as unverified.
- **A backend later.** A static host is enough for everything here. If you add an MCP
  server (see "Where to take it next" in `architecture.md`), host it on the same origin
  as its site, behind HTTPS, with CORS for the callers you allow.

## Going to production

1. Create the three hosted sites and note their origins.
2. Put the origins in the `production` block of `origins.json`, in place of the
   `REPLACE-ME` placeholders. Scheme and host only, no path and no final `/`.
3. Rewrite the partner URLs and rebuild:

   ```shell
   npm run origins -- production
   npm test
   node scripts/check-conformance.mjs --production
   ```

4. Commit and deploy.
5. Check the hosted sites:

   ```shell
   npm run conformance:live -- --env production
   node tools/agentify-website/scripts/check_partner.mjs https://<installer host>/heatwright_installers --origin https://<utility host>
   node tools/agentify-website/scripts/check_partner.mjs https://<grants host>/fernbrook_grants --origin https://<utility host>
   node tools/agentify-website/scripts/check_partner.mjs https://<grants host>/fernbrook_grants --origin https://<installer host>
   ```

6. Work through the "Browser" rows of `docs/hackathon/conformance_checklist.md` on the
   hosted sites.

`npm run origins -- local` switches back for local work. The repository holds one state
at a time, so deploy from a commit made in the `production` state: a `production` branch
is the simplest way to keep `dev` on `local`.

## Branches

- `dev` is the default branch. All work lands here, with the `local` origins. CI runs on it.
- `production` holds the same code with the `production` origins. To release: merge `dev`
  into `production`, run `npm run origins -- production`, `npm test` and
  `node scripts/check-conformance.mjs --production`, commit, push, then deploy the three
  Workers with `wrangler`. Never merge `production` back into `dev`.

## Being found

The spec needs no registry, but two lists help others find and call the sites: the
[list of agentic websites](https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/agentic_websites.md),
which takes pull requests, and the [NANDA Index](https://nandaindex.org/). Both ask for
the network URL: the site's origin, then the network name.
