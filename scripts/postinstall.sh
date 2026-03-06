#!/usr/bin/env bash
set -euo pipefail

# Link the Spindle story format so the compiler can find it
mkdir -p storyformats
ln -sfn ../node_modules/@rohal12/spindle/dist/pkg storyformats/spindle

# If there's no .git directory, this is a fresh degit clone.
# Remove template-only files that aren't needed for user projects.
if [ ! -d ".git" ]; then
  rm -rf docs .github/workflows/deploy-docs.yml CHANGELOG.md

  # Remove docs-only dependencies and scripts
  npm pkg delete scripts.docs:dev scripts.docs:build scripts.docs:preview 2>/dev/null || true
  npm pkg delete devDependencies.vitepress 2>/dev/null || true

  echo "Cleaned up template-only files (docs, deploy-docs workflow, changelog)."
fi
