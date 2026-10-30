#!/bin/sh
# Vercel clones only recent history, so the sitemap's git dates
# (src/config/sitemap.mjs) would find none. The repository is public, so the
# build can fetch the rest from GitHub without a token. Runs before the build
# (vercel.json). If the fetch fails, the build still runs: the sitemap logs a
# warning and dates no pages.
set -u
REPOSITORY=https://github.com/ekline-io/potluck-docs.git

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	echo "fetch-git-history: not a git checkout; the sitemap will have no git dates"
	exit 0
fi
if [ "$(git rev-parse --is-shallow-repository)" != true ]; then
	echo "fetch-git-history: full history already present"
	exit 0
fi

# The exact commit being built, so a branch that moved on since does not matter.
commit=${VERCEL_GIT_COMMIT_SHA:-$(git rev-parse HEAD)}
if git fetch --quiet --unshallow --no-tags "$REPOSITORY" "$commit"; then
	if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
		echo "fetch-git-history: fetched $commit but the checkout is still shallow; the sitemap will have no git dates" >&2
	else
		echo "fetch-git-history: fetched full history of $commit ($(git rev-list --count HEAD) commits)"
	fi
else
	echo "fetch-git-history: could not fetch full history; the sitemap will have no git dates" >&2
fi
