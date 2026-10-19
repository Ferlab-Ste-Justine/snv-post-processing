# Ferlab-Ste-Justine/snv-post-processing: Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### `Added`

- [#118](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/118) BIOINFO-239: The slivar step now sets five tags that record why a family or child can't be given a mode of inheritance, named after Radiant's `transmission_mode` values: `unknown_parents_genotype` (solos and sibships), `unknown_father_genotype` / `unknown_mother_genotype` (one parent not sequenced, including when the PED names a parent missing from the VCF), and, in complete trios, `non_carrier_proband` (child hom-ref) and `unknown_proband_genotype` (child has no call or a low-depth one). They are set alongside the existing MoI tags. See `docs/output.md`.
- [#119](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/119) BIOINFO-240: Parental-origin (`po_*`) tags are now set for duos as well as trios: every child with at least one parent in the VCF gets them. The parent who wasn't sequenced counts as unknown, as in Radiant, so a duo child mostly gets `po_possible_*` labels. The `po_*` expressions now use slivar's `--sample-expr` with a new `sample_parental_origin()` function instead of `--trio`. A mother–child duo whose PED names an unsequenced father still gets no tag, because slivar then drops the child's link to the mother too.

### `Changed`

- [#108](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/108) **Breaking:** BIOINFO-220: Renamed the `download_cache_species` parameter to `vep_species` (always the plain species name, e.g. `homo_sapiens`) and added a new `vep_annotation` parameter (`merged`/`refseq`/unset) for the cache flavor, since VEP's `--species` flag never takes a `_merged`/`_refseq` suffix — that's controlled by `--merged`/`--refseq` instead. Update any `params.json`/`params.yaml` using `download_cache_species` (or a suffixed `vep_species` value from an earlier `[Unreleased]` build of this branch) to use `vep_species` + `vep_annotation` separately.
- [#108](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/108) BIOINFO-220: Bump the VEP containers (`ENSEMBLVEP_VEP`, `ENSEMBLVEP_DOWNLOAD` — now `release_114.2`/`114.2--pl5321h2a3209d_1`) and the test profile's `vep_cache_version` from 111 to 114.
- [#109](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/109) **Breaking:** BIOINFO-222: Renamed the `exclude_mnps` parameter to `gvcf_filtering`, and the `EXCLUDE_MNPS` subworkflow to `SANITIZE_GVCF_RECORDS`. The old names described removing MNPs, but that filter never actually matched anything (see `Fixed` below) — the step's real, working job has always been sanitizing malformed/duplicate gVCF records, which the new names describe accurately. Update any `params.json`/`params.yaml` using `exclude_mnps` to use `gvcf_filtering` instead.
- [#114](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/114) BIOINFO-232: `EXOMISER` now uses the official `exomiser/exomiser-cli:14.0.0-bash` image instead of the custom `ferlabcrsj/exomiser` one. The exomiser version reported in `versions.yml` is now read from the image's `exomiser-core` jar filename instead of a baked-in `/EXOMISER_VERSION.txt`, and the image's `/bin/bash` entrypoint is cleared for `EXOMISER` in the `docker` and `podman` profiles.
- [#114](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/114) BIOINFO-232: Removed the `containers/` directory (custom `exomiser` and `exomiser-13` Dockerfiles) and the three `publish_with_*.yml` workflows that built and pushed them to `ferlabcrsj/exomiser`. Images already on Docker Hub are unaffected. Custom images, if needed again, will be maintained in a dedicated repository rather than in a pipeline repository.
- [#115](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/115) **Breaking:** BIOINFO-231: Raised the minimum supported Nextflow version from 23.10.1 to 24.10.5 (`manifest.nextflowVersion` is now `!>=24.10.5, <26.0.0`), in line with the other Ferlab pipelines. Nextflow 23.10.x is no longer tested in CI and is refused at launch; upgrade to 24.10.5 or later.
- [#116](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/116) BIOINFO-233: Updated the nf-core modules and subworkflows: `bcftools/view`, `filter`, `norm` and `annotate`, the three `gatk4` modules, `ensemblvep/vep`, `ensemblvep/download` and `vcf_annotate_ensemblvep`. They now report software versions through Nextflow topic channels, which the pipeline collects (on Nextflow 24.10, `main.nf` enables the `nextflow.preview.topic` flag this needs). VEP now indexes its own output, so `tabix/tabix` is removed. The local patches on `bcftools/pluginfixploidy` and `bcftools/annotate` are gone. The `container` overrides are unchanged, so the same tool versions run and results are identical. The VEP components and the `utils_nextflow_pipeline`/`utils_nfcore_pipeline` subworkflows stay behind their latest version on purpose; see `docs/journal.md`.
- [#116](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/116) BIOINFO-233: Added the `editorconfig-checker` pre-commit hook and a shared `.editorconfig`, fixed the whitespace it flagged, and aligned `nf-test.config` with the other Ferlab pipelines (nf-core template `ignore` and `triggers`, `nft-utils` 1.0.0). Changing `assets/*.js` (the slivar functions) now triggers the full nf-test suite; before, such a PR ran no nf-test at all. `CONTRIBUTING.md` and the docs now describe the current CI and use the nf-core tools 4.x commands (`nf-core pipelines lint`, `nf-core pipelines schema build`, ...).
- [#117](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/117) **Breaking:** BIOINFO-238: Renamed the pipeline and its repository from `Post-processing-Pipeline` to `snv-post-processing`, in line with `cnv-post-processing`. Launch it with `nextflow run Ferlab-Ste-Justine/snv-post-processing`; the old name may still resolve through GitHub's redirect, but don't rely on it. The software versions file is now `pipeline_info/snv-post-processing_software_mqc_versions.yml`. The internal workflows were renamed too (`FERLABSTEJUSTINE_SNV_POST_PROCESSING`, `SNV_POST_PROCESSING`), which changes fully-qualified process names: update any custom config that selects processes by their full name, and runs started before this version can't be resumed with it (`-resume` reruns every task). The test dataset moved to `s3://ferlab-public-dataset/nextflow/snv-post-processing/`.
- [#118](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/118) **Breaking:** BIOINFO-239: Renamed the slivar mode-of-inheritance `INFO` tags to the values Radiant uses for `transmission_mode`: `denovo` → `autosomal_dominant_de_novo`, `dominant` → `autosomal_dominant`, `recessive` → `autosomal_recessive`, `x_dominant` → `x_linked_dominant`, `x_recessive` → `x_linked_recessive`. `x_denovo` is split by the child's sex into `x_linked_dominant_de_novo` (daughter) and `x_linked_recessive_de_novo` (son). `uniparental_disomy` is unchanged. Update anything that reads these tags from the published slivar VCF; VCFs from earlier versions keep the old names. `SLIVAR_COMPOUNDHETS` now reads `autosomal_dominant_de_novo`, so de novos still pair with inherited hets. A new `SLIVAR_INHERITANCE` nf-test runs the real `conf/slivar.config` and checks the tag names and that pairing.
- [#118](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/118) BIOINFO-239: Removed the `SLIVAR_COMPOUNDHETS` `ext.args` override from `conf/test.config`. It never took effect, because `conf/slivar.config` is included after the profiles and its arguments always won, so the `test` profile's behaviour is unchanged. `docs/usage.md` now points to `conf/slivar.config` for tuning the slivar processes.
- [#118](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/118) BIOINFO-239: A child who is hom-ref or whose genotype is unknown no longer gets a parental-origin tag; `non_carrier_proband` or `unknown_proband_genotype` is set instead. Before, such a child got `po_unknown` (most `po_unknown` tags in practice were hom-ref children), and a hom-ref son at a non-PAR X or Y site got `po_mother` / `po_father` from the parents' genotypes alone. `po_unknown` now only means the child carries the variant but the parents' genotypes can't resolve its origin.
- [#119](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/119) **Breaking:** BIOINFO-240: The pipeline now checks each family's PED against the sample names in the family VCF before the slivar step, and stops with a message naming the problem and its fix if (1) a VCF sample has no PED row, or (2) a sequenced sample's father or mother is named but isn't in the VCF. In the first case slivar left the sample out of the family; a PED matching none of the VCF's IDs only failed later in `SLIVAR_COMPOUNDHETS` with an unclear `no trios found`. In the second, when the absent parent was the father, slivar also dropped the child's link to the mother, so inheritance and parental-origin tags were silently missing or wrong. PEDs that named unsequenced parents and ran before now fail; set those parents to `0`. Rows for relatives who weren't sequenced are still allowed. The new `--skip_ped_validation` parameter (default `false`) turns these errors into warnings and lets the run continue, e.g. for tests. See `validatePedAgainstVcf()` and `vcfSampleNames()` in `subworkflows/local/utils_nfcore_snv_post_processing_pipeline/utils.nf`, both with nf-tests.
- [#120](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/120) BIOINFO-241: The slivar inheritance, unknown-genotype and parental-origin tags are now set on every `PASS` variant, whatever its consequence, as the Radiant ETL does. Before, slivar's `INFO.impactful` was part of the `--info` pre-filter, so only loss-of-function, missense, inframe and splice-region variants got any tag; synonymous, intronic, UTR, upstream/downstream and intergenic variants got none. Compound hets are unchanged: `INFO.impactful` now gates the compound-het sides (`comphet_side`, `het_side`, and a new intermediate `denovo_side` that replaces `autosomal_dominant_de_novo` as the de novo input to `SLIVAR_COMPOUNDHETS`). `slivar compound-hets` skips intronic and UTR consequences by itself but not synonymous ones, which would otherwise pair. The rare-variant (`gnomad_popmax_af_rare`, `topmed_af_rare`) part of the pre-filter is unchanged. Expect many more tagged records (on a WES trio test dataset, all `PASS` records instead of about 26k, with `unknown_proband_genotype` on most off-target sites) and about twice the `SLIVAR_EXPR` run time. A new `impactful_gate` nf-test covers both behaviours.

### `Fixed`

- [#106](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/106) BIOINFO-221: Allow `familyId` and `sample` to be specified as integers in the samplesheet, not only strings.
- [#108](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/108) BIOINFO-220: Fix VEP annotation looking for the wrong cache subdirectory (e.g. `homo_sapiens` instead of `homo_sapiens_merged`) when a non-default `vep_annotation` cache flavor is set. VEP's `--merged`/`--mane` (or `--refseq`) flags and the MANE/RefSeq output fields are now also enabled automatically for the merged/refseq cache.
- [#109](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/109) BIOINFO-222: `BCFTOOLS_FILTER` (in the renamed `SANITIZE_GVCF_RECORDS` subworkflow) now removes gVCF records missing the required `<NON_REF>` allele — a defect observed in ~0.005% of DRAGEN 4.4.7 gVCF records that otherwise makes `GATK4_GENOTYPEGVCFS` fail with `the list of input alleles must contain <NON_REF>`. This replaces the previous MNP-exclusion filter (`strlen(REF)>1 & strlen(REF)==strlen(ALT) & TYPE="snp"`), which could never match any record — bcftools classifies any same-length, >1bp substitution as `TYPE="mnp"`, never `TYPE="snp"`, so that expression was unsatisfiable for any input, from any caller.
- [#111](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/111) BIOINFO-219: Fix a `publish_mode:` typo (not a recognized `publishDir` key; silently ignored) in the `VCF_ANNOTATE_ENSEMBLVEP` and `BCFTOOLS_ANNOTATE` process blocks, which made `params.publish_dir_mode` never reach them and left them on Nextflow's `symlink` default instead. The VEP-annotated VCF and the final slivar VCF are now actually copied per `publish_dir_mode` (`copy` by default) like every other published output, instead of being symlinked into `work/`.
- [#112](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/112) BIOINFO-228: Bring `nf-core lint --release` down from 8 failures/30 warnings to 0 failures/16 warnings (the rest deferred as their own follow-up -- see PR description): updated the nf-core institutional-custom-config `includeConfig` line to the current template's logic (a local `custom_config_base` now still loads even when `NXF_OFFLINE` is set, only a remote `http(s)` one is skipped offline); removed a redundant, no-op `validation.failUnrecognisedParams = false` (already nf-schema's own default); added a Nextflow minimum-version README badge; added a `versions.yml` snapshot to `tests/default.nf.test`; added missing `meta.yml` files/entries for `channel_create_csv` and `slivar_inheritance`; and reworded leftover template `TODO` comments. `.nf-core.yml` gained ignore entries for template files/checks that don't apply to a non-published, internal Ferlab pipeline (newer nf-core sharded-nf-test CI scaffolding, `CONTRIBUTING.md`, the nf-core template-version README badge, `pipeline_name_conventions`, and the nf-core/configs per-pipeline `includeConfig` line, which points at a config that will never exist for this repo).
- [#116](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/116) BIOINFO-233: `BCFTOOLS_ANNOTATE` (slivar inheritance) now appears in the software versions report; its version was never collected before.
- [#118](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/118) BIOINFO-239: The `po_validation` fixture used by the `SLIVAR_EXPR` parental-origin nf-test carried slivar tags from an earlier run. slivar never removes an INFO tag already in its input, so the test's assertions passed whatever `parental_origin()` returned. The stale tags are removed.
- [#118](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/118) BIOINFO-239: When a PED names a parent who isn't in the VCF, slivar leaves the `kids` attribute off that parent's children. Five functions in `assets/slivar-functions.js` read `kids` directly, which throws on a missing attribute, and slivar counts an expression that throws as false. `autosomal_dominant`, `x_linked_dominant`, `autosomal_recessive` and compound hets could therefore be silently missing for such a family, depending on who is affected and the VCF sample order. These functions now read `kids` through `has_kids_in_fam()`, so those tags are set again. A new `SLIVAR_INHERITANCE` nf-test (`moi_tags-absent_parent`) covers each case.
- [#119](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/119) BIOINFO-240: The per-step CSVs in `<outdir>/csv/` wrote a literal `[]` for a family without a PED or phenopacket, so restarting the pipeline from one failed. Passed back as `--input`, the CSV failed schema validation. On an automatic restart from the same `--outdir` (`allow_intermediate_input`), `[]` was read as a file path, and slivar or exomiser failed for that family. Absent values are now written as empty fields, and the automatic restart also treats `[]` in CSVs from earlier versions as empty. A new `CHANNEL_CREATE_CSV` nf-test covers the CSV written for such a family.
- [#119](https://github.com/Ferlab-Ste-Justine/snv-post-processing/pull/119) BIOINFO-240: The `po_validation` fixture had no record producing `po_possible_father`, although its test is meant to cover all 9 parental-origin labels. It now has one (child het, father het, mother no-call), with an assertion.

## [v3.0.0 - 2026-06-02]

### `Added`

- [#88](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/88) Add local slivar `expr` and `compound-hets` modules with nf-tests and `slivar_inheritance` workflow.
- [#89](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/89) Add slivar to main pipeline and its parameters, including the new `inheritance` step and the `slivar` option for `--tools`.
- [#92](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/92) Add missing nf-tests for the pipeline utility functions.
- [#95](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/95) Update nf-test configuration.
- [#102](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/102) Added MOI (mode-of-inheritance) rules to slivar.
- [#103](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/103) Add nf-test for the `COMBINEGVCFS` local module.

### `Changed`

- [#90](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/90) Update CI/CD test to dataset V7 and limit nf version to <26.0.
- [#91](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/91) Update documentation.
- [#94](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/94) Refactor syntax for VQSR modules and subworkflow.
- [#96](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/96) Refactor syntax for split multi-allelics module.
- [#97](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/97) Refactor syntax for exclude MNPs workflow.
- [#98](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/98) Refactor syntax of main pipeline; helper functions that called processes have been inlined; software versions are now aggregated and written to `pipeline_info/Post-Processing-Pipeline_software_mqc_versions.yml`.`exomiser_local_frequency_index_path` is now optional; when omitted, the index path is derived from `exomiser_local_frequency_path` by appending `.tbi`.
- [#100](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/100) Update nf-validation to nf-schema.
- [#101](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/101) Full pipeline lint.
- [#103](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/103) Update documentation and refresh the pipeline workflow diagram for the v3.0.0 release.

### `Fixed`

- [#93](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/93) Stop calling `isBlank` on `params.tools` when it can be null.

## [v2.11.0 - 2026-03-18]

### `Added`

- [#85](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/85) Allow to start from normalization step, accepting as input a hard-filtered VCF.

## v2.10.1 - 2026-02-25

### `Added`

- [#82](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/82) Updated CODEOWNERS to add new maintainers.

### `Changed`

- [#84](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/84) Adjusted resources for processes.

## v2.10.0 - 2026-01-08

### `Added`

- [#80](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/80) Added param --cache_species to allow the download of different cache types.

### `Changed`

- [#79](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/79) Updated CI workflow to include new test data from S3.

## v2.9.1 - 2025-11-13

### `Fixed`

- [#78](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/78) Fixed bug preventing exomiser to execute when starting from annotation step.

## v2.9.0 - 2025-06-12

### `Added`

- [#76](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/76) Allow to start/re-start pipeline from defined intermediate steps. Creates csv files of published results.

### `Changed`

- [#76](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/76) Changed meta field familypheno to familyPheno.

### `Removed`

- [#75](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/75) Remove the nextflow docker image

## v2.8.1 - 2025-04-11

### `Changed`

- [#73](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/73) Pass intervals file to GenotypeGVCFs if available.

## v2.8.0 - <small>2025-04-03</small>

### `Added`

- [#71](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/71) Add parameters exomiser_outdir and vep_outdir to allow separate publish folders for exomiser and vep

### `Changed`

- [#71](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/71) Replaces the exomiser/results output folder with exomiser
- [#71](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/71) Only publish the output of the splitmultiallelics process when publish_all parameter is set to true

### `Fixed`

- [#68](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/68) Corrected documentation for the exclude_mnps parameter and familyPheno samplesheet column

## v2.7.0 - <small>2025-03-26</small>

### `Added`

- [#66](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/66) Allow to configure the first step of VQSR SNP variant recalibration (model building) via parameters

### `Fixed`

- [#69](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/69) Accept .vcf and .vcf.gz file extensions for input gvcf files

## v2.6.0 - <small>2025-02-07</small>

### `Added`

- [#63](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/63) Allow to skip exomiser for specific families

## v2.5.0 - <small>2025-01-30</small>

### `Added`

- [#61](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/61) Add download VEP module form nf-core. Addresses [#BIOINFO-20](https://ferlab-crsj.atlassian.net/browse/BIOINFO-20), no cache version issues were found.

### `Changed`

- [#59](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/59) Add ".snv" to VEP output filename prefix

### `Deprecated`

- Changelog versioning format vx.y.z-dev is deprecated as of now. We will now keep an [Unreleased section](#unreleased) at the top to track upcoming changes. When bumping the version, move the Unreleased section changes under the new version section. Listed changes will now be associated with the specific tag.

## v2.4.1-dev - <small>2025-01-16</small>

## v2.4.0-dev

### `Fixed`

- [#57](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/57) Allow to pass exomiser application properties

## v2.3.0-dev

### `Added`

- [#44](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/44) Make interval file optional in GenotypeGVCFs process
- [#44](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/44) Decouple the interval file parameter from the broad
- [#45](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/45) Allow to add dbsnp ids to output vcf files
- [#46](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/46) Allow to skip the exclude mnp step
- [#47](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/47) Improve pipeline output documentation
- [#48](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/48) Publish only main outputs by default
- [#49](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/49) Add support for local frequency source
- [#49](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/49) Pass java -Xmx option at the command line for exomiser
- [#53](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/53) Replace vep and tabix logic by a standard nf-core subworkflow
- [#54](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/54) Allow exomiser to start from the vep output

### `Changed`

- [#54](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/54) Standardize exomiser output filenames

### `Fixed`

- [#50](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/50) Use container tag 1.20 for splitMultiAllelics process
- [#51](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/51) Add missing ressources for exomiser process in configuration
- [#52](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/52) Ensure .gvcf file extensions are supported in all scenarios

### `Known issues`

- The nf-core modules that we are using have a potential performance flaw. Typically, the regex used to describe the output files also match the input files (ex: "\*.vcf"), which can cause unnecessary file transfers. This has already proven to cause issues on fusion. One fix could be to transfer the whole modules to local to perform the small change necessary to fix this.
- The VEP cache version used in the CQDG environment (112) does not match the default configured VEP version (111). This issue can be avoided by overriding the Docker container of the ensemblevep process. If no project is using VEP version 111, it should not be used as the default value.

## v2.2.0-dev

### `Added`

- [#41](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/41) Allow to customize the vep command
- [#41](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/41) Improve parameter schema for params max_disk, max_memory, max_time
- [#41](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/41) Consider only stable nextflow versions for ci test
- [#42](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/42) Add docker image for exomiser 13.1.0

### `Known issues`

- The nf-core modules that we are using have a potential performance flaw. Typically, the regex used to describe the output files also match the input files (ex: "\*.vcf"), which can cause unnecessary file transfers. This has already proven to cause issues on fusion. One fix could be to transfer the whole modules to local to perform the small change necessary to fix this.
- The VEP cache version used in the CQDG environment (112) does not match the default configured VEP version (111). This issue can be avoided by overriding the Docker container of the ensemblevep process. If no project is using VEP version 111, it should not be used as the default value.

### `Fixed`

- [#41](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/41) Fix vep url pointing to the wrong vep version in the reference data documentation.

## v2.1.0dev

### `Added`

- [#35](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/35) Added allow_old_gatk_data parameter (set to false by default).
- [#35](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/35) Added missing stub block in process writemeta for compatibility with latest nextflow version.
- [#35](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/35) Improve github ci workflow to display nextflow log file content on error

### `Fixed`

- [#35](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/35) Fix incorrect assumption about assets folder location in github ci workflow
- [#36](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/36) Fix variable input in process BCFTOOLS_NORM causing resume problems

### `Known issues`

- The nf-core modules genotypeGVCFs and VARIANTFILTRATION have a potential performance flaw. The output glob specifies for vcf and tbi _.vcf and _.vcf.tbi respectively. This regex will also include the inputs, which can cause unnecessary file transfers. This has already proven to cause issues on fusion. One fix could be to transfer the whole modules to local to perform the small change necessary to fix this (change the globs to \*${prefix}.vcf)

## v2.0.0dev

### `Added`

- [#25](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/25) Added exomiser module and introduced `tools` parameter to control the execution of VEP and Exomiser.
- [#25](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/25) Group vep output files in subfolder `vep`.
- [#26](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/26) Add version file in exomiser docker image
- [#27](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/27) Added nf-core module GATK4_VARIANTFILTRATION to replace local module hardFilters.nf

### `Known issues`

- [#20](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/20) [#27](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/27) The nf-core modules genotypeGVCFs and VARIANTFILTRATION have a potential performance flaw. The output glob specifies for vcf and tbi _.vcf and _.vcf.tbi respectively. This regex will also include the inputs, which can cause unnecessary file transfers. This has already proven to cause issues on fusion. One fix could be to transfer the whole modules to local to perform the small change necessary to fix this (change the globs to \*${prefix}.vcf)

## v1.0dev

Initial release of Ferlab-Ste-Justine/Post-Processing-Pipeline, created with the [nf-core](https://nf-co.re/) template.

### `Added`

- [#2](https://github.com/FelixAntoineLeSieur/Post-processing-Pipeline/pull/2) Added tests and samplefile channel functions
- [#3](https://github.com/FelixAntoineLeSieur/Post-processing-Pipeline/pull/3) Added a test file for the test profile
- [#7](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/7) Added most functions and modules from previous pipeline to make it functional
- [#9](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/9) New format "V3" is now supported. Includes metadata propagation.
- [#10](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/10) Converted the exclude_MNPs function into a nf-core subworkflow containing 2 nf-core modules. Also added test profile test data (but it fails at VQSR for now)
- [#17](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/17) Save nextflow log file to output directory on workflow completion
- [#17](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/17) Allow to run nf-tests check in github workflow
- [#19](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/19) Added local module COMBINEGVCFS to replace local function importGVCFs, mostly equivalent to nf-core module GATK4_COMBINEGVCFS
- [#20](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/20) Added nf-core module GATK4_GENOTYPEGVCFS to replace local function genotype_gvcf
- [#21](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/21) Added nextflow docker image
- [#22](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/22) Added exomiser docker image

### `Fixed`

- [#1](https://github.com/FelixAntoineLeSieur/Post-processing-Pipeline/pull/1) Fixed template schemas
- [#13](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/13) Run test in stub mode in GitLab workflow with necessary adjustments
- [#13](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/13) Add missing docker image for process writemeta
- [#13](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/13) Fix bug with extra java arguments in process genotypeGVCF

### `Dependencies`

- [#17](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/17) Updated nf-core subworkflows utils_nextflow_pipeline and utils_nfcore_pipeline

### `Deprecated`

- Format "V1" and "V2" are now deprecated as of [#9](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/9)

### `Removed`

- [#1](https://github.com/FelixAntoineLeSieur/Post-processing-Pipeline/pull/1) Removed input_schema
- [#2](https://github.com/FelixAntoineLeSieur/Post-processing-Pipeline/pull/2) Removed V1 format input. V2 is the only accepted format.
- [#5](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/5) Removed many files related to workflows and email notifications
- [#8](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/8) Removed remaining unnecessary workflows including the linting fix, the branch protection workflow and the "download pipeline" workflow
- [#13](https://github.com/Ferlab-Ste-Justine/Post-processing-Pipeline/pull/13) Removed linter tests on gitHub workflows to customize them to our needs.
