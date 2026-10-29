/**
 * Structured data (JSON-LD) for search engines and AI answer engines.
 *
 * With `generateStructuredData` on, every build adds to each page's `<head>`:
 *
 * - on every page, a `WebSite` node for this docs site, plus an `Organization`
 *   node for your company and a node for your product once you fill them in
 *   below;
 * - on every docs page that is not a splash page, a `TechArticle` describing
 *   the page and a `BreadcrumbList` of the pages above it.
 *
 * Everything comes from the page itself: its title, description and URL, and
 * the date the sitemap gives it (`src/config/sitemap.mjs`). A page that already
 * carries its own block of one of those kinds keeps it, and the generated one
 * of that kind is left out.
 *
 * On by default. `organization` ships empty, so a site that never fills it in
 * names no company or product: nothing about you is guessed.
 *
 * Example:
 *
 *     export const organization = {
 *     	name: 'Acme',
 *     	url: 'https://acme.com/',
 *     	description: 'Acme makes rockets for road runners.',
 *     	logo: 'https://acme.com/logo.png',
 *     	sameAs: ['https://www.linkedin.com/company/acme'],
 *     	product: {
 *     		type: 'SoftwareApplication',
 *     		name: 'Acme Rocket',
 *     		description: 'Launches anything, anywhere.',
 *     		url: 'https://acme.com/rocket/',
 *     		applicationCategory: 'DeveloperApplication',
 *     	},
 *     };
 *
 * The product sits inside the organization because the company publishes it.
 * Its identity is its own `url` plus `#product` (`https://acme.com/rocket/#product`),
 * so a company with a docs site per product names each one; a product with no
 * `url` takes the company's website (`https://acme.com/#product`).
 */

import { checkOrganization } from '../lib/structured-data.mjs';

export const generateStructuredData = true;

/**
 * @typedef {object} Product
 * @property {string} type The schema.org type, such as `SoftwareApplication` or `WebApplication`.
 * @property {string} name
 * @property {string} [description]
 * @property {string} [url]
 * @property {string} [applicationCategory] Such as `DeveloperApplication` or `BusinessApplication`.
 */

/**
 * @typedef {object} Organization
 * @property {string} name
 * @property {string} url Your company's website, an absolute http(s) URL.
 * @property {string} [description]
 * @property {string} [logo] An absolute URL to a square logo image.
 * @property {string[]} [sameAs] Your company's profiles elsewhere, such as LinkedIn or GitHub.
 * @property {Product} [product]
 */

/** @type {Organization | undefined} */
export const organization = undefined;

/* Checked at module load, like `src/config/theme.mjs`, so a mistyped address
 * fails the build with a sentence naming this file instead of shipping broken
 * identities on every page. */
if (organization) checkOrganization(/** @type {Organization} */ (organization));
