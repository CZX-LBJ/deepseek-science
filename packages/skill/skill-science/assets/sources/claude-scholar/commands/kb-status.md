---
name: kb-status
description: Summarize the current bound project KB status, including registry counts and key project note paths.
tags: [Research, Obsidian, KB]
---

# /kb-status

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/obsidian-project-kb-core/scripts/project_kb.py" status --cwd "$PWD"
```

Optionally add `--project-id "$project_id"` when the repo has multiple bindings.
