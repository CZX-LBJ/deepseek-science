---
description: "Research project, scholarly literature and embedded skill tools with replayable scientific state."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-science

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

Use three tools to retain project progress, search and read papers, and load embedded scientific instructions. The scientific sidebar follows successful logged results. Provider usage buckets and response latency come from settled model attempts; unavailable accounting stays unknown.

<a id="table-of-contents"></a>
## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Use the supplied science profiles. A custom composition requires agents, tools, filesystem, skills, sandbox policy, system prompt, session projections, scienceProjects and scienceLiterature.

| Field | Default | Meaning |
|---|---|---|
| `enabledPacks` | core, ai, nature | Advertised skill packs and noncommercial opt-in |
| `assetRoot` | packaged assets | External skill catalog, when specified |
| `workspaceRoot` | session cwd | Required for calls without an agent |
| `maxResultChars` | 24000 | Rendered non-skill result budget |
| `maxSkillChars` | 200000 | Full skill body ceiling |
| `maxExportBytes` | 4194304 | Search-record input budget |
| `maxSearchSkills` | 40 | Maximum skill search items |
| `maxRetainedBytes` | 8388608 | Complete structured result, content and metadata budget |
| `enableNativeRecipes` | true | Register the three locally maintained scientific workflows |
| `enableAutomaticGuidance` | true | Select scientific guidance from ordinary user requests before the first model request |
| `maxAutoSkills` | 8 | Maximum complete instruction bodies per automatic message |
| `maxAutoChars` | 200000 | Complete automatic message budget, including shortlist and source metadata |

Use `science_project` to create, inspect, checkpoint, advance, skip, resume or reopen a changed phase. Use `science_literature` for search/read/verify/export; export references a saved search JSON and writes BibTeX or CSV. Use `science_skills` for search/inspect/doctor/load. The doctor reports current Harness tools and declared requirements, not installed optional dependencies.

The first-party `deepseek-science-literature`, `deepseek-science-analysis` and `deepseek-science-writing` recipes are separate from the pinned upstream catalog. They load through the ordinary skill consumer or `science_skills`; search with the `native` pack to select them. Packaged scripts create reproducible analysis outputs or an evidence-preserving manuscript scaffold, and refuse existing output directories. Their instructions retain dependency and scientific-review requirements.

The [scientific kernel](assets/kernel/policy.md) is always present in the system prompt. [Automatic routing](src/kernel.ts) interprets direct user research requests and appends full native and discipline instructions as logged `science-routing` messages before inference. Users need not name skills. All 22 callable Nature Skills modules and their shared references are in the default `nature` pack. Matching tasks receive their complete skill body, selected static workflow, and condition-indexed optional references; all other full source files remain in the checked asset catalog. Biology, medicine, chemistry, physics, mathematics, engineering, electronics, Earth/environmental science and computing have bilingual route rules. Conceptual questions do not start a research project. Deferred instructions remain named and loadable; no partial skill body is emitted. Committed visible guidance is deduplicated, and guidance removed by compaction can be supplied again.

Complete manuscript requests require editable LaTeX, bibliography, figures and a real compiled PDF. The writing recipe's `publication.py` provides init/doctor/compile/check/render commands and neutral, unofficial Nature-inspired, IEEE and CJK layouts. Checks report current-byte provenance, unresolved references, missing assets, placeholders and layout overflow. Actual rendering and scientific review remain necessary; a clean compiler is not journal acceptance. Templates do not impersonate publisher typesetting or guarantee compliance with every journal's current author instructions.

Finished manuscripts default to a two-column journal layout with a full-width title, top/bottom column floats and top/bottom spanning figures/tables. Inline `[h]`/`[H]` placement is not the default. Long equations must fit the actual column using aligned derivations. A specifically requested venue's manuscript rules can override this default. Inspect real multi-page output for column flow, float position and avoidable whitespace; a short scaffold cannot establish those properties.

<a id="understand-the-implementation"></a>
## Understand the implementation

[Tools](src/index.ts) reuse existing execution, filesystem authority and result logging. [The projection](src/projection.ts) replays successful scientific metadata and settled provider attempts. Cache ratio is cache reads divided by uncached input plus cache reads plus cache writes. Failed attempts remain counted; missing buckets and zero denominators remain unknown. This release does not compute currency cost; the field remains unknown.

## Model Experience

### Scientific tools and results

#### What the model sees

The [tool definitions](../../../docs/tool-catalog.md#deepseek-aidsh-tool-science) expose the three scientific operations. Results contain committed project records, selected evidence, source reports or loaded skill instructions. A stable kernel enforces evidence, domain-specific rigor, LaTeX and figure standards. Automatic guidance records the selected, fully loaded and deferred names plus a content digest; it does not mislabel automatic selection as an explicit user skill invocation.

#### Token effect

Only selected complete skill bodies and bounded tool results enter context. Automatic guidance defaults to eight bodies and 200000 characters, including its shortlist; task matching usually admits far less. Disabled automatic routing leaves the stable policy active. Larger records remain in workspace files; the full library is searchable without publishing every summary.

#### KV Cache effect

Tool schemas and workflow guidance remain stable for one composition. Results append to existing history; this package does not reorder messages or replace the DeepSeek transport.

## Known Limitations and Deferred Work

- Literature verification checks bibliographic metadata; claim support still needs scientific review.
- Skills retain upstream assumptions and optional dependencies. Inspection and loading do not run installers.
- Embedded knowledge guides preserve and identify original documents; they do not install scientific libraries or confer specialist validation. Automatic demand matching is heuristic, with additional catalog search available to the model.
- Snapshot metrics describe model attempts, not whole-project wall-clock time or billing. Changing retained-result limits can make a result unavailable even when its file write committed.

<a id="dev-note"></a>
### Dev Note

Applications launch through a `dsh` profile; this package has no standalone launcher.
