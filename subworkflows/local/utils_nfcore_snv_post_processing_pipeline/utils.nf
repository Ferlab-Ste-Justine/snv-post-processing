def isVepToolIncluded() {
    return isToolIncluded("vep")
}

def isExomiserToolIncluded() {
    return isToolIncluded("exomiser")
}

def isToolIncluded(tool) {
    return params.tools && params.tools.split(",").contains(tool)
}

// Fails the run when the PED doesn't match the family VCF, before slivar misreads
// the family:
//   - every VCF sample needs a PED row under the same ID: slivar ignores a sample
//     without one, and with no affected child matched it fails late and unclearly;
//   - a parent named for a sequenced sample must be in the VCF, or written as 0:
//     slivar (0.3.1) drops a child's link to its mother when the named father is
//     absent, so inheritance and parental-origin tags go silently missing or wrong.
// Rows for relatives who aren't in the VCF are allowed and not checked.
// warn_only (--skip_ped_validation): report the problems as a warning and continue.
def validatePedAgainstVcf(family_id, vcf, ped, warn_only = false) {
    def vcf_samples = vcfSampleNames(vcf)
    def rows = ped.readLines()
        .findAll { line -> !line.startsWith('#') }
        .collect { line -> line.trim().split(/\s+/) }
        .findAll { cols -> cols.size() >= 4 }
    def ped_samples = rows.collect { cols -> cols[1] }
    def problems = []

    def without_row = vcf_samples.findAll { sample -> !(sample in ped_samples) }
    if (without_row) {
        problems << "VCF samples without a PED row: ${without_row.join(', ')} (the PED must use the VCF's sample IDs)"
    }
    rows.findAll { cols -> cols[1] in vcf_samples }.each { cols ->
        [father: cols[2], mother: cols[3]].each { role, parent ->
            if (parent != '0' && !(parent in vcf_samples)) {
                problems << "${cols[1]}'s ${role} '${parent}' isn't in the VCF (write an unsequenced parent as 0)"
            }
        }
    }

    if (problems) {
        def message = ["Family '${family_id}': the PED file doesn't match the family VCF (${ped}):"]
        message += problems.collect { problem -> "  - ${problem}" }
        message << "Samples in the VCF: ${vcf_samples.join(', ')}."
        message << "slivar would leave out or misread these family members, so inheritance and parental-origin tags would be missing or wrong."
        if (warn_only) {
            message << "--skip_ped_validation is set, so slivar runs anyway."
            log.warn(message.join('\n'))
        } else {
            message << "To run anyway, with this as a warning, set --skip_ped_validation."
            error(message.join('\n'))
        }
    }
}

// Sample names from the VCF header's #CHROM line (bgzipped or plain).
def vcfSampleNames(vcf) {
    def input = vcf.toString().endsWith('.gz') ? new java.util.zip.GZIPInputStream(vcf.newInputStream()) : vcf.newInputStream()
    return input.withReader { reader ->
        def line
        while ((line = reader.readLine()) != null) {
            if (line.startsWith('#CHROM')) {
                return line.split('\t').drop(9) as List
            }
            if (!line.startsWith('#')) {
                break
            }
        }
        return []
    }
}
