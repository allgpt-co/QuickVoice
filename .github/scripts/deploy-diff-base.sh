#!/usr/bin/env bash
# Compare with a deployment that actually succeeded, not merely the previous push.
set -euo pipefail
: "${GITHUB_REPOSITORY:?}" "${SOURCE_SHA:?}" "${DEPLOY_JOB:?}"
empty_tree="$(git hash-object -w -t tree /dev/null)"
runs="$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs?branch=main&status=success&per_page=100" --jq '.workflow_runs[] | [.id, .head_sha] | @tsv')"
while IFS=$'\t' read -r run_id sha; do
  [ -n "$run_id" ] || continue
  [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || continue
  [ "$sha" != "$SOURCE_SHA" ] || continue
  git merge-base --is-ancestor "$sha" "$SOURCE_SHA" || continue
  jobs="$(gh api --paginate "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}/jobs?per_page=100" --jq '.jobs[] | select(.conclusion == "success") | .name')"
  if grep -Fqx "$DEPLOY_JOB" <<< "$jobs"; then
    printf '%s\n' "$sha"
    exit 0
  fi
done <<< "$runs"
# No verified deployment in the bounded history: deploy all relevant tracked files.
printf '%s\n' "$empty_tree"
