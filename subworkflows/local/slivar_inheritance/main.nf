include { SLIVAR_EXPR } from '../../../modules/local/slivar/expr/main'
include { SLIVAR_COMPOUNDHETS } from '../../../modules/local/slivar/compoundhets/main'
include { BCFTOOLS_ANNOTATE } from '../../../modules/nf-core/bcftools/annotate/main'

workflow SLIVAR_INHERITANCE {
    take:
    ch_vcf_ped // channel: [ val(meta), vcf, tbi, ped ]
    val_regions_bed
    val_exclude_bed
    val_gnotate_files
    val_js

    main:

    SLIVAR_EXPR(ch_vcf_ped, val_regions_bed, val_exclude_bed, val_gnotate_files, val_js)

    ch_compoundhets_in = ch_vcf_ped
        .join(SLIVAR_EXPR.out.vcf)
        .map { meta, _vcf, _tbi, ped, expr_vcf ->
            return [meta, expr_vcf, ped]
        }

    SLIVAR_COMPOUNDHETS(ch_compoundhets_in)

    ch_annotate = SLIVAR_EXPR.out.vcf
        .join(SLIVAR_COMPOUNDHETS.out.vcf)
        .join(SLIVAR_COMPOUNDHETS.out.tbi)
        .map { meta, expr_vcf, ch_vcf, ch_tbi ->
            return [meta, expr_vcf, [], ch_vcf, ch_tbi, [], [], []]
        }

    BCFTOOLS_ANNOTATE(ch_annotate)

    ch_vcf_tbi = BCFTOOLS_ANNOTATE.out.vcf
        .join(BCFTOOLS_ANNOTATE.out.index)
        .map { meta, vcf, tbi ->
            return [meta, vcf, tbi]
        }

    emit:
    vcf_tbi = ch_vcf_tbi // channel: [ val(meta), [ vcf, tbi ] ]
    expr_summary = SLIVAR_EXPR.out.summary // channel: [ val(meta), summary ]
    ch_summary = SLIVAR_COMPOUNDHETS.out.summary // channel: [ val(meta), summary ]
    // BCFTOOLS_ANNOTATE (nf-core) reports through the versions topic instead
    versions = SLIVAR_EXPR.out.versions.mix(SLIVAR_COMPOUNDHETS.out.versions) // channel: [ versions.yml ]
}
