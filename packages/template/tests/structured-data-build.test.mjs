/**
 * The JSON-LD in the built pages, against the site's own content and sitemap.
 *
 * `structured-data.test.mjs` proves what each node holds. This file checks
 * what only a real build can show: that every page that should carry a
 * generated article and breadcrumb carries exactly one of each, whether
 * generated or the page's own, and that the generated date is the sitemap's.
 *
 * Only the generated scripts (`data-generated="structured-data"`) are judged
 * for their content. A block a page writes itself is left as its author wrote
 * it, and judging it here would fail a deploy over content the generator
 * deliberately does not touch.
 *
 * Run: npm run build && node --test tests/structured-data-build.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { staticDir } from './helpers/static-dir.mjs';
import { enabledReferences, routeFor } from '../src/config/api-reference.mjs';
import { generateStructuredData } from '../src/config/structured-data.mjs';
import { contentRoutes } from '../src/lib/sitemap-lastmod.mjs';
import { ARTICLE_TYPES } from '../src/lib/structured-data.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STATIC = staticDir(ROOT);
const generatorOff = !generateStructuredData && 'generateStructuredData is off';

const sitemapEntries = readdirSync(STATIC)
	.filter((file) => /^sitemap-\d+\.xml$/.test(file))
	.flatMap((file) =>
		[...readFileSync(join(STATIC, file), 'utf8').matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, entry = '']) => ({
			path: new URL(/<loc>([^<]*)<\/loc>/.exec(entry)?.[1] ?? '').pathname,
			lastmod: /<lastmod>([^<]*)<\/lastmod>/.exec(entry)?.[1],
		})),
	);

// Astro's `base`, read from where `@astrojs/sitemap` lists each sitemap file, the one place the build records it.
const readSitemapBase = () => {
	const index = join(STATIC, 'sitemap-index.xml');
	const loc = existsSync(index) ? /<loc>([^<]*)<\/loc>/.exec(readFileSync(index, 'utf8'))?.[1] : undefined;
	return loc ? new URL(loc).pathname.replace(/[^/]*$/, '') : '/';
};
const BASE_PREFIX = readSitemapBase().replace(/\/+$/, '');
const withoutBase = (path) => (BASE_PREFIX && path.startsWith(`${BASE_PREFIX}/`) ? path.slice(BASE_PREFIX.length) : path);

/** @param {string} path A page's URL path, as the sitemap lists it. */
const htmlFor = (path) => {
	const route = withoutBase(path);
	const file = route.endsWith('.html') ? join(STATIC, route) : join(STATIC, route, 'index.html');
	return readFileSync(file, 'utf8');
};

/**
 * @param {string} html
 * @returns {Array<{ generated: boolean, content: string }>}
 */
const jsonLdScripts = (html) =>
	[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
		.filter(([, attrs = '']) => /\btype=["']?application\/ld\+json/.test(attrs))
		.map(([, attrs = '', content = '']) => ({ generated: /\bdata-generated=["']?structured-data/.test(attrs), content }));

/**
 * Top-level and `@graph` nodes. A page's own block that does not parse counts
 * for nothing, as it does for the generator.
 *
 * @param {string} content
 * @returns {Array<Record<string, unknown>>}
 */
const nodesIn = (content) => {
	let parsed;
	try {
		parsed = JSON.parse(content);
	} catch {
		return [];
	}
	const flatten = (value) =>
		Array.isArray(value)
			? value.flatMap(flatten)
			: value && typeof value === 'object'
				? [value, ...flatten(value['@graph'] ?? [])]
				: [];
	return flatten(parsed).filter((node) => node['@type'] !== undefined);
};

const typesOf = (node) => [node['@type']].flat();

const pageNodes = (html) => ({
	all: jsonLdScripts(html).flatMap(({ content }) => nodesIn(content)),
	generated: jsonLdScripts(html)
		.filter(({ generated }) => generated)
		.flatMap(({ content }) => nodesIn(content)),
});

const ROUTES = contentRoutes(ROOT);
const isSplash = (file) => {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(ROOT, file), 'utf8'))?.[1] ?? '';
	return /^template:[ \t]*['"]?splash['"]?[ \t]*(?:#.*)?$/m.test(frontmatter);
};

const docsPagesInSitemap = sitemapEntries
	.map((entry) => ({ ...entry, file: ROUTES.get(withoutBase(entry.path)) }))
	.filter((entry) => entry.file !== undefined);
const eligible = docsPagesInSitemap.filter(({ file }) => !isSplash(file));
const splash = docsPagesInSitemap.filter(({ file }) => isSplash(file));

const isArticle = (node) => typesOf(node).some((type) => ARTICLE_TYPES.includes(type));
const isBreadcrumb = (node) => typesOf(node).includes('BreadcrumbList');

test('the sitemap and the content routes agree on page URLs', { skip: generatorOff }, () => {
	assert.ok(sitemapEntries.length > 0, 'no sitemap entries found; did the build run?');
	// Without this, a URL shape the route matching does not know would leave every per-page test checking nothing.
	const contentPages = [...ROUTES.values()].filter((file) => !isSplash(file)).length;
	assert.ok(contentPages === 0 || eligible.length > 0, 'no sitemap URL matched a docs page; check the URL shape');
});

// A page's own nodes count towards "has one", but only generated ones can be wrong:
// judging the page's own blocks would fail a deploy over content the generator leaves alone.
test('every eligible page has an article node and a BreadcrumbList, and at most one generated of each', { skip: generatorOff }, () => {
	const wrong = eligible.flatMap(({ path }) => {
		const { all, generated } = pageNodes(htmlFor(path));
		const problems = [
			all.some(isArticle) ? undefined : 'no article node',
			all.some(isBreadcrumb) ? undefined : 'no BreadcrumbList',
			generated.filter(isArticle).length > 1 ? 'two generated article nodes' : undefined,
			generated.filter(isBreadcrumb).length > 1 ? 'two generated BreadcrumbLists' : undefined,
		].filter(Boolean);
		return problems.length ? [`${path}: ${problems.join(', ')}`] : [];
	});

	assert.deepEqual(wrong, []);
});

test('splash pages get the site graph only', { skip: generatorOff }, () => {
	const wrong = splash.flatMap(({ path }) => {
		const generatedTypes = pageNodes(htmlFor(path)).generated.flatMap(typesOf);
		return generatedTypes.includes('TechArticle') || generatedTypes.includes('BreadcrumbList')
			? [`${path}: ${generatedTypes.join(', ')}`]
			: [];
	});

	assert.deepEqual(wrong, []);
});

const allBuiltPages = readdirSync(STATIC, { recursive: true })
	.filter((rel) => typeof rel === 'string' && rel.endsWith('.html'))
	.map((rel) => rel.split(sep).join('/'));

test('no page has two nodes with the same @id', { skip: generatorOff }, () => {
	const duplicates = allBuiltPages.flatMap((rel) => {
		const { all, generated } = pageNodes(readFileSync(join(STATIC, rel), 'utf8'));
		const generatedIds = new Set(generated.map((node) => node['@id']));
		const counts = all.reduce((seen, node) => seen.set(node['@id'], (seen.get(node['@id']) ?? 0) + 1), new Map());
		// Only a clash involving a generated node is the generator's to answer for.
		return [...generatedIds].filter((id) => counts.get(id) > 1).map((id) => `${rel}: ${id}`);
	});

	assert.deepEqual(duplicates, []);
});

test('generated scripts are valid JSON and contain no raw <', { skip: generatorOff }, () => {
	const scripts = allBuiltPages.flatMap((rel) =>
		jsonLdScripts(readFileSync(join(STATIC, rel), 'utf8'))
			.filter(({ generated }) => generated)
			.map(({ content }) => ({ rel, content })),
	);
	const broken = scripts.flatMap(({ rel, content }) => {
		if (content.includes('<')) return [`${rel}: raw <`];
		try {
			const parsed = JSON.parse(content);
			return Array.isArray(parsed['@graph']) && parsed['@graph'].length > 0 ? [] : [`${rel}: no @graph`];
		} catch (err) {
			return [`${rel}: ${err instanceof Error ? err.message : String(err)}`];
		}
	});

	assert.ok(scripts.length > 0, 'no generated scripts found in the build');
	assert.deepEqual(broken, []);
});

// Holds with git dates off too: the sitemap then has no <lastmod>, and the generated node must have no date.
test('generated dateModified equals the sitemap lastmod, and is absent where the sitemap has none', { skip: generatorOff }, () => {
	const mismatches = eligible.flatMap(({ path, lastmod }) => {
		const article = pageNodes(htmlFor(path)).generated.find((node) => typesOf(node).includes('TechArticle'));
		return article && article.dateModified !== lastmod
			? [`${path}: generated ${article.dateModified}, sitemap ${lastmod}`]
			: [];
	});

	assert.deepEqual(mismatches, []);
});

test(
	'pages outside the docs collection get the site graph only',
	{ skip: generatorOff || (enabledReferences.length === 0 && 'every API reference is disabled') },
	() => {
		const wrong = enabledReferences.flatMap((reference) => {
			const route = routeFor(reference);
			const generatedTypes = pageNodes(htmlFor(`${BASE_PREFIX}${route}`)).generated.flatMap(typesOf);
			return generatedTypes.includes('WebSite') &&
				!generatedTypes.includes('TechArticle') &&
				!generatedTypes.includes('BreadcrumbList')
				? []
				: [`${route}: ${generatedTypes.join(', ') || 'no generated nodes'}`];
		});

		assert.deepEqual(wrong, []);
	},
);
