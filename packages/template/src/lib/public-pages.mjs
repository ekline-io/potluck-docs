/**
 * Which pages this site advertises: the sitemap lists them, and the route
 * middleware in `src/structured-data-middleware.ts` describes them to search
 * engines. One rule for both, so a page is never described but unlisted, or
 * listed but undescribed.
 *
 * Kept free of `astro:*` imports so `astro.config.mjs`, the route middleware
 * and the `node --test` suites call the same code.
 */

/**
 * Nothing under /private/ should be advertised: reaching it needs a session, so
 * a crawler can only ever collect a redirect, and the URL itself names an org.
 *
 * This is not belt-and-braces. `@astrojs/sitemap` never consults
 * `isPrerendered` — its only filters are `type !== 'page'` and a defined
 * `pathname`, and `pathname` is undefined for `[dynamic]` and `[...spread]`
 * routes. So an on-demand route is listed like any other unless it happens
 * to be dynamic. Every route this template puts under /private/ is a spread
 * route, which is why nothing leaked before this filter existed; adding one
 * plain `src/pages/private/welcome.astro` would publish it. Measured twice
 * on real builds, not inferred. See wiki/private-docs.md.
 *
 * /demo-login is filtered for the same reason with one difference: it is a
 * *static* pathname (`src/pages/demo-login.astro`), exactly the shape the
 * sitemap advertises unless told otherwise — the route-shape defence the
 * /private/ routes get for free does not exist here.
 *
 * `/private/` is a directory prefix: anything under it, at any depth.
 * `/demo-login` is a single leaf route, so it is anchored — a page at
 * /guides/demo-login-setup/ is not this route, and neither is a deployment
 * whose hostname happens to contain the string (both measured: an unanchored
 * `.includes('/demo-login')` matches both). A page named exactly `demo-login`
 * nested anywhere else *is* excluded — the accepted price of letting a `base`
 * prefix sit in front of the route, since /docs/demo-login/ and
 * /guides/demo-login/ are indistinguishable without teaching this filter
 * about `base`.
 *
 * Not anchored on a trailing slash either: whether one is emitted depends on
 * `build.format` / `trailingSlash`, which you may change. Measured under
 * `trailingSlash: 'never'` the build emits `/demo-login` bare, so a
 * slash-anchored filter would publish the route rather than merely mis-filter
 * a page.
 *
 * @param {string} pathname A URL's path, `base` included when the site sets one.
 * @returns {boolean}
 */
export const isListedInSitemap = (pathname) => !pathname.includes('/private/') && !/\/demo-login\/?$/.test(pathname);
