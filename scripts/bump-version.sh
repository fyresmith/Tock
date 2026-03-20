#!/bin/bash
set -e

NEW_VERSION=$1
if [ -z "$NEW_VERSION" ]; then
  echo "Usage: ./scripts/bump-version.sh 0.2.0"
  exit 1
fi

sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
# Update only the first `version = "..."` line in Cargo.toml (the package version)
sed -i '' "1,/^version = /s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push origin main --follow-tags
