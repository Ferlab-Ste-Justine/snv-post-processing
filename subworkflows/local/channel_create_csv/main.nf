/**
WORKFLOW CREATE CSV
    This subworkflow creates a CSV file from the input channel.
    The CSV file contains the header and the paths of the files.
*/

workflow CHANNEL_CREATE_CSV {

    take:
    ch_input // channel: [ val(meta), [ bam, bai] ]
    tool // string: name of the step
    outdir  // params.outdir - output directory
    tool_outdir // Optional - Directory for the tool's output files. Must match the tool's output directory. If not provided, the default is the outdir/tool.

    main:

    def dir = tool_outdir ?: "${outdir}/${tool}" // set the output directory of the results

    ch_input.map { channel ->
        def meta = channel[0].collectEntries { k, v ->
                    [ k, v instanceof Path ? v.toUriString() : v] }  // to not loose the complete path when there are meta fields that are files.
        def files = channel[1..-1]
        [meta, files]
        }
        // collect the channel to a CSV file
        .collectFile(keepHeader: true, skip: 1, sort: true, storeDir: "${outdir}/csv") { meta, files ->
            def column_names = meta.keySet().sort()
            // An absent optional value (familyPed/familyPheno are held as []) is written as an
            // empty field. Written as "[]", it fails schema validation when this CSV is passed
            // back as --input, and is read as a file path on an intermediate-input restart.
            def column_values = column_names.collect{ key -> (meta[key] == null || meta[key] == []) ? '' : meta[key] }
            def header = column_names.join(",") // create header from the keys of the meta map
            // generate output directory path for each file in files, check if they exist
            def files_path = files.collect { outfile ->
                                def filetype = outfile.name.replaceAll(/\.gz$/, '').tokenize('.')[-1]
                                header += ",${filetype}" // get type of file and add to header
                                return "${dir}/${outfile.name}" // return the final ouput path of the file
                            }.join(",") // if multiple files, join the paths with a comma
            ["${tool}.csv", "${header}\n${column_values.join(",")},${files_path}\n"]
    }

}
