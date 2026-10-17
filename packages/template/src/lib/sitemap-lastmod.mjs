/**
 * `<lastmod>` dates for the sitemap, from each docs page's git history.
 *
 * `@astrojs/sitemap` can only set one `lastmod` for the whole site, and a
 * date that changes on every build tells search engines nothing. They use
 * `<lastmod>` to decide what to recrawl, and stop trusting it once it claims
 * changes that did not happen. So a page gets the first of:
 *
 *   1. its `lastUpdated` frontmatter, when that holds a date (Starlight's own
 *      field, which also overrides the footer's "Last updated");
 *   2. the date of the last commit that changed its file, leaving out commits
 *      listed in `.sitemap-lastmod-ignore-revs` at the site root;
 *   3. nothing: a page with no usable history gets no `<lastmod>`, never a
 *      guessed one.
 *
 * The commit that added a file counts, because docs pages carry no publish
 * date of their own: that commit is when the page appeared.
 *
 * Kept free of `astro:*` imports so `astro.config.mjs` and the `node --test`
 * suites call the same code.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

/**
 * Commits that changed many pages without changing what they say, such as a
 * formatting pass. The format is git's `.git-blame-ignore-revs`: one full
 * commit hash per line, `#` starts a comment.
 */
export const SKIP_FILE_NAME = '.sitemap-lastmod-ignore-revs';

const CONTENT_DIRECTORY = 'src/content/docs';
// The extensions Starlight's docs loader reads, plus Markdoc's when that integration is on.
const CONTENT_FILE = /\.(markdown|mdown|mkdn|mkd|mdwn|md|mdx|mdoc)$/;
const FULL_COMMIT_HASH = /^[0-9a-f]{40}$/;
const GIT_LOG_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/**
 * Astro's default page id slugifies each path segment with `github-slugger`.
 * This reproduces it for the characters a file name realistically holds,
 * without depending on a package the template does not install directly.
 *
 * @param {string} segment
 * @returns {string}
 */
const slugifySegment = (segment) =>
	segment
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{Nd}\p{Nl}\p{Pc} -]/gu, '')
		.replace(/ /g, '-');

/**
 * Reads the two top-level frontmatter keys this needs without a YAML parser:
 * both are plain scalars when they are set at all.
 *
 * @param {string} text
 * @returns {{ lastUpdated?: string, slug?: string }}
 */
const readFrontmatter = (text) => {
	const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
	const value = (key) => {
		const raw = new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, 'm').exec(block)?.[1];
		if (!raw) return undefined;
		// A quoted scalar ends at its closing quote; an unquoted one at ` #`, where a YAML comment starts.
		const quoted = /^(['"])(.*?)\1(?:\s+#.*)?$/.exec(raw);
		return quoted ? quoted[2] : raw.replace(/\s+#.*$/, '');
	};
	return { lastUpdated: value('lastUpdated'), slug: value('slug') };
};

/**
 * @param {string} value
 * @param {string} description
 * @returns {string}
 */
const toIsoDate = (value, description) => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`[sitemap] ${description} is not a date: "${value}"`);
	}
	return date.toISOString();
};

/**
 * @param {string} contentPath Path inside the content directory, e.g. `guides/setup.md`.
 * @param {string | undefined} slug A `slug` set in frontmatter, which Astro uses as the id as is.
 * @returns {string} The page's path, e.g. `/guides/setup/`.
 */
const routeFor = (contentPath, slug) => {
	const id =
		slug?.replace(/^\/+|\/+$/g, '') ??
		contentPath
			.replace(CONTENT_FILE, '')
			.split('/')
			.map(slugifySegment)
			.join('/')
			.replace(/(^|\/)index$/, '');
	return id ? `/${id}/` : '/';
};

/** @param {string} filePath */
const toPosix = (filePath) => filePath.split('\\').join('/');

/**
 * @param {string} directory
 * @returns {string[]} Paths relative to `directory`, with `/` separators.
 */
const listContentFiles = (directory) =>
	existsSync(directory)
		? readdirSync(directory, { recursive: true, withFileTypes: true })
				.filter((entry) => entry.isFile() && CONTENT_FILE.test(entry.name) && !entry.name.startsWith('_'))
				.map((entry) => posix.relative(toPosix(directory), toPosix(join(entry.parentPath, entry.name))))
		: [];

/**
 * @param {string} siteRoot
 * @param {string[]} args
 * @returns {string}
 */
const runGit = (siteRoot, args) =>
	execFileSync('git', ['-C', siteRoot, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: GIT_LOG_MAX_BUFFER_BYTES,
	});

/**
 * A shallow clone holds one or a few commits, so every file's "last commit" is
 * one of those, and every page would share the date of the commit being built.
 * A repository with no commits yet makes `git log` fail outright.
 *
 * @param {string} siteRoot
 * @returns {string | undefined} Why git history cannot be used, or undefined when it can.
 */
const gitHistoryUnavailableReason = (siteRoot) => {
	let isShallow;
	try {
		isShallow = runGit(siteRoot, ['rev-parse', '--is-shallow-repository']).trim() === 'true';
	} catch (err) {
		// git's own reason ("fatal: not a git repository…") is on stderr; without git there is only the spawn error.
		const stderr = err && typeof err === 'object' && 'stderr' in err && err.stderr ? String(err.stderr).trim() : '';
		const message = stderr || (err instanceof Error ? err.message : String(err));
		return `git history is not available (${message.split('\n')[0]})`;
	}
	if (isShallow) return 'the checkout is a shallow clone';
	try {
		runGit(siteRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']);
	} catch {
		return 'the repository has no commits yet';
	}
	return undefined;
};

/**
 * @param {string} siteRoot
 * @returns {Set<string>}
 */
const readSkippedCommits = (siteRoot) => {
	const skipFile = join(siteRoot, SKIP_FILE_NAME);
	if (!existsSync(skipFile)) return new Set();
	const hashes = readFileSync(skipFile, 'utf8')
		.split('\n')
		.map((line, index) => ({ entry: line.replace(/#.*/, '').trim(), lineNumber: index + 1 }))
		.filter(({ entry }) => entry.length > 0)
		.map(({ entry, lineNumber }) => {
			// A shortened hash would match nothing and let the skipped commit's date through unnoticed.
			if (!FULL_COMMIT_HASH.test(entry)) {
				throw new Error(
					`[sitemap] ${SKIP_FILE_NAME} line ${lineNumber}: expected a full 40-character commit hash, got "${entry}"`,
				);
			}
			return entry;
		});
	return new Set(hashes);
};

/**
 * One `git log` for every page at once, keeping the newest counted commit per
 * file. `--relative` keeps paths relative to the site root, which is not
 * always the repository root. `--no-renames` because a blob-less partial clone
 * would otherwise fetch old file contents one at a time to detect renames.
 *
 * @param {string} siteRoot
 * @param {Set<string>} skippedCommits
 * @returns {Map<string, string>} Path from the site root to an ISO date.
 */
const readLastCommitDates = (siteRoot, skippedCommits) => {
	const log = runGit(siteRoot, [
		'-c',
		'core.quotePath=false',
		'log',
		'--relative',
		'--no-renames',
		'--format=%x00%H %cI',
		'--name-status',
		'--',
		CONTENT_DIRECTORY,
	]);

	return log
		.split('\0')
		.slice(1)
		.map((record) => {
			const [header = '', ...changes] = record.split('\n');
			const [hash = '', committedAt = ''] = header.split(' ');
			const files = changes
				.map((line) => line.split('\t'))
				.filter(([status, file]) => (status === 'A' || status === 'M') && file)
				.map(([, file]) => /** @type {string} */ (file));
			return { hash, committedAt, files };
		})
		.filter(({ hash }) => !skippedCommits.has(hash))
		.flatMap(({ hash, committedAt, files }) => {
			const date = toIsoDate(committedAt, `commit date of ${hash}`);
			return files.map((file) => /** @type {[string, string]} */ ([file, date]));
		})
		.reduce(
			// ISO strings in UTC sort chronologically, so the larger string is the later commit.
			(latest, [file, date]) => ((latest.get(file) ?? '') >= date ? latest : latest.set(file, date)),
			/** @type {Map<string, string>} */ (new Map()),
		);
};

/**
 * @param {string} siteRoot
 * @returns {Array<{ route: string, file: string, lastUpdated?: string }>} One entry per docs page,
 *   with `file` relative to the site root. Each file is read once.
 */
const readContentPages = (siteRoot) => {
	const contentDirectory = join(siteRoot, CONTENT_DIRECTORY);
	return listContentFiles(contentDirectory).map((contentPath) => {
		const { slug, lastUpdated } = readFrontmatter(readFileSync(join(contentDirectory, contentPath), 'utf8'));
		return { route: routeFor(contentPath, slug), file: posix.join(CONTENT_DIRECTORY, contentPath), lastUpdated };
	});
};

/**
 * Every docs page's path, mapped to its source file relative to the site root.
 *
 * @param {string} siteRoot
 * @returns {Map<string, string>}
 */
export const contentRoutes = (siteRoot) => new Map(readContentPages(siteRoot).map(({ route, file }) => [route, file]));

/**
 * @typedef {object} LookupOptions
 * @property {string} siteRoot The directory holding `src/content/docs/`.
 * @property {(message: string) => void} warn Called once when git history cannot be used.
 * @property {string} [base] Astro's `base`, when the site sets one.
 */

/**
 * @param {LookupOptions} options
 * @param {Set<string>} skippedCommits
 * @returns {(pathname: string) => string | undefined}
 */
const buildLastmodLookup = ({ siteRoot, warn, base = '/' }, skippedCommits) => {
	const historyUnavailable = gitHistoryUnavailableReason(siteRoot);
	if (historyUnavailable) {
		warn(
			`[sitemap] Not using git dates for lastmod: ${historyUnavailable}. Docs pages fall back to their lastUpdated frontmatter, or no lastmod.`,
		);
	}

	const lastCommitDates = historyUnavailable ? new Map() : readLastCommitDates(siteRoot, skippedCommits);

	const lastmodByRoute = new Map(
		readContentPages(siteRoot).map(({ route, file, lastUpdated }) => {
			// `true` and `false` only switch Starlight's footer date on or off.
			const frontmatterDate =
				lastUpdated && lastUpdated !== 'true' && lastUpdated !== 'false'
					? toIsoDate(lastUpdated, `lastUpdated in ${file}`)
					: undefined;
			return [route, frontmatterDate ?? lastCommitDates.get(file)];
		}),
	);

	const basePrefix = base.replace(/\/+$/, '');
	return (pathname) => {
		const withoutBase =
			basePrefix && pathname.startsWith(`${basePrefix}/`) ? pathname.slice(basePrefix.length) : pathname;
		return lastmodByRoute.get(withoutBase.endsWith('/') ? withoutBase : `${withoutBase}/`);
	};
};

/**
 * The skip file is read even when git is unavailable, so a broken one fails
 * every build, not only full-history ones.
 *
 * @param {LookupOptions} options
 * @returns {(pathname: string) => string | undefined} The `<lastmod>` for a sitemap URL's path.
 */
export const createLastmodLookup = (options) => buildLastmodLookup(options, readSkippedCommits(options.siteRoot));

/**
 * A `serialize` hook for `@astrojs/sitemap`. Git runs on the first entry, not
 * when `astro.config.mjs` loads, so `astro dev` never pays for it. The skip
 * file is checked when it loads: `@astrojs/sitemap` catches anything
 * `serialize` throws and skips writing the sitemap while the build passes.
 *
 * @param {LookupOptions} options
 * @returns {(item: { url: string, lastmod?: string }) => { url: string, lastmod?: string }}
 */
export const createSitemapSerializer = (options) => {
	const skippedCommits = readSkippedCommits(options.siteRoot);
	/** @type {((pathname: string) => string | undefined) | undefined} */
	let lookup;
	return (item) => {
		lookup ??= buildLastmodLookup(options, skippedCommits);
		const lastmod = lookup(new URL(item.url).pathname);
		return lastmod ? { ...item, lastmod } : item;
	};
};
