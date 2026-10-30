/**
 * Starlight route middleware that adds generated JSON-LD to each page's head.
 *
 * What it adds and how to turn it off: `src/config/structured-data.mjs`. The
 * work is in `src/lib/structured-data-middleware.mjs`; this file gives it this
 * site's settings.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { lastmodFromGit } from './config/sitemap.mjs';
import { generateStructuredData, organization } from './config/structured-data.mjs';
import { isListedInSitemap } from './lib/public-pages.mjs';
import { structuredDataMiddleware } from './lib/structured-data-middleware.mjs';

export const onRequest = defineRouteMiddleware(
	structuredDataMiddleware({ generateStructuredData, organization, lastmodFromGit, isListed: isListedInSitemap })
);
