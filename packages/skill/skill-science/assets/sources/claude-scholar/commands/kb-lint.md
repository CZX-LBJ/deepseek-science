---
name: kb-lint
description: Run deterministic KB health checks and rewrite _system/lint-report.md.
tags: [Research, Obsidian, KB, Lint]
---

# /kb-lint

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/obsidian-project-kb-core/scripts/kb_lint.py" --cwd "$PWD"
```

Checks include registry coverage, broken wikilinks, index coverage, canvas validity, and several KB consistency warnings.
