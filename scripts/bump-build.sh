#!/usr/bin/env bash
# Give the site a new build id so open copies show "New version available"
# and browsers fetch the new css/js instead of a cached copy.
# Usage: scripts/bump-build.sh            (uses the date and time)
#        scripts/bump-build.sh my-build-id
set -euo pipefail
cd "$(dirname "$0")/.."
id="${1:-$(date -u +%Y%m%d%H%M)}"
sed -i -E \
  -e "s/(name=\"budsbox-build\" content=\")[^\"]+/\1${id}/" \
  -e "s/(app\.(css|js)\?v=)[^\"]+/\1${id}/g" \
  -e "s/(const APP_BUILD = \")[^\"]+/\1${id}/" \
  index.html
echo "build id: ${id}"
