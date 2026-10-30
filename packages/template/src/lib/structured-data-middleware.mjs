/**
 * The route middleware that adds generated JSON-LD to each page's head, with
 * its settings passed in: `src/structured-data-middleware.ts` passes this
 * site's.
 *
 * Runs once per page before it renders, after Starlight has merged the head
 * entries from `astro.config.mjs` and the page's frontmatter, so it can see a
 * block the site or the page already wrote and leave that kind out. Appended
 * entries land after all of those, analytics scripts included.
 *
 * Imports only Node built-ins, Astro's virtual modules and files beside it, so
 * a site outside this project can import it without this project's packages.
 */
import { fileURLToPath } from 'node:url';
import { build, root, trailingSlash } from 'astro:config/server';
import { getCollection } from 'astro:content';
import { createLastmodLookup } from './sitemap-lastmod.mjs';
import {
	breadcrumbTrail,
	buildPageGraph,
	buildSiteGraph,
	existingJsonLdTypes,
	jsonLdHeadEntry,
	pageUrlFor,
	siteUrlFor,
	withoutExisting,
} from './structured-data.mjs';

/** @typedef {import('./structured-data.mjs').PageSummary} PageSummary */
/** @typedef {import('../config/structured-data.mjs').Organization} Organization */

/**
 * @typedef {object} HeadEntry
 * @property {string} tag
 * @property {Record<string, string | boolean | undefined>} [attrs]
 * @property {string} [content]
 */

/**
 * The parts of Starlight's route middleware context this reads.
 *
 * @typedef {object} RouteContext
 * @property {URL | undefined} site
 * @property {URL} url
 * @property {{ starlightRoute: {
 *   head: HeadEntry[],
 *   entry: { data: { title: string, description?: string, template?: string } },
 *   id: string,
 *   lang: string,
 *   siteTitle: string,
 * } }} locals
 */

/**
 * @typedef {object} StructuredDataSettings
 * @property {boolean} generateStructuredData The switch in `src/config/structured-data.mjs`.
 * @property {Organization | undefined} organization The company and product, from the same file.
 * @property {boolean} lastmodFromGit The sitemap's switch: dates come only from the lookup the sitemap uses.
 * @property {(pathname: string) => boolean} isListed The sitemap's rule for which pages are public.
 */

/**
 * @param {StructuredDataSettings} settings
 * @returns {(context: RouteContext) => Promise<void>}
 */
export const structuredDataMiddleware = ({ generateStructuredData, organization, lastmodFromGit, isListed }) => {
	/** @type {Promise<Map<string, PageSummary>> | undefined} */
	let docsPages;

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

	/** @type {((pathname: string) => string | undefined) | undefined} */
	let lastmodFor;

	return async (context) => {
		// Private pages render on request, on a server with no git history or source tree: return before any work there.
		if (!generateStructuredData || !context.site || !isListed(context.url.pathname)) return;

		const route = context.locals.starlightRoute;
		const existing = existingJsonLdTypes(route.head);
		const siteUrl = siteUrlFor(context.site, import.meta.env.BASE_URL);

		const siteEntry = jsonLdHeadEntry(
			withoutExisting(
				buildSiteGraph({ siteUrl, siteTitle: route.siteTitle, lang: route.lang, organization }),
				existing
			)
		);
		if (siteEntry) route.head.push(siteEntry);

		// The sitemap leaves out error pages, so the page graph does too.
		if (route.entry.data.template === 'splash' || route.id === '404' || route.id === '500') return;
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
	};
};
