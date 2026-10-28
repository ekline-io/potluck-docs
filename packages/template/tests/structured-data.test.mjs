/**
 * Unit tests for the JSON-LD builders in `src/lib/structured-data.mjs`.
 *
 * The fixtures with `docs.ekline.io` URLs are a real site's hand-written
 * blocks, copied as they were before the generator replaced them: the
 * generator has to reproduce every `@id` in them exactly, or the site's
 * entities would silently split in two.
 *
 * Run: node --test tests/structured-data.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSiteGraph, organizationIds } from '../src/lib/structured-data.mjs';

const EKLINE_ORGANIZATION = {
	name: 'EkLine',
	url: 'https://ekline.io/',
	description:
		'Streamline your documentation workflow with EkLine. Designed for software teams, our platform helps engineers, product managers and technical writers create, maintain, and optimize high-quality product, user, and API guides effortlessly.',
	logo: 'https://ekline.io/assets/images/favicon/android-chrome-512x512.png',
	sameAs: ['https://www.linkedin.com/company/ekline'],
	product: {
		type: 'WebApplication',
		name: 'EkLine',
		description:
			'EkLine turns support conversations, engineering changes, and feature releases into accurate, self-serve documentation, automatically.',
		url: 'https://ekline.io/',
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

test("buildSiteGraph reproduces docs.ekline.io's hand-written site graph", () => {
	// The `@graph` from `structuredDataHead` in docs.ekline.io's astro.config.mjs, in its own order.
	const handWritten = [
		{
			'@type': 'Organization',
			'@id': 'https://ekline.io/#organization',
			name: 'EkLine',
			url: 'https://ekline.io/',
			description:
				'Streamline your documentation workflow with EkLine. Designed for software teams, our platform helps engineers, product managers and technical writers create, maintain, and optimize high-quality product, user, and API guides effortlessly.',
			logo: {
				'@type': 'ImageObject',
				'@id': 'https://ekline.io/#logo',
				url: 'https://ekline.io/assets/images/favicon/android-chrome-512x512.png',
			},
			sameAs: ['https://www.linkedin.com/company/ekline'],
		},
		{
			'@type': 'WebSite',
			'@id': 'https://docs.ekline.io/#website',
			url: 'https://docs.ekline.io/',
			name: 'EkLine Documentation',
			publisher: { '@id': 'https://ekline.io/#organization' },
			inLanguage: 'en-US',
		},
		{
			'@type': 'WebApplication',
			'@id': 'https://ekline.io/#product',
			name: 'EkLine',
			description:
				'EkLine turns support conversations, engineering changes, and feature releases into accurate, self-serve documentation, automatically.',
			url: 'https://ekline.io/',
			applicationCategory: 'DeveloperApplication',
			publisher: { '@id': 'https://ekline.io/#organization' },
		},
	];

	const graph = buildSiteGraph({
		siteUrl: 'https://docs.ekline.io/',
		siteTitle: 'EkLine Documentation',
		lang: 'en-US',
		organization: EKLINE_ORGANIZATION,
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
