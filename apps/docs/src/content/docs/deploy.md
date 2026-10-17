---
title: Deploy
description: Deploying Potluck Docs to Vercel, a Node host, Netlify or Cloudflare, or a static-only host — what each supports and the one setting that matters.
---

**Deploy to Vercel unless you're already committed to self-hosting.** It's
what the live preview uses, needs no adapter configuration, and supports
everything the template ships.

Whichever target you use, set `DOCS_SITE_URL` to your real domain — or edit
`site` in `astro.config.mjs` — or the sitemap and `llms.txt` ship with
placeholder `https://example.com` URLs.

| Target | Logged-in tier | The one setting that matters |
| --- | --- | --- |
| **Vercel** | Works. Adapter picked automatically. | Nothing target-specific — see below. |
| **Node** (self-hosted, Docker) | Works. | `security.allowedDomains`, if sign-in is on — see below. |
| **Netlify, Cloudflare Pages** | Works, with their own adapter. | Swap the `adapter:` line in `astro.config.mjs` — one line, nothing else changes. |
| **Static-only** (GitHub Pages, S3, anywhere with no adapter) | Cannot run. | Remove the logged-in tier first — see below. |

:::danger[Never enable Vercel ISR]
If you use the logged-in experience, leave `vercel()` called bare. Turning on
ISR — `vercel({ isr: true })` — lets `/_isr?x_astro_path=/private/orgs/acme/`
render any route while **bypassing Astro middleware entirely**, which is where
this template's only access check lives
([CVE-2026-73424](https://github.com/withastro/astro/security/advisories)).

The template is not affected as shipped. There is no fixed release on the
`@astrojs/vercel` 10.x line, so not enabling ISR *is* the mitigation. See
[Private and per-org docs](/internals/private-docs/).
:::

## Vercel

Nothing to configure. Vercel's build sets `VERCEL=1`, which the template
reads to select `@astrojs/vercel` — the same setup the live preview uses.
Import the repository and deploy.

## Node

This is the default whenever `VERCEL` isn't set — self-hosting, Docker, any
other host. After `npm run build`, run the server yourself:

```bash
node ./dist/server/entry.mjs
```

It listens on port `4321` and binds to `localhost`. Set `PORT` to move the
port; in a container, also set `HOST=0.0.0.0`, or nothing outside the
container reaches it.

If sign-in is on, also set `security.allowedDomains` in `astro.config.mjs`
to your domain:

```js
security: {
  allowedDomains: [{ hostname: 'docs.example.com', protocol: 'https' }],
},
```

Leave it unset and Astro treats **every** request as `localhost` — direct
traffic included, not just requests through a proxy — so your SSO endpoint
gets handed a callback URL on the server's own loopback and sign-in never
returns. `astro dev` uses the real host, which is why this only shows up
once you deploy.

## Netlify and Cloudflare Pages

Swap the adapter import and the `adapter:` line in `astro.config.mjs` for
`@astrojs/netlify` or `@astrojs/cloudflare`. The auth code is
adapter-agnostic, so nothing else changes and the logged-in tier keeps
working.

## Static-only

GitHub Pages, S3, or anywhere that just serves files can't run a server, so
the logged-in tier has to go first — see [*Don't need private
docs?*](https://github.com/ekline-io/potluck-docs/blob/main/packages/template/README.md#dont-need-private-docs)
in the template's README. Skip that and `astro.config.mjs` still picks an
adapter the same way it always does: `dist/` exists, but as the parent of
`dist/client/` and `dist/server/`, with no `dist/index.html` at the root for
a static host to serve. Once the feature is removed, the adapter goes with
it and the flat `dist/` with a root `dist/index.html` returns.

:::note
Deploying without `DOCS_SSO_URL`, `DOCS_SSO_SECRET` and `DOCS_SESSION_SECRET`
set turns the logged-in tier off at runtime by itself — the **Log in**
control disappears and `/private/**` answers a plain 404. That's enough to
ship a staging build or a fork that hasn't wired sign-in yet, on Vercel or a
Node host. It does **not** change the build shape described above, so it
isn't a route onto a static-only host — `astro.config.mjs` picks an adapter
regardless of whether these variables are set. Removing the feature, not
leaving it unconfigured, is what gets you a static-only build.
:::

## Sitemap dates

The sitemap gives each docs page a `<lastmod>`, which search engines use to
decide what to recrawl. It is the page's `lastUpdated` frontmatter when that
holds a date, otherwise the date of the last commit that changed the page's
file. A page with neither gets no `<lastmod>`: a missing date is better than
a wrong one, and search engines stop trusting dates that claim changes that
did not happen.

Git dates need the build to see your repository's history:

- **GitHub Actions:** set `fetch-depth: 0` on `actions/checkout`. Adding
  `filter: blob:none` downloads every commit but only the current files.
- **Vercel's Git integration** builds from a shallow clone, so pages get
  frontmatter dates only. To get git dates on Vercel, build in your own CI
  with full history and deploy the output with `vercel deploy --prebuilt`.
- **Anywhere else**, the build log tells you. A shallow checkout prints
  `[sitemap] Not using git dates for lastmod: the checkout is a shallow clone.`

A commit that changes many pages without changing what they say, such as a
formatting pass, would date them all to that day. Put its full commit hash in
`.sitemap-lastmod-ignore-revs` at the root of your site, one per line, with
`#` for comments, and the sitemap skips it.

To leave `<lastmod>` out of the sitemap entirely, set `lastmodFromGit` to
`false` in `src/config/sitemap.mjs`. If you set `base` in `astro.config.mjs`,
pass the same value to `createSitemapSerializer` in its `sitemap()` block, so
sitemap URLs map back to their pages.
