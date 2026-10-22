# Bundled scientific skills

English | [中文](science-skills.zh.md)

## Summary

DeepSeek Science 0.2.1-alpha.2 carries **968 catalog entries from 19 sources and 11,527 hash-pinned resource files**. This is an inventory of instructions and reference materials. A catalog entry does not certify that an upstream workflow or its external tools have been tested end to end in this application.

## Contents

- [Source inventory](#source-inventory)
- [Automatic use](#automatic-use)
- [Readiness](#readiness)
- [Licenses](#licenses)
- [Verification](#verification)

## Source inventory

Counts use each entry's primary source; shared resources and explicitly user-only instructions can also have catalog entries. Nature Skills contributes 22 model-callable workflows and one shared support entry. The four numerical, symbolic, control and quantum projects contribute locally authored knowledge guides with preserved upstream references, rather than upstream-authored skill collections.

| Source | Catalog entries | Main use |
| --- | ---: | --- |
| [Academic Research Skills](https://github.com/Imbad0202/academic-research-skills) | 5 | Research and manuscripts |
| [Academic Research Skills Codex](https://github.com/Imbad0202/academic-research-skills-codex) | 1 | Research suite |
| [AI Research Skills](https://github.com/Orchestra-Research/AI-Research-SKILLs) | 98 | AI research and experiments |
| [ARIS](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep) | 184 | Ideation, experiments, writing and review |
| [bioSkills](https://github.com/GPTomics/bioSkills) | 44 | Biology and bioinformatics |
| [Claude Scholar](https://github.com/Galaxy-Dawn/claude-scholar) | 45 | Research planning and manuscripts |
| [Claude Scientific Writer](https://github.com/K-Dense-AI/claude-scientific-writer) | 22 | Scientific writing |
| [python-control guides](https://github.com/python-control/python-control) | 1 | Control systems reference guide |
| [Hugging Face Skills](https://github.com/huggingface/skills) | 24 | Models, datasets and training |
| [KiCad Happy](https://github.com/aklofas/kicad-happy) | 5 | Electronics and circuit workflows |
| [Lean4 Skills](https://github.com/cameronfreer/lean4-skills) | 1 | Formal mathematics |
| [Matt Pocock Skills](https://github.com/mattpocock/skills) | 21 | Software development workflows |
| [Nature Skills](https://github.com/Yuan1z0825/nature-skills) | 23 | Writing, figures, literature and review |
| [OpenScience](https://github.com/synthetic-sciences/openscience) | 311 | Multidisciplinary research workflows |
| [QuTiP tutorials](https://github.com/qutip/qutip-tutorials) | 1 | Quantum dynamics reference guide |
| [Scientific Agent Skills](https://github.com/K-Dense-AI/scientific-agent-skills) | 164 | Scientific domains, databases and methods |
| [SciPy guides](https://github.com/scipy/scipy) | 1 | Numerical methods reference guide |
| [Superpowers](https://github.com/obra/superpowers) | 15 | Planning, debugging and validation |
| [SymPy guides](https://github.com/sympy/sympy) | 2 | Symbolic mathematics reference guides |

Pinned revisions, license texts and attribution are recorded in [NOTICE](../packages/skill/skill-science/assets/NOTICE.md). The machine-readable [manifest](../packages/skill/skill-science/assets/manifest.json) lists every retained entry, resource hash, requirement and excluded instruction.

## Automatic use

The scientific operating policy is active by default. Users describe a research task in ordinary language; they do not need to remember skill names. The common discovery list contains 52 model-callable upstream entries, alongside the application's native research workflows. This small list is not the full bundled library.

The kernel selects relevant instructions through 15 task and domain routing rules and task-specific Nature assemblies. It can select a routed skill even when its pack is absent from the common discovery list. The agent can also search the complete catalog and load permitted instructions through its scientific tools. Context budgets can defer instruction bodies or references until they are needed; the application does not insert all 968 entries into every model request.

The catalog marks 956 entries as model-callable, including the noncommercial entries that require explicit activation. Other entries retain their upstream invocation restrictions. Automatic loading makes instructions available to the selected model; it does not install external services or make their experiments run by itself.

## Readiness

| Catalog status | Entries | Meaning |
| --- | ---: | --- |
| guidance-only | 57 | Instructions are retained as guidance; this does not certify an executed workflow. |
| needs-setup | 910 | Upstream assumptions or runtime requirements still need checking or adaptation. |
| support | 1 | Shared supporting material. |

All upstream entries currently record `testedHere: false`. Tests of catalog hashes, instruction loading and routing validate the integration mechanisms, not every scientific package, external API, experiment or paper-generation outcome. Task-specific Python libraries, TeX, GPUs, licensed data and service credentials may still be required. Bundling these materials is not equivalent to completing executable adaptations of all upstream projects.

## Licenses

The two Academic Research Skills collections are bundled separately under CC BY-NC 4.0 and disabled by default; they contain six catalog entries in total. Explicit activation does not grant commercial-use rights. Other collections retain their own license terms and nested exceptions.

## Verification

From a source checkout with dependencies installed, run the following checks. The source check verifies that every declared resource is actually tracked by Git, including upstream files in directories otherwise ignored by this repository.

```powershell
node scripts/verify-science-source.mjs
node scripts/sync-science-skills.mjs --verify-only
```

Release packaging additionally inspects the unpacked application for credentials and local build/profile paths. The release audit compares its bundled catalog and resource hashes with this source inventory.
