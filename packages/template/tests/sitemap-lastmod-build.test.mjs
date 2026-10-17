/**
 * The built sitemap's `<lastmod>` dates, against the site's own pages.
 *
 * `sitemap-lastmod.test.mjs` proves the date rules on throwaway repositories.
 * This file checks the two things only a real build can show: that the path
 * the resolver computes for each of your content files is the path Starlight
 * actually published, and that the dates in the written sitemap are the
 * resolver's. A page whose path is computed wrongly gets no date at all, which
 * no other test would notice.
 *
 * Both run against the same checkout as the build, so they hold on a shallow
 * clone as well: there the build and the resolver both fall back to
 * frontmatter.
 *
 * Run: npm run build && node --test tests/sitemap-lastmod-build.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { staticDir } from './helpers/static-dir.mjs';
import { lastmodFromGit } from '../src/config/sitemap.mjs';
import { contentRoutes, createLastmodLookup } from '../src/lib/sitemap-lastmod.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STATIC = staticDir(ROOT);

const sitemapEntries = readdirSync(STATIC)
	.filter((file) => /^sitemap-\d+\.xml$/.test(file))
	.flatMap((file) =>
		[...readFileSync(join(STATIC, file), 'utf8').matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, entry = '']) => ({
			path: new URL(/<loc>([^<]*)<\/loc>/.exec(entry)?.[1] ?? '').pathname,
			lastmod: /<lastmod>([^<]*)<\/lastmod>/.exec(entry)?.[1],
		})),
	);

// `@astrojs/sitemap` leaves out the 404 page, and production builds leave out drafts.
const isPublishedInSitemap = (route, file) => {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(ROOT, file), 'utf8'))?.[1] ?? '';
	return route !== '/404/' && !/^draft:[ \t]*true[ \t]*(?:#.*)?$/m.test(frontmatter);
};

test('every published docs page is in the sitemap at the path the resolver computes for it', () => {
	const sitemapPaths = new Set(sitemapEntries.map((entry) => entry.path));
	const missing = [...contentRoutes(ROOT)]
		.filter(([route, file]) => isPublishedInSitemap(route, file))
		.filter(([route]) => !sitemapPaths.has(route))
		.map(([route, file]) => `${route} (${file})`);

	assert.ok(sitemapEntries.length > 0, 'no sitemap entries found; did the build run?');
	assert.deepEqual(missing, []);
});

test('the sitemap carries the dates the resolver gives', { skip: !lastmodFromGit && 'lastmodFromGit is off' }, () => {
	const lookup = createLastmodLookup({ siteRoot: ROOT, warn: () => {} });
	const mismatches = sitemapEntries
		.filter((entry) => entry.lastmod !== lookup(entry.path))
		.map((entry) => `${entry.path}: sitemap ${entry.lastmod}, resolver ${lookup(entry.path)}`);

	assert.deepEqual(mismatches, []);
});
