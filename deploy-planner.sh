#!/bin/bash
cd "$(dirname "$0")"
TMPDIR=$(mktemp -d)
cp palau-trip-planner.html "$TMPDIR/index.html"
npx wrangler pages deploy "$TMPDIR" --project-name palau-planner --branch main
rm -rf "$TMPDIR"
