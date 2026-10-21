---
name: kb-literature-review
description: Run the project-scoped literature workflow from Sources/Papers into Knowledge, Writing, and Maps/literature.canvas.
tags: [Research, Obsidian, KB, Literature]
---

# /kb-literature-review

Use `obsidian-literature-workflow`.

Conditional outputs:
- `Knowledge/Literature Overview.md` only when paper notes contain enough Evidence Records for synthesis
- `Knowledge/Method Taxonomy.md` when useful and evidence-backed
- `Knowledge/Research Gaps.md` when useful and evidence-backed
- `Knowledge/Claim Map.md` or a warning when evidence is weak
- `Writing/related-work-draft.md` only when promoted claims pass the evidence gate
- `Maps/literature.canvas`

Keep source notes in `Sources/Papers/`. Do not turn source notes into synthesis notes.

Evidence gate:
- refuse polished `Knowledge` or `Writing` synthesis when paper notes lack Evidence Records,
- keep abstract-only or webpage-placeholder items in coverage / `To-Read`,
- generate a warning or `Knowledge/Claim Map.md` instead of a mature related-work draft when evidence is weak,
- preserve claim strength on literature canvas edges.
