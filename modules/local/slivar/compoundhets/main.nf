process SLIVAR_COMPOUNDHETS {
    tag "$meta.id"
    label 'process_single'

    // No biocontainer for slivar: brentp (its author) publishes the image on Docker Hub. Pinned
    // to a release tag: untagged, it floats with :latest (same image as v0.3.1 as of 2026-11).
    // The docker.io/ prefix keeps a global docker.registry from rewriting it to a registry
    // that doesn't host it.
    container "docker.io/brentp/slivar:v0.3.1"

    input:
    tuple val(meta), path(vcf), path(ped)

    output:
    tuple val(meta), path("*.vcf.gz"), emit: vcf
    tuple val(meta), path("*.tbi"), optional:true, emit: tbi
    tuple val(meta), path("*.slivar.summary.txt"), optional:true, emit: summary
    path "versions.yml", emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def args = task.ext.args ?: ''
    !(args.contains("--sample-field") || args.contains("-s")) ? log.warn("It is recommended to specify the sample field using --sample-field or -s when running slivar compound-hets.") : ''
    def prefix = task.ext.prefix ?: "${meta.id}"
    def ped_arg = ped ? "-p $ped" : ''
    slivar_ch_summary = "${meta.id}.ch.slivar.summary.txt"
    """
    export SLIVAR_SUMMARY_FILE=$slivar_ch_summary

    slivar compound-hets \\
        --vcf $vcf \\
        $ped_arg \\
        $args \\
    | bcftools view -Oz -o ${prefix}.vcf.gz

    bcftools index -t ${prefix}.vcf.gz

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        slivar: \$(slivar 2>&1 | head -n1 | sed 's/^.*version: //; s/ .*\$//')
        bcftools : \$(bcftools --version 2>&1 | head -n1 | sed 's/^.*bcftools //; s/ .*\$//')
    END_VERSIONS
    """

    stub:
    def args = task.ext.args ?: ''
    def prefix = task.ext.prefix ?: "${meta.id}"
    slivar_ch_summary = "${meta.id}.ch.slivar.summary.txt"
    """

    echo '' | gzip > ${prefix}.vcf.gz
    touch ${prefix}.vcf.gz.tbi

    touch $slivar_ch_summary

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        slivar: \$(slivar 2>&1 | head -n1 | sed 's/^.*version: //; s/ .*\$//')
        bcftools : \$(bcftools --version 2>&1 | head -n1 | sed 's/^.*bcftools //; s/ .*\$//')
    END_VERSIONS
    """
}
