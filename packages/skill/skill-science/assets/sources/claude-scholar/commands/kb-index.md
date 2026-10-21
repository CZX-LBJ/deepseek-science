---
name: kb-index
description: Refresh the auto index block inside 02-Index.md without overwriting curated content.
tags: [Research, Obsidian, KB]
---

# /kb-index

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/obsidian-project-kb-core/scripts/project_kb.py" sync --cwd "$PWD" --scope index
```

The index is a human navigation note, not a registry mirror.
Only the auto-generated block should be refreshed here; curated sections must stay intact.
