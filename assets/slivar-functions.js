// slivar JS helpers + mode-of-inheritance (MoI) tag functions.
//
// Loaded by `slivar expr --js` from conf/slivar.config. The config file calls
// the moi_*(fam) functions defined at the bottom of this file; everything
// above them is the building blocks.
//
// Family-structure handling:
//   - de novo (autosomal & X-linked) self-gates to trios because
//     segregating_denovo / segregating_denovo_x require both parents in `s`.
//   - dominant (autosomal & X-linked) is gated by has_aff_parent(fam)
//     so it doesn't fire on de novo events (kid het + parents hom_ref).
//   - recessive accepts any family structure where `fam.every(segregating_*)`
//     passes. With strict carrier rules below, that's trios, duos with the
//     informative parent, single-parent + sibling families, and solos.
//   - het_side covers compound-het detection for any non-trio family; trios
//     use the transmission-aware comphet_side(kid, mom, dad) via --trio.
//   - unknown_*_genotype / non_carrier_proband say why a family or proband
//     can't get a transmission mode (Radiant's values; see the section
//     "Transmission-mode sentinels" below).

// ---------------------------------------------------------------------------
// Quality config + hq filters
// ---------------------------------------------------------------------------
var config = {min_GQ: 20, min_AB: 0.20, min_DP: 6, min_male_X_GQ: 10, min_male_X_DP: 6}

function hq(kid, mom, dad, isX) {
  return hq1(kid, isX) && hq1(mom, isX) && hq1(dad, isX)
}

function hq1(sample, isX) {
  var gq = isX && sample.sex == 'male' ? config.min_male_X_GQ : config.min_GQ
  var dp = isX && sample.sex == 'male' ? config.min_male_X_DP : config.min_DP

  if (sample.unknown || (sample.GQ < gq)) return false;
  if ((sample.AD[0] + sample.AD[1]) < dp) return false;
  if (sample.hom_ref) return sample.AB < 0.02
  if (sample.het)     return sample.AB >= config.min_AB && sample.AB <= (1 - config.min_AB)
  return sample.AB > 0.98
}


// ---------------------------------------------------------------------------
// Trio-style compound-het helpers
// ---------------------------------------------------------------------------
// Used by `--trio 'comphet_side:comphet_side(kid, mom, dad)'` in slivar.config.

// True iff `sample` looks like one side of a compound het in isolation.
function solo_ch_het_side(sample) {
  return sample.het && hq1(sample)
}

// Standard slivar trio comphet_side: kid het, parents asymmetric (one het
// one hom_ref) so we can pin which parent the variant came from, and
// neither parent hom_alt (clinical heuristic: an unaffected hom_alt parent
// is strong evidence the variant isn't pathogenic enough to be a comphet side).
function comphet_side(kid, mom, dad) {
  return kid.het
      && (solo_ch_het_side(mom) != solo_ch_het_side(dad))
      && mom.alts != 2 && dad.alts != 2
      && solo_ch_het_side(kid) && hq1(mom) && hq1(dad);
}


// ---------------------------------------------------------------------------
// Per-sample segregation predicates (called via fam.every(...))
// ---------------------------------------------------------------------------
// Each function takes ONE family member `s` and returns true iff that member's
// genotype is consistent with the MoI. fam.every(seg_*) then aggregates across
// the whole family. Slivar populates s.mom, s.dad, s.kids based on the PED.

// --- de novo (autosomal) ---
function segregating_denovo(s) {
  if (!hq1(s)) return false;
  if (!s.affected) return s.hom_ref;
  if (s.hom_alt) return false;
  if (!(s.het && s.AB >= config.min_AB && s.AB <= (1 - config.min_AB))) return false;
  // Both parents must be present in the family -- de novo isn't provable otherwise.
  return ("mom" in s) && ("dad" in s);
}

// --- recessive (autosomal) ---
// Affected      => hom_alt
// Unaffected parent => MUST be het (carrier). hom_ref violates Mendelian
//                     inheritance given an affected hom_alt child.
// Unaffected non-parent (sibling) => het OR hom_ref (both Mendelian).
function segregating_recessive(s) {
  if (!hq1(s)) return false;
  if (variant.CHROM == "chrX" || variant.CHROM == "X") return segregating_recessive_x(s);
  if (s.affected) return s.hom_alt;
  // Unaffected: stricter rule for parents, permissive for sibs.
  if (has_kids_in_fam(s)) return s.het;
  return s.het || s.hom_ref;
}

// --- dominant (autosomal) ---
// Affected   => het OR hom_alt   (homozygous-affected for a dominant variant is
//                                  biologically possible, e.g. when both parents
//                                  are het carriers; matches GE's
//                                  InheritedAutosomalDominant filter)
// Unaffected => hom_ref (strict, including AB < 0.01 to exclude noisy hom_refs)
// Note: this function alone does NOT enforce "an affected parent exists" --
// that's done at the moi_dominant(fam) level via has_aff_parent(fam),
// otherwise this rule would also accept de novo events.
function segregating_dominant(s) {
  if (variant.CHROM == "chrX" || variant.CHROM == "X") return segregating_dominant_x(s);
  if (!hq1(s)) return false;
  if (s.affected) return s.het || s.hom_alt;
  return s.hom_ref && s.AB < 0.01;
}

// --- X-linked predicates (delegated to from the autosomal ones) ---
function hom_ref(s)        { return s && s.hom_ref && hq1(s); }

// MODIFIED from upstream slivar (https://github.com/brentp/slivar/blob/master/js/slivar-functions.js):
//   * Added hq1(s, true) gate at the top -- moi_x_recessive calls this function
//     directly without running hq1, so low-quality / unknown samples would otherwise slip through.
//     Passing isX=true so male-X-relaxed GQ/DP thresholds apply.
//   * Affected male tightened from `s.het || s.hom_alt` to `s.hom_alt` only.
//   * Unaffected male tightened from implicit `!(s.het || s.hom_alt)` to explicit `s.hom_ref`.
function segregating_recessive_x(s) {
  if (!hq1(s, true)) return false;
  if (s.sex == "female") return s.affected == s.hom_alt;
  if (s.sex == "male") {
    if (s.affected) return s.hom_alt;
    return s.hom_ref;
  }
  return false;
}

function parents_x_dn_or_homref(s) {
  if (!("mom" in s) || !("dad" in s)) return false;
  return (hom_ref(s.mom) || segregating_denovo_x(s.mom))
      && (hom_ref(s.dad) || segregating_denovo_x(s.dad));
}

function segregating_denovo_x(s) {
  if (s.sex == "female") {
    if (s.affected) return s.het && hq1(s) && parents_x_dn_or_homref(s);
    return s.hom_ref;
  }
  if (s.sex == "male") {
    if (s.affected) return (s.het || s.hom_alt) && parents_x_dn_or_homref(s);
    return s.hom_ref;
  }
  return false;
}

// MODIFIED from upstream slivar (https://github.com/brentp/slivar/blob/master/js/slivar-functions.js):
//   * Kids check in the affected-male branch now only requires DAUGHTERS to be affected
//     (was: "all kids of affected dad must be affected").
function segregating_dominant_x(s) {
  if (!s.affected) return hq1(s, true) && s.hom_ref;

  if (s.sex == "male") {
    var kids = ("kids" in s) ? s.kids : [];
    for (var i=0; i < kids.length; i++) {
      var kid = kids[i];
      // Only daughters of an affected dad are required to be affected.
      if (kid.sex == "female" && !kid.affected) return false;
    }
    if (("mom" in s) && !(s.mom.affected == s.mom.het)) return false;
    if (("mom" in s) && !hq1(s.mom, true)) return false;
    if (("dad" in s) && !hq1(s.dad, true)) return false;
    return (s.hom_alt || s.het) && hq1(s, true);
  }

  if (s.sex != "female") return false;
  // Female: inherited dominant only -- de novos on chrX are handled by segregating_denovo_x.
  if (("mom" in s) || ("dad" in s)) {
    if (!((("mom" in s) && s.mom.affected && s.mom.het)
      || (("dad" in s) && s.dad.affected && s.dad.het))) return false;
    if (("dad" in s) && !hq1(s.dad, true)) return false;
    if (("mom" in s) && !hq1(s.mom, true)) return false;
  }
  return s.het && hq1(s, true);
}


// ---------------------------------------------------------------------------
// Family-level helpers
// ---------------------------------------------------------------------------
function is_autosomal() { return variant.CHROM !== "X" && variant.CHROM !== "chrX"; }
function is_x_linked()  { return variant.CHROM === "X" || variant.CHROM === "chrX"; }

// When the PED names a parent who isn't in the VCF, slivar omits `kids` on
// that parent's children (see "Transmission-mode sentinels" below). Reading a
// missing attribute throws, and slivar then counts the whole expression as
// false, silently dropping its tag. Use this instead of reading s.kids.
function has_kids_in_fam(s) { return ("kids" in s) && s.kids.length > 0; }

// True iff any family member is BOTH affected AND has children in the
// family (i.e. they're an affected parent we observe). Gates
// `autosomal_dominant` / `x_linked_dominant` so they don't fire on de novo
// configurations.
function has_aff_parent(fam) {
  for (var i=0; i<fam.length; i++) {
    var s = fam[i];
    if (s.affected && has_kids_in_fam(s)) return true;
  }
  return false;
}

function has_affected_of_sex(fam, sex) {
  for (var i=0; i<fam.length; i++) {
    if (fam[i].affected && fam[i].sex == sex) return true;
  }
  return false;
}

// True iff any affected family member is hq-het. Used by moi_het_side.
function proband_het(fam) {
  for (var i=0; i<fam.length; i++) {
    var s = fam[i];
    if (s.affected && s.het && hq1(s)) return true;
  }
  return false;
}

// True iff any UNAFFECTED PARENT in the family is hom_alt. Used to drop
// duo het_side candidates that wouldn't be a plausible disease-causing
// comphet side (mirrors the mom.alts != 2 && dad.alts != 2 rule in
// the trio comphet_side function).
function present_parent_hom_alt(fam) {
  for (var i=0; i<fam.length; i++) {
    var s = fam[i];
    if (s.affected) continue;
    if (!has_kids_in_fam(s)) continue;  // skip non-parents (siblings)
    if (s.hom_alt && hq1(s)) return true;
  }
  return false;
}

// True iff the affected proband has both parents in the family. Used to
// route compound-hets: trios use --trio comphet_side (transmission-aware);
// everything else uses moi_het_side.
function proband_has_both_parents(fam) {
  for (var i=0; i<fam.length; i++) {
    var s = fam[i];
    if (s.affected && ("mom" in s) && ("dad" in s)) return true;
  }
  return false;
}

// True iff no family member has children in the family (i.e. no parents are
// in the PED). Covers both:
//   * literal solos (fam.length === 1)
//   * sibships (multiple sibs, no parents)
// Both configurations provide zero segregation evidence for single-variant
// MoIs (recessive, x_recessive)
function no_parents_in_fam(fam) {
  for (var i=0; i<fam.length; i++) {
    var s = fam[i];
    if (has_kids_in_fam(s)) return false;
  }
  return true;
}


// ---------------------------------------------------------------------------
// Mode-of-inheritance tag functions
// ---------------------------------------------------------------------------
// One named function per --family-expr tag in conf/slivar.config. Each one
// fully encodes the chromosome guard + family-level gate + per-sample
// segregation check for that tag. The AF clause stays in slivar.config
// because it depends on Nextflow params.

function moi_denovo(fam)      { return is_autosomal() && fam.every(segregating_denovo); }
function moi_recessive(fam)   { return is_autosomal() && !no_parents_in_fam(fam) && fam.every(segregating_recessive); }
function moi_dominant(fam)    { return is_autosomal() && has_aff_parent(fam) && fam.every(segregating_dominant); }
function moi_x_denovo(fam)    { return is_x_linked()  && fam.every(segregating_denovo_x); }
function moi_x_recessive(fam) { return is_x_linked()  && !no_parents_in_fam(fam) && fam.every(segregating_recessive_x); }
function moi_x_dominant(fam)  { return is_x_linked()  && has_aff_parent(fam) && fam.every(segregating_dominant_x); }

// Radiant names an X-linked de novo by the child's sex: a daughter's (het) is
// x_linked_dominant_de_novo, a son's (hemizygous) is x_linked_recessive_de_novo.
// moi_x_denovo only passes when every affected member has both parents in the
// family, so every affected member is a de novo child here. Affected siblings
// of both sexes would set both tags.
function moi_x_denovo_female(fam) { return moi_x_denovo(fam) && has_affected_of_sex(fam, "female"); }
function moi_x_denovo_male(fam)   { return moi_x_denovo(fam) && has_affected_of_sex(fam, "male"); }

// Uniparental disomy: an affected proband is hom_alt and exactly ONE parent is
// hom_ref, meaning both copies of the chromosome came from the carrier parent
// (Mendelian violation diagnostic of UPD, or alternatively a deletion in trans
// in the hom_ref parent, or somatic mosaicism).
//
// Requires a complete trio: we can't detect the Mendelian violation without
// both parents.
//
function moi_upd(fam) {
  if (!is_autosomal()) return false;
  for (var i=0; i<fam.length; i++) {
    var s = fam[i];
    if (!s.affected || !s.hom_alt || !hq1(s)) continue;
    if (!("mom" in s) || !("dad" in s)) continue;
    if (!hq1(s.mom) || !hq1(s.dad)) continue;
    if (s.mom.hom_ref !== s.dad.hom_ref) return true;
  }
  return false;
}

// Compound-het sides for non-trio families. Trios use comphet_side(kid, mom, dad)
// via slivar's --trio (transmission-aware). Everything else (duos, solos,
// single-parent + sib, sibship-only) goes here:
//   * any hq het in an affected family member
//   * dropped if any unaffected parent is hom_alt (clinical heuristic,
//     parallels the trio rule)
function moi_het_side(fam) {
  if (proband_has_both_parents(fam)) return false;     // trios -> use comphet_side instead
  return !present_parent_hom_alt(fam) && proband_het(fam);
}

// Family structure is enough to confirm X-linked recessive when either we have
// a full trio, or the affected proband is male with mom in the PED (males
// inherit X only from mom, so mom's carrier status alone confirms transmission).
function x_recessive_provable(fam) {
  for (var i=0; i<fam.length; i++) {
    var s = fam[i];
    if (!s.affected) continue;
    if (("mom" in s) && ("dad" in s)) return true;
    if (s.sex === "male" && ("mom" in s)) return true;
  }
  return false;
}

// Fires alongside an MoI tag when family structure is insufficient to confirm
// its segregation. The other MoIs (denovo, dominant, x_denovo, x_dominant, upd)
// only fire when their family-structure prerequisite is met, so they never
// need a candidate flag:
//   * denovo / x_denovo / upd self-gate to trios (need both parents)
//   * dominant / x_dominant only fire via the has_aff_parent gate, which
//     itself supplies the segregation evidence
//
// Only recessive (needs both parents to verify both are carriers) and
// x_recessive (needs both parents OR male proband with mom) can fire here
// without sufficient structural proof.
//
// NOTE: the comphet pathway is intentionally NOT included here. The previous
// `moi_het_side(fam)` clause fired BEFORE slivar compound-hets had paired
// anything, setting `candidate` on every hq het in an affected non-trio
// member (~thousands per duo). Most never paired into a comphet, leaving
// orphan candidate tags with no MoI partner in the published VCF. Restoring
// condition (c) of the doc (candidate co-labels non-trio slivar_comphets)
// requires a post-compoundhets step -- either a second slivar expr pass
// over INFO/slivar_comphet, or bcftools post-processing with a per-family
// is_non_trio flag. Tracked as a follow-up.
function moi_candidate(fam) {
  if (moi_recessive(fam)   && !proband_has_both_parents(fam)) return true;
  if (moi_x_recessive(fam) && !x_recessive_provable(fam))    return true;
  return false;
}


// ---------------------------------------------------------------------------
// Transmission-mode sentinels
// ---------------------------------------------------------------------------
// Port of the early returns in radiant/tasks/vcf/snv/germline/occurrence.py::
// compute_transmission_mode(); the tag names in conf/slivar.config are
// Radiant's values verbatim. An "unknown" parent here is one that isn't in
// the family at all (not sequenced). A parent who is in the family but has
// no usable call is a different case, covered by the po_possible_* tags.
//
// The parent checks are family-level (--family-expr). The proband checks run
// per kid via --trio, so they only fire in complete trios -- as in Radiant,
// where a missing parent takes precedence over the proband's genotype.
//
// One deliberate departure: Radiant only computes a transmission mode when at
// least one parent is present, so it never actually returns
// unknown_parents_genotype. Here it fires for solos and sibships.
//
// Parents are found as members with children in the family, by sex, rather
// than through the kid's mom/dad links: when the PED names a parent who isn't
// in the VCF, slivar (0.3.1) drops the kid's `kids` attribute and, when the
// missing parent is the father, the kid's `mom` link too. So a duo whose PED
// names an unsequenced father would look parentless.

// BIOINFO-239: When one PED parent is missing from the VCF, slivar can drop the child's link to the other parent.
// the helper finds parents from the other direction: anyone in the family with children there is a parent,
// and their PED sex says whether they're the father or the mother.
function has_parent_of_sex(fam, sex) {
  for (var i=0; i<fam.length; i++) {
    if (has_kids_in_fam(fam[i]) && fam[i].sex == sex) return true;
  }
  return false;
}

// BIOINFO-239: nobody in the family has children there (solos, sibships);
function moi_unknown_parents_genotype(fam) {
  for (var i=0; i<fam.length; i++) {
    if (has_kids_in_fam(fam[i])) return false;
  }
  return true;
}

// BIOINFO-239: a mother is present, no father;
function moi_unknown_father_genotype(fam) {
  return has_parent_of_sex(fam, "female") && !has_parent_of_sex(fam, "male");
}

// BIOINFO-239: a father is present, no mother;
function moi_unknown_mother_genotype(fam) {
  return has_parent_of_sex(fam, "male") && !has_parent_of_sex(fam, "female");
}

// BIOINFO-239: Proband genotype after the same low-depth downgrade parental_origin() uses
// (po_adj): 0 = hom-ref, -1 = no-call or too few reads to trust.
// Here, every trio child who loses their po_* tag gets exactly one of the two explanations.
function proband_non_carrier(kid) { return po_adj(kid) === 0; }
function proband_gt_unknown(kid)  { return po_adj(kid) === -1; }

/*

##########################################
            PARENTAL ORIGIN
##########################################

*/
// Reproduces radiant/tasks/vcf/snv/germline/occurrence.py::parental_origin()
// (AUTOSOMAL_ORIGINS_LOOKUP / X_ORIGINS_LOOKUP / Y_ORIGINS_LOOKUP) as a
// custom function file for slivar (--js).
//
// FIDELITY NOTE
// -------------
// slivar's sample objects only expose genotype *dosage* via `.alts`:
//   -1 = unknown, 0 = hom-ref, 1 = het, 2 = hom-alt
//   In other words:
//     what fraction of this person's copies at this site are alt?"
//     0 = 0% alt (all copies ref)
//     1 = 50% alt (exactly possible only with 2 copies: one ref, one alt — heterozygous)
//     2 = 100% alt (every copy present is alt)
// They never expose raw genotype ploidy (a true haploid "1" GT vs a diploid
// "1/1" GT). The Python implementation leans on that raw ploidy, in a few
// X/Y lookup entries, purely as a proxy for whether the site sits in the
// pseudoautosomal region (PAR) -- where X and Y both carry the same,
// fully-diploid, autosomally-recombining sequence -- or in true non-PAR X/Y,
// where males are genuinely hemizygous.
//
// Rather than guess ploidy from a caller-dependent GT representation, this
// port checks PAR membership directly from genomic coordinates (ground
// truth, independent of how the caller encoded the genotype) via
// isPseudoautosomal() below, using GRCh38/hg38 PAR1/PAR2 boundaries (this
// repo targets hg38 -- see design/SJRA-1751-somatic-snv-tumor-only-ingestion.md).
// That removes the ambiguity entirely instead of merely approximating it:
//   - In PAR: everyone is diploid and inheritance is plain autosomal, so
//     AUTOSOMAL_ORIGINS is used regardless of chromosome or sex.
//   - Outside PAR: males are unambiguously hemizygous, so the son/Y tables
//     are exact, not approximations.
//
// Update the PAR_REGIONS table below if this is ever run against GRCh37/hg19
// data (different boundaries, and PAR2 differs between chrX and chrY).

var DENOVO = "DENOVO";
var MOTHER = "MOTHER";
var FATHER = "FATHER";
var BOTH = "BOTH";
var AMBIGUOUS = "AMBIGUOUS";
var POSSIBLE_DENOVO = "POSSIBLE_DENOVO";
var POSSIBLE_MOTHER = "POSSIBLE_MOTHER";
var POSSIBLE_FATHER = "POSSIBLE_FATHER";
var UNKNOWN = "UNKNOWN";
// Returned when the proband is hom-ref or has no usable call: no po_* tag
// fires, and non_carrier_proband / unknown_proband_genotype says why.
var NO_ORIGIN = null;
// JT: suggestion to keep 3 or 4 values only : DENOVO/MOTHER/FATHER/BOTH (Bi-parental) /UNKNOWN
// Bi-parental: for homozygous-recessive cases where both parents are obligate carriers

// Autosomal: keyed "kid_dad_mom" dosage. Exact port of AUTOSOMAL_ORIGINS_LOOKUP.
/*
break down the key format: "kid_dad_mom", where each number is that sample's dosage —
how many copies of the alt allele they carry at this position (matching Slivar's own
.alts convention: -1 unknown, 0 hom-ref, 1 het, 2 hom-alt).
A person is diploid — two copies of each autosome, one from each parent. So dosage 2
doesn't mean "two alt alleles that arrived together," it means the genotype call is
1/1: both of that person's copies at this position are the alt allele. Dosage 0 = 0/0
(both copies ref), 1 = 0/1 (one ref, one alt — heterozygous).
      Example:
      "2_0_0": DENOVO — kid is 1/1 (has alt on both copies), dad is 0/0, mom is 0/0.
      Neither parent has a single alt allele between them, yet the kid has two.
      That's not really explainable by a single ordinary transmission event — normally
      you'd need an alt allele from at least one parent to end up with even one copy
      in the kid. This bucket is really "unexplained by the observed parental genotypes"
      — it's labeled DENOVO as the best-fit bucket, but with two alt copies and zero alt
      alleles in either parent, this combination in real data is more often a
      genotyping/Mendelian-inconsistency flag than a literal two-mutation event.
*/
// REVIEW CANDIDATE: "2_1_-1" / "2_2_-1" (dad known-alt, mom unknown) and their   <-------
// mirror "2_-1_1" / "2_-1_2" (mom known-alt, dad unknown). Kid is hom-alt (2),
// which is only reachable if BOTH parents' donated copies were alt -- so the
// *unknown* parent is just as mathematically forced to have contributed alt
// as the known one is. Yet the label names only the known parent (FATHER /
// MOTHER) instead of BOTH, even though "2_1_1"/"2_1_2"/"2_2_1"/"2_2_2" (both
// parents actually observed) correctly say BOTH for the identical situation.
// Confirm whether "only assert what's directly observed" is deliberate
// policy (never claim a parent we didn't see) or an oversight.
var AUTOSOMAL_ORIGINS = { // i.e. non-sex chromosomes AND PAR regions
  "1_0_0":  DENOVO,           "1_0_1":  MOTHER,           "1_0_2":   MOTHER,     "1_0_-1":  POSSIBLE_DENOVO,
  "1_1_0":  FATHER,           "1_1_1":  AMBIGUOUS,        "1_1_2":   MOTHER,     "1_1_-1":  POSSIBLE_FATHER,
  "1_2_0":  FATHER,           "1_2_1":  FATHER,           "1_2_2":   AMBIGUOUS,  "1_2_-1":  FATHER,
  "1_-1_0": POSSIBLE_DENOVO,  "1_-1_1": POSSIBLE_MOTHER,  "1_-1_2":  MOTHER,     "1_-1_-1": UNKNOWN,
  "2_0_0":  DENOVO,           "2_0_1":  MOTHER,           "2_0_2":   MOTHER,     "2_0_-1":  POSSIBLE_DENOVO,
  "2_1_0":  FATHER,           "2_1_1":  BOTH,             "2_1_2":   BOTH,
  "2_2_0":  FATHER,           "2_2_1":  BOTH,             "2_2_2":   BOTH,
  "2_-1_0": POSSIBLE_DENOVO,  "2_-1_-1": UNKNOWN,
  "2_1_-1": FATHER, // Since mom is unknown, should be UNKNOWN or AMBIGUOUS?
  "2_2_-1": FATHER, // Since mom is unknown, should be UNKNOWN or AMBIGUOUS?
  "2_-1_1": MOTHER, // Since dad is unknown, should be UNKNOWN or AMBIGUOUS?
  "2_-1_2": MOTHER  // Since dad is unknown, should be UNKNOWN or AMBIGUOUS?
};
// Also clack convo about XY sperm.
// 1_0_-1: why chose possible de novo. Could be unknown? possible is a wide word.
// ex: 1_1_2 vs 1_2_1 why ambiguous vs father.

// X, kid.sex == "male", NON-PAR (i.e. Sex chromosomes) only (true hemizygous -- PAR calls are
// routed to AUTOSOMAL_ORIGINS before this table is ever consulted, so there
// is no more haploid-vs-diploid ambiguity to resolve here). keyed "dad_mom"
// dosage. kid.alts is always 2 (a haploid call can't be "het"; a dosage-0
// non-carrier returns NO_ORIGIN in parental_origin before this lookup).
// Outside PAR, dad's X is never transmitted to a son -- his genotype here
// is diagnostic context only, never the true source of the son's allele.
// dad_mom. Only 2 numbers (not 3) because kid dosage is always 2
// (or more precisely 100% alt-allele. Remember that a row only exists because the kid carries something.)
//
// REVIEW CANDIDATE 1 "1_0" / "2_0"                                               <-------
// (mom confirmed hom-ref) -> unhedged FATHER, but "1_-1" / "2_-1" (mom simply
// UNKNOWN) -> hedged POSSIBLE_FATHER. That's backwards: a son's X can never
// come from dad at all, so dad's signal is only ever a coincidence/anomaly
// flag, never a real source -- and mom being *confirmed* ref is stronger
// evidence against "really mom" than mom being merely unknown, so if
// anything the confirmed-ref row should be hedged at least as much as the
// unknown row, not less.
//
// REVIEW CANDIDATE 2: "1_1" -> AMBIGUOUS, even though mom alone (dosage 1,       <-------
// het) is already sufficient to fully explain a son's alt allele regardless
// of dad -- dad's genotype is never a real transmission path for a son's X.
// Compare "0_1" -> MOTHER and "2_1" -> MOTHER: same mom value, different
// (and biologically irrelevant) dad value, both confidently resolved. Only
// the dad=1 row breaks that pattern into AMBIGUOUS, which suggests dad's
// value is being allowed to override mom's sufficient signal when it
// shouldn't be able to.
var X_SON_ORIGINS = {
  "0_0":  DENOVO,           "0_1":  MOTHER,           "0_2":  MOTHER,              "0_-1":  POSSIBLE_DENOVO,
  "1_2":  MOTHER,// **            "1_-1": POSSIBLE_FATHER,
  "2_1":  MOTHER,           "2_2":  MOTHER,           "2_-1": POSSIBLE_FATHER,
  "-1_0": POSSIBLE_DENOVO,  "-1_1": MOTHER,           "-1_2": MOTHER,              "-1_-1": UNKNOWN,
  "1_0":  FATHER,   // Should be POSSIBLE_FATHER?
  "2_0":  FATHER,   // Should be POSSIBLE_FATHER?
  "1_1":  AMBIGUOUS // Should me MOTHER? ** discussed with David
};
// JT: hoW CAN A FATHER BE 2?
// After fixploidy, will all Dads be 2s? Even GATK vcfs should be always 2?
// X, kid.sex == "female" (diploid). keyed "kid_dad_mom" dosage.
// Expanding vocabulary to ex: FATHER_CONTRIB (we are 100% /(2_1_0) 2_2_0, 2_1_-1, 2_2_-1, sure the father contrib)
// 2_-1_1 MOTHER CONTRIB
// 2-1_2 MOTHER CONTRIB


// REVIEW CANDIDATE 1: same "unknown parent's forced contribution isn't         <-------
// reflected as BOTH" pattern as AUTOSOMAL_ORIGINS above -- "2_1_-1" /
// "2_2_-1" (dad known-alt, mom unknown) and "2_-1_1" / "2_-1_2" (mom
// known-alt, dad unknown) name only the known parent, even though kid being
// hom-alt (2) mathematically forces the unobserved parent's donated copy to
// be alt too.
//
// REVIEW CANDIDATE 2: "1_0_-1" -> POSSIBLE_DENOVO. Unlike a normal diploid     <-------
// parent, dad here (dosage 0) is a *deterministic* ref-donor -- he has only
// one X to give and it's ref, so he's not just "unlikely" to be the source,
// he's provably excluded. With dad certain and mom unknown, the real
// uncertainty is "mother or de novo," which arguably deserves a
// MOTHER-flavored hedge rather than the DENOVO-flavored one it shares with
// the mirrored "1_-1_0" (dad genuinely unknown, still a live candidate) --
// a case where the uncertainty is not actually equivalent.
var X_DAUGHTER_ORIGINS = {
  "1_0_0":  DENOVO,            "1_0_1":  MOTHER,          "1_0_2":  MOTHER,      "1_0_-1":  POSSIBLE_DENOVO, // But could POSSIBLE_MOTHER as well?
  "1_1_0":  FATHER,            "1_1_1":  AMBIGUOUS,       "1_1_2":  AMBIGUOUS,   "1_1_-1":  FATHER,
  "1_2_0":  FATHER,            "1_2_1":  FATHER,          "1_2_2":  AMBIGUOUS,   "1_2_-1":  FATHER,
  "1_-1_0": POSSIBLE_DENOVO,   "1_-1_1": POSSIBLE_MOTHER, "1_-1_2": MOTHER,      "1_-1_-1": UNKNOWN,
  "2_0_0":  DENOVO,            "2_0_1":  MOTHER,          "2_0_2":  MOTHER,      "2_0_-1":  POSSIBLE_DENOVO, // denovo...
  "2_1_0":  FATHER,            "2_1_1":  BOTH,            "2_1_2":  BOTH,        "2_1_-1":  FATHER, //Should be POSSIBLE_FATHER?
  "2_2_0":  FATHER,            "2_2_1":  BOTH,            "2_2_2":  BOTH,        "2_2_-1":  FATHER, //Should be POSSIBLE_FATHER?
  "2_-1_0": POSSIBLE_DENOVO,   "2_-1_1": MOTHER,          "2_-1_2": MOTHER,      "2_-1_-1": UNKNOWN
};

// Y, NON-PAR only (all of Y outside PAR1/PAR2 -- routed here only after the
// PAR check below). kid is always male/hemizygous, so kid.alts is always 2.
// mom has no Y allele biologically outside PAR; a real dosage from her here
// is a data anomaly (contamination, mapping artifact), not a transmission
// signal, so it's flagged AMBIGUOUS rather than trusted.
//
// REVIEW CANDIDATE: "1_1" / "1_2" / "2_1" / "2_2" -> AMBIGUOUS whenever mom   <-------
// shows any signal at all, even though mom biologically cannot contribute to
// Y outside PAR. A coincidental/anomalous mom observation is allowed to
// downgrade confidence in what is otherwise a fully legitimate, real
// paternal transmission call. Arguably the origin call should stay FATHER
// (the only real pathway) with the mom-anomaly surfaced as a separate QC
// flag, rather than folded into (and diluting) the origin label itself.
// This behavior is inherited directly from the original Python table, not
// introduced by this port.
var Y_ORIGINS = {
  "0_-1": DENOVO,   "2_-1": FATHER,      "-1_-1": UNKNOWN,
  "0_0":  DENOVO,
  "0_1":  MOTHER,      "0_2":   MOTHER, // Should not happen
  "1_0":  FATHER,   "1_1":  AMBIGUOUS,   "1_2":   AMBIGUOUS, // Here, why AMBIGUOUS when MOM cannot give her non-existent Y chromosome?
  "2_0":  FATHER,   "2_1":  AMBIGUOUS,   "2_2":   AMBIGUOUS  // Here, why AMBIGUOUS when MOM cannot give her non-existent Y chromosome?
};

// GRCh38/hg38 pseudoautosomal region boundaries (1-based, inclusive; VCF
// POS convention). PAR2 differs in length between chrX and chrY.
// read file or what genome we prodive.
var PAR_REGIONS = {
  X: [[10001, 2781479], [155701383, 156030895]],
  Y: [[10001, 2781479], [56887903, 57217415]],
};

function isPseudoautosomal(chrom, pos) {
  var regions = PAR_REGIONS[chrom];
  if (!regions) return false;
  for (var i = 0; i < regions.length; i++) {
    if (pos >= regions[i][0] && pos <= regions[i][1]) return true;
  }
  return false;
}

// Low-depth adjustment, ported from adjust_calls_and_zygosity():
// het/hom with 0 < AD[alt] < 3  -> unknown
// hom-ref with 0 < AD[ref] < 3  -> unknown
// NOTE: faithful to the Python, the rule only fires when the AD value is > 0
// (in Python an AD of 0 becomes None and short-circuits the check).
// JT: Put more meaningful variables.
function po_adj(individual) {
  var alt = individual.alts;
  if (alt === -1 || alt === undefined) { return -1; }
  if (typeof individual.AD !== "undefined" && individual.AD.length > 1) {
    var ad_ref = individual.AD[0];
    var ad_alt = individual.AD[1];
    if ((alt === 1 || alt === 2) && ad_alt > 0 && ad_alt < 3) { return -1; }
    if (alt === 0 && ad_ref > 0 && ad_ref < 3) { return -1; }
  }
  return alt;
}

// chrom/pos: pass variant.CHROM, variant.POS. kid/dad/mom: slivar sample
// objects (need .alts and, for kid, .sex -- "male" / "female").
function parental_origin(chrom, pos, kid, dad, mom) {
  // Every lookup table below assumes the kid is a confirmed carrier (dosage
  // 1 or 2). A hom-ref kid, or one po_adj() downgrades to unknown, gets no
  // po_* tag at all; the --trio non_carrier_proband / unknown_proband_genotype
  // tags say why instead. Checked before any lookup because the X-son and Y
  // tables are keyed on the parents only and would otherwise label a hom-ref
  // son (e.g. MOTHER when mom is het).
  var k = po_adj(kid);
  if (k === 0 || k === -1) return NO_ORIGIN;

  // dad/mom are passed through as-is (no early-return): AUTOSOMAL_ORIGINS,
  // X_DAUGHTER_ORIGINS, and X_SON_ORIGINS already have full "-1" coverage on
  // both parents, so po_adj-driven downgrades resolve to the same graduated
  // labels a genuinely-missing genotype would. Y_ORIGINS is missing the
  // dad=-1/mom-known entries specifically -- accepted as-is for now, falls
  // through to the blanket UNKNOWN default in that gap.
  var d = po_adj(dad);
  var m = po_adj(mom);

  var CHROM = ("" + chrom).replace(/^chr/i, "");

  if ((CHROM == "X" || CHROM == "Y") && isPseudoautosomal(CHROM, pos)) {
    // PAR: fully diploid, plain Mendelian (autosomal-equivalent) inheritance.
    return AUTOSOMAL_ORIGINS[k + "_" + d + "_" + m] || UNKNOWN;
  }

  if (CHROM == "Y") {
    if (kid.sex != "male") return UNKNOWN;
    return Y_ORIGINS[d + "_" + m] || UNKNOWN;
  }

  if (CHROM == "X") {
    if (kid.sex == "male") {
      return X_SON_ORIGINS[d + "_" + m] || UNKNOWN;
    }
    if (kid.sex == "female") {
      return X_DAUGHTER_ORIGINS[k + "_" + d + "_" + m] || UNKNOWN;
    }
    return UNKNOWN; // sex unknown: X transmission can't be resolved safely
  }

  return AUTOSOMAL_ORIGINS[k + "_" + d + "_" + m] || UNKNOWN;
}

// Example usage:
//
//   slivar expr --js slivar-parental-origin.js \
//     --vcf annotated.vcf.gz --ped family.ped \
//     --trio "po_denovo:parental_origin(variant.CHROM, variant.POS, kid, dad, mom) == 'DENOVO'" \
//     --trio "po_mother:parental_origin(variant.CHROM, variant.POS, kid, dad, mom) == 'MOTHER'" \
//     --trio "po_father:parental_origin(variant.CHROM, variant.POS, kid, dad, mom) == 'FATHER'" \
//     --trio "po_both:parental_origin(variant.CHROM, variant.POS, kid, dad, mom) == 'BOTH'" \
//     --trio "po_ambiguous:parental_origin(variant.CHROM, variant.POS, kid, dad, mom) == 'AMBIGUOUS'" \
//     --trio "po_possible_denovo:parental_origin(variant.CHROM, variant.POS, kid, dad, mom) == 'POSSIBLE_DENOVO'" \
//     --trio "po_possible_mother:parental_origin(variant.CHROM, variant.POS, kid, dad, mom) == 'POSSIBLE_MOTHER'" \
//     --trio "po_possible_father:parental_origin(variant.CHROM, variant.POS, kid, dad, mom) == 'POSSIBLE_FATHER'" \
//     --trio "po_unknown:parental_origin(variant.CHROM, variant.POS, kid, dad, mom) == 'UNKNOWN'" \
//     -o out.vcf.gz
//
// The QLIN compound-het step ("Parental origin is Mother or Father") is
// exactly this filter: keep the trio if parental_origin(...) is MOTHER or
// FATHER (i.e. inheritance-resolved), then group survivors by gene and flag
// hc_complement / is_possibly_hc downstream as described in the design doc.
