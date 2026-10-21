---
name: research-init
description: Initialize a research project with Zotero-integrated literature review. Creates or audits project-scoped sources, generates research question cards, and only writes a research proposal when the evidence gate passes.
args:
  - name: topic
    description: Research topic or keywords
    required: true
  - name: scope
    description: Review scope (focused/broad)
    required: false
    default: focused
  - name: output_type
    description: Output type (review/proposal/both). All modes produce research-question-card.md; references.bib is produced only when reliable citation metadata exists; review adds literature-review.md only when evidence is sufficient; proposal adds research-proposal.md only when the selected card passes the proposal readiness gate.
    required: false
    default: both
tags: [Research, Literature Review, Zotero, Paper Search]
---

# /research-init - Zotero-Integrated Research Startup Workflow

Launch a project-scoped literature startup workflow for the research topic "$topic", with scope "$scope" and output type "$output_type".

Default behavior is evidence-first: if Zotero is unavailable, if full-paper evidence is insufficient, or if the selected Research Question Card is not ready, produce an intake/audit result instead of forcing a polished proposal.

## Usage

### Basic Usage

```bash
/research-init "transformer interpretability"
```

### Specify Scope

```bash
/research-init "few-shot learning" focused
```

### Specify All Parameters

```bash
/research-init "neural architecture search" broad both
```

## Workflow

Execute the following steps in order:

### Step 0: Intake and Capability Gate

Before creating collections or writing files:

1. Confirm the practical purpose: new project intake, literature review, proposal draft, or source audit.
2. Check whether Zotero MCP is configured and writable.
3. If Zotero MCP is unavailable, read-only, or the user asks for dry-run mode:
   - do **not** create collections,
   - do **not** import papers,
   - produce `research-question-card.md` and a source candidate/audit section,
   - either skip `references.bib` or create a stub that clearly says canonical BibTeX is unavailable unless reliable BibTeX can be generated from existing sources,
   - stop before `literature-review.md` or `research-proposal.md` unless the user explicitly provides sufficient local evidence.
4. If the topic, target venue/audience, or project boundary is ambiguous enough to change the search strategy, ask a short clarifying question before acting.

### Step 1: Create Zotero Research Collection

1. Call the Zotero MCP tool `zotero_create_collection` to create the main collection, named `Research-{Topic}-{YYYY-MM}` (extract a short PascalCase keyword from the topic, use the current year and month)
2. Create sub-collections under the main collection:
   - `Core Papers`
   - `Methods`
   - `Applications`
   - `Baselines`
   - `To-Read`
3. Record the `collection_key` for each sub-collection (needed for import in Step 2)

### Step 2: Literature Search and Import

1. Use WebSearch to find papers related to "$topic"
   - Search strategy: use the topic directly, plus variant combinations of key terms
   - Target sources: arXiv, DOI-backed publisher landing pages, conference proceedings with full-paper pages, direct PDF pages
   - Time range: focused mode searches the last 3 years, broad mode searches the last 5 years
   - Target paper count: 20-50 papers for focused scope, 50-100 for broad scope
2. **Source quality filter before extraction**:
   - Prefer candidates that expose at least one of: DOI, arXiv ID, direct PDF URL, or clear citation metadata for a full paper
   - **Explicitly avoid abstract-only pages as primary sources** when a better source exists for the same paper (for example conference abstract listings, event schedule pages, teaser pages, or pages that only contain a short abstract with no DOI/arXiv/PDF)
   - For the same title, source preference should be:
     1. DOI-backed publisher page
     2. arXiv abs/pdf page
     3. direct PDF URL
     4. full-paper proceedings landing page
     5. abstract-only page (last resort only)
   - If the discovered page is clearly abstract-only and no DOI/arXiv/PDF can be extracted, do **not** prioritize it for import; keep searching for a better source first
   - Abstract-only pages should **not** be counted toward the target paper quota unless all better identifier-bearing/full-paper sources for that title have been exhausted
3. Extract candidate DOI / arXiv ID / landing-page URL from filtered search results
4. **Classify before import**: For each paper, determine which sub-collection it belongs to (Core Papers, Methods, Applications, Baselines, or To-Read) based on its title, abstract, and venue
5. **Pre-import deduplication (two-step)**:
   - Call the Zotero MCP tool `zotero_search_items` with the DOI string when available to find potential matches
   - Call `zotero_get_item_metadata` on results to confirm the DOI field matches exactly
   - If confirmed match → skip import, log ("Already exists: {DOI} → {item_key}")
   - For papers without DOI → search by title using token overlap ratio (lowercase both titles, remove punctuation, compute intersection of words / union of words). Ratio > 0.8 = duplicate
6. **Abstract-only page guardrail (mandatory)**:
   - Before calling `zotero_add_items_by_identifier`, check whether the chosen URL is likely an abstract-only page
   - Strong signals include: URL/path contains `abstract`, page title/heading is an abstract listing, page body lacks PDF/full-text links, and no DOI/arXiv identifier is visible
   - If it is abstract-only **and** no DOI/arXiv/PDF can be recovered, prefer one of:
     - keep searching for a better source for the same title, or
     - skip this candidate for now
   - Do **not** eagerly import abstract-only pages into analytical sub-collections just to satisfy paper count
   - If an abstract-only page is imported as a last-resort placeholder, it must be treated as `To-Read` only, never as a confirmed paper source for `Core Papers`, `Methods`, `Applications`, or `Baselines`
   - When you skip such a candidate during Step 2, print this exact user-facing line in the terminal output:
     - `Skipped abstract-only page; searching better source`
7. **Smart import with collection assignment**: Call `zotero_add_items_by_identifier` with the target sub-collection's `collection_key`, `attach_pdf=true`, and `fallback_mode="webpage"`
   - Route priority is fixed: DOI / doi.org URL → arXiv ID or arXiv URL → direct PDF URL → generic landing-page URL
   - The tool will prefer proper paper/preprint items and only fall back to `webpage` when no reliable DOI/arXiv identifier is found
   - For difficult publisher pages and cookie-gated PDFs, the import path may additionally use the local Zotero connector/browser session and optional Playwright-assisted PDF rescue before falling back to `webpage`
   - The server records internal import events automatically for debugging, but that internal ledger is not part of the default public MCP tool surface and should not be part of the normal workflow
8. **Collection guardrail**: Only keep `paper` imports in `Core Papers`, `Methods`, `Applications`, or `Baselines`
   - If the import result says `Saved as webpage`, move or create that entry only in `To-Read`
9. **PDF follow-up**: `zotero_add_items_by_identifier(..., attach_pdf=true)` already runs the PDF cascade by default. If the import result says `PDF not attached`, optionally call `zotero_find_and_attach_pdfs({ item_keys: [...] })` for a second pass. If it still fails, log it and continue.
10. **Automatic postpass dedupe/reconcile (mandatory)**: after the import batch, call `zotero_reconcile_collection_duplicates` on the main research collection with:
   - `collection_key = {main research collection key}`
   - `include_subcollections = true`
   - `dry_run = false`
   - `reconcile_local_only = true`
   - `local_db_fallback = false`
   - Goal: automatically clean duplicate parent items across the whole research collection tree, keep the canonical item with PDF when available, merge collection memberships, and remove stale duplicates when the standard APIs can handle them
   - **Precondition**: destructive dedupe with `dry_run=false` requires Zotero MCP write/delete permission, which means `UNSAFE_OPERATIONS=items` must already be enabled
   - **Default safety mode**: do **not** enable `local_db_fallback=true` automatically inside `/research-init`; only mention it in debug/recovery mode if residual duplicates remain after the standard pass
11. **Step-2 terminal summary (mandatory)**: after import + postpass dedupe, print a user-facing compact summary table:

   ```
   | Input | Zotero Key | Collection | Status |
   |-------|------------|------------|--------|
   | ...   | ABC123     | Core Papers | Imported as paper + PDF attached |
   ```

   - `Status` should use only user-facing phrases:
     - `Imported as paper + PDF attached`
     - `Imported as paper`
     - `Saved as webpage + PDF attached`
     - `Saved as webpage`
     - `Import failed`
   - If a candidate was rejected before import because it is abstract-only and no DOI/arXiv/PDF could be recovered, print this standalone line before the table entry list continues:
     - `Skipped abstract-only page; searching better source`
   - After the table, print one compact dedupe line:
     - `Collection dedupe summary: duplicate groups 0, duplicates trashed 0`
     - or `Collection dedupe summary: duplicate groups N, duplicates trashed M`
   - Then print one compact missing-PDF repair line:
     - `Missing PDF postpass: repaired 0 items`
     - or `Missing PDF postpass: repaired N items`
   - Read these counts from the `zotero_reconcile_collection_duplicates` summary; do not invent them
   - Do **not** print `route=...`, `pdf_source=...`, `fallback_reason=...`, `local_item_key=...`, or reconcile internals in the default terminal output
   - Do **not** dump the raw dedupe markdown table in normal mode; read the tool result, extract the counts, and summarize it in one user-facing line
   - If you need implementation details for debugging, explicitly say you are switching to debug mode and rerun with `ZOTERO_MCP_DEBUG_IMPORT=1`

**Note**: Zotero items can still be added to or removed from collections later, but `/research-init` should prefer correct `collection_key` assignment during import so analytical sub-collections stay clean. The default command path should now rely on `zotero_reconcile_collection_duplicates` as the standard postpass cleanup, not the older item-by-item local reconcile helper.
When in doubt between a full-paper source and an abstract-only page for the same title, always prefer the full-paper source, even if the abstract-only page ranks higher in search results. Use canonical Zotero MCP tool names consistently in this workflow: `zotero_create_collection`, `zotero_search_items`, `zotero_get_item_metadata`, `zotero_add_items_by_identifier`, `zotero_find_and_attach_pdfs`, and `zotero_reconcile_collection_duplicates`.

### Step 3: Paper Analysis

1. Call `zotero_get_collection_items` to list imported papers
2. Call `zotero_get_item_metadata` with `include_abstract: true` to get metadata and abstracts (ensures abstracts are available as fallback if full-text retrieval fails)
3. Call `zotero_get_item_fulltext` to read full text of papers with PDFs
3. For each paper, extract:
   - Research question and motivation
   - Core methodology
   - Key findings and contributions
   - Limitations and future work
4. Use these structured notes as intermediate analysis to inform the final `literature-review.md` (they are not a separate output file)

### Step 4: Gap Analysis and Synthesis

1. Analyze all collected papers for:
   - Research trends and directions
   - Methodological gaps
   - Unexplored application domains
   - Contradictions in research findings
2. Identify 2-3 concrete research gaps
3. Formulate 2-3 potential research questions as Research Question Cards:

   ```md
   ## Research Question Card

   Question:
   Type: exploratory | confirmatory | applied
   Hypothesis:
   Why it matters:
   Current evidence:
   Missing evidence:
   What would support it:
   What would falsify it:
   Minimal next action:
   Decision: explore | read more | run experiment | stop
   ```

4. Apply the **Proposal Readiness Gate** from `skills/research-ideation/references/research-contract.md`:
   - at least one full-paper/preprint/dataset/experiment-artifact Evidence Record supports the selected direction,
   - weak sources such as webpage placeholders or abstract-only notes are labeled as weak support,
   - current evidence, missing evidence, support criteria, falsification criteria, and minimal next action are explicit.
5. Select one card as the default direction for `research-proposal.md` only if it passes this gate. If none is ready for a proposal, state that the next action is `read more` or `explore` instead of forcing a proposal narrative.

### Step 5: Generate Outputs

Generate corresponding files based on output_type "$output_type":

Output matrix:

| output_type | Always generated | Additional generated files |
|---|---|---|
| `review` | `research-question-card.md` | `references.bib` when reliable citation metadata exists; `literature-review.md` when evidence is sufficient |
| `proposal` | `research-question-card.md` | `references.bib` when reliable citation metadata exists; `research-proposal.md` if a selected card passes the gate |
| `both` | `research-question-card.md` | `references.bib` when reliable citation metadata exists; `literature-review.md` when evidence is sufficient; `research-proposal.md` if a selected card passes the gate |

File contracts:

1. **research-question-card.md** - 2-3 candidate Research Question Cards plus the selected default card and minimal next action
2. **literature-review.md** - Structured literature review with real citations from Zotero (generated for `review` and `both` only when the evidence base is sufficient)
3. **research-proposal.md** - Research proposal derived from the selected Research Question Card (generated for `proposal` and `both` only when the selected card passes the Proposal Readiness Gate)
4. **references.bib** - BibTeX references from Zotero data, generated only when reliable citation metadata exists
   - **Primary method**: Use Zotero REST API with `?format=bibtex` to export accurate, complete BibTeX entries
     ```
     GET https://api.zotero.org/users/{user_id}/collections/{collection_key}/items?format=bibtex
     ```
     **Note**: The REST API `?format=bibtex` on a collection only exports items directly in that collection, not items in sub-collections. You must iterate each sub-collection key individually, or collect all item keys and use the items endpoint: `GET https://api.zotero.org/users/{user_id}/items?itemKey=KEY1,KEY2,...&format=bibtex`
   - **Fallback**: Construct BibTeX manually from `zotero_get_item_metadata` metadata (note: volume, issue, pages, and publisher fields are not available via this tool — entries will be incomplete)

Use TodoWrite to track progress throughout the workflow.

At the end, summarize:
- selected question,
- current evidence,
- missing evidence,
- minimal next action,
- whether the next decision is `explore`, `read more`, `run experiment`, or `stop`.

## Error Handling

If the default Zotero MCP path fails during execution, use these workflow fallbacks:

1. **Zotero MCP unavailable or read-only** → Switch to dry-run/intake mode; do not create collections, import papers, or pretend references were saved.
2. **`zotero_create_collection` fails** → If REST credentials are configured and the user intended write mode, create via Zotero REST API directly; otherwise switch to dry-run/intake mode.
3. **`zotero_add_items_by_identifier` fails** → Retry with a narrower identifier (explicit DOI or arXiv ID). If the source is a publisher landing page or direct PDF, allow the smart importer to use connector/browser-session rescue and optional Playwright-assisted PDF rescue first. If smart import still fails, use an out-of-band fallback such as CrossRef metadata lookup (`https://api.crossref.org/works/{DOI}`) and retry the DOI-specific path or save the page as a manual `webpage`.
4. **`zotero_get_item_fulltext` fails** → Use `WebFetch` on the paper's DOI URL to scrape abstract → fall back to `abstractNote` from `zotero_get_item_metadata` + domain knowledge
5. **`zotero_find_and_attach_pdfs` fails** → Log and continue; PDFs are not required for analysis. If a needed paper still lacks a PDF, ask the user to attach it manually in Zotero Desktop and rerun analysis later.
6. **`zotero_reconcile_collection_duplicates` fails** → Keep the import results, log that postpass dedupe failed, and continue with analysis. In debug mode, inspect the tool's summary and consider rerunning with `local_db_fallback=true` only if local-only duplicates remain and the user explicitly wants aggressive cleanup.
7. **Single paper fails** → Log error, skip, and continue to next paper
8. **API rate limit** → Wait 5 seconds and retry, up to 3 attempts

## Completion Checklist

Before finishing, verify:

- [ ] Zotero write mode or dry-run/intake mode explicitly stated
- [ ] In write mode, Zotero collection `Research-{Topic}-{YYYY-MM}` created with sub-collections
- [ ] In write mode, papers imported and organized into sub-collections (target: 20-50 focused / 50-100 broad)
- [ ] In write mode, PDFs attached for available open-access papers
- [ ] Full-text analysis completed for core papers when available; otherwise source limitations are explicit
- [ ] Gap analysis identifies at least 2-3 concrete research gaps
- [ ] Research Question Cards generated with support criteria, falsification criteria, and minimal next action
- [ ] Proposal Readiness Gate applied before generating `research-proposal.md`
- [ ] Output files generated according to the output matrix for `review`, `proposal`, or `both`
- [ ] All citations in review correspond to actual Zotero library entries

## Possible Output Files

The command may generate the following files according to the output matrix and evidence gates:

```
{project_dir}/
├── research-question-card.md # Candidate questions, hypotheses, evidence needs, and selected next action
├── literature-review.md      # Structured literature review when evidence is sufficient
├── research-proposal.md      # Research proposal (if requested and evidence gate passes)
└── references.bib            # BibTeX references when reliable citation metadata exists
```

## Integration Notes

This command will:
1. Use **Zotero MCP** tools to manage literature collections and metadata
2. Trigger the **literature-reviewer agent** for literature analysis
3. Use the **research-ideation skill** methodology (5W1H, Gap Analysis)
4. Search for latest papers via **WebSearch**

## Notes

- Ensure the Zotero MCP service is properly configured and running
- DOI import depends on network connectivity and Zotero's metadata resolution capability
- PDF attachment is limited to open-access papers; paywalled papers must be added manually
- Generated literature reviews and research proposals require manual review and refinement

## Related Resources

- **Skill**: `research-ideation` - Research ideation methodology
- **Agent**: `literature-reviewer` - Literature search and analysis
- **Commands**: `/zotero-review` - Analyze existing Zotero collections, `/zotero-notes` - Batch generate reading notes
