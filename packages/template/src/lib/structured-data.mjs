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
