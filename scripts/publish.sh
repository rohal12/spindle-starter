#!/usr/bin/env bash
set -euo pipefail

# Publish script for Spindle stories
# Supports: github-pages, itch.io (via butler)

usage() {
  cat <<EOF
Usage: $0 <target> [options]

Targets:
  pages          Deploy to GitHub Pages (triggers workflow via gh CLI)
  itch           Deploy to itch.io via butler

Options for 'itch':
  -u, --user     itch.io username (or set ITCH_USER env var)
  -g, --game     itch.io game/project name (or set ITCH_GAME env var)
  -c, --channel  Butler channel (default: html5)

Examples:
  $0 pages
  $0 itch --user myname --game my-story
  $0 itch  # uses ITCH_USER and ITCH_GAME env vars
EOF
  exit 1
}

build() {
  echo "Building production story..."
  npm run build
  echo "Build complete: dist/index.html"
}

deploy_pages() {
  if ! command -v gh &>/dev/null; then
    echo "Error: GitHub CLI (gh) is required. Install it from https://cli.github.com"
    exit 1
  fi

  echo "Triggering GitHub Pages deployment workflow..."
  gh workflow run deploy-pages.yml
  echo "Deployment triggered. Check status with: gh run list --workflow=deploy-pages.yml"
}

deploy_itch() {
  local user="${ITCH_USER:-}"
  local game="${ITCH_GAME:-}"
  local channel="html5"

  while [[ $# -gt 0 ]]; do
    case $1 in
      -u|--user)    user="$2"; shift 2 ;;
      -g|--game)    game="$2"; shift 2 ;;
      -c|--channel) channel="$2"; shift 2 ;;
      *) echo "Unknown option: $1"; usage ;;
    esac
  done

  if [[ -z "$user" || -z "$game" ]]; then
    echo "Error: itch.io username and game name are required."
    echo "Set ITCH_USER/ITCH_GAME env vars or pass --user/--game flags."
    exit 1
  fi

  if ! command -v butler &>/dev/null; then
    echo "Error: butler is required. Install it from https://itch.io/docs/butler/"
    exit 1
  fi

  build

  local target="${user}/${game}:${channel}"
  echo "Pushing to itch.io: ${target}"
  butler push dist/ "$target"
  echo "Published to https://${user}.itch.io/${game}"
}

[[ $# -lt 1 ]] && usage

target="$1"
shift

case "$target" in
  pages) deploy_pages ;;
  itch)  deploy_itch "$@" ;;
  *)     echo "Unknown target: $target"; usage ;;
esac
