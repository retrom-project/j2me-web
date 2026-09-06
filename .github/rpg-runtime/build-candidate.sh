#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
output=${1:?absolute empty output directory is required}
node "$root/scripts/package-candidate.mjs" prepare "$output"
J2ME_PFB_CANDIDATE_BUILD=1 bash "$root/scripts/build-runtime.sh"
node "$root/scripts/package-candidate.mjs" finalize "$output"
