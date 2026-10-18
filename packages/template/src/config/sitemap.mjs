/**
 * Sitemap switches, read by `astro.config.mjs`.
 *
 * `lastmodFromGit` gives each docs page's sitemap entry a `<lastmod>`: the
 * page's `lastUpdated` frontmatter when it holds a date, otherwise the date of
 * the last commit that changed its file (`src/lib/sitemap-lastmod.mjs`). Search
 * engines use it to decide what to recrawl, and stop trusting it if it claims
 * changes that did not happen, so a page with no usable history gets no date
 * rather than a guessed one.
 *
 * Off by default. Set this to `true` once your build can see the repository's
 * history: on a shallow clone, which many CI systems and hosts make by
 * default, the build logs one warning and only frontmatter dates are used.
 */
export const lastmodFromGit = false;
