#!/usr/bin/env bash
# Automated pre-push checks, mirroring everything CI does short of the full
# NXF_VER matrix: nf-core CLI version pin, pre-commit hooks, a
# declared-floor version check, nf-test suite, and nf-core lint.
# Fail-fast (set -e) so the first broken step stops the script.
#
# pre-commit is now included here -- it's still wired into
# .github/workflows/linting.yml too (duplicated on purpose), so a local run
# catches formatting issues before CI does rather than after.
#
# Unlike quality-control-pipeline's run-test-suite.sh, there's no commit
# message lint step here: this repo squash-merges PRs and checks the PR title
# instead (.github/workflows/ci-pr-title-lint.yml), which only exists on GitHub.
#
# Not covered here, left to CI: .github/workflows/nf-test.yml's NXF_VER
# matrix only ever runs the full nf-test suite under this machine's single
# installed Nextflow version (see step 4) -- it does NOT also run the full
# suite under every CI-pinned version (24.10.5, 25.10.4, latest-everything),
# since that would mean installing/switching Nextflow versions and roughly
# quadrupling this script's runtime. Step 3 only smoke-checks the floor.
#
# Note on dependencies: the dry-run and lint steps need nothing but the
# tools themselves, but the real (non-dry-run) nf-test suite still spins up
# Docker containers, and its pipeline-level tests (tests/default.nf.test, and
# tests/stub.nf.test, whose samplesheet and PED checks read the inputs for
# real even under -stub) need the S3 test dataset synced locally (data-test/
# -- see CLAUDE.md's "Test dataset" section). This script does NOT include the ad hoc, manually
# -inspected `nextflow run` smoke tests -- see scripts/run-smoke-tests.sh for
# those.
#
# Usage: scripts/run-test-suite.sh

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
export NXF_FILE_ROOT="$PWD"

require() {
    command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found on PATH." >&2; exit 1; }
}
require git
require pre-commit
require nextflow
require nf-test
require nf-core

step() { echo; echo "==> $1"; }

# If .snap file needs to be generated.
# nf-test test modules/local/slivar_expr --updateSnapshot

# Mirrors linting.yml's "nf-core" job, which reads nf_core_version from
# .nf-core.yml and installs exactly that version before linting -- a locally
# drifted nf-core CLI could pass/fail differently than CI without this check.
nf_core_pinned=$(grep -oP "nf_core_version:\s*\K[0-9.]+" .nf-core.yml)
nf_core_installed=$(nf-core --version 2>&1 | grep -oP "nf-core, version \K[0-9.]+")
step "[1/6] Verify installed nf-core CLI ($nf_core_installed) matches .nf-core.yml's pin ($nf_core_pinned)"
if [[ "$nf_core_installed" != "$nf_core_pinned" ]]; then
    echo "  ERROR: installed nf-core ($nf_core_installed) != .nf-core.yml's nf_core_version ($nf_core_pinned)." >&2
    echo "  Run: pip install nf-core==$nf_core_pinned" >&2
    exit 1
fi

step "[2/6] pre-commit (prettier, trailing-whitespace, end-of-file-fixer, editorconfig-checker)"
pre-commit run --all-files

# Only CI actually runs the pipeline under multiple pinned Nextflow versions
# (see .github/workflows/nf-test.yml's NXF_VER matrix) -- this just checks
# the one boundary that's most likely to be wrong: the floor manifest.nextflowVersion
# itself claims to support. `--help` is NOT enough for this: nf-schema answers
# --help straight from nextflow_schema.json without ever executing main.nf's
# body, so a broken top-level statement wouldn't surface. `-preview` does
# fully execute/compile the DSL2 script -- including that top-level code --
# while skipping real task execution, so it's as fast and Docker-free as
# --help but actually catches this class of bug.
nxf_floor=$(grep -oP "nextflowVersion\s*=\s*'!?>=\K[0-9.]+" nextflow.config)
step "[3/6] Verify the pipeline launches under its declared nextflowVersion floor ($nxf_floor)"
nxf_floor_check_dir=$(mktemp -d)
trap 'rm -rf "$nxf_floor_check_dir"' EXIT
NXF_VER="$nxf_floor" nextflow run . -profile test,docker -preview --outdir "$nxf_floor_check_dir"

# Remember that running 'nf-test test' essentially discovers and run .nf.test files
step "[4/6] nf-test dry-run (syntax check only, no execution)"
nf-test test --dryRun

step "[5/6] nf-test full suite (--profile test,docker)"
nf-test test --profile test,docker

step "[6/6] nf-core pipelines lint --release"
nf-core pipelines lint --release

echo
echo "All checks passed."
