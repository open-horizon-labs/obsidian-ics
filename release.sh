#!/bin/bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <new-version> <minimum-obsidian-version>"
    echo ""
    echo "IMPORTANT: if any <new-version>-betaN pre-release has already"
    echo "shipped, do not reuse <new-version> here - Obsidian's stock"
    echo "update checker can't compare pre-release suffixes, so users who"
    echo "installed the beta would never see this release as an update."
    echo "Bump at least the patch version higher than the beta's base."
    echo "See CONTRIBUTING.md for details."
    exit 1
fi

NEW_VERSION=$1
MINIMUM_OBSIDIAN_VERSION=$2
BRANCH_NAME="release/${NEW_VERSION}"

# Ensure no uncommitted changes
if [[ $(git status --porcelain) ]]; then
  echo "Uncommitted changes detected. Please commit or stash them before running the release script."
  exit 1
fi

echo "Preparing release ${NEW_VERSION} with minimum Obsidian version ${MINIMUM_OBSIDIAN_VERSION}"

# Create and switch to a new branch
git checkout -b "${BRANCH_NAME}"

# Update version in package.json
echo "Updating package.json..."
jq ".version = \"${NEW_VERSION}\"" package.json > package.json.tmp && mv package.json.tmp package.json

# Update version in manifest.json
echo "Updating manifest.json..."
jq ".version = \"${NEW_VERSION}\" | .minAppVersion = \"${MINIMUM_OBSIDIAN_VERSION}\"" manifest.json > manifest.json.tmp && mv manifest.json.tmp manifest.json

# Update versions.json
echo "Updating versions.json..."
jq ". += {\"${NEW_VERSION}\": \"${MINIMUM_OBSIDIAN_VERSION}\"}" versions.json > versions.json.tmp && mv versions.json.tmp versions.json

# Install dependencies to update package-lock.json
echo "Updating package-lock.json..."
npm install

# Commit changes
git add package.json package-lock.json manifest.json versions.json
git commit -m "Release ${NEW_VERSION}"

# Push branch to remote
git push --set-upstream origin "${BRANCH_NAME}"

# Create a pull request
echo "Creating a pull request..."
gh pr create \
  --title "Release ${NEW_VERSION}" \
  --body "This pull request updates the version to ${NEW_VERSION} and sets the minimum Obsidian version to ${MINIMUM_OBSIDIAN_VERSION}." \
  --base master \
  --head "${BRANCH_NAME}"

echo "Pull request created. Please review and merge it to trigger the release workflow."
