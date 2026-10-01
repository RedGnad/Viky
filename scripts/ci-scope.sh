#!/usr/bin/env bash
# What a change asks of the CI (the founder, 1 Oct 2026). Reads the changed paths on standard input, one per line,
# and prints two answers as `name=true|false`, in the form a workflow step writes to its outputs.
#
#   contracts  whether forge runs: its formatting, its build, its sizes and its tests.
#   browser    whether the application is built and its screens are walked in a browser.
#
# The policy tests run on every change, so they are not an answer here.
#
# Two things are skipped and no third:
# - the browser, when the change touches documents and nothing else;
# - forge, when the change touches no Solidity file and nothing that moves money.
#
# Nothing is lightened for what touches money: contracts, relays and payment routes keep the whole suite. So forge is
# skipped only when every changed path is on the short list below, the screens, their words and the tests written in
# TypeScript, and it runs for every path that list does not name. A path nobody thought of runs everything.
set -euo pipefail

contracts=false
browser=false
seen=false

while IFS= read -r path; do
  [ -n "$path" ] || continue
  seen=true

  # Documents: nothing to build, nothing to walk, nothing forge reads.
  case "$path" in
    *.md | docs/* | LICENSE) continue ;;
  esac
  browser=true

  # Solidity, wherever it is, and what forge is configured by.
  case "$path" in
    *.sol | contracts/* | script/* | lib/* | foundry.toml | remappings.txt)
      contracts=true
      continue
      ;;
  esac

  # The routes are where money is asked to move: none of them is on the list, whatever it is called.
  case "$path" in
    app/api/*)
      contracts=true
      continue
      ;;
  esac

  # Screens, their words, and the tests written in TypeScript: no contract, no relay, no payment route.
  case "$path" in
    app/* | public/* | test/* | src/sentences.ts | src/design-tokens.ts | src/consumer-words.ts) ;;
    src/gift-live.ts | src/gift-moment.ts | src/gift-voice.ts | src/moments.ts | src/motion.ts | src/theme.ts) ;;
    *) contracts=true ;;
  esac
done

# No path at all is not a change that was measured: everything runs.
if [ "$seen" = false ]; then
  contracts=true
  browser=true
fi

echo "contracts=$contracts"
echo "browser=$browser"
