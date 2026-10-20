# Ferlab-Ste-Justine/snv-post-processing: Usage

> _Parameters documentation is available in the [pipeline schema](../nextflow_schema.json)._
> _You can use the command `nf-core pipelines schema docs` to output parameters documentation._
> _To avoid duplication of information, we minimize parameters details in markdown files._
> _Currently, we only add context for the reference data parameters and provide parameter summaries for convenience._

## Introduction

The Ferlab-Ste-Justine/snv-post-processing is a bioinformatics pipeline designed for family-based analysis of GVCFs from multiple samples. It performs joint genotyping, tags low-quality variants, and optionally annotates the final VCF using VEP and/or Exomiser. This document provides instructions on how to prepare input files, run the pipeline, and understand the output.

## Samplesheet input

You will need to create a samplesheet with information about the samples you would like to analyse before running the pipeline. Use the `--input` parameter to specify its location. The samplesheet has to be a comma separated file (`.csv`).

The samplesheet must contains the following columns at the minimum:

- _familyId_: The identifier used for the sample family
- _sample_: The identifier used for the sample
- _sequencingType_: Must be either WES (Whole Exome Sequencing) or WGS (Whole Genome Sequencing)
- _gvcf_: Path to the sample `.gvcf.gz` file
- _vcf_: Path to the joint-genotyped/filtered `vcf.gz` file. **_If starting from normalization, vep or exomiser_**

Additionally, there is an optional _familyPheno_ column that can contain a `.yml/.json` file providing phenotype information on the family in phenopacket format. This column is only necessary if using the exomiser tool. If exomiser is enabled, it must consistently contain either an empty string or the same phenopacket file for all members of the family. For more details, refer to the exomiser tool section below.

There is also an optional _familyPed_ column that can point to a `.ped` pedigree file for the family. This column is required to run the [slivar inheritance step](#slivar-inheritance-step), which tags variants by mode of inheritance and identifies compound heterozygotes from a VEP-annotated VCF. As with `familyPheno`, the value must be identical for all members of the same family.

Before running slivar, the pipeline checks each family's PED against the sample names in the family VCF, and stops with an error naming the problem if:

- a sample in the VCF has no row in the PED. The PED must use the VCF's sample IDs, which come from the gVCF headers, not from the samplesheet's `sample` column. slivar would leave such a sample out of the family;
- a sequenced sample's father or mother is named but isn't in the VCF. Write a parent who wasn't sequenced as `0`: when the named father is missing, slivar also drops the child's link to the mother, so inheritance and parental-origin tags would be silently missing or wrong.

Rows for relatives who weren't sequenced can stay in the PED; they aren't checked. To run anyway, for example for tests, set `--skip_ped_validation`: the same problems are then logged as warnings, and the slivar tags of those families may be missing or wrong.

> **Note:** the `sample` (and `familyId`) values in the samplesheet are used only for this pipeline's own file naming and internal tracking (e.g. `meta.id`, published filenames, CSV manifests). They are **not** validated against the sample name actually embedded in the corresponding `gvcf`/`vcf` file's header — if the two differ, the pipeline will not detect or warn about it, and everything downstream that reads sample names directly from the VCF/PED/phenopacket files (GATK joint genotyping, slivar's inheritance tagging, exomiser's phenotype matching) will use the file's own embedded name regardless of what the samplesheet says. This is intentional (e.g. to allow a LIMS-assigned identifier to differ from a sequencing core's internal sample name) and not implemented here (snv-post-processing) because it is already implemented in pipelines that should be run downstream of this one (e.g. QC and file integrity pipelines). However, note that if the sample identifiers in the pedigree or phenopacket file differ from the ones in their corresponding VCF file, the pipeline will still fail at the slivar and/or exomiser steps.

**sample.csv**

```csv
**familyId**,**sample**,**sequencingType**,**gvcf**,**familyPheno**,**familyPed**
CONGE-XXX,01,WES,CONGE-XXX-01.hard-filtered.gvcf.gz,CONGE-XXX.pheno.yml,CONGE-XXX.ped
CONGE-XXX,02,WES,CONGE-XXX-02.hard-filtered.gvcf.gz,CONGE-XXX.pheno.yml,CONGE-XXX.ped
CONGE-XXX,03,WES,CONGE-XXX-03.hard-filtered.gvcf.gz,CONGE-XXX.pheno.yml,CONGE-XXX.ped
CONGE-YYY,01,WGS,CONGE-YYY-01.hard-filtered.gvcf.gz,CONGE-YYY.pheno.yml,CONGE-YYY.ped
CONGE-YYY,02,WGS,CONGE-YYY-02.hard-filtered.gvcf.gz,CONGE-YYY.pheno.yml,CONGE-YYY.ped
CONGE-YYY,03,WGS,CONGE-YYY-03.hard-filtered.gvcf.gz,CONGE-YYY.pheno.yml,CONGE-YYY.ped
```

> [!NOTE]
> The sequencing type (WES or WGS) will determine the variant filtering approach used by the pipeline.
> In the case of Whole Genome Sequencing (WGS), VQSR (Variant Quality Score Recalibration) is used.
> In the case of Whole Exome Sequencing (WES), VQSR is replaced by a hard filtering approach as VQSR cannot be applied in this case.
> Additionally, a different analysis file will be used when running the exomiser tool based on the sequencing type.

## Reference Data

Reference files are essential at various stages of the workflow, including joint-genotyping, VQSR, the Variant Effect Predictor (VEP), and exomiser.

These files must be correctly downloaded and specified through pipeline parameters. For more details about how to do this, see [reference_data.md](reference_data.md).

## Running the pipeline

The typical command for running the pipeline is as follows:

```bash
nextflow run -c fusion.config Ferlab-Ste-Justine/snv-post-processing -r "v3.0.0" \
    -params-file params.json  \
   --input samplesheet.csv \
   --outdir results/dir \
   --tools vep,exomiser
```

Note that the pipeline will create the following files in your working directory:

```bash
work                # Directory containing the nextflow working files
<OUTDIR>            # Finished results in specified location (defined with --outdir)
.nextflow_log       # Log file from Nextflow
# Other nextflow hidden files, eg. history of pipeline runs and old logs.
```

If you wish to repeatedly use the same parameters for multiple runs, rather than specifying each flag in the command, you can specify these in a params file (json or yaml).

> [!WARNING]
> Do not use `-c <file>` to specify parameters as this will result in errors. Custom config files specified with `-c` must only be used for [tuning process resource specifications](https://nf-co.re/docs/usage/configuration#tuning-workflow-resources), other infrastructural tweaks (such as output directories), or module arguments (args).

### Starting from intermediate steps

#### Starting with normalization (`--step 'normalize'`)

To start from the normalization step, the csv samplesheet must contain the columns `familyId`, `sample`, `sequencingType`, and `vcf`, with the optional `tbi`. This allows you to skip the joint genotyping and VQSR/hard filtering steps and start directly from the normalization of already processed VCF files.

This step also normalizes genotype ploidy (`bcftools +fixploidy`) right after splitting multi-allelics, forcing diploid GT notation on hemizygous non-PAR X/Y calls. This is needed because some callers (e.g. DRAGEN) emit true haploid genotypes there, which slivar's dosage model cannot parse — see the [slivar parental origin notes](#parental-origin) for details. GATK4-called VCFs, which are already diploid, pass through unchanged.

> **Note:** the ploidy fix only runs as part of this pipeline's `genotype`/`normalize` step. If you enter the pipeline later (`--step annotation`, `exomiser`, or `inheritance`) with VCFs that were normalized outside this pipeline, DRAGEN-style haploid X/Y calls will not be corrected, and mode-of-inheritance/parental-origin tagging in the slivar step may misbehave for those sites.

**sample.csv**

```csv
**familyId**,**sample**,**sequencingType**,**vcf**,**tbi**
CONGE-XXX,01,WES,CONGE-XXX.filtered.vcf.gz,CONGE-XXX.filtered.vcf.gz.tbi
CONGE-XXX,02,WES,CONGE-XXX.filtered.vcf.gz,CONGE-XXX.filtered.vcf.gz.tbi
CONGE-XXX,03,WES,CONGE-XXX.filtered.vcf.gz,CONGE-XXX.filtered.vcf.gz.tbi
```

#### Starting with vep annotation (`--step 'annotation'`) or Exomiser (`--step 'exomiser'`)

To start from either the annotation step or from exomiser, the csv samplesheet must contain the columns `familyId`, `sequencingType`, and `vcf`, with the optional `tbi`. To start from exomiser, the column `familyPheno` is required.

**sample.csv**

```csv
**familyId**,**sequencingType**,**vcf**,**tbi**,**familyPheno**
CONGE-XXX,WES,CONGE-XXX.snv.vep.vcf.gz,CONGE-XXX.snv.vep.vcf.gz.tbi,CONGE-XXX.pheno.yml
CONGE-YYY,WES,CONGE-YYY.normalized.vcf.gz,CONGE-YYY.normalized.vcf.gz.tbi,CONGE-YYY.pheno.yml
```

#### Starting with the slivar inheritance step (`--step 'inheritance'`)

To start from the slivar inheritance step, the input VCF is assumed to be already VEP-annotated. The csv samplesheet must contain the columns `familyId`, `sequencingType`, `vcf`, and `familyPed`, with the optional `tbi`.

**sample.csv**

```csv
**familyId**,**sequencingType**,**vcf**,**tbi**,**familyPed**
CONGE-XXX,WES,CONGE-XXX.snv.vep.vcf.gz,CONGE-XXX.snv.vep.vcf.gz.tbi,CONGE-XXX.ped
CONGE-YYY,WES,CONGE-YYY.snv.vep.vcf.gz,CONGE-YYY.snv.vep.vcf.gz.tbi,CONGE-YYY.ped
```

When `--step inheritance` is set, slivar is run by default even if not listed in `tools`. Families without a `familyPed` value are silently skipped.

#### **This feature supports using results from a previous run as input.**

The normalize, annotation, exomiser, and inheritance steps can be started from previously generated results:

- Normalize step can start from previously generated joint-genotyped and filtered VCFs
- Annotation step can start from previously generated normalized VCFs
- Exomiser step can start from previously generated joint-genotyped VCFs or from previous results of ensemblvep
- Inheritance step can start from previously generated VEP-annotated VCFs

If in a previous run `save_genotyped = true` and/or vep was run, the CSV files will be stored under `$outdir/csv/normalized_genotypes.csv` and `$outdir/csv/ensemblvep.csv`.

If the required CSV is found in the same output directory, it will automatically be used as an input when specifying the parameter `allow_intermediate_input = true`. This option depends on the [output directory structure](output.md#directory-structure) being respected as it looks at the `csv` directory to retrieve the paths to the data. If output directory is different, the csv will need to be passed manually.

See [tools](#tools) for details on required input for each step.

### Output Customization

By default, all pipeline outputs are saved in the directory specified by the `--outdir` parameter. However, you can customize the output locations for specific steps using the following parameters:

- **`vep_outdir`**: Specifies a custom directory for vep output files. If not provided, vep output will be saved in the `ensemblvep` subfolder within the main output directory.
- **`exomiser_outdir`**: Specifies a custom directory for exomiser output files. If not provided, exomiser output will be saved in the `exomiser` subfolder within the main output directory.

Slivar output is always written to the `slivar` subfolder of `--outdir`.

For more details on the pipeline outputs, see [output.md](output.md)

### Enable or Disable GVCF Cleaning with `gvcf_filtering`

At the start of the workflow, by default, we run steps to sanitize the input gVCF files, removing records that could cause compatibility issues with the joint genotyping procedure.

The following records are removed:

- **Records missing the required `<NON_REF>` allele**: every record in a valid gVCF must carry the `<NON_REF>` symbolic allele (used by joint genotyping to represent "some other possible allele"). Some gVCF producers occasionally emit records without it — for example, DRAGEN 4.4.7 has been observed to omit it from a small fraction of records — which otherwise makes GATK's `GenotypeGVCFs` fail outright with an error like `the list of input alleles must contain <NON_REF>`.
- **Duplicated Positions**: lines with duplicate positions, which can also cause issues with `CombineGVCFs`.

You can optionally skip this filtering logic if you have no reason to suspect that the underlying data problems will occur. To do so, set the `gvcf_filtering` parameter to `false` (default is `true`).

By default, this gVCF sanitization feature is enabled to maintain previous behaviour in CQDG. However, use this feature with caution. We may improve the pipeline to handle these issues differently in the future.

> **Note:** this parameter was previously named `exclude_mnps`. It was renamed because, despite the old name, the underlying filter never actually removed MNPs (multi-nucleotide polymorphisms) — that was a long-standing dead code path, not a deliberate design choice — and its real, working purpose has always been the record sanitization described above.

### Tools

You can include additional analysis in your pipeline via the `tools` parameter. Currently, the pipeline supports
three tools: `vep` (Variant Effect Predictor), `exomiser`, and `slivar`.

VEP is a widely used tool for annotating genetic variants with information such as gene names,
variant consequences, and population frequencies. It provides valuable insights into the functional impact of genetic variants.

Exomiser is a tool specifically designed for the analysis of rare genetic diseases. It integrates phenotype data with variant information to prioritize variants that are likely to be disease-causing.
This can greatly assist in the identification of potential disease-causing variants in exome sequencing data.

Slivar runs an inheritance subworkflow that tags variants by mode of inheritance and identifies compound heterozygotes from a VEP-annotated VCF and a family PED file. It must be combined with `vep` in `tools` (or used via `--step inheritance` on already VEP-annotated input).

### Exomiser tool

To run exomiser, activate it via the `tools` parameter (see section above).

Additionally, provide the exomiser phenopacket file in the samplesheet for each family member in the familyPheno column. If the phenopacket file is not specified for a family, exomiser will be skipped for that family.
`
Note that the value for the familyPheno column must always be identical for the same family.

#### Exomiser input data

By default, both vep and exomiser steps, if applicable, run in parallel and consume the output of the normalization step.

To have the Exomiser step start from the VEP output instead, set the parameter `exomiser_start_from_vep` to `true`. In this case, the vep and exomiser steps will run sequentially.

Note that the parameter `exomiser_start_from_vep` will be ignored if vep is not specified via the `tools` parameter.

#### Exomiser CLI options

We typically allow passing extra arguments in our process scripts via the process `task.ext` directive (`task.ext.args` key).

When using the exomiser process, it's important to distinguish between regular CLI options and options that correspond to properties normally specified in the application.properties file.

Regular CLI options should be added to `task.ext.args`.

Options that correspond to application properties (e.g., typically `--exomiser.some-property=value`) must be added to `task.ext.application_properties_args`. These options need to be grouped at the end of the exomiser command to ensure that regular exomiser cli options are parsed correctly.

### Slivar inheritance step

The pipeline can run a [slivar](https://github.com/brentp/slivar)-based inheritance subworkflow that:

1. Tags variants by mode of inheritance (de novo, recessive, dominant, X-linked variants, and compound-het candidate sides) using `slivar expr`.
2. Identifies compound heterozygotes from the tagged VCF using `slivar compound-hets`.
3. Merges the compound-het annotations back into the expression-tagged VCF using `bcftools annotate`.

This step runs per family when either:

- `slivar` is included in the `tools` parameter. In this case `vep` must also be in `tools` so that slivar can consume the VEP-annotated VCF (the schema enforces this dependency).
- `--step inheritance` is set, in which case the input VCF is assumed to be already VEP-annotated and slivar is run by default.

In both modes, only families with a `familyPed` value in the samplesheet are processed; families without a PED file are silently skipped.

#### Slivar reference data

To apply the population-frequency filters embedded in the inheritance expressions, provide one or both of the following [slivar gnotate](https://github.com/brentp/slivar/wiki/gnotate) zip files:

- `slivar_gnomad_gnotate`: gnomAD-based gnotate file. When provided, the expressions add `INFO.gnomad_popmax_af` and `INFO.gnomad_nhomalt` guards driven by the `gnomad_popmax_af_*` and `gnomad_nhomalt` parameters.
- `slivar_topmed_gnotate`: TOPMed-based gnotate file. When provided, the general `--info` filter additionally enforces `INFO.topmed_af < topmed_af_rare`.

If a gnotate file is omitted, the corresponding population-frequency guards are dropped from the expressions automatically — the inheritance segregation logic still runs, but is no longer rarity-filtered against that population.

You can additionally provide:

- `slivar_regions_bed`: restrict analysis to regions in this BED file (`slivar expr --regions`).
- `slivar_exclude_bed`: skip variants overlapping regions in this BED file (`slivar expr --exclude`).
- `slivar_js`: custom JavaScript helper functions. Defaults to the bundled `assets/slivar-functions.js`; override only if you have customized segregation/quality functions.

#### Slivar inheritance thresholds

The default population-frequency thresholds applied in the inheritance expressions can be tuned via parameters:

| Parameter                    | Default | Used in                                                                                                                                                                     |
| ---------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gnomad_popmax_af_rare`      | `0.01`  | General `--info` rare-variant filter (gates every slivar tag)                                                                                                               |
| `topmed_af_rare`             | `0.05`  | General `--info` rare-variant filter (gates every slivar tag)                                                                                                               |
| `gnomad_popmax_af_dominant`  | `0.001` | `autosomal_dominant_de_novo`, `autosomal_dominant`, `x_linked_dominant_de_novo`, `x_linked_recessive_de_novo`, `x_linked_dominant`, and the `denovo_side` compound-het side |
| `gnomad_popmax_af_recessive` | `0.01`  | `autosomal_recessive`, `uniparental_disomy`, `x_linked_recessive`                                                                                                           |
| `gnomad_nhomalt`             | `10`    | `comphet_side` and `het_side` compound-het sides                                                                                                                            |

The `--info` rare-variant filter gates every slivar tag. Apart from it, the slivar step doesn't restrict tags by consequence: only the compound-het sides are limited to variants slivar considers impactful.

Each threshold is only applied when the corresponding gnotate file is provided.

#### Slivar output

Slivar output is always written to the `slivar` subfolder within the main output directory (`--outdir`). For details on the slivar output files, see [output.md](output.md#slivar-step-slivar).

#### Parental origin

For every child with at least one parent in the VCF (trios and duos), the slivar step additionally tags each variant with its most likely parental origin (`po_denovo`, `po_mother`, `po_father`, `po_both`, `po_ambiguous`, `po_possible_denovo`, `po_possible_mother`, `po_possible_father`, `po_unknown`), computed by `parental_origin()` in `assets/slivar-functions.js`. Origin is resolved separately for autosomal/PAR, X (son/daughter), and Y sites, and genotype calls backed by very low allele depth are treated as unknown rather than trusted. In a duo, the parent who wasn't sequenced counts as unknown. A child who is hom-ref or whose genotype is unknown gets no parental-origin tag. Solos and sibships get none either; they get `unknown_parents_genotype`. An unsequenced parent must be written as `0` in the PED (see [Samplesheet input](#samplesheet-input)). See [output.md](output.md#slivar-step-slivar) for what each tag means.

This relies on the ploidy normalization described above in [Starting with normalization](#starting-with-normalization---step-normalize) — without it, hemizygous X/Y calls from some callers would otherwise come out as unknown (`po_unknown` or `unknown_proband_genotype`).

### Customize versions and commands

If needed, it is possible to customize the options passed to the vep command by overriding the ext.args directive for the
ENSEMBLVEP_VEP process. See [conf/modules.config](../conf/modules.config).

The slivar expressions and the bcftools annotate command can also be tuned via the `SLIVAR_EXPR`, `SLIVAR_COMPOUNDHETS`, and `BCFTOOLS_ANNOTATE` `withName` blocks in [conf/slivar.config](../conf/slivar.config).

### Stub mode and quick tests

The `-stub` (or `-stub-run`) option can be added to run the "stub" block of processes instead of the "script" block. This can be helpful for testing.

To test your setup in stub mode, simply run `nextflow run Ferlab-Ste-Justine/snv-post-processing -profile test,docker -stub`.

For tests with real data, see documentation in the [test configuration profile](conf/test.config)

### Updating the pipeline

When you run the above command, Nextflow automatically pulls the pipeline code from GitHub and stores it as a cached version. When running the pipeline after this, it will always use the cached version if available - even if the pipeline has been updated since. To make sure that you're running the latest version of the pipeline, make sure that you regularly update the cached version of the pipeline:

```bash
nextflow pull Ferlab-Ste-Justine/snv-post-processing
```

### Reproducibility

It is a good idea to specify a pipeline version when running the pipeline on your data. This ensures that a specific version of the pipeline code and software are used when you run your pipeline. If you keep using the same tag, you'll be running the same version of the pipeline, even if there have been changes to the code since.

First, go to the [Ferlab-Ste-Justine/snv-post-processing releases page](https://github.com/Ferlab-Ste-Justine/snv-post-processing/tags) and find the latest pipeline version - numeric only (eg. `v3.0.0`). Then specify this when running the pipeline with `-r` (one hyphen) - eg. `-r v3.0.0`. Of course, you can switch to another version by changing the number after the `-r` flag.

This version number will be logged in reports when you run the pipeline, so that you'll know what you used when you look back in the future. For example, at the bottom of the MultiQC reports.

To further assist in reproducibility, you can use share and re-use [parameter files](#running-the-pipeline) to repeat pipeline runs with the same settings without having to write out a command with every single parameter.

> <b>TIP</b>:\
> If you wish to share such profile (such as upload as supplementary material for academic publications), make sure to NOT include cluster specific paths to files, nor institutional specific profiles.

### Core Nextflow arguments

- Use the `-profile` parameter to choose a configuration profile. Profiles can give configuration presets for different compute environments (e.g., docker, singularity, conda). Multiple profiles can be loaded in sequence, e.g., `-profile test,docker`.
- Use the `-resume` parameter to restart a pipeline from where it left off. This can save time by using cached results from previous runs.
- You can specify a custom configuration file using the `-c` parameter. This is useful to set configuration specific to your execution environment and change requested resources for a process.

For more detailed information, please refer to the [official Nextflow documentation](https://www.nextflow.io/docs/latest/index.html).

### Running in the background

Nextflow handles job submissions and supervises the running jobs. The Nextflow process must run until the pipeline is finished.

The Nextflow `-bg` flag launches Nextflow in the background, detached from your terminal so that the workflow does not stop if you log out of your session. The logs are saved to a file.

Alternatively, you can use `screen` / `tmux` or similar tool to create a detached session which you can log back into at a later time.
Some HPC setups also allow you to run nextflow within a cluster job submitted your job scheduler (from where it submits more jobs).

### Nextflow memory requirements

In some cases, the Nextflow Java virtual machines can start to request a large amount of memory.
To limit this, you can use the `NXF_OPTS` environment variable:

```bash
NXF_OPTS='-Xms1g -Xmx4g'
```

## Parameters summary

| Parameter name                        | Required?  | Description                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input`                               | _Required_ | Path to the input file                                                                                                                                                                                                                                                                                                                                                                         |
| `outdir`                              | _Required_ | Path to the output directoy                                                                                                                                                                                                                                                                                                                                                                    |
| `referenceGenome`                     | _Required_ | Path to the directory containing the reference genome data                                                                                                                                                                                                                                                                                                                                     |
| `referenceGenomeFasta`                | _Required_ | Filename of the reference genome .fasta file, within the specified `referenceGenome` directory                                                                                                                                                                                                                                                                                                 |
| `dbsnpFile`                           | _Optional_ | Path to dbsnp file. If specified, will be used to add ids in the ID column of output vcf files.                                                                                                                                                                                                                                                                                                |
| `dbsnpFileIndex`                      | _Optional_ | Path to dbsnp file index. Must be specified if the dbsnpFile parameter is specified.                                                                                                                                                                                                                                                                                                           |
| `broad`                               | _Optional_ | Path to the directory containing Broad reference data (for VQSR)                                                                                                                                                                                                                                                                                                                               |
| `vqsr_snp_resources`                  | _Optional_ | List of `{labels, vcf, index}` maps describing the SNP VQSR training resources. Relative vcf/index paths are joined with `params.broad`.                                                                                                                                                                                                                                                       |
| `vqsr_indel_resources`                | _Optional_ | Same shape as `vqsr_snp_resources`, used for the INDEL VQSR model.                                                                                                                                                                                                                                                                                                                             |
| `intervalsFile`                       | _Optional_ | Path to the file containg the genome intervals list on which to operate                                                                                                                                                                                                                                                                                                                        |
| `tools`                               | _Optional_ | Additional tools to run separated by commas. Supported tools are `vep`, `exomiser`, and `slivar`. `slivar` requires `vep` to also be included.                                                                                                                                                                                                                                                 |
| `step`                                | _Optional_ | Step from which to restart the pipeline. Options: `genotype`(default),`normalize`,`annotation`,`exomiser`,`inheritance`                                                                                                                                                                                                                                                                        |
| `allow_intermediate_input`            | _Optional_ | When starting from subsequent steps, use intermediate csv as input samplesheet if found. (default `true`)                                                                                                                                                                                                                                                                                      |
| `save_genotyped`                      | _Optional_ | If true, save joint-genotyping results                                                                                                                                                                                                                                                                                                                                                         |
| `publish_all`                         | _Optional_ | If true, publish the outputs of every pipeline step. Not recommended in production (default `false`).                                                                                                                                                                                                                                                                                          |
| `vep_cache`                           | _Optional_ | Path to the vep cache data directory. Must contain a `<vep_species>[_<vep_annotation>]/<vep_cache_version>_<vep_genome>/` subdirectory.                                                                                                                                                                                                                                                        |
| `vep_cache_version`                   | _Optional_ | Version of the vep cache. e.g. `114`                                                                                                                                                                                                                                                                                                                                                           |
| `vep_genome`                          | _Optional_ | Genome assembly version of the vep cache                                                                                                                                                                                                                                                                                                                                                       |
| `vep_species`                         | _Optional_ | Species VEP annotates against (default: `homo_sapiens`). Always the plain species name — passed as-is to VEP's `--species` at annotation time (VEP rejects a `_merged`/`_refseq` suffix there); combined with `vep_annotation` for the cache-download species.                                                                                                                                 |
| `vep_annotation`                      | _Optional_ | VEP cache flavor: `merged` (combined Ensembl/RefSeq cache) or `refseq` (RefSeq-only cache); unset for the default Ensembl-only cache. Must match whatever cache directory `vep_cache` points to (`<vep_species>_merged`/`<vep_species>_refseq`). Setting it to `merged` also enables VEP's `--merged`/`--mane` flags and adds MANE/RefSeq-specific output fields; `refseq` enables `--refseq`. |
| `download_cache`                      | _Optional_ | Download vep cache (default: false)                                                                                                                                                                                                                                                                                                                                                            |
| `outdir_cache`                        | _Optional_ | Path to write the cache to. If not declared, cache will be written to `<outputdir>/cache/`                                                                                                                                                                                                                                                                                                     |
| `vep_outdir`                          | _Optional_ | If specified, publish vep output files to this location                                                                                                                                                                                                                                                                                                                                        |
| `gvcf_filtering`                      | _Optional_ | Sanitize input gvcf files by removing malformed (missing `<NON_REF>`) and duplicate-position records that cause compatibility issues with joint genotyping (default: true).                                                                                                                                                                                                                    |
| `exomiser_data_dir`                   | _Optional_ | Path to the exomiser reference data directory                                                                                                                                                                                                                                                                                                                                                  |
| `exomiser_genome`                     | _Optional_ | Genome assembly version to be used by exomiser(`hg19` or `hg38`)                                                                                                                                                                                                                                                                                                                               |
| `exomiser_data_version`               | _Optional_ | Exomiser data version (e.g., `2402`)                                                                                                                                                                                                                                                                                                                                                           |
| `exomiser_cadd_version`               | _Optional_ | Version of the CADD data to be used by exomiser (e.g., `1.7`)                                                                                                                                                                                                                                                                                                                                  |
| `exomiser_cadd_indel_filename`        | _Optional_ | Filename of the exomiser CADD indel data file (e.g., `gnomad.genomes.r4.0.indel.tsv.gz`)                                                                                                                                                                                                                                                                                                       |
| `exomiser_cadd_snv_filename`          | _Optional_ | Filename of the exomiser CADD snv data file (e.g., `whole_genome_SNVs.tsv.gz`)                                                                                                                                                                                                                                                                                                                 |
| `exomiser_remm_version`               | _Optional_ | Version of the REMM data to be used by exomiser (e.g., `0.3.1.post1`)                                                                                                                                                                                                                                                                                                                          |
| `exomiser_remm_filename`              | _Optional_ | Filename of the exomiser REMM data file (e.g., `ReMM.v0.3.1.post1.hg38.tsv.gz`)                                                                                                                                                                                                                                                                                                                |
| `exomiser_local_frequency_path`       | _Optional_ | Path to a custom local frequency source file for exomiser                                                                                                                                                                                                                                                                                                                                      |
| `exomiser_local_frequency_index_path` | _Optional_ | Path to the tabix index of the local frequency file. Defaults to `<exomiser_local_frequency_path>.tbi` when omitted.                                                                                                                                                                                                                                                                           |
| `exomiser_analysis_wes`               | _Optional_ | Path to the exomiser analysis file for WES data, if different from the default                                                                                                                                                                                                                                                                                                                 |
| `exomiser_analysis_wgs`               | _Optional_ | Path to the exomiser analysis file for WGS data, if different from the default                                                                                                                                                                                                                                                                                                                 |
| `exomiser_start_from_vep`             | _Optional_ | If `true` (default `false`), run the exomiser analysis on the VEP annotated VCF file. Ignored if vep is not activated via `tools` parameter.                                                                                                                                                                                                                                                   |
| `exomiser_outdir`                     | _Optional_ | If specified, publish exomiser output files to this location                                                                                                                                                                                                                                                                                                                                   |
| `slivar_gnomad_gnotate`               | _Optional_ | Path to the gnomAD slivar gnotate (`.zip`) file. Required to apply gnomAD-based population-frequency guards in the inheritance expressions.                                                                                                                                                                                                                                                    |
| `slivar_topmed_gnotate`               | _Optional_ | Path to the TOPMed slivar gnotate (`.zip`) file. Required to apply the TOPMed-based population-frequency guard.                                                                                                                                                                                                                                                                                |
| `slivar_regions_bed`                  | _Optional_ | BED file restricting slivar analysis to the specified regions.                                                                                                                                                                                                                                                                                                                                 |
| `slivar_exclude_bed`                  | _Optional_ | BED file of regions to exclude from slivar analysis.                                                                                                                                                                                                                                                                                                                                           |
| `slivar_js`                           | _Optional_ | JavaScript file defining helper functions used in the slivar expressions. Defaults to `assets/slivar-functions.js`.                                                                                                                                                                                                                                                                            |
| `gnomad_popmax_af_rare`               | _Optional_ | Max gnomAD popmax AF for the general `--info` rare-variant filter (default `0.01`).                                                                                                                                                                                                                                                                                                            |
| `topmed_af_rare`                      | _Optional_ | Max TOPMed AF for the general `--info` rare-variant filter (default `0.05`).                                                                                                                                                                                                                                                                                                                   |
| `gnomad_popmax_af_dominant`           | _Optional_ | Max gnomAD popmax AF for dominant and de novo inheritance expressions (default `0.001`).                                                                                                                                                                                                                                                                                                       |
| `gnomad_popmax_af_recessive`          | _Optional_ | Max gnomAD popmax AF for recessive inheritance expressions (default `0.01`).                                                                                                                                                                                                                                                                                                                   |
| `gnomad_nhomalt`                      | _Optional_ | Max gnomAD homozygous-alt count allowed when tagging compound-het candidate sides (default `10`).                                                                                                                                                                                                                                                                                              |
