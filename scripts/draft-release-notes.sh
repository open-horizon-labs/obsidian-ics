#!/bin/bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <version-being-released> <previous-version-tag>"
    echo ""
    echo "Drafts a release-notes skeleton from every PR merged between"
    echo "the two tags, so you're editing real content instead of"
    echo "starting from GitHub's generic \"Automated release for"
    echo "version X\" text. Does NOT publish anything - it only writes a"
    echo "file for you to review, rewrite the top summary of, and then"
    echo "apply yourself:"
    echo ""
    echo "  gh release edit <version> --notes-file <file> --draft=false"
    echo ""
    echo "Example:"
    echo "  $0 1.14.3 1.14.0"
    exit 1
fi

NEW_VERSION=$1
PREVIOUS_VERSION=$2
OUT_FILE="/tmp/release-notes-${NEW_VERSION}.md"

if ! git rev-parse "${PREVIOUS_VERSION}" >/dev/null 2>&1; then
  echo "Tag '${PREVIOUS_VERSION}' not found. Check versions.json or 'git tag --sort=-creatordate' for the right previous version."
  exit 1
fi

PR_NUMBERS=$(git log "${PREVIOUS_VERSION}..HEAD" --merges --oneline \
  | grep -oE '#[0-9]+' \
  | tr -d '#' \
  | sort -un)

if [ -z "${PR_NUMBERS}" ]; then
  echo "No merged PRs found between ${PREVIOUS_VERSION} and HEAD. Nothing to draft."
  exit 1
fi

{
  echo "**<one-line outcome-oriented summary - fill this in>**"
  echo ""
  echo "- <rewrite these as user-facing bullets, drop anything dev-only>"
  echo ""
  echo "### Merged PRs since ${PREVIOUS_VERSION} (raw material, prune before publishing)"
  echo ""
  for num in ${PR_NUMBERS}; do
    gh pr view "${num}" --json title,url --jq '"- " + .title + " ([#'"${num}"'](" + .url + "))"' 2>/dev/null || true
  done
} > "${OUT_FILE}"

echo "Drafted $(echo "${PR_NUMBERS}" | wc -w | tr -d ' ') merged PR(s) into:"
echo "  ${OUT_FILE}"
echo ""
echo "Review/rewrite it, then apply with:"
echo "  gh release edit ${NEW_VERSION} --notes-file ${OUT_FILE} --draft=false"
