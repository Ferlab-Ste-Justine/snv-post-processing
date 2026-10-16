//
// Subworkflow with functionality specific to the Ferlab-Ste-Justine/snv-post-processing pipeline
//

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    IMPORT FUNCTIONS / MODULES / SUBWORKFLOWS
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

include { UTILS_NFSCHEMA_PLUGIN } from '../../nf-core/utils_nfschema_plugin/main'
include { paramsSummaryMap          } from 'plugin/nf-schema'
include { samplesheetToList         } from 'plugin/nf-schema'
include { UTILS_NEXTFLOW_PIPELINE   } from '../../nf-core/utils_nextflow_pipeline'
include { completionSummary         } from '../../nf-core/utils_nfcore_pipeline'
include { dashedLine                } from '../../nf-core/utils_nfcore_pipeline'
include { nfCoreLogo                } from '../../nf-core/utils_nfcore_pipeline'
include { UTILS_NFCORE_PIPELINE     } from '../../nf-core/utils_nfcore_pipeline'
include { workflowCitation          } from '../../nf-core/utils_nfcore_pipeline'
include { isExomiserToolIncluded } from './utils'
include { isVepToolIncluded } from './utils'
include { isToolIncluded } from './utils'


/*
========================================================================================
    SUBWORKFLOW TO INITIALISE PIPELINE
========================================================================================
*/

workflow PIPELINE_INITIALISATION {

    take:
    version           // boolean: Display version and exit
    help              // boolean: Display help text
    validate_params   // boolean: Boolean whether to validate parameters against the schema at runtime
    monochrome_logs   // boolean: Do not use coloured log outputs
    nextflow_cli_args //   array: List of positional nextflow CLI args
    outdir            //  string: The output directory where the results will be saved
    input             //  string: Path to input samplesheet

    main:

    ch_versions = Channel.empty()

    //
    // Print version and exit if required and dump pipeline parameters to JSON file
    //
    UTILS_NEXTFLOW_PIPELINE (
        version,
        true,
        outdir,
        workflow.profile.tokenize(',').intersect(['conda', 'mamba']).size() >= 1
    )

    //
    // Validate parameters and generate parameter summary to stdout
    //
    pre_help_text = nfCoreLogo(monochrome_logs)
    post_help_text = '\n' + workflowCitation() + '\n' + dashedLine(monochrome_logs)
    def String workflow_command = "nextflow run ${workflow.manifest.name} -profile <docker/singularity/.../institute> --input samplesheet.csv --outdir <OUTDIR>"
    UTILS_NFSCHEMA_PLUGIN (
        workflow,
        validate_params,
        null,
        help,
        false,
        false,
        pre_help_text,
        post_help_text,
        workflow_command,
        null
    )

    //
    // Check config provided to the pipeline
    //
    UTILS_NFCORE_PIPELINE (
        nextflow_cli_args
    )
    //
    // Custom validation for pipeline parameters
    //
    validateInputParameters()

    //_________Local___________

    //
    // Create channel from input file provided through params.input
    //
    if (params.step == 'genotype' && input) {
        log.info("Reading input samplesheet")
        channel
            .fromList(samplesheetToList(params.input, "${projectDir}/assets/schema_input.json"))
            .map {
                meta, gvcf, _vcf, _tbi ->
                [meta.familyId, [meta, gvcf]]
            }
            .tap{ch_sample_simple} //Save this channel to join later
            .groupTuple()
            .map{
                familyId, ch_items ->
                if(isExomiserToolIncluded()){
                    validatePhenopacketFiles(familyId, ch_items)
                }
                if(isToolIncluded('slivar') || params.step == 'inheritance'){
                    validatePedFiles(familyId, ch_items)
                }
                [familyId, ch_items.size()]
            }
            .combine(ch_sample_simple,by:0)
            .map {
                id,size,metasfile -> //include sample count in meta
                    def meta = metasfile[0]
                    [
                        meta + [sampleSize: size] + [id: meta.familyId + "." + meta.sample], //meta.id is referenced in modules
                        metasfile[1]                       //file
                    ]
            }.set {ch_samplesheet}
    }
    else {
        // check if there is an intermediate file already available in the output directory
        input_restart = findIntermediateInput(params.step, outdir, params.exomiser_start_from_vep)

        if (input_restart && params.allow_intermediate_input) {
            log.info("Using intermediate input file: ${input_restart}")
            channel.fromPath(input_restart,checkIfExists: true)
                .splitCsv(header: true)
                .map { row ->
                    def meta = row.subMap('id','familyId', 'sequencingType')
                    // CSVs written before BIOINFO-240 hold a literal "[]" for an absent value.
                    meta += ['familyPheno': row.familyPheno && row.familyPheno != '[]' ? row.familyPheno : [] ]
                    meta += ['familyPed': row.familyPed && row.familyPed != '[]' ? row.familyPed : [] ]
                    def vcf = file(row.vcf, checkIfExists: true)
                    def tbi = row.tbi ? file(row.tbi, checkIfExists:true) : (file("${vcf}.tbi").exists() ? file("${vcf}.tbi") : [])
                    if (!tbi) {
                        log.warn "No TBI file found for VCF: ${vcf}"
                        }
                    [meta, vcf, tbi]
                }
                .set { ch_samplesheet }
        } else {
            channel
                .fromList(samplesheetToList(params.input, "${projectDir}/assets/schema_input.json"))
                .map {
                    meta, _gvcf, vcf, tbi ->
                    [ [ id:meta.familyId ] + meta, vcf, tbi]
            }
            .set { ch_samplesheet }
        }
    }

    emit:
    samplesheet = ch_samplesheet
    versions    = ch_versions
}

/*
========================================================================================
    SUBWORKFLOW FOR PIPELINE COMPLETION
========================================================================================
*/

workflow PIPELINE_COMPLETION {

    take:
    outdir          //    path: Path to output directory where results will be published
    monochrome_logs // boolean: Disable ANSI colour codes in log output
    command_line    //  string: Command line used to run the pipeline

    main:

    summary_params = paramsSummaryMap(workflow)

    //
    // Completion summary
    //
    workflow.onComplete {
        completionSummary(monochrome_logs)

        // Copy the nextflow log file to the pipeline info folder
        def log_file = getLogFile(command_line)
        def destination = getPipelineInfoFolder(outdir) + "/nextflow.log"
        log.info "Copying nextflow log file ${log_file} to ${destination}"
        file(log_file).copyTo(destination)
    }

    workflow.onError {
        log.error "Pipeline failed. Please refer to troubleshooting docs: https://nf-co.re/docs/usage/troubleshooting"
    }
}

/*
========================================================================================
    FUNCTIONS
========================================================================================
*/
//
//_____________Local functions_____________
//
// Extracts the nextflow log file path from the given command line string.
// If the '-log' option is present, it returns the specified log file path.
// Otherwise, it defaults to '.nextflow.log'.
//
def getLogFile(command_line) {
    if (!command_line) {
        error "Command line not provided"
    }

    // Tokenize the command line while preserving quoted arguments as single tokens.
    // For example, the command line 'arg1 "arg2 with spaces"' will be parsed into two tokens: 'arg1' and 'arg2 with spaces'.
    def matcher = command_line =~ /"([^"]+)"|'([^']+)'|(\S+)/
    def tokens = []
    matcher.each { match ->
        tokens << (match[1] ?: match[2] ?: match[3])
    }

    def log_option_index = tokens.lastIndexOf("-log")
    return log_option_index >= 0 ? tokens[log_option_index + 1] : '.nextflow.log'
}

//
// Returns the path to the pipeline info folder within the specified output directory.
// We encourage you to reuse this function instead of hardcoding the path to ease maintenance in
// case the folder structure changes in the future.
//
def getPipelineInfoFolder(outdir) {
    if (!outdir) {
        error "Output directory not provided"
    }
    return "${outdir}/pipeline_info"
}

def validatePhenopacketFiles(family_id, metafiles) {
    def phenopacket_files =  metafiles.collect{it[0].familyPheno}.unique(false)
    if(phenopacket_files.size() > 1){
        error("All samples in the same family must have the same familyPheno value in the input samplesheet. Found ${phenopacket_files} in family ${family_id}.")
    }
}

def validatePedFiles(family_id, metafiles) {
    def ped_files = metafiles.collect{ entry -> entry[0].familyPed }.findAll{ ped -> ped }.unique(false)
    if (ped_files.size() > 1) {
        error("Samples in the same family must reference the same familyPed value in the input samplesheet. Found ${ped_files} in family ${family_id}.")
    }
}

def findIntermediateInput(step, outdir, exomiser_start_from_vep) {
    def input_file = null
    def intermediate_file = null
    if (step == "normalize") {
        return false
    }
    if (step == "genotype") {
        error("Must provide samplesheet as input for genotype step.")
    } else if (step == "annotation") {
        intermediate_file = file(outdir + "/csv/normalized_genotypes.csv")
    } else if (step == "exomiser") {
        if (exomiser_start_from_vep) {
            intermediate_file = file(outdir + "/csv/ensemblvep.csv")
        } else {
            intermediate_file = file(outdir + "/csv/normalized_genotypes.csv")
        }
    } else if (step == "inheritance") {
        intermediate_file = file(outdir + "/csv/ensemblvep.csv")
    } else {
        error("Unknown step: ${step}")
    }
    if (intermediate_file.exists()) {
        input_file = intermediate_file
    }

    return input_file
}

//
// Validate that the provided VEP cache version corresponds to the VEP version in the container(s)
//
def validateVepCacheVersion() {
    def vep_container = workflow.container.find{ it -> it.key.contains('ENSEMBLVEP_VEP') }
    def cache_version = params.vep_cache_version.toString()
    def version_ok = vep_container.value.contains(cache_version)
    if (params.download_cache) {
        def vep_download_container = workflow.container.find{ it -> it.key.contains('ENSEMBLVEP_DOWNLOAD') }
        version_ok = version_ok && vep_download_container.value.contains(cache_version)
        vep_container = [ vep_container ]  + [ vep_download_container ]
    }
    version_ok ?: error("ERROR ~ The specified VEP cache version '${cache_version}' does not correspond to the VEP version in one or more of the specified container(s):\n\n${vep_container}\n\nPlease provide the correct container(s) in the config file.\n")
}

//_____________Template functions_____________
//
// Check and validate pipeline parameters
//
def validateInputParameters() {

    if ((isVepToolIncluded() || (params.step == 'annotation')) || params.download_cache) {
        validateVepCacheVersion()
    }

    if (params.allow_old_gatk_data) {
        log.warn "The 'allow_old_gatk_data' parameter is set to true, allowing the pipeline to run with older GATK data in GATK4_GENOTYPEGVCFS. Not recommended for production."
    }
    if (params.allow_intermediate_input && params.step != 'genotype') {
        log.warn "The 'allow_intermediate_input' parameter is set to true, pipeline will use intermediate input files if available."
    }
    if (params.step == 'exomiser' && !isExomiserToolIncluded()) {
        log.warn "Step is exomiser but Exomiser is not included in tools. Running Exomiser by default."
    }
    if (params.step == 'annotation' && !isVepToolIncluded()) {
        log.warn "Step is annotation but Ensembl VEP is not included in tools. Running VEP for annotation by default."
    }
    if ( params.step in ['genotype','normalize'] && (!params.tools && !params.save_genotyped ) ){
        log.warn "No tools provided. Publishing genotyped results by default."
    }
    if (params.step == 'inheritance' && !isToolIncluded('slivar')) {
        log.warn "Step is inheritance but Slivar is not included in tools. Running Slivar by default."
    }
    genomeExistsError()
}

//
// Get attribute from genome config file e.g. fasta
//
def getGenomeAttribute(attribute) {
    if (params.genomes && params.genome && params.genomes.containsKey(params.genome)) {
        if (params.genomes[ params.genome ].containsKey(attribute)) {
            return params.genomes[ params.genome ][ attribute ]
        }
    }
    return null
}

//
// Exit pipeline if incorrect --genome key provided
//
def genomeExistsError() {
    if (params.genomes && params.genome && !params.genomes.containsKey(params.genome)) {
        def error_string = "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n" +
            "  Genome '${params.genome}' not found in any config files provided to the pipeline.\n" +
            "  Currently, the available genome keys are:\n" +
            "  ${params.genomes.keySet().join(", ")}\n" +
            "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
        error(error_string)
    }
}
