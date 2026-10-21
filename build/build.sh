#!/usr/bin/env bash
# Builds one self-contained HTML (or a paste-in fragment) from a scene and logs the result.
# Usage: build/build.sh <scene.json> [out.html] [--fragment | --embed-test]
#   --fragment    writes only the block to paste into an existing page (styles, book, scripts)
#   --embed-test  wraps the book in placeholder text, to test scrolling inside a page
# The log goes next to the output (popup-build.log); builds into this project's out/ log to logs/build.log.
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"

scene="" dest="" flag=""
for arg in "$@"; do
  case "$arg" in
    --embed-test|--fragment) flag="$arg" ;;
    *) if [[ -z "$scene" ]]; then scene="$arg"; else dest="$arg"; fi ;;
  esac
done
[[ -z "$scene" ]] && { echo "usage: build.sh <scene.json> [out.html] [--fragment | --embed-test]"; exit 2; }
name="$(basename "$scene" .json)"
[[ -z "$dest" ]] && dest="$here/out/$name${flag:+-${flag#--}}.html"
mkdir -p "$(dirname "$dest")"
destdir="$(cd "$(dirname "$dest")" && pwd)"
if [[ "$destdir" == "$here/out" ]]; then logfile="$here/logs/build.log"; else logfile="$destdir/popup-build.log"; fi
mkdir -p "$(dirname "$logfile")"

summary="$(node "$here/build/build.mjs" "$scene" "$dest" $flag)"
code=$?

node -e '
  const r = JSON.parse(process.argv[1]);
  const lines = [`${process.argv[2]} scene=${r.scene} out=${r.out} validation=${r.ok ? "ok" : "FAILED"} size=${r.ok ? (r.bytes / 1024).toFixed(1) + " KB" : "-"}`];
  for (const e of r.errors || []) lines.push(`  error: ${e}`);
  for (const w of r.warnings || []) lines.push(`  warning: ${w}`);
  console.log(lines.join("\n"));
' "$summary" "$(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$logfile"
exit $code
