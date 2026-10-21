# Evidence-led scientific writing standard

Apply this maintained standard automatically to scientific drafting and substantive polishing. It distils the bundled `nature-writing`, `nature-polishing`, `nature-statistics`, `nature-citation` and exact `nature-shared` references; use their installed manifests and task fragments for deeper guidance. This is a writing and review standard, not a claim of journal acceptance or an official Nature policy. A fluent draft can still fail every scientific check below.

## Scope and source selection

Infer the requested section, paper type, language and journal from the task. Reuse established choices on follow-up edits. Without a named venue, use generic high-quality scientific writing informed by Nature's argument discipline. Do not impose flagship Nature's production layout, length, reference limits, article structure, significance threshold or journal-family citation filter on other fields. A Nature-inspired visual template does not make a manuscript a Nature submission. Actual venue and article-type rules override stylistic defaults.

Use writing guidance for new sections or argument restructuring; use polishing for existing prose. In a polishing task, retain the author's question and scientific interpretation unless the user authorizes a substantive revision. If a supplied claim conflicts with its evidence, flag the conflict and offer an evidence-bounded wording rather than silently inventing a better argument. Complete supported passages while retaining explicit missing-input markers in dependent passages. A requested outline approval remains an approval step; an ordinary drafting task does not acquire one.

## Establish the argument before sentences

Build a compact evidence record from the supplied study before drafting:

| Field | Required content |
|---|---|
| Exact question | What phenomenon, mechanism, condition, disagreement or boundary is unresolved? |
| Main claim | The strongest proposition supported by the actual study, with setting and scope |
| Decisive evidence | Source artifact, figure/table/panel or analysis location; comparison and measurement |
| Supporting claims | What each adds to acceptance or interpretation of the main claim |
| Boundary | Conditions tested, failures, alternatives not excluded, missing evidence |
| Protected facts | Terminology, sample units and counts, values, uncertainty definitions, design, citations |

Distinguish `supported`, `inferred` and `needs evidence`. A related paper title, a valid DOI, an attractive figure or a successful PDF build does not establish support. Record why the cited passage or study artifact supports the exact proposition, including its limitations. Do not call a new architecture's existence a scientific knowledge gap. If novelty has not been checked, do not claim priority.

Draft Results from evidence first, then align the Introduction's questions and Discussion's synthesis, and write the abstract once that chain is stable. Adapt the sequence to a local edit rather than restarting a full manuscript workflow. For review articles, use a verified literature synthesis rather than inventing original experiments; for theory, preserve hypotheses, proof status and counterexamples; for methods and algorithms, make the fair comparator and tested operating regime explicit.

## Paragraph reasoning

Give each paragraph one dominant scientific message. Use `topic or question -> evidence -> bounded interpretation -> link to the next question` as a reasoning check, not a four-sentence template. A paragraph may combine these moves or omit a link when the next step is already clear. A background paragraph should narrow the problem; a Results paragraph should change what the reader can infer. Do not split a coherent claim and its necessary qualification just to enforce one sentence function per paragraph.

The topic sentence must be defensible from what follows. Bring the decisive comparison close to its claim, state the condition and uncertainty needed to interpret it, and close with the inference the design permits. Explain how the next experiment discriminates an alternative or tests a boundary. Repeating a baseline on more datasets does not by itself establish a stronger mechanism claim. Reverse-outline paragraphs by question, new inference, evidence and boundary before polishing wording.

Use stable names for methods, species, populations, metrics, units, abbreviations and symbols. Preserve the author's canonical terminology rather than varying technical words for elegance. Remove redundancy and empty transitions after the reasoning is sound. No adjective count, connector quota, sentence-length target or word-count reduction is a scientific quality score.

## Section decisions

**Abstract.** Give the shortest understandable chain from exact question through answer-enabling design to one main finding, one or two decisive supports or boundaries, and a bounded implication. Scale or method inventory earns space only when it changes the inference. Include numbers when they define the main effect, comparison or boundary; do not require a number merely to sound empirical. Every abstract claim must resolve to Results evidence and remain within the Discussion's scope. Do not announce a mechanism or application absent from the study.

**Introduction.** Move from the relevant phenomenon to what existing work establishes, the precise unknown and the question this design can answer. Use verified literature to establish, contrast, qualify or expose a gap rather than list authors. Do not manufacture a field-wide absence of evidence from a short source list. A study question can be stated while its literature-based novelty remains `AUTHOR_INPUT_NEEDED`. End with a concise research route that explains the decisive comparisons, not a second abstract. Every central question needs a Results answer; every central Results claim needs a motivated question.

**Results.** Order by inference: establish the observation, test necessary support or alternatives, then expose material boundaries. Use only the steps the study actually contains. Do not write a diagnostic intervention that was not performed. Local interpretation may stay beside the evidence when it answers that experiment's question, leaves credible alternatives explicit and does not become a broad literature discussion. An adjacent subsection should add a new inference, not repeat “the method helps” under a new heading.

**Discussion.** Start from a compressed finding or problem anchor, synthesize across Results, explain the relationship to verified prior work, distinguish the established contribution from a supported interpretation and an open implication, then bound the conclusion. Functions can be combined; they are not mandatory paragraphs. Do not replay every effect, test and panel. Strong verbs and causal or necessity claims need a named design feature that licenses them. A correlation, ablation or subgroup contrast does not automatically establish mechanism. Different within-group significance results do not establish an interaction. Failure to reject a difference does not establish equivalence or absence of harm.

Write each limitation as `claim affected -> untested/constrained condition -> consequence -> what remains supported -> resolving test`. A narrow study can end with a narrow conclusion. Derive future work from the uncertainty that would change the interpretation, rather than promising generic scale, translation or impact. Do not fabricate limitations: distinguish a documented constraint from missing information about the study.

## Numbers, design and citation integrity

Preserve metric definitions, units, direction of contrasts, denominators, estimates, intervals, test families, corrections and uncertainty semantics. Do not turn a relative percentage into percentage points, a confidence interval into a standard deviation, or technical readings into independent replicates. State what was measured, what independent unit was analyzed, and what inference follows. Nested or repeated observations require their actual dependence structure; model seeds do not automatically create independent datasets or populations.

Prefer the supplied effect and uncertainty to ungrounded significance language. Never infer a test, exact P value, randomization, blinding, exclusions, preregistration, equivalence margin, software version or sample size from conventional practice. New analysis requires source data, the requested scope and a recorded method; a rewrite cannot supply one. Missing quantities remain explicit and block submission-ready claims when material.

Verify bibliographic identity and claim support separately. Retain verified title, author order, year, DOI and citation key; never fill missing author names from memory or add a plausible-looking reference. Read the relevant primary source passage or abstract and record support as direct, partial, contextual or unsupported. A search candidate is not a verified citation. Follow corrections and retractions where known. Use a restricted Nature/CNS family search only when the user requested that restriction; scientific writing quality does not justify excluding relevant primary evidence from other journals.

## Main text, captions, Methods and supporting information

Classify results by their role in this paper before shortening them: `core_discovery`, `necessary_support`, `qualification`, `robustness`, `heterogeneity`, `trace_detail`, `alternative_inference`, `edge_case`. Keep evidence establishing, materially changing or limiting the central conclusion visible in the main text. An inconvenient null result or failure cannot be moved to supporting information merely because it is inconvenient. A robustness check that rules out the central confound belongs in the main argument.

Use the main text for the sufficient evidence chain; captions for reading the display, including required units and statistics; Methods/source data for reproducible procedures and complete analysis definitions; supporting information (SI or the target venue's equivalent) for secondary checks and extended detail. Retain stable pointers and the complete record. Required reporting and integrity information takes precedence over compression. Choose an authoritative numeric report without removing statistics a standalone figure or journal rule requires.

For each major relocation or deletion, retain the source fact IDs, destination and reason. A proposed addition triggers a replacement/deletion check in the affected paragraph. A claim may appear as an abstract finding, Results demonstration and Discussion synthesis when these do different jobs. Delete repeated demonstrations that add no new evidence, interpretation or boundary. Record a word-count change only as an editing diagnostic, never as evidence that quality improved.

## Review and completion

Return the requested prose first, then concise material notes: main claim/evidence status, consequential structural changes, protected facts preserved, and missing inputs. For major restructuring retain an allocation table, paragraph map and change record. Do not obscure the prose with a large default checklist. Keep factual or citation uncertainty visible even when the prose is otherwise polished.

Use a two-stage assessment. First check integrity: any invented or distorted result, independent unit, statistical inference, reference or scope is a failure that style cannot offset. Then judge argument quality with evidence-linked findings: precise gap, main/support hierarchy, inference progression, paragraph reasoning, essential boundary placement and Discussion synthesis. Use `pass`, `revise`, `fail` or `not assessable` per criterion with a text location and reason. Do not sum these into an unexplained “Nature score”.

Mechanical checks can validate structured record fields, fact-ID references, numeric consistency against a ledger, citation metadata presence and allocation coverage. They cannot prove that a citation supports a claim, that every relevant fact was extracted, that a gap is novel, that a design licenses causality, or that a paragraph synthesizes rather than repeats. Those require a capable model or human reading both the evidence and the prose. Human authors retain responsibility for the study argument and final scientific judgement. Mark model-generated evaluations and synthetic examples as such; neither a hand-written demonstration nor a keyless test proves improvement of the configured model.

## Sources and status

The bundled source guidance is in `nature-writing/static/core/`, its matching `static/fragments/`, `nature-polishing/static/core/`, `nature-statistics/SKILL.md`, `nature-citation/static/core/`, and `nature-shared/core/{main-text-discipline,nature-abstract,nature-introduction,nature-results-discussion,discussion-argument-language}.md`. The shared section guidance is corpus-derived or general writing advice, not official Nature policy. Resolve paths through the installed source record rather than guessing an external filesystem path.

Official pages checked on 2026-10-20: [Nature initial submission](https://www.nature.com/nature/for-authors/initial-submission) allows flexibility in initial format and asks for a nontechnical account of main results and implications; its statistics section requires exact n, replicate definitions and analysis details. [Nature Portfolio reporting standards](https://www.nature.com/nature-portfolio/editorial-policies/reporting-standards) emphasizes reporting transparency, reproducibility and the materials needed to verify claims. These scoped points support integrity checks here; they do not make all sections or production rules universal. The separate formatting-guide page could not be fetched in this check, so no new exact formatting limit is asserted from it. Recheck the named target's current instructions when submission requirements matter.
