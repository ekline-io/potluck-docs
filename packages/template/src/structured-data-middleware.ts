/**
 * Starlight route middleware that adds generated JSON-LD to each page's head.
 *
 * Runs once per page before it renders, after Starlight has merged the head
 * entries from `astro.config.mjs` and the page's frontmatter, so it can see a
 * block the site or the page already wrote and leave that kind out. Appended
 * entries land after all of those, analytics scripts included.
 *
 * What it adds and how to turn it off: `src/config/structured-data.mjs`.
 */
import { fileURLToPath } from 'node:url';
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { build, root, trailingSlash } from 'astro:config/server';
import { getCollection } from 'astro:content';
import { lastmodFromGit } from './config/sitemap.mjs';
import { generateStructuredData, organization } from './config/structured-data.mjs';
import { isListedInSitemap } from './lib/public-pages.mjs';
import { createLastmodLookup } from './lib/sitemap-lastmod.mjs';
import {
	breadcrumbTrail,
	buildPageGraph,
	buildSiteGraph,
	existingJsonLdTypes,
	jsonLdHeadEntry,
	pageUrlFor,
	siteLevelHead,
	siteUrlFor,
	withoutExisting,
	type PageSummary,
} from './lib/structured-data.mjs';

let docsPages: Promise<Map<string, PageSummary>> | undefined;

/** Every published docs page by route id, read once: breadcrumbs need their parents' titles. */
const loadDocsPages = () =>
	(docsPages ??= getCollection(
		'docs',
		// Starlight's own filter, so a draft parent never appears in a production breadcrumb linking to a 404.
		({ data }) => import.meta.env.MODE !== 'production' || data.draft === false
	).then(
		(entries) =>
			new Map(
				entries.map(({ id, data }) => [
					// Starlight's route id for the root page is '', not the collection's 'index'.
					id === 'index' ? '' : id,
					{ title: data.title, sidebarLabel: data.sidebar.label },
				])
			)
	));

let lastmodFor: ((pathname: string) => string | undefined) | undefined;

export const onRequest = defineRouteMiddleware(async (context) => {
	// Private pages render on request, on a server with no git history or source tree: return before any work there.
	if (!generateStructuredData || !context.site || !isListedInSitemap(context.url.pathname)) return;

	const route = context.locals.starlightRoute;
	const existing = existingJsonLdTypes(route.head);
	const siteUrl = siteUrlFor(context.site, import.meta.env.BASE_URL);

	const siteEntry = jsonLdHeadEntry(
		withoutExisting(
			buildSiteGraph({ siteUrl, siteTitle: route.siteTitle, lang: route.lang, organization }),
			existingJsonLdTypes(siteLevelHead(route.head, route.entry.data.head))
		)
	);
	if (siteEntry) route.head.push(siteEntry);

	if (route.entry.data.template === 'splash') return;
	const pages = await loadDocsPages();
	const pageUrl = route.head.find(({ tag, attrs }) => tag === 'link' && attrs?.rel === 'canonical')?.attrs?.href;
	// Pages Starlight renders from outside the collection, such as the API references, have no source file to date.
	if (!pages.has(route.id) || typeof pageUrl !== 'string') return;

	// The lookup does not read the switch, and would otherwise produce git dates the sitemap does not have.
	const dateModified = lastmodFromGit
		? (lastmodFor ??= createLastmodLookup({
				siteRoot: fileURLToPath(root),
				// The sitemap already warns once about missing git history.
				warn: () => {},
				base: import.meta.env.BASE_URL,
			}))(context.url.pathname)
		: undefined;

	const pageEntry = jsonLdHeadEntry(
		withoutExisting(
			buildPageGraph({
				pageUrl,
				siteUrl,
				title: route.entry.data.title,
				description: route.entry.data.description,
				lang: route.lang,
				dateModified,
				trail: breadcrumbTrail({
					pageId: route.id,
					siteTitle: route.siteTitle,
					pages,
					urlFor: (id) => pageUrlFor({ siteUrl, format: build.format, trailingSlash, id }),
				}),
				organization,
			}),
			existing
		)
	);
	if (pageEntry) route.head.push(pageEntry);
});
