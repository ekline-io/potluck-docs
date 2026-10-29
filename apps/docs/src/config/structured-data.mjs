/**
 * Structured data (JSON-LD) for this site, the same feature the template ships
 * in `packages/template/src/config/structured-data.mjs`; its docs are on the
 * Structured data page here.
 *
 * The company values are the ones docs.ekline.io publishes, so both sites
 * name the same EkLine (`https://ekline.io/#organization`). The product is
 * Potluck Docs, whose identity comes from its own `url`
 * (`https://potluck.ekline.io/#product`) and so does not collide with
 * EkLine's product on docs.ekline.io (`https://ekline.io/#product`).
 */
import { checkOrganization } from '../../../../packages/template/src/lib/structured-data.mjs';

export const generateStructuredData = true;

/** @type {import('../../../../packages/template/src/config/structured-data.mjs').Organization} */
export const organization = {
	name: 'EkLine',
	url: 'https://ekline.io/',
	description:
		'Streamline your documentation workflow with EkLine. Designed for software teams, our platform helps engineers, product managers and technical writers create, maintain, and optimize high-quality product, user, and API guides effortlessly.',
	logo: 'https://ekline.io/assets/images/favicon/android-chrome-512x512.png',
	sameAs: ['https://www.linkedin.com/company/ekline'],
	product: {
		type: 'SoftwareApplication',
		name: 'Potluck Docs',
		description:
			'An Astro Starlight documentation template with a logged-in experience and interactive API references pre-wired, ready to fork and customize.',
		url: 'https://potluck.ekline.io/',
		applicationCategory: 'DeveloperApplication',
	},
};

checkOrganization(organization);
