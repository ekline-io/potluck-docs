/**
 * JSON-LD nodes for search engines and AI answer engines, built from data the
 * site already has: its settings in `src/config/structured-data.mjs` and each
 * page's own title, description and URL.
 *
 * Every `@id` is built from a URL, never from a counter or a title, so the same
 * page or company keeps the same identity across builds. Changing one does not
 * raise an error anywhere; it silently creates a second, disconnected entity.
 *
 * Kept free of `astro:*` imports so the route middleware and the `node --test`
 * suites call the same code.
 */

/** @typedef {import('../config/structured-data.mjs').Organization} Organization */

/**
 * JSON-LD reads a missing key and an `undefined` one the same way, but the
 * serialized output and `deepEqual` do not.
 *
 * @param {Record<string, unknown>} node
 * @returns {Record<string, unknown>}
 */
const withoutUndefined = (node) => Object.fromEntries(Object.entries(node).filter(([, value]) => value !== undefined));

/**
 * @param {Organization} organization
 * @returns {{ organization: string, logo: string, product: string }}
 */
export const organizationIds = (organization) => {
	const { origin } = new URL(organization.url);
	return {
		organization: `${origin}/#organization`,
		logo: `${origin}/#logo`,
		product: `${origin}/#product`,
	};
};

/**
 * @param {URL | string} site Astro's `site`.
 * @param {string} base Astro's `base`, with or without a trailing slash.
 * @returns {string} The site's URL with `base` and a trailing slash, the root every `@id` here hangs from.
 */
export const siteUrlFor = (site, base) => new URL(base.endsWith('/') ? base : `${base}/`, site).href;

/**
 * A docs page's URL in the shape Starlight gives its canonical link: Astro's
 * build URL for the page, with the trailing slash `trailingSlash` asks for.
 * A breadcrumb that linked a parent by any other spelling would name a
 * different URL from the one that page calls itself.
 *
 * @param {object} options
 * @param {string} options.siteUrl The site's URL with `base` and a trailing slash.
 * @param {'file' | 'directory' | 'preserve'} options.format Astro's `build.format`.
 * @param {'always' | 'never' | 'ignore'} options.trailingSlash Astro's `trailingSlash`.
 * @param {string} options.id Starlight's route id: `''` for the root.
 * @returns {string}
 */
export const pageUrlFor = ({ siteUrl, format, trailingSlash, id }) => {
	if (format === 'file') return new URL(id ? `${id}.html` : 'index.html', siteUrl).href;
	const href = new URL(id ? `${id}/` : '', siteUrl).href;
	return trailingSlash === 'never' ? href.replace(/\/$/, '') : href;
};

/**
 * The nodes every page carries: the site, and the company and product behind
 * it when they are set.
 *
 * @param {object} options
 * @param {string} options.siteUrl The site's URL with `base` and a trailing slash.
 * @param {string} options.siteTitle
 * @param {string} options.lang
 * @param {Organization | undefined} options.organization
 * @returns {Record<string, unknown>[]}
 */
export const buildSiteGraph = ({ siteUrl, siteTitle, lang, organization }) => {
	const ids = organization ? organizationIds(organization) : undefined;
	const website = withoutUndefined({
		'@type': 'WebSite',
		'@id': `${siteUrl}#website`,
		url: siteUrl,
		name: siteTitle,
		publisher: ids && { '@id': ids.organization },
		inLanguage: lang,
	});
	if (!organization || !ids) return [website];

	const company = withoutUndefined({
		'@type': 'Organization',
		'@id': ids.organization,
		name: organization.name,
		url: organization.url,
		description: organization.description,
		logo: organization.logo && { '@type': 'ImageObject', '@id': ids.logo, url: organization.logo },
		sameAs: organization.sameAs?.length ? organization.sameAs : undefined,
	});
	const { product } = organization;
	if (!product) return [website, company];

	return [
		website,
		company,
		withoutUndefined({
			'@type': product.type,
			'@id': ids.product,
			name: product.name,
			description: product.description,
			url: product.url,
			applicationCategory: product.applicationCategory,
			publisher: { '@id': ids.organization },
		}),
	];
};

/**
 * @typedef {object} PageSummary What a breadcrumb needs to know about a docs page.
 * @property {string} title
 * @property {string} [sidebarLabel]
 */

/** @typedef {{ name: string, url?: string }} BreadcrumbEntry */

/**
 * Starlight's own rule for naming a page in the sidebar, so a breadcrumb says
 * what the navigation says.
 *
 * @param {PageSummary} page
 */
const navigationName = (page) => page.sidebarLabel || page.title;

/**
 * The home page, then each parent path of the page that has a page of its own
 * (nearest the root first), then the page itself, which has no link.
 *
 * @param {object} options
 * @param {string} options.pageId Starlight's route id: `''` for the root, `guides/setup` otherwise.
 * @param {string} options.siteTitle Names the home entry when the site has no root page.
 * @param {Map<string, PageSummary>} options.pages Every docs page, keyed by route id.
 * @param {(id: string) => string} options.urlFor The absolute URL of the page with that route id.
 * @returns {BreadcrumbEntry[]}
 */
export const breadcrumbTrail = ({ pageId, siteTitle, pages, urlFor }) => {
	const page = pages.get(pageId);
	if (!page) throw new Error(`[structured-data] no docs page with id "${pageId}" to build a breadcrumb for`);
	if (pageId === '') return [{ name: page.title }];

	const root = pages.get('');
	const segments = pageId.split('/');
	const parents = segments
		.slice(0, -1)
		.map((_, index) => segments.slice(0, index + 1).join('/'))
		.flatMap((id) => {
			const parent = pages.get(id);
			return parent ? [{ name: navigationName(parent), url: urlFor(id) }] : [];
		});

	return [{ name: root ? navigationName(root) : siteTitle, url: urlFor('') }, ...parents, { name: page.title }];
};

/**
 * The nodes for one docs page: the page as a `TechArticle`, and its breadcrumb.
 *
 * @param {object} options
 * @param {string} options.pageUrl The page's canonical URL.
 * @param {string} options.siteUrl The site's URL with `base` and a trailing slash.
 * @param {string} options.title
 * @param {string | undefined} options.description
 * @param {string} options.lang
 * @param {string | undefined} options.dateModified The page's sitemap `<lastmod>`, never a guess.
 * @param {BreadcrumbEntry[]} options.trail
 * @param {Organization | undefined} options.organization
 * @returns {Record<string, unknown>[]}
 */
export const buildPageGraph = ({ pageUrl, siteUrl, title, description, lang, dateModified, trail, organization }) => {
	const ids = organization ? organizationIds(organization) : undefined;
	return [
		withoutUndefined({
			'@type': 'TechArticle',
			'@id': `${pageUrl}#article`,
			headline: title,
			description: description || undefined,
			mainEntityOfPage: pageUrl,
			isPartOf: { '@id': `${siteUrl}#website` },
			about: ids && organization?.product ? { '@id': ids.product } : undefined,
			publisher: ids && { '@id': ids.organization },
			dateModified,
			inLanguage: lang,
		}),
		{
			'@type': 'BreadcrumbList',
			'@id': `${pageUrl}#breadcrumb`,
			itemListElement: trail.map((entry, index) =>
				withoutUndefined({ '@type': 'ListItem', position: index + 1, name: entry.name, item: entry.url }),
			),
		},
	];
};

/** The types a page's own article can be written as; any of them stands in for the generated `TechArticle`. */
export const ARTICLE_TYPES = ['TechArticle', 'Article', 'BlogPosting', 'NewsArticle'];

/**
 * @param {unknown} value Parsed JSON-LD: one node, a `{ '@graph': [...] }` wrapper, or an array of either.
 * @returns {Record<string, unknown>[]}
 */
const topLevelNodes = (value) => {
	if (Array.isArray(value)) return value.flatMap(topLevelNodes);
	if (!value || typeof value !== 'object') return [];
	const node = /** @type {Record<string, unknown>} */ (value);
	return [node, ...topLevelNodes(node['@graph'])];
};

/**
 * Every `@type` already declared by a JSON-LD script in the page's head, from
 * the site's config and the page's frontmatter alike.
 *
 * A block that does not parse counts for nothing: it was never valid
 * structured data, and failing the build over it would block a deploy on
 * content this generator does not own.
 *
 * @param {Array<{ tag: string, attrs?: Record<string, string | boolean | undefined>, content?: string }>} head
 *   Starlight's head entries for the page.
 * @returns {Set<string>}
 */
export const existingJsonLdTypes = (head) => {
	const types = new Set();
	for (const { tag, attrs, content } of head) {
		if (tag !== 'script' || attrs?.type !== 'application/ld+json' || !content) continue;
		let parsed;
		try {
			parsed = JSON.parse(content);
		} catch {
			continue;
		}
		for (const node of topLevelNodes(parsed)) {
			for (const type of [node['@type']].flat()) {
				if (typeof type === 'string') types.add(type);
			}
		}
	}
	return types;
};

/**
 * A site's or page's own block wins: leaves out each generated node whose kind
 * the head already has, so a page never carries two of one kind.
 *
 * @param {Record<string, unknown>[]} nodes
 * @param {Set<string>} existingTypes
 * @returns {Record<string, unknown>[]}
 */
export const withoutExisting = (nodes, existingTypes) =>
	nodes.filter((node) =>
		node['@type'] === 'TechArticle'
			? !ARTICLE_TYPES.some((type) => existingTypes.has(type))
			: !existingTypes.has(/** @type {string} */ (node['@type'])),
	);

/**
 * One `<script type="application/ld+json">` head entry holding the nodes.
 *
 * Starlight writes a head entry's content into the page as is, so a title
 * containing `</script>` would end the tag early; `\u003c` is the same
 * character to a JSON parser and nothing to an HTML one.
 *
 * @param {Record<string, unknown>[]} nodes
 * @returns {{ tag: 'script', attrs: { type: 'application/ld+json', 'data-generated': 'structured-data' }, content: string } | undefined}
 */
export const jsonLdHeadEntry = (nodes) =>
	nodes.length === 0
		? undefined
		: {
				tag: 'script',
				attrs: { type: 'application/ld+json', 'data-generated': 'structured-data' },
				content: JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c'),
			};
