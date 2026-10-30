/**
 * Starlight route middleware that adds generated JSON-LD to each page's head:
 * the template's, imported across the repo like the markdown negotiation
 * integration in `astro.config.mjs`, with this site's settings.
 *
 * No sitemap filter here, so every page is public: this site's `/demo-login/`
 * is a docs page about the template's demo login, not the login itself.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { structuredDataMiddleware } from '../../../packages/template/src/lib/structured-data-middleware.mjs';
import { lastmodFromGit } from './config/sitemap.mjs';
import { generateStructuredData, organization } from './config/structured-data.mjs';

export const onRequest = defineRouteMiddleware(
	structuredDataMiddleware({ generateStructuredData, organization, lastmodFromGit, isListed: () => true })
);
