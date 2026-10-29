/**
 * This site's sitemap dates and JSON-LD, read off the build: the template's
 * two features with this site's settings (`src/config/sitemap.mjs`,
 * `src/config/structured-data.mjs`).
 *
 * The dates need the repository's history. With it, a committed page that has
 * no date fails here. Without it, as on a shallow clone, or on Vercel when
 * `scripts/fetch-git-history.sh` cannot fetch the rest, that test skips and
 * the build passes undated.
 *
 * Run after `npm run build`:  `node --test tests/structured-data.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { contentRoutes } from '../../../packages/template/src/lib/sitemap-lastmod.mjs';
import { staticDir } from './helpers/static-dir.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = staticDir(ROOT);
const ORGANIZATION_ID = 'https://ekline.io/#organization';
const PRODUCT_ID = 'https://potluck.ekline.io/#product';

/** Every sitemap entry's path and `<lastmod>`, by path. */
const sitemapDates = new Map(
	[...readFileSync(join(STATIC, 'sitemap-0.xml'), 'utf8').matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, entry]) => [
		new URL(/** @type {string} */ (entry.match(/<loc>(.*?)<\/loc>/)?.[1])).pathname,
		entry.match(/<lastmod>(.*?)<\/lastmod>/)?.[1],
	])
);

/** Pages from `src/content/docs/`, by the path they are published at, without splash pages. */
const contentPages = contentRoutes(ROOT);
const articlePages = [...contentPages].filter(
	([, file]) => !/^template:\s*splash\s*$/m.test(readFileSync(join(ROOT, file), 'utf8'))
);

/** @param {string} path */
const generatedNodes = (path) =>
	[...readFileSync(join(STATIC, path, 'index.html'), 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi)]
		.filter(([, attrs]) => /\bdata-generated=["']?structured-data/i.test(attrs))
		.flatMap(([, , content]) => JSON.parse(content)['@graph']);

/** @param {string[]} args */
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

const historyIsComplete = (() => {
	try {
		return git(['rev-parse', '--is-shallow-repository']).trim() === 'false';
	} catch {
		return false;
	}
})();

/** Content files with at least one commit: a page not committed yet has no git date to give. */
const committedFiles = historyIsComplete
	? new Set(git(['log', '--relative', '--no-renames', '--format=', '--name-only', '--', 'src/content/docs']).split('\n'))
	: new Set();

test('the site-wide nodes name EkLine as publisher and Potluck Docs as the product', () => {
	const nodes = generatedNodes('');
	const company = nodes.find((node) => node['@type'] === 'Organization');
	const product = nodes.find((node) => node['@id'] === PRODUCT_ID);

	assert.equal(company?.['@id'], ORGANIZATION_ID);
	assert.equal(product?.name, 'Potluck Docs');
	assert.deepEqual(product?.publisher, { '@id': ORGANIZATION_ID });
	assert.deepEqual(nodes.find((node) => node['@type'] === 'WebSite')?.publisher, { '@id': ORGANIZATION_ID });
});

test('every docs page has one article about Potluck Docs and one breadcrumb', () => {
	assert.ok(articlePages.length > 0, 'no docs pages found under src/content/docs/');
	for (const [path] of articlePages) {
		const nodes = generatedNodes(path);
		const articles = nodes.filter((node) => node['@type'] === 'TechArticle');

		assert.equal(articles.length, 1, `${path}: ${articles.length} TechArticle nodes`);
		assert.deepEqual(articles[0].about, { '@id': PRODUCT_ID }, path);
		assert.equal(nodes.filter((node) => node['@type'] === 'BreadcrumbList').length, 1, `${path}: breadcrumbs`);
	}
});

test('every docs page carries its sitemap date as dateModified, or no date where the sitemap has none', () => {
	for (const [path] of articlePages) {
		const article = generatedNodes(path).find((node) => node['@type'] === 'TechArticle');

		assert.ok(sitemapDates.has(path), `${path} is not in the sitemap`);
		assert.equal(article?.dateModified, sitemapDates.get(path), path);
	}
});

test(
	'with the full git history, every committed page from src/content/docs has a sitemap date',
	{ skip: !historyIsComplete && 'the checkout is shallow or not a git repository, so the build has no git dates' },
	() => {
		const undated = [...contentPages]
			.filter(([path, file]) => committedFiles.has(file) && !sitemapDates.get(path))
			.map(([path]) => path);

		assert.deepEqual(undated, []);
	}
);
