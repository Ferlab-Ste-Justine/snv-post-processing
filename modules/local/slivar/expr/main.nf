process SLIVAR_EXPR {
    tag "$meta.id"
    label 'process_single'

    // No biocontainer for slivar: brentp (its author) publishes the image on Docker Hub. Pinned
    // to a release tag: untagged, it floats with :latest (same image as v0.3.1 as of 2026-11).
    // The docker.io/ prefix keeps a global docker.registry from rewriting it to a registry
    // that doesn't host it.
    container "docker.io/brentp/slivar:v0.3.1"

    input:
    tuple val(meta), path(vcf), path(tbi), path(ped)
    path(regions_bed)
    path(exclude_bed)
    path(gnotate_files)
    path(js)

    output:
    tuple val(meta), path("*.vcf.gz"), emit: vcf
    tuple val(meta), path("*.slivar.summary.txt"), optional:true, emit: summary
    path "versions.yml", emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def args = task.ext.args ?: ''
    args.contains("--pass-only") ? log.info("Using expr with --pass-only. Only variants that pass the expressions will be in the output.") : ''
    def prefix = task.ext.prefix ?: "${meta.id}"
    def ped_arg = ped ? "-p $ped" : ''
    def exclude_arg = exclude_bed ? "--exclude $exclude_bed" : ''
    def regions_arg = regions_bed ? "--regions $regions_bed" : ''
    def gnotate_arg = gnotate_files ? gnotate_files.collect{ gnotate_file -> "-g $gnotate_file" }.join(' ') : ''
    def js_arg = js ? "--js $js" : ''
    slivar_ch_summary = "${meta.id}.expr.slivar.summary.txt"
    """
    export SLIVAR_SUMMARY_FILE=$slivar_ch_summary

    slivar expr \\
        --vcf $vcf \\
        $ped_arg \\
        $exclude_arg \\
        $regions_arg \\
        $gnotate_arg \\
        $js_arg \\
        $args \\
    | bcftools view -Oz -o ${prefix}.vcf.gz

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        slivar: \$(slivar 2>&1 | head -n1 | sed 's/^.*version: //; s/ .*\$//')
        bcftools : \$(bcftools --version 2>&1 | head -n1 | sed 's/^.*bcftools //; s/ .*\$//')
    END_VERSIONS
    """

    stub:
    def args = task.ext.args ?: ''
    args.contains("--pass-only") ? log.info("Using expr with --pass-only. Only variants that pass the expressions will be in the output.") : ''
    def prefix = task.ext.prefix ?: "${meta.id}"
    """

    echo '' | gzip > ${prefix}.vcf.gz
    touch ${meta.id}.expr.slivar.summary.txt

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        slivar: \$(slivar 2>&1 | head -n1 | sed 's/^.*version: //; s/ .*\$//')
        bcftools : \$(bcftools --version 2>&1 | head -n1 | sed 's/^.*bcftools //; s/ .*\$//')
    END_VERSIONS
    """
}
