---
title: Structured data
description: The JSON-LD every page gets, how to name your company and product in it, and how to check it.
---

Every build adds structured data — [schema.org](https://schema.org/) JSON-LD
— to each public page's `<head>`. Search engines and AI answer engines read it
to learn what a page is, where it sits on your site, and who publishes it.
Leave it alone and:

- every page gets a `WebSite` node for your docs site;
- every page in `src/content/docs/` that is not a splash page also gets a
  `TechArticle` describing the page and a `BreadcrumbList` of the pages above
  it.

No company or product is named until you add one. Nothing is guessed.

For a page at `/guides/setup/`, the build writes:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://docs.example.com/guides/setup/#article",
      "headline": "Set up your account",
      "description": "Create an account and invite your team.",
      "mainEntityOfPage": "https://docs.example.com/guides/setup/",
      "isPartOf": { "@id": "https://docs.example.com/#website" },
      "inLanguage": "en"
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://docs.example.com/guides/setup/#breadcrumb",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://docs.example.com/" },
        { "@type": "ListItem", "position": 2, "name": "Guides", "item": "https://docs.example.com/guides/" },
        { "@type": "ListItem", "position": 3, "name": "Set up your account" }
      ]
    }
  ]
}
```

Every value comes from the page: its `title`, its `description`, and its URL.
You don't write any of it, and it stays right when you edit the page.

## Name your company and product

Fill in `organization` in `src/config/structured-data.mjs`:

```js
export const organization = {
	name: 'Acme',
	url: 'https://acme.com/',
	description: 'Acme makes rockets for road runners.',
	logo: 'https://acme.com/logo.png',
	sameAs: ['https://www.linkedin.com/company/acme', 'https://github.com/acme'],
	product: {
		type: 'SoftwareApplication',
		name: 'Acme Rocket',
		description: 'Launches anything, anywhere.',
		url: 'https://acme.com/rocket/',
		applicationCategory: 'DeveloperApplication',
	},
};
```

Every page then also gets an `Organization` node with your logo and a node
for your product, and each page's `TechArticle` names your company as its
`publisher` and your product as what it is `about`.

The company needs `name` and `url`; the product needs `type` and `name`.
Leave any other field out and it's left out of the data. The company's `url`
must be your website's full address, `https://` included, or the build stops:

```text
src/config/structured-data.mjs: organization.url is "acme.com", but must be an absolute http(s) URL
```

`product` sits inside `organization` on purpose. Its identity is built from
your company's website — `https://acme.com/#product` — so a product with no
company has none. For `type`, use the schema.org type that fits:
`SoftwareApplication`, `WebApplication`, `MobileApplication`, or `Product`.

## A page's own block wins

If a page already carries JSON-LD of a kind the build generates — in its
frontmatter `head`, or in the `head` of `astro.config.mjs` — that page keeps
its own, and the generated one of that kind is left out:

| Generated | Left out when the page already has |
| --- | --- |
| `TechArticle` | a `TechArticle`, `Article`, `BlogPosting` or `NewsArticle` |
| `BreadcrumbList` | a `BreadcrumbList` |
| `WebSite`, `Organization`, your product | a node of the same type |

Other types, such as `FAQPage`, are never affected: write them by hand as
before, and the page gets both. A hand-written block that isn't valid JSON
counts for nothing.

So a page never carries two articles or two breadcrumbs. But a hand-written
block is not updated when you edit the page. Delete the ones the build now
writes for you.

## How breadcrumbs are named

A page's breadcrumb starts at your home page and lists each folder above the
page that has a page of its own — an `index.md` in that folder — then the page
itself:

1. **Home**: your home page's `sidebar.label`, or its `title`. With no home
   page, your site's title.
2. **Each folder with its own page**: that page's `sidebar.label`, or its
   `title`. A folder with no page of its own is skipped.
3. **The page itself**: its `title`.

To give a section a short name in breadcrumbs, add `sidebar.label` to its
index page:

```yaml
---
title: Everything you can do with guides
sidebar:
  label: Guides
---
```

That is Starlight's own field, so it also renames the page in the sidebar —
unless your sidebar configuration gives the entry its own `label`, which wins.

## `dateModified`

A page's `TechArticle` gets a `dateModified` only when the
[sitemap](/sitemap/) gives the page a `<lastmod>`, and it is always the same
date. Turn on `lastmodFromGit` in `src/config/sitemap.mjs` and both appear
together; leave it off and neither does. A page the sitemap can't date gets no
`dateModified` — never the date of the build.

With dates on, if `astro.config.mjs` sets `base`, pass it to the sitemap as
well, as [the sitemap page shows](/sitemap/#if-you-set-base). Otherwise your
pages get dates the sitemap doesn't have, and `npm test` fails, listing each
page whose date disagrees.

## Which pages get what

| Page | What it gets |
| --- | --- |
| A page in `src/content/docs/` | `WebSite`, your company and product once set, and its own `TechArticle` and `BreadcrumbList` |
| A splash page, such as the home page | `WebSite`, and your company and product once set |
| An API reference page, or any other page outside `src/content/docs/` | `WebSite`, and your company and product once set |
| Pages under `/private/`, and `/demo-login` | Nothing — the sitemap leaves them out too |

## Check that it worked

1. Build the site: `npm run build`.
2. Count the generated blocks on a docs page:

   ```sh
   grep -o 'data-generated="structured-data"' dist/client/guides/example/index.html | wc -l
   ```

   A docs page has `2`; a splash page has `1`. On Vercel, the same file is in
   `.vercel/output/static/`.
3. Once deployed, paste a page's URL into Google's
   [Rich Results Test](https://search.google.com/test/rich-results). It lists
   the breadcrumb Google can show in results. To see every node, use the
   [Schema Markup Validator](https://validator.schema.org/).

`npm test` also checks every build: each docs page has exactly one article
and one breadcrumb, no generated node repeats an `@id` already on its page,
the generated blocks are valid JSON, and each `dateModified` matches the
sitemap.

## Turn it off

```js
export const generateStructuredData = false;
```

Nothing is generated, and the tests that check it are skipped. Blocks you
wrote by hand are unaffected.

## Settings

All in `src/config/structured-data.mjs`.

| Setting | Leave it alone and… |
| --- | --- |
| `generateStructuredData` | `true`: every page gets its structured data. |
| `organization` | `undefined`: no company or product is named anywhere. |
| `organization.product` | No product node, and no page says what it is `about`. |
