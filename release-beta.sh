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
    echo "IMPORTANT: once X.Y.Z-betaN ships, X.Y.Z is burned - Obsidian's"
    echo "stock update checker cannot compare pre-release suffixes, so a"
    echo "later stable release reusing that exact base version will never"
    echo "reach users who installed the beta. The real stable release must"
    echo "ship higher than X.Y.Z (bump at least the patch). See"
    echo "CONTRIBUTING.md for details."
    echo "Exiting."

    exit 1
fi

if [[ $(git status --porcelain) ]]; then
  echo "Changes in the git repo."
  echo "Exiting."

  exit 1
fi

NEW_VERSION=$1
MINIMUM_OBSIDIAN_VERSION=$2
BRANCH_NAME="beta/${NEW_VERSION}"

echo "Updating to version ${NEW_VERSION} with minimum obsidian version ${MINIMUM_OBSIDIAN_VERSION}"

read -p "Continue? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
  # master is a protected branch - commits must land via PR, not a direct push.
  echo "Creating branch ${BRANCH_NAME}"
  git checkout -b "${BRANCH_NAME}"

  echo "Updating package.json"
  TEMP_FILE=$(mktemp)
  jq ".version |= \"${NEW_VERSION}\"" package.json > "$TEMP_FILE" || exit 1
  mv "$TEMP_FILE" package.json

  echo "Updating manifest-beta.json"
  TEMP_FILE=$(mktemp)
  jq ".version |= \"${NEW_VERSION}\" | .minAppVersion |= \"${MINIMUM_OBSIDIAN_VERSION}\"" manifest-beta.json > "$TEMP_FILE" || exit 1
  mv "$TEMP_FILE" manifest-beta.json

  echo "Updating versions.json"
  TEMP_FILE=$(mktemp)
  jq ". += {\"${NEW_VERSION}\": \"${MINIMUM_OBSIDIAN_VERSION}\"}" versions.json > "$TEMP_FILE" || exit 1
  mv "$TEMP_FILE" versions.json

  echo "Updating package-lock.json"
  npm install

  read -p "Create git commit, push, and open a pull request? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]
  then
    git add package.json package-lock.json manifest-beta.json versions.json
    git commit -m "Update to version ${NEW_VERSION}"
    git push --set-upstream origin "${BRANCH_NAME}"

    echo "Creating a pull request..."
    gh pr create \
      --title "Update to version ${NEW_VERSION}" \
      --body "Beta version bump to ${NEW_VERSION} (minimum Obsidian version ${MINIMUM_OBSIDIAN_VERSION})." \
      --base master \
      --head "${BRANCH_NAME}"

    echo ""
    echo "Pull request created. Review and merge it, then build and publish the beta release from master:"
    echo ""
    echo "  git checkout master && git pull"
    echo "  npm run build"
    echo "  cp manifest-beta.json /tmp/manifest.json"
    echo "  gh release create \"${NEW_VERSION}\" --prerelease --title \"${NEW_VERSION}\" \\"
    echo "    --notes \"<release notes>\" \\"
    echo "    dist/main.js /tmp/manifest.json styles.css"
  fi
else
  echo "Exiting."
  exit 1
fi
