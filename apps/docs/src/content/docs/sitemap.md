---
title: Sitemap
description: What the sitemap lists, and how to give every page a last-modified date from your git history.
---

Every build writes `sitemap-index.xml` and `sitemap-0.xml`. Leave it alone
and the sitemap lists every public page — not the 404 page, `/private/…`, or
`/demo-login` — with no dates. It needs `site` (or `DOCS_SITE_URL`) set to
your real domain, and `/robots.txt` only points crawlers at it once you've set
one; see [Deploy](/deploy/).

## Add last-modified dates

Turn on dates in `src/config/sitemap.mjs`:

```js
export const lastmodFromGit = true;
```

Each docs page's sitemap entry then gets a `<lastmod>`:

```xml
<url>
  <loc>https://docs.example.com/guides/setup/</loc>
  <lastmod>2026-02-20T17:00:00.000Z</lastmod>
</url>
```

The date comes from the page's git history: the last commit that added or
changed its file. Search engines use `<lastmod>` to decide which pages to
recrawl, so an edit you publish gets picked up sooner.

**Turn it on if your build can see your repository's history** — the next
section shows how. Leave it off and nothing runs and nothing changes. There
is no middle setting that guesses: a page the build can't date gets no
`<lastmod>` at all, because search engines stop trusting dates once they
claim changes that didn't happen.

API reference pages and any other page outside `src/content/docs/` never get a
date.

## Give your build your git history

Dates need a full clone. Many CI systems and hosts clone only the latest
commit, and then every page would look as if it changed in that commit — so
the build ignores git, prints a warning, and dates only the pages that set
one by hand (see [Set a page's date](#set-a-pages-date)).

| Where you build | What to do |
| --- | --- |
| **GitHub Actions** | Fetch full history on the checkout step — see below. |
| **Vercel**, connected to your repository | Vercel's builds clone only recent history, so pages get no git dates. To get them, build in GitHub Actions and deploy the output to Vercel — see below. |
| **Your own machine** | Nothing. A normal `git clone` has full history. |
| **Anywhere else** | Build once and read the log. If it prints the warning in [Messages](#messages), find your host's setting for a full or "deep" clone. |

### GitHub Actions

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
    filter: blob:none
```

`fetch-depth: 0` fetches every commit. `filter: blob:none` keeps that fast:
it skips the contents of old files, which the dates don't need.

### Vercel

Build in GitHub Actions with the checkout above, then hand the result to
Vercel with `vercel deploy --prebuilt`. Vercel's guide,
[How can I use GitHub Actions with Vercel?](https://vercel.com/guides/how-can-i-use-github-actions-with-vercel),
has the full workflow and the three secrets it needs. The build steps are:

```yaml
- run: npx vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
- run: npx vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
- run: npx vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

Then stop Vercel's own Git builds from deploying your production branch.
Otherwise every push deploys twice, and whichever build finishes last goes
live — possibly the one without dates. In `vercel.json`, with your production
branch's name:

```json
{
  "git": {
    "deploymentEnabled": { "main": false }
  }
}
```

Other branches still get preview deployments from Vercel. Those have no git
dates, and their build log shows the warning.

## Check that it worked

1. Build the site: `npm run build`.
2. Look for this line in the output. If it's there, the build couldn't use
   git — see [Messages](#messages):

   ```text
   [sitemap] Not using git dates for lastmod: …
   ```

3. Count the dated pages in the sitemap the build wrote:

   ```sh
   grep -o '<lastmod>' dist/client/sitemap-0.xml | wc -l
   ```

   The sitemap is written on a single line, so this counts matches, not lines.
   On Vercel, the same file is in `.vercel/output/static/`. If you removed the
   logged-in experience, the build is static-only and the file is in `dist/`.

`npm test` also checks the result once dates are on: that every page is in
the sitemap at the address its file maps to, and that each entry carries the
right date.

## Set a page's date

To give one page a date of your choosing, add `lastUpdated` to its
frontmatter:

```yaml
---
title: Install
lastUpdated: 2026-03-01
---
```

It wins over the page's git history. Use it when the last commit to a page
wasn't a real update — a typo fix, say — and you want the date to stay where
it was. It's also how a page gets a date on a build that can't see git. When
you later make a real change to that page, move the date forward or delete
the line, or the old date stays.

`lastUpdated` is Starlight's own field. If you turn on Starlight's
[`lastUpdated` option](https://starlight.astro.build/reference/configuration/#lastupdated),
the same date also shows at the bottom of the page. `lastUpdated: true` and
`lastUpdated: false` only switch that footer on or off; they don't set a
sitemap date.

## Skip commits that didn't change content

A commit that touches many pages without changing what they say — running a
formatter, adding a frontmatter field to every page — would make all of those
pages look updated that day. List it in `.sitemap-lastmod-ignore-revs`, next
to `astro.config.mjs`:

```text
# Reformatted every page with Prettier
4f2a9c1e8b3d7f6a5c0e9d2b1a8f7e6d5c4b3a29
```

One full 40-character commit hash per line; `#` starts a comment. `git log
--oneline` shows short hashes — `git rev-parse <short hash>` prints the full
one. If your team squash-merges pull requests, use the hash of the commit on
your main branch, not the one on the pull request's branch. If you merge with
merge commits, list the commit that changed the pages, not the merge commit.
Leave the file out and no commit is skipped.

Keep real changes out of this file. A fix to the content, a new link or a new
image is an update, and search engines should hear about it.

:::note[Moving or renaming a page]
A moved or renamed file starts its history again at the commit that moved it,
so the page's date becomes the day of the move. To keep the earlier date, set
`lastUpdated` on the page.
:::

## If you set `base`

If `astro.config.mjs` sets `base`, pass the same value to the sitemap so its
URLs map back to your pages:

```js
serialize: createSitemapSerializer({
  siteRoot: fileURLToPath(new URL('.', import.meta.url)),
  base: '/docs',
  warn: (message) => console.warn(message),
}),
```

Leave it out on a site with `base` and no page gets a date, and `npm test`
fails, listing each sitemap entry that should have one.

## How each page's date is chosen

| Order | Source | Notes |
| --- | --- | --- |
| 1 | `lastUpdated` in the page's frontmatter | Only a date counts; `true` and `false` are skipped. |
| 2 | The last commit that added or changed the page's file | That commit's own date. With squash or rebase merges, that's when the change reached your main branch; with merge commits, it's when the change was committed on its branch. Commits in `.sitemap-lastmod-ignore-revs` don't count. Skipped entirely when the build can't use git. |
| 3 | Nothing | The entry has no `<lastmod>`. |

| Setting | Where | Leave it alone and… |
| --- | --- | --- |
| `lastmodFromGit` | `src/config/sitemap.mjs` | `false`: no page gets a date, and git never runs. |
| `lastUpdated` | A page's frontmatter | The page is dated from git. |
| `.sitemap-lastmod-ignore-revs` | Next to `astro.config.mjs` | Every commit counts. |
| `base` | The `createSitemapSerializer` call in `astro.config.mjs` | Fine unless your site sets `base`; then pages get no dates and `npm test` fails. |

## Messages

These appear in the build output.

| Message | What it means | What to do |
| --- | --- | --- |
| `Not using git dates for lastmod: the checkout is a shallow clone.` | The build saw only recent commits. | [Give your build your git history](#give-your-build-your-git-history). Until then, only pages with `lastUpdated` get a date. |
| `Not using git dates for lastmod: the repository has no commits yet.` | You're building a new site before its first commit. | Commit your files, then build again. |
| `Not using git dates for lastmod: git history is not available (…)` | Git isn't installed where the build runs (the brackets say `spawnSync git ENOENT`), or the site isn't in a repository (`fatal: not a git repository`). | Build from a clone of your repository, on a machine with git. |
| `.sitemap-lastmod-ignore-revs line 3: expected a full 40-character commit hash, got "…"` | That line holds a short hash or a typo. **The build stops.** | Replace it with the full hash from `git rev-parse`. |

Each of these starts with `[sitemap]`. The first three are warnings: the
build carries on and dates only the pages that set `lastUpdated`.

A `lastUpdated` that isn't a date stops the build before the sitemap is
written. Starlight reports it as `InvalidContentEntryDataError`, naming the
page, with `lastUpdated: Did not match union`. Use a date such as
`2026-03-01`, or delete the line.
