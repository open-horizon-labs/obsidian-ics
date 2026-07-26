#!/bin/bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
    echo "Must provide exactly two arguments."
    echo "First one must be the new version number."
    echo "Second one must be the minimum obsidian version for this release."
    echo ""
    echo "Example usage:"
    echo "./release-beta.sh 1.12.1-beta1 1.9.12"
    echo ""
    echo "DO NOT bump the base version (X.Y.Z) for every beta fix. While"
    echo "you're still iterating on the same round of testing, keep X.Y.Z"
    echo "fixed and only increment the -betaN suffix (-beta1, -beta2,"
    echo "-beta3, ...) - see 1.12.1-beta1..beta4 in versions.json for"
    echo "precedent. Only bump X.Y.Z when starting a fresh beta cycle."
    echo ""
    echo "IMPORTANT: once X.Y.Z-betaN ships (for any N), X.Y.Z is burned -"
    echo "Obsidian's stock update checker cannot compare pre-release"
    echo "suffixes, so a later stable release reusing that exact base"
    echo "version will never reach users who installed the beta. The real"
    echo "stable release, once betas are done, must ship higher than"
    echo "X.Y.Z (bump at least the patch). See CONTRIBUTING.md for"
    echo "details."
    exit 1
fi

NEW_VERSION=$1
MINIMUM_OBSIDIAN_VERSION=$2
BRANCH_NAME="beta/${NEW_VERSION}"

# Ensure no uncommitted changes
if [[ $(git status --porcelain) ]]; then
  echo "Uncommitted changes detected. Please commit or stash them before running the release script."
  exit 1
fi

echo "Preparing beta ${NEW_VERSION} with minimum Obsidian version ${MINIMUM_OBSIDIAN_VERSION}"

# master is a protected branch - commits must land via PR, not a direct push.
git checkout -b "${BRANCH_NAME}"

echo "Updating package.json..."
jq ".version = \"${NEW_VERSION}\"" package.json > package.json.tmp && mv package.json.tmp package.json

echo "Updating manifest-beta.json..."
jq ".version = \"${NEW_VERSION}\" | .minAppVersion = \"${MINIMUM_OBSIDIAN_VERSION}\"" manifest-beta.json > manifest-beta.json.tmp && mv manifest-beta.json.tmp manifest-beta.json

echo "Updating versions.json..."
jq ". += {\"${NEW_VERSION}\": \"${MINIMUM_OBSIDIAN_VERSION}\"}" versions.json > versions.json.tmp && mv versions.json.tmp versions.json

echo "Updating package-lock.json..."
npm install

# Commit changes
git add package.json package-lock.json manifest-beta.json versions.json
git commit -m "Update to version ${NEW_VERSION}"

# Push branch to remote
git push --set-upstream origin "${BRANCH_NAME}"

# Create a pull request
echo "Creating a pull request..."
gh pr create \
  --title "Update to version ${NEW_VERSION}" \
  --body "Beta version bump to ${NEW_VERSION} (minimum Obsidian version ${MINIMUM_OBSIDIAN_VERSION})." \
  --base master \
  --head "${BRANCH_NAME}"

echo "Pull request created. Please review and merge it to trigger the automated beta release."
echo "Once merged, draft real release notes with:"
echo "  ./scripts/draft-release-notes.sh ${NEW_VERSION} <previous-version>"
