---
name: kb-sync
description: Run deterministic KB maintenance to refresh scaffold integrity, registry, index, daily note, and runtime binding summary.
args:
  - name: scope
    description: Sync scope such as auto, all, index, literature, experiments, or results.
    required: false
    default: auto
tags: [Research, Obsidian, KB]
---

# /kb-sync

Use this when you want a deterministic project-KB resync after structural changes, note moves, migrations, or batch updates.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/obsidian-project-kb-core/scripts/project_kb.py" sync --cwd "$PWD" --scope "$scope"
```

Typical scopes:
- `auto`
- `all`
- `index`
- `literature`
- `experiments`
- `results`

This refreshes:
- scaffold integrity under `Research/{project-slug}/`
- `_system/registry.md`
- `02-Index.md`
- today's `Daily/YYYY-MM-DD.md`
- repo-local `.claude/project-memory/<project_id>.md`
- `00-Hub.md` recent changes when appropriate
