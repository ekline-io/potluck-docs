/**
 * The sitemap's `<lastmod>` dates, against throwaway git repositories.
 *
 * Search engines use `<lastmod>` to decide what to recrawl and stop trusting
 * it once it claims changes that did not happen, so the failures that matter
 * are the quiet ones: a shallow clone giving every page the date of the commit
 * being built, a page mapped to the wrong file, a formatting pass dating every
 * page to the same day. Each test below builds the history it needs with fixed
 * commit dates and calls the same functions `astro.config.mjs` calls.
 *
 * Run: node --test tests/sitemap-lastmod.test.mjs
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
	SKIP_FILE_NAME,
	createLastmodLookup,
	createSitemapSerializer,
} from '../src/lib/sitemap-lastmod.mjs';

const tempDirs = [];

// These build real repositories. Without git on the machine the feature itself falls back, so only the tests skip.
const NO_GIT = spawnSync('git', ['--version']).status !== 0 && 'git is not installed';
const gitTest = (name, fn) => test(name, { skip: NO_GIT }, fn);

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Isolated from the developer's git config, so signing or hooks cannot break a fixture commit.
const FIXTURE_GIT_ENV = {
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_NOSYSTEM: '1',
	GIT_AUTHOR_NAME: 'Fixture',
	GIT_AUTHOR_EMAIL: 'fixture@example.com',
	GIT_COMMITTER_NAME: 'Fixture',
	GIT_COMMITTER_EMAIL: 'fixture@example.com',
};

const git = (cwd, args, date) =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, ...FIXTURE_GIT_ENV, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
	}).trim();

const makeTempDir = () => {
	const dir = mkdtempSync(join(tmpdir(), 'sitemap-lastmod-'));
	tempDirs.push(dir);
	return dir;
};

const createRepo = () => {
	const dir = makeTempDir();
	git(dir, ['init', '-q', '-b', 'main']);
	return dir;
};

const writePage = (root, relativePath, frontmatter = '', body = 'Body text.') => {
	const fullPath = join(root, 'src/content/docs', relativePath);
	mkdirSync(dirname(fullPath), { recursive: true });
	writeFileSync(fullPath, `---\ntitle: Fixture\n${frontmatter}\n---\n\n${body}\n`);
};

const commit = (repo, message, date) => {
	git(repo, ['add', '-A']);
	git(repo, ['commit', '-q', '-m', message], date);
	return git(repo, ['rev-parse', 'HEAD']);
};

const silent = () => {};

const lookupFor = (siteRoot, options = {}) => createLastmodLookup({ siteRoot, warn: silent, ...options });

gitTest('dates a page from the last commit that changed its file', () => {
	const repo = createRepo();
	writePage(repo, 'guides/setup.md');
	commit(repo, 'Add setup guide', '2026-01-10T09:00:00-07:00');
	writePage(repo, 'guides/setup.md', '', 'Rewritten.');
	commit(repo, 'Rewrite setup guide', '2026-02-20T10:00:00-07:00');

	assert.equal(lookupFor(repo)('/guides/setup/'), '2026-02-20T17:00:00.000Z');
});

gitTest('counts the commit that added a page, since docs pages carry no publish date', () => {
	const repo = createRepo();
	writePage(repo, 'guides/setup.md');
	commit(repo, 'Add setup guide', '2026-03-03T08:00:00Z');

	assert.equal(lookupFor(repo)('/guides/setup/'), '2026-03-03T08:00:00.000Z');
});

gitTest('prefers a lastUpdated date in frontmatter over git history', () => {
	const repo = createRepo();
	writePage(repo, 'guides/setup.md', 'lastUpdated: 2026-01-05');
	commit(repo, 'Add setup guide', '2026-05-01T12:00:00Z');

	assert.equal(lookupFor(repo)('/guides/setup/'), '2026-01-05T00:00:00.000Z');
});

gitTest('reads a lastUpdated date followed by a YAML comment, as YAML does', () => {
	const repo = createRepo();
	writePage(repo, 'plain.md', 'lastUpdated: 2026-01-05 # reviewed after launch');
	writePage(repo, 'quoted.md', "lastUpdated: '2026-01-06' # quoted, then a comment");
	commit(repo, 'Add pages', '2026-05-01T12:00:00Z');
	const lookup = lookupFor(repo);

	assert.equal(lookup('/plain/'), '2026-01-05T00:00:00.000Z');
	assert.equal(lookup('/quoted/'), '2026-01-06T00:00:00.000Z');
});

gitTest('ignores lastUpdated: true and false, which only toggle Starlight\'s footer date', () => {
	const repo = createRepo();
	writePage(repo, 'on.md', 'lastUpdated: true');
	writePage(repo, 'off.md', 'lastUpdated: false');
	commit(repo, 'Add pages', '2026-05-01T12:00:00Z');
	const lookup = lookupFor(repo);

	assert.equal(lookup('/on/'), '2026-05-01T12:00:00.000Z');
	assert.equal(lookup('/off/'), '2026-05-01T12:00:00.000Z');
});

gitTest('skips commits listed in the skip file', () => {
	const repo = createRepo();
	writePage(repo, 'guides/setup.md');
	commit(repo, 'Add setup guide', '2026-01-10T12:00:00Z');
	writePage(repo, 'guides/setup.md', '', 'Rewritten.');
	commit(repo, 'Rewrite setup guide', '2026-02-01T12:00:00Z');
	writePage(repo, 'guides/setup.md', '', '<Wrapper>Rewritten.</Wrapper>');
	const formattingPass = commit(repo, 'Wrap every page', '2026-04-01T12:00:00Z');
	writeFileSync(join(repo, SKIP_FILE_NAME), `# Formatting pass\n${formattingPass}\n`);

	assert.equal(lookupFor(repo)('/guides/setup/'), '2026-02-01T12:00:00.000Z');
});

gitTest('gives no lastmod to a page whose only commit is skipped', () => {
	const repo = createRepo();
	writePage(repo, 'imported.md');
	const migration = commit(repo, 'Import pages from the old site', '2026-06-27T12:00:00Z');
	writeFileSync(join(repo, SKIP_FILE_NAME), `${migration}  # migration\n`);

	assert.equal(lookupFor(repo)('/imported/'), undefined);
});

gitTest('maps index pages to their directory and the root index to /', () => {
	const repo = createRepo();
	writePage(repo, 'index.mdx');
	writePage(repo, 'guides/index.md');
	commit(repo, 'Add index pages', '2026-03-03T08:00:00Z');
	const lookup = lookupFor(repo);

	assert.equal(lookup('/'), '2026-03-03T08:00:00.000Z');
	assert.equal(lookup('/guides/'), '2026-03-03T08:00:00.000Z');
});

gitTest('uses a slug set in frontmatter, as Astro does', () => {
	const repo = createRepo();
	writePage(repo, 'old/name.md', "slug: 'guides/renamed'");
	commit(repo, 'Add page', '2026-03-03T08:00:00Z');
	const lookup = lookupFor(repo);

	assert.equal(lookup('/guides/renamed/'), '2026-03-03T08:00:00.000Z');
	assert.equal(lookup('/old/name/'), undefined);
});

gitTest('slugifies file names the way Astro builds page URLs', () => {
	const repo = createRepo();
	writePage(repo, 'Getting Started/First Steps.md');
	commit(repo, 'Add page', '2026-03-03T08:00:00Z');

	assert.equal(lookupFor(repo)('/getting-started/first-steps/'), '2026-03-03T08:00:00.000Z');
});

gitTest('ignores files whose name starts with an underscore, which Starlight does not publish', () => {
	const repo = createRepo();
	writePage(repo, '_partial.md');
	commit(repo, 'Add partial', '2026-03-03T08:00:00Z');

	assert.equal(lookupFor(repo)('/_partial/'), undefined);
});

gitTest('works when the site lives in a subdirectory of the repository', () => {
	const repo = createRepo();
	const siteRoot = join(repo, 'sites/docs');
	writePage(siteRoot, 'guides/setup.md');
	commit(repo, 'Add setup guide', '2026-03-03T08:00:00Z');

	assert.equal(lookupFor(siteRoot)('/guides/setup/'), '2026-03-03T08:00:00.000Z');
});

gitTest('strips a configured base from sitemap URLs', () => {
	const repo = createRepo();
	writePage(repo, 'guides/setup.md');
	commit(repo, 'Add setup guide', '2026-03-03T08:00:00Z');

	assert.equal(lookupFor(repo, { base: '/docs' })('/docs/guides/setup/'), '2026-03-03T08:00:00.000Z');
});

gitTest('ignores git history in a shallow clone, where every file shares the checkout commit', () => {
	const repo = createRepo();
	writePage(repo, 'dated.md', 'lastUpdated: 2026-01-05');
	writePage(repo, 'undated.md');
	commit(repo, 'Add pages', '2026-01-10T12:00:00Z');
	writeFileSync(join(repo, 'README.md'), 'unrelated');
	commit(repo, 'Unrelated change', '2026-09-01T12:00:00Z');
	const clone = join(makeTempDir(), 'clone');
	git(repo, ['clone', '-q', '--depth', '1', `file://${repo}`, clone]);
	const warnings = [];

	const lookup = createLastmodLookup({ siteRoot: clone, warn: (message) => warnings.push(message) });

	assert.equal(lookup('/dated/'), '2026-01-05T00:00:00.000Z');
	assert.equal(lookup('/undated/'), undefined);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /shallow/i);
});

gitTest('falls back to frontmatter and warns once in a repository with no commits yet', () => {
	const repo = createRepo();
	writePage(repo, 'dated.md', 'lastUpdated: 2026-01-05');
	writePage(repo, 'undated.md');
	const warnings = [];

	const lookup = createLastmodLookup({ siteRoot: repo, warn: (message) => warnings.push(message) });

	assert.equal(lookup('/dated/'), '2026-01-05T00:00:00.000Z');
	assert.equal(lookup('/undated/'), undefined);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /no commits/i);
});

test('falls back to frontmatter and warns once when the site is not in a git repository', () => {
	const siteRoot = makeTempDir();
	writePage(siteRoot, 'dated.md', 'lastUpdated: 2026-01-05');
	const warnings = [];

	const lookup = createLastmodLookup({ siteRoot, warn: (message) => warnings.push(message) });

	assert.equal(lookup('/dated/'), '2026-01-05T00:00:00.000Z');
	assert.equal(warnings.length, 1);
});

gitTest("the warning outside a git repository gives git's reason, not the command that failed", () => {
	const siteRoot = makeTempDir();
	writePage(siteRoot, 'page.md');
	const warnings = [];

	createLastmodLookup({ siteRoot, warn: (message) => warnings.push(message) });

	assert.match(warnings[0] ?? '', /not a git repository/);
	assert.doesNotMatch(warnings[0] ?? '', /Command failed/);
});

gitTest('fails, naming the file, when lastUpdated is neither a date nor a boolean', () => {
	const repo = createRepo();
	writePage(repo, 'broken.md', "lastUpdated: 'last Tuesday'");
	commit(repo, 'Add page', '2026-03-03T08:00:00Z');

	assert.throws(() => lookupFor(repo), /src\/content\/docs\/broken\.md/);
});

gitTest('fails, naming the line, when the skip file holds something other than a full commit hash', () => {
	const repo = createRepo();
	writePage(repo, 'page.md');
	const sha = commit(repo, 'Add page', '2026-03-03T08:00:00Z');
	// A shortened hash would silently match nothing, letting the skipped commit's date through.
	writeFileSync(join(repo, SKIP_FILE_NAME), `${sha.slice(0, 9)}\n`);

	assert.throws(() => lookupFor(repo), /line 1/);
});

// `@astrojs/sitemap` catches anything `serialize` throws, logs it, and writes no sitemap while the build passes.
test('the sitemap serializer rejects a bad skip file when it is created, before the sitemap is written', () => {
	const siteRoot = makeTempDir();
	writePage(siteRoot, 'page.md');
	writeFileSync(join(siteRoot, SKIP_FILE_NAME), 'abc1234\n');

	assert.throws(() => createSitemapSerializer({ siteRoot, warn: silent }), /line 1/);
});

gitTest('the sitemap serializer adds lastmod to docs pages and leaves other entries alone', async () => {
	const repo = createRepo();
	writePage(repo, 'guides/setup.md');
	commit(repo, 'Add setup guide', '2026-03-03T08:00:00Z');
	const serialize = createSitemapSerializer({ siteRoot: repo, warn: silent });

	const docsPage = await serialize({ url: 'https://docs.example.org/guides/setup/' });
	const otherPage = await serialize({ url: 'https://docs.example.org/api/' });

	assert.deepEqual(docsPage, { url: 'https://docs.example.org/guides/setup/', lastmod: '2026-03-03T08:00:00.000Z' });
	assert.deepEqual(otherPage, { url: 'https://docs.example.org/api/' });
});
