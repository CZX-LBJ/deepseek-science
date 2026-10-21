---
name: kb-ingest
description: Ingest external material into Sources/* inside the bound project KB, then update registry, index, and daily note as needed.
args:
  - name: path
    description: Source path or URL to ingest.
    required: true
tags: [Research, Obsidian, KB, Ingestion]
---

# /kb-ingest

Use `obsidian-source-ingestion` with the new routing rules:

- paper -> `Sources/Papers/`
- web -> `Sources/Web/`
- docs/spec -> `Sources/Docs/`
- dataset/benchmark -> `Sources/Data/`
- interview/transcript -> `Sources/Interviews/`
- loose imported note -> `Sources/Notes/`

After ingest:
- update `_system/registry.md`
- update `02-Index.md` when the source is important
- append a short line to today's `Daily/` when this is part of an active session
