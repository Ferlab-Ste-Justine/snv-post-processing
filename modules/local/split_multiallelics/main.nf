process SPLIT_MULTIALLELICS {
    tag "$meta.id"
    label 'process_single'

    container "${ workflow.containerEngine == 'singularity' && !task.ext.singularity_pull_docker_container ?
        'https://depot.galaxyproject.org/singularity/bcftools:1.20--h8b25389_0' :
        'biocontainers/bcftools:1.20--h8b25389_0' }"

    input:
    tuple val(meta),  path(vcf), path(tbi)
    tuple val(meta2), path(fasta)

    output:
    tuple val(meta), path("*.vcf.gz")    , emit: vcf
    tuple val(meta), path("*.vcf.gz.tbi"), emit: tbi
    path "versions.yml"                  , emit: versions

    when:
    task.ext.when == null || task.ext.when

    script:
    def args   = task.ext.args   ?: ''
    def prefix = task.ext.prefix ?: "${meta.id}"
    """
    bcftools annotate -x FORMAT/PRI $vcf \\
        | bcftools norm -c w -m -any -f $fasta --old-rec-tag OLD_RECORD -Ou \\
        | bcftools view --min-ac 1 -Oz --write-index=tbi --output ${prefix}.vcf.gz $args

    # Quoted: unquoted, the versions report reads bcftools 1.20 as the number 1.2.
    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        bcftools: "\$(bcftools --version 2>&1 | head -n1 | sed 's/^.*bcftools //; s/ .*\$//')"
    END_VERSIONS
    """

    stub:
    def prefix = task.ext.prefix ?: "${meta.id}"
    """
    echo "" | gzip > ${prefix}.vcf.gz
    touch ${prefix}.vcf.gz.tbi

    cat <<-END_VERSIONS > versions.yml
    "${task.process}":
        bcftools: "\$(bcftools --version 2>&1 | head -n1 | sed 's/^.*bcftools //; s/ .*\$//')"
    END_VERSIONS
    """
}
