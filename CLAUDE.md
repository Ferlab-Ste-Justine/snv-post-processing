# CLAUDE.md

This file gives Claude Code the context it needs to work effectively in this repository.

## Project overview

`Ferlab-Ste-Justine/snv-post-processing` (named `Post-processing-Pipeline` until BIOINFO-238; older docs, CHANGELOG entries and PR links use that name) is a Nextflow DSL2 pipeline for family-based variant analysis of GVCFs. It performs joint genotyping, tags low-quality variants, optionally normalizes, annotates with VEP, tags variants by mode of inheritance with slivar, and prioritizes variants with exomiser.

The repo is structured following nf-core conventions. It is _not_ a published nf-core pipeline.

Nextflow version range: `>=24.10.5, <26.0.0`. Pipeline version is tracked in `nextflow.config` (`manifest.version`) and `.nf-core.yml` (`template.version`).

## High-level pipeline flow

The single entry workflow is in `main.nf`, which calls `SNV_POST_PROCESSING` in `workflows/snv_post_processing.nf`. That workflow is gated by the `--step` parameter so the pipeline can be entered at five points:

1. `genotype` (default): standardize input VCFs → optional gVCF record sanitization → `COMBINEGVCFS` → `GATK4_GENOTYPEGVCFS` → tag artifacts (VQSR for WGS, GATK `VariantFiltration` hard-filtering for WES)
2. `normalize`: starts from filtered VCFs → `SPLIT_MULTIALLELICS` (bcftools norm)
3. `annotation`: starts from normalized VCFs → VEP (`VCF_ANNOTATE_ENSEMBLVEP`); cache is downloaded via `ENSEMBLVEP_DOWNLOAD` when `--download_cache` is set
4. `inheritance`: starts from VEP-annotated VCFs → `SLIVAR_INHERITANCE` (tags by mode of inheritance, detects compound heterozygotes)
5. `exomiser`: starts from annotated/normalized VCFs → `EXOMISER`

Two optional branches run when their tool is included via `--tools` (comma-separated, e.g. `vep,exomiser,slivar`):

- **slivar inheritance** (`isToolIncluded('slivar')` or `--step inheritance`) — tags variants by mode of inheritance and identifies compound hets via `SLIVAR_INHERITANCE`. Requires a `familyPed` column in the samplesheet.
- **exomiser** — only runs for families that have a `familyPheno` phenopacket. Picks WES vs. WGS analysis YAML based on `meta.sequencingType`.

The WES/WGS distinction is load-bearing: it controls both the artifact-tagging method (VQSR vs. hard-filter) and the exomiser analysis file. Sequencing type comes from the `sequencingType` column of the samplesheet.

## Repository layout

```
main.nf                      # Entry point — calls PIPELINE_INITIALISATION, FERLABSTEJUSTINE_SNV_POST_PROCESSING, PIPELINE_COMPLETION
nextflow.config              # Params, profiles, per-process resources, manifest
nextflow_schema.json         # Authoritative parameter schema (use this, not the README)
nf-test.config               # nf-test runner config (profile "test")
workflows/snv_post_processing.nf  # Main SNV_POST_PROCESSING workflow — step gating + inlined stage logic (standardize, gVCF sanitization, artifact tagging, VEP/slivar/exomiser branches); the old helper closures were inlined in v3.0.0 (their names survive only as `ch_output_from_*` channels)
subworkflows/local/          # sanitize_gvcf_records, vqsr, slivar_inheritance, channel_create_csv, utils_nfcore_snv_post_processing_pipeline
subworkflows/nf-core/        # utils_nextflow_pipeline, utils_nfcore_pipeline, utils_nfschema_plugin, vcf_annotate_ensemblvep
modules/local/               # combine_gvcfs, exomiser, gatk4/applyvqsr, slivar/{expr,compoundhets}, split_multiallelics
modules/nf-core/             # bcftools (annotate/filter/norm/view), ensemblvep (vep, download), gatk4 (genotypegvcfs, variantfiltration, variantrecalibrator)
conf/                        # base.config, modules.config, slivar.config, igenomes.config, test.config, test_full.config
assets/                      # TestSampleSheet.csv, schema_input.json, slivar-functions.js, exomiser/ (default analysis YAMLs)
docs/                        # usage.md, output.md, reference_data.md
```

## How to run

Typical invocation (from the README):

```bash
nextflow run -c cluster.config Ferlab-Ste-Justine/snv-post-processing -r "v3.0.0" \
    -params-file params.json \
    --input samplesheet.csv \
    --outdir results/dir \
    --tools vep,exomiser
```

Important conventions:

- Pass parameters via CLI flags or `-params-file` (JSON/YAML). **Do not** put params in a `-c` config file — `-c` is reserved for resource/infrastructure tuning. The `docs/usage.md` and `nextflow.config` comments both call this out.
- `--tools` is a comma-separated list. Membership is checked with `isToolIncluded` / `isVepToolIncluded` / `isExomiserToolIncluded` (in `subworkflows/local/utils_nfcore_snv_post_processing_pipeline/utils`).
- `--step` defaults to `genotype`. Other valid values: `normalize`, `annotation`, `exomiser`, `inheritance`.

### Test dataset

The test data is expected to be accessible locally under the launch directory. Before testing the pipeline, verify that the test-data directory exists.
The data lives in a private AWS S3 bucket `s3://ferlab-public-dataset/nextflow/snv-post-processing/V7/data-test` and in a private CEPH S3 bucket `s3://cqdg-prod-file-import/test-datasets/snv-post-processing/V7/data-test`.
In CI, `nf-test.yml` and `ci-full-run.yml` both download it through the `.github/actions/copy-test-data` composite action, the only place CI defines the S3 path. When the dataset version changes, update it there, in `scripts/run-smoke-tests.sh`, in `tests/nextflow.config` (`pipelines_testdata_base_path`, which nf-core lint requires but no test reads), and here.

### Stub / quick smoke test

```bash
nextflow run Ferlab-Ste-Justine/snv-post-processing -profile test,docker -stub
```

`-stub` runs the `stub:` block of each process instead of the real `script:` block — useful for verifying wiring without real data or reference downloads.

`tests/stub.nf.test` runs the pipeline with `-stub` once per route (`--tools` subsets, WES-only, `download_cache`, each `--step` entry point) and checks how many tasks each process ran, so a stage that silently gets no input fails a test. It still needs `data-test/`: samplesheet validation and the PED-against-VCF check read the inputs for real.

### Test profile

If running locally:

- Make sure Docker Desktop is installed and running.

```bash
nextflow run Ferlab-Ste-Justine/snv-post-processing -profile test,docker
```

If running on ARM hardware, add the `arm` profile to pull ARM-compatible images:

```bash
nextflow run Ferlab-Ste-Justine/snv-post-processing -profile test,docker,arm
```

To clean-up outputs, run `nextflow clean -f`.

For the manual smoke-test routine (debug+test profile, plain test profile, and a VEP merged-cache check) as a single command, run `scripts/run-smoke-tests.sh` — it verifies `data-test/` is synced and Docker is running before starting, and leaves existing output directories in place rather than wiping them.

### Tests (nf-test)

`nf-test` is the testing framework. Config in `nf-test.config` sets `profile "test"` (add `docker` on the command line, e.g. `--profile test,docker`). nf-core upstream tests are excluded via the `ignore` glob.

If running locally,

- Make sure to run `export NXF_FILE_ROOT=$PWD` to allow nf-core's `nf-test` framework to find test files.

```bash
nf-test test                         # run all tests
nf-test test --profile test,docker --tag pipeline          # run the entire pipeline test
nf-test test --profile test,docker modules/local/exomiser  # target one module/subworkflow
```

Test snapshots live alongside each module as `tests/main.nf.test.snap`.

To clean-up test outputs, run `nf-test clean` or manually delete the `.test_output/` directory.

`scripts/run-test-suite.sh` runs the full nf-test suite (unfiltered — every discoverable `.nf.test` file, so nothing new gets silently missed the way a hand-picked path list can) as a single pre-push gate, along with lint (see below), pre-commit, an installed-nf-core-CLI-version check, and a launch check under the pipeline's declared minimum Nextflow version.

### Linting

CI workflows live in `.github/workflows/`: `linting.yml` (pre-commit + nf-core lint), `nf-test.yml` (sharded nf-test, using the composite actions in `.github/actions/`), `ci-full-run.yml` (full `-profile test` pipeline run), and `ci-pr-title-lint.yml` (the PR title must look like `<type>: <TICKET-123> <description>`, e.g. `fix: BIOINFO-231 pin actions/checkout`; PRs are squash-merged, so the title becomes the commit message on `main`). Run lint locally with:

```bash
nf-core pipelines lint --release
```

`.nf-core.yml` carries lint overrides — several nf-core-template files are deliberately not present (e.g. `CODE_OF_CONDUCT.md`, nf-core logos, AWS CI workflows) because this is a Ferlab workflow, not a published nf-core pipeline. Don't reintroduce those files; instead update `.nf-core.yml` if you need to change lint behavior.

To format the files before commiting run:

```bash
pre-commit run --all-files
```

`nf-core pipelines lint --release` and `pre-commit run --all-files` are also bundled into `scripts/run-test-suite.sh`, alongside the full nf-test suite — duplicated on purpose with `.github/workflows/linting.yml` so formatting issues surface locally before CI does.

## Samplesheet format

Required columns depend on `--step`. See `assets/schema_input.json` for the authoritative schema; `docs/usage.md` has worked examples. Summary:

- Default (`genotype`): `familyId, sample, sequencingType, gvcf` (+ optional `familyPheno`, `familyPed`)
- `normalize`: `familyId, sample, sequencingType, vcf` (+ optional `tbi`)
- `annotation` / `exomiser`: `familyId, sequencingType, vcf` (+ optional `tbi`, `familyPheno` required for exomiser)

`sequencingType` must be `WES` or `WGS`. `familyPheno` (phenopacket YAML/JSON) must be identical for every member of a family; same rule for `familyPed`.

## Working in this codebase

A few patterns worth knowing before editing:

- **Channel shape convention.** Most VCF channels carry `[meta, vcf, tbi]`. After a `BCFTOOLS_*` / `GATK4_*` call, the index is usually emitted separately and joined back: `out.vcf.join(out.index)` for the nf-core bcftools modules, `out.vcf.join(out.tbi)` for GATK4 and VEP.
- **Software versions.** nf-core modules report their versions through the `versions` topic channel, which `SNV_POST_PROCESSING` collects; don't mix their outputs into `ch_versions`. Local modules still emit `versions.yml`, mixed into `ch_versions`. Reading a topic needs `nextflow.preview.topic` on Nextflow 24.10, which `main.nf` sets only below 25.04 (25.04+ fails if it's set).
- **Per-process resources** live in `nextflow.config` under `process { withName: '...' }`, gated by the `check_max(...)` function and the `max_cpus / max_memory / max_disk / max_time` params. When adding a new process, follow the same `errorStrategy = 'retry'` + `task.attempt`-scaled pattern.
- **Hard filters** for WES are defined as a list of `[name, expression]` pairs in `nextflow.config` (`params.hardFilters`). VQSR tranches/annotations are in the same block.
- **Reference inputs** are resolved at the top of `SNV_POST_PROCESSING` from `params.referenceGenome` + `params.referenceGenomeFasta` (the Fasta lives _inside_ the referenceGenome directory; `.fai` and `.dict` are derived from the Fasta path).
- **Adding an nf-core module:** use `nf-core modules install <tool>` so `modules.json` stays consistent. Local-only logic goes under `modules/local/`.
- **Updating nf-core modules:** the `container` overrides in `conf/modules.config` pin the tools that actually run (VEP 114.2, bcftools 1.20, GATK 4.5.0.0); keep them, so a module update never changes results. Some components are deliberately held behind their latest version because newer ones break on Nextflow 24.10 or in our pinned containers; `docs/journal.md` lists them and the checks to run before updating.
- **Schema and params stay in sync.** `nextflow_schema.json` is the source of truth for parameter validation (driven by the `nf-schema` plugin, `nf-schema@2.1.0` — migrated from `nf-validation` in v3.0.0). When adding a param, update both `nextflow.config` defaults and the schema.
- **Samplesheet `sample`/`familyId` are not cross-checked against file content.** `BCFTOOLS_VIEW` (standardize) never inspects or renames the actual sample name embedded in the gVCF/VCF header, so a samplesheet typo or swapped file goes undetected — everything downstream that matches on sample names (GATK, slivar/PED, exomiser/phenopacket) uses the file's own embedded name, not the samplesheet's. See `docs/usage.md`'s samplesheet section for the full note; as of 2026-08-24 this is understood to be intentional.

## Outputs

`--outdir` is required. VEP and exomiser outputs can be split to separate directories via `--vep_outdir` and `--exomiser_outdir`. Per-step CSV manifests of published results are produced by the `channel_create_csv` subworkflow (added in v2.9.0); these are what makes restarting from intermediate steps work — the CSV from a previous run is a valid `--input` for the next step. Pipeline run metadata, configs, timeline/report/trace/dag are written to `${outdir}/pipeline_info/`.

See `docs/output.md` for the full output layout.

## Pointers

- Parameter documentation: `nextflow_schema.json` (authoritative). README/usage docs intentionally avoid duplicating parameter details.
- Reference data setup: `docs/reference_data.md`.
- Output layout: `docs/output.md`.
- Changelog and version history: `CHANGELOG.md`.
- PR templates: `.github/PULL_REQUEST_TEMPLATE.md`.
