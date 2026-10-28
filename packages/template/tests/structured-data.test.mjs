/**
 * Unit tests for the JSON-LD builders in `src/lib/structured-data.mjs`.
 *
 * The fixtures with `docs.acme.com` URLs have the shape of a site's
 * hand-written blocks: a site that replaces its own blocks with generated ones
 * needs every `@id` reproduced exactly, or its entities silently split in two.
 *
 * Run: node --test tests/structured-data.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ARTICLE_TYPES,
	breadcrumbTrail,
	buildPageGraph,
	buildSiteGraph,
	existingJsonLdTypes,
	jsonLdHeadEntry,
	organizationIds,
	pageUrlFor,
	siteUrlFor,
	withoutExisting,
} from '../src/lib/structured-data.mjs';
import { isListedInSitemap } from '../src/lib/public-pages.mjs';

const ACME_ORGANIZATION = {
	name: 'Acme',
	url: 'https://acme.com/',
	description:
		'Acme builds tools for teams that ship software.',
	logo: 'https://acme.com/logo.png',
	sameAs: ['https://www.linkedin.com/company/acme'],
	product: {
		type: 'WebApplication',
		name: 'Acme',
		description:
			'Acme Docs keeps product documentation in step with every release.',
		url: 'https://acme.com/',
		applicationCategory: 'DeveloperApplication',
	},
};

/** @param {object[]} nodes */
const byId = (nodes) => [...nodes].sort((a, b) => a['@id'].localeCompare(b['@id']));

test('buildSiteGraph with no organization returns only a WebSite without publisher', () => {
	const graph = buildSiteGraph({
		siteUrl: 'https://docs.example.com/',
		siteTitle: 'My Docs',
		lang: 'en',
		organization: undefined,
	});

	assert.deepEqual(graph, [
		{
			'@type': 'WebSite',
			'@id': 'https://docs.example.com/#website',
			url: 'https://docs.example.com/',
			name: 'My Docs',
			inLanguage: 'en',
		},
	]);
	assert.equal('publisher' in graph[0], false);
});

test("buildSiteGraph reproduces a hand-written site graph", () => {
	// A site-level `@graph` as a site would write it by hand, in its own order.
	const handWritten = [
		{
			'@type': 'Organization',
			'@id': 'https://acme.com/#organization',
			name: 'Acme',
			url: 'https://acme.com/',
			description:
				'Acme builds tools for teams that ship software.',
			logo: {
				'@type': 'ImageObject',
				'@id': 'https://acme.com/#logo',
				url: 'https://acme.com/logo.png',
			},
			sameAs: ['https://www.linkedin.com/company/acme'],
		},
		{
			'@type': 'WebSite',
			'@id': 'https://docs.acme.com/#website',
			url: 'https://docs.acme.com/',
			name: 'Acme Documentation',
			publisher: { '@id': 'https://acme.com/#organization' },
			inLanguage: 'en-US',
		},
		{
			'@type': 'WebApplication',
			'@id': 'https://acme.com/#product',
			name: 'Acme',
			description:
				'Acme Docs keeps product documentation in step with every release.',
			url: 'https://acme.com/',
			applicationCategory: 'DeveloperApplication',
			publisher: { '@id': 'https://acme.com/#organization' },
		},
	];

	const graph = buildSiteGraph({
		siteUrl: 'https://docs.acme.com/',
		siteTitle: 'Acme Documentation',
		lang: 'en-US',
		organization: ACME_ORGANIZATION,
	});

	// Node order inside `@graph` carries no meaning in JSON-LD; every node and every `@id` must match.
	assert.deepEqual(byId(graph), byId(handWritten));
	assert.deepEqual(
		graph.map((node) => node['@type']),
		['WebSite', 'Organization', 'WebApplication'],
	);
});

test('buildSiteGraph leaves out optional organization and product fields that are not set', () => {
	const graph = buildSiteGraph({
		siteUrl: 'https://docs.acme.com/',
		siteTitle: 'Acme Docs',
		lang: 'en',
		organization: { name: 'Acme', url: 'https://acme.com/', sameAs: [], product: { type: 'SoftwareApplication', name: 'Rocket' } },
	});

	assert.deepEqual(graph.slice(1), [
		{ '@type': 'Organization', '@id': 'https://acme.com/#organization', name: 'Acme', url: 'https://acme.com/' },
		{
			'@type': 'SoftwareApplication',
			'@id': 'https://acme.com/#product',
			name: 'Rocket',
			publisher: { '@id': 'https://acme.com/#organization' },
		},
	]);
});

test('buildSiteGraph with an organization but no product has no product node', () => {
	const graph = buildSiteGraph({
		siteUrl: 'https://docs.acme.com/',
		siteTitle: 'Acme Docs',
		lang: 'en',
		organization: { name: 'Acme', url: 'https://acme.com/' },
	});

	assert.deepEqual(
		graph.map((node) => node['@type']),
		['WebSite', 'Organization'],
	);
});

test('organizationIds uses the origin without a trailing slash', () => {
	assert.deepEqual(organizationIds({ name: 'Acme', url: 'https://acme.com/products?x=1' }), {
		organization: 'https://acme.com/#organization',
		logo: 'https://acme.com/#logo',
		product: 'https://acme.com/#product',
	});
});

/** @param {string} siteUrl */
const urlsUnder = (siteUrl) => (/** @type {string} */ id) => (id ? `${siteUrl}${id}/` : siteUrl);

test('breadcrumbTrail reproduces a hand-written trail', () => {
	const pages = new Map([
		['', { title: 'Acme docs — …', sidebarLabel: 'Documentation' }],
		['reviewer/quickstart', { title: 'Run your first documentation review', sidebarLabel: 'Quickstart' }],
		['reviewer/quickstart/vscode', { title: 'Set up Acme Docs in VS Code' }],
	]);

	const trail = breadcrumbTrail({
		pageId: 'reviewer/quickstart/vscode',
		siteTitle: 'Acme Documentation',
		pages,
		urlFor: urlsUnder('https://docs.acme.com/'),
	});

	assert.deepEqual(trail, [
		{ name: 'Documentation', url: 'https://docs.acme.com/' },
		{ name: 'Quickstart', url: 'https://docs.acme.com/reviewer/quickstart/' },
		{ name: 'Set up Acme Docs in VS Code' },
	]);
});

test('breadcrumbTrail falls back to the site title without a root page', () => {
	const pages = new Map([['guides/setup', { title: 'Set up' }]]);

	const trail = breadcrumbTrail({
		pageId: 'guides/setup',
		siteTitle: 'My Docs',
		pages,
		urlFor: urlsUnder('https://docs.example.com/'),
	});

	assert.deepEqual(trail, [{ name: 'My Docs', url: 'https://docs.example.com/' }, { name: 'Set up' }]);
});

test('breadcrumbTrail uses title when a parent has no sidebarLabel', () => {
	const pages = new Map([
		['', { title: 'Home' }],
		['guides', { title: 'All guides' }],
		['guides/setup', { title: 'Set up' }],
	]);

	const trail = breadcrumbTrail({
		pageId: 'guides/setup',
		siteTitle: 'My Docs',
		pages,
		urlFor: urlsUnder('https://docs.example.com/'),
	});

	assert.deepEqual(trail, [
		{ name: 'Home', url: 'https://docs.example.com/' },
		{ name: 'All guides', url: 'https://docs.example.com/guides/' },
		{ name: 'Set up' },
	]);
});

test("breadcrumbTrail names the page by its title, using its sidebarLabel only where it is someone's parent", () => {
	const pages = new Map([
		['guides', { title: 'All guides', sidebarLabel: 'Guides' }],
		['guides/setup', { title: 'Set up your account', sidebarLabel: 'Setup' }],
	]);
	const urlFor = urlsUnder('https://docs.example.com/');

	assert.deepEqual(breadcrumbTrail({ pageId: 'guides/setup', siteTitle: 'My Docs', pages, urlFor }), [
		{ name: 'My Docs', url: 'https://docs.example.com/' },
		{ name: 'Guides', url: 'https://docs.example.com/guides/' },
		{ name: 'Set up your account' },
	]);
	assert.deepEqual(breadcrumbTrail({ pageId: 'guides', siteTitle: 'My Docs', pages, urlFor }), [
		{ name: 'My Docs', url: 'https://docs.example.com/' },
		{ name: 'All guides' },
	]);
});

test('breadcrumbTrail skips parent paths that have no page of their own', () => {
	const pages = new Map([
		['', { title: 'Home' }],
		['a/b', { title: 'B' }],
		['a/b/c/d', { title: 'D' }],
	]);

	const trail = breadcrumbTrail({
		pageId: 'a/b/c/d',
		siteTitle: 'My Docs',
		pages,
		urlFor: urlsUnder('https://docs.example.com/'),
	});

	assert.deepEqual(trail, [
		{ name: 'Home', url: 'https://docs.example.com/' },
		{ name: 'B', url: 'https://docs.example.com/a/b/' },
		{ name: 'D' },
	]);
});

test('breadcrumbTrail keeps a base path in every URL', () => {
	const pages = new Map([
		['guides', { title: 'Guides' }],
		['guides/setup', { title: 'Set up' }],
	]);

	const trail = breadcrumbTrail({
		pageId: 'guides/setup',
		siteTitle: 'My Docs',
		pages,
		urlFor: urlsUnder('https://example.com/docs/'),
	});

	assert.deepEqual(trail, [
		{ name: 'My Docs', url: 'https://example.com/docs/' },
		{ name: 'Guides', url: 'https://example.com/docs/guides/' },
		{ name: 'Set up' },
	]);
});

test('breadcrumbTrail for the root page itself is that page alone', () => {
	const pages = new Map([['', { title: 'Welcome', sidebarLabel: 'Home' }]]);

	const trail = breadcrumbTrail({ pageId: '', siteTitle: 'My Docs', pages, urlFor: urlsUnder('https://docs.example.com/') });

	assert.deepEqual(trail, [{ name: 'Welcome' }]);
});

test('breadcrumbTrail names the page it was asked about when that page is missing', () => {
	assert.throws(
		() => breadcrumbTrail({ pageId: 'nope', siteTitle: 'My Docs', pages: new Map(), urlFor: urlsUnder('https://x.com/') }),
		/no docs page with id "nope"/,
	);
});

const CREDIT_PAGE = {
	pageUrl: 'https://docs.acme.com/credit/',
	siteUrl: 'https://docs.acme.com/',
	title: 'Add the "Powered by Acme" badge',
	description:
		'Embed the Acme badge on your documentation site. Find the snippet for your framework and paste it.',
	lang: 'en-US',
	dateModified: '2026-10-05',
	trail: [{ name: 'Documentation', url: 'https://docs.acme.com/' }, { name: 'Add the "Powered by Acme" badge' }],
	organization: ACME_ORGANIZATION,
};

test('buildPageGraph matches a hand-written page graph', () => {
	// A page `@graph` as a site would write it by hand into the page's frontmatter.
	const handWritten = [
		{
			'@type': 'TechArticle',
			'@id': 'https://docs.acme.com/credit/#article',
			headline: 'Add the "Powered by Acme" badge',
			description:
				'Embed the Acme badge on your documentation site. Find the snippet for your framework and paste it.',
			mainEntityOfPage: 'https://docs.acme.com/credit/',
			isPartOf: { '@id': 'https://docs.acme.com/#website' },
			about: { '@id': 'https://acme.com/#product' },
			publisher: { '@id': 'https://acme.com/#organization' },
			dateModified: '2026-10-05',
			inLanguage: 'en-US',
		},
		{
			'@type': 'BreadcrumbList',
			'@id': 'https://docs.acme.com/credit/#breadcrumb',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Documentation', item: 'https://docs.acme.com/' },
				{ '@type': 'ListItem', position: 2, name: 'Add the "Powered by Acme" badge' },
			],
		},
	];

	assert.deepEqual(buildPageGraph(CREDIT_PAGE), handWritten);
});

test('buildPageGraph with no organization has no about or publisher', () => {
	const [article] = buildPageGraph({ ...CREDIT_PAGE, organization: undefined });

	assert.equal('about' in article, false);
	assert.equal('publisher' in article, false);
	assert.deepEqual(article.isPartOf, { '@id': 'https://docs.acme.com/#website' });
});

test('buildPageGraph with an organization but no product has a publisher and no about', () => {
	const { product, ...company } = ACME_ORGANIZATION;
	const [article] = buildPageGraph({ ...CREDIT_PAGE, organization: company });

	assert.equal('about' in article, false);
	assert.deepEqual(article.publisher, { '@id': 'https://acme.com/#organization' });
});

test('buildPageGraph with no date has no dateModified', () => {
	const [article] = buildPageGraph({ ...CREDIT_PAGE, dateModified: undefined });

	assert.equal('dateModified' in article, false);
});

test('buildPageGraph with no description has no description', () => {
	for (const description of [undefined, '']) {
		const [article] = buildPageGraph({ ...CREDIT_PAGE, description });
		assert.equal('description' in article, false);
	}
});

const ldScript = (content) => ({ tag: 'script', attrs: { type: 'application/ld+json' }, content });

test('existingJsonLdTypes reads @graph and arrays, and skips malformed JSON', () => {
	const head = [
		{ tag: 'meta', attrs: { charset: 'utf-8' } },
		ldScript(
			JSON.stringify({
				'@context': 'https://schema.org',
				'@graph': [{ '@type': 'TechArticle' }, { '@type': ['BreadcrumbList'] }],
			}),
		),
		ldScript(JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage' })),
		ldScript('{not json'),
		{ tag: 'script', attrs: { src: '/analytics.js' } },
		{ tag: 'script', attrs: {}, content: JSON.stringify({ '@type': 'WebSite' }) },
	];

	assert.deepEqual(existingJsonLdTypes(head), new Set(['TechArticle', 'BreadcrumbList', 'FAQPage']));
});

test('existingJsonLdTypes reads a top-level array of nodes and a script with no content', () => {
	const head = [
		ldScript(JSON.stringify([{ '@type': 'Organization' }, { '@type': ['WebSite', 'Thing'] }])),
		{ tag: 'script', attrs: { type: 'application/ld+json', src: '/data.json' } },
	];

	assert.deepEqual(existingJsonLdTypes(head), new Set(['Organization', 'WebSite', 'Thing']));
});

test('existingJsonLdTypes reads a script whose type has a parameter or other case', () => {
	const head = [
		{ tag: 'script', attrs: { type: 'application/ld+json; charset=utf-8' }, content: JSON.stringify({ '@type': 'TechArticle' }) },
		{ tag: 'script', attrs: { type: 'Application/LD+JSON' }, content: JSON.stringify({ '@type': 'BreadcrumbList' }) },
	];

	assert.deepEqual(existingJsonLdTypes(head), new Set(['TechArticle', 'BreadcrumbList']));
});

const pageNodes = () => buildPageGraph(CREDIT_PAGE);

test('ARTICLE_TYPES is the set a page article can be written as', () => {
	assert.deepEqual(ARTICLE_TYPES, ['TechArticle', 'Article', 'BlogPosting', 'NewsArticle']);
});

test('withoutExisting drops TechArticle when a BlogPosting exists, keeps BreadcrumbList', () => {
	const kept = withoutExisting(pageNodes(), new Set(['BlogPosting', 'FAQPage']));

	assert.deepEqual(
		kept.map((node) => node['@type']),
		['BreadcrumbList'],
	);
});

test('withoutExisting drops WebSite when the config already has one', () => {
	const siteNodes = buildSiteGraph({
		siteUrl: 'https://docs.acme.com/',
		siteTitle: 'Acme Documentation',
		lang: 'en',
		organization: ACME_ORGANIZATION,
	});

	const kept = withoutExisting(siteNodes, new Set(['WebSite']));

	assert.deepEqual(
		kept.map((node) => node['@type']),
		['Organization', 'WebApplication'],
	);
});

test('withoutExisting drops a BreadcrumbList only for a BreadcrumbList, and FAQPage drops nothing', () => {
	assert.deepEqual(
		withoutExisting(pageNodes(), new Set(['BreadcrumbList'])).map((node) => node['@type']),
		['TechArticle'],
	);
	assert.equal(withoutExisting(pageNodes(), new Set(['FAQPage'])).length, 2);
});

test('jsonLdHeadEntry escapes </script>', () => {
	const entry = jsonLdHeadEntry([{ '@type': 'Thing', name: 'a</script><b>' }]);

	assert.ok(entry);
	assert.equal(entry.tag, 'script');
	assert.deepEqual(entry.attrs, { type: 'application/ld+json', 'data-generated': 'structured-data' });
	assert.equal(entry.content.includes('<'), false);
	assert.deepEqual(JSON.parse(entry.content), {
		'@context': 'https://schema.org',
		'@graph': [{ '@type': 'Thing', name: 'a</script><b>' }],
	});
});

test('jsonLdHeadEntry keeps a quote in a title inside one valid string', () => {
	const entry = jsonLdHeadEntry(buildPageGraph({ ...CREDIT_PAGE, title: 'Say "hi" </script>' }));

	assert.ok(entry);
	assert.equal(JSON.parse(entry.content)['@graph'][0].headline, 'Say "hi" </script>');
});

test('jsonLdHeadEntry returns nothing for an empty list', () => {
	assert.equal(jsonLdHeadEntry([]), undefined);
});

test('isListedInSitemap excludes /private/ at any depth and /demo-login, keeps /guides/demo-login-setup/', () => {
	for (const pathname of [
		'/private',
		'/docs/private',
		'/private/',
		'/private/getting-started/',
		'/private/orgs/acme/',
		'/docs/private/getting-started/',
		'/demo-login',
		'/demo-login/',
		'/docs/demo-login/',
		'/guides/demo-login/',
	]) {
		assert.equal(isListedInSitemap(pathname), false, pathname);
	}
	for (const pathname of ['/', '/guides/demo-login-setup/', '/demo-login-help/', '/guides/private-beta/', '/privateer/', '/api/']) {
		assert.equal(isListedInSitemap(pathname), true, pathname);
	}
});

test('siteUrlFor keeps a base path and always ends in a slash', () => {
	assert.equal(siteUrlFor(new URL('https://docs.example.com'), '/'), 'https://docs.example.com/');
	assert.equal(siteUrlFor(new URL('https://example.com'), '/docs'), 'https://example.com/docs/');
	assert.equal(siteUrlFor(new URL('https://example.com/'), '/docs/'), 'https://example.com/docs/');
});

test("pageUrlFor gives a page the shape of Starlight's canonical link", () => {
	const directory = { siteUrl: 'https://example.com/docs/', format: /** @type {const} */ ('directory') };

	assert.equal(pageUrlFor({ ...directory, trailingSlash: 'ignore', id: '' }), 'https://example.com/docs/');
	assert.equal(pageUrlFor({ ...directory, trailingSlash: 'ignore', id: 'guides' }), 'https://example.com/docs/guides/');
	assert.equal(pageUrlFor({ ...directory, trailingSlash: 'always', id: 'a/b' }), 'https://example.com/docs/a/b/');
	assert.equal(pageUrlFor({ ...directory, trailingSlash: 'never', id: 'guides' }), 'https://example.com/docs/guides');
	assert.equal(pageUrlFor({ ...directory, trailingSlash: 'never', id: '' }), 'https://example.com/docs');
	assert.equal(
		pageUrlFor({ siteUrl: 'https://example.com/', format: 'file', trailingSlash: 'ignore', id: 'guides/setup' }),
		'https://example.com/guides/setup.html',
	);
	assert.equal(
		pageUrlFor({ siteUrl: 'https://example.com/', format: 'file', trailingSlash: 'ignore', id: '' }),
		'https://example.com/index.html',
	);
});
