---
name: kb-links
description: Repair or strengthen wikilinks among canonical KB notes without generating extra artifact sprawl.
tags: [Research, Obsidian, KB]
---

# /kb-links

Use `obsidian-kb-artifacts` for standalone wikilink repair.

Default surfaces:
- `Sources/`
- `Knowledge/`
- `Experiments/`
- `Results/`
- `Writing/`
- `00-Hub.md`
- `01-Plan.md`
- `02-Index.md`

Rules:
- repair links inside existing canonical notes first
- do not create new notes just to satisfy a weak connection
- after substantial link repair, run `/kb-sync` or `/kb-lint`
- only touch `Maps/` when the user explicitly wants artifact updates
