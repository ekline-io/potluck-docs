/**
 * Sitemap switches, read by `astro.config.mjs` and the structured data
 * middleware: the template's `packages/template/src/config/sitemap.mjs`,
 * switched on.
 *
 * On, because this site's builds have its git history: Vercel's clone is
 * shallow, so `scripts/fetch-git-history.sh` fetches the rest before the
 * build (the build command is in `vercel.json`), and CI checks out the full
 * history. A build without it logs one warning and dates no pages.
 */
export const lastmodFromGit = true;
