---
description: "Scientific skills, literature, project workflow and sidebar for dsh profiles."
kind: "package-bundle"
---

# @deepseek-ai/dsh-science

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

The science and science-headless profiles include this layer. They gain embedded research instructions, scholarly literature operations and recoverable project checkpoints while using the original Harness model loop and transport. The web profile also displays the scientific sidebar.

<a id="table-of-contents"></a>
## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The shipped science and science-headless profile already selects this bundle. Inspect the resolved composition with:

```sh
pnpm dsh --profile science-headless --dump-default-config
```

Enable both academic noncommercial packs explicitly with `DSH_SCIENCE_NONCOMMERCIAL=1` for permitted noncommercial use. Other research packs remain searchable and loadable without advertising every entry.

<a id="understand-the-implementation"></a>
## Understand the implementation

[The patch](cordis.patch.yml) inserts the skill, literature, project and tool providers plus the existing-sidebar science page. It disables the browser page in science-headless. Package defaults own operation limits.

## Model Experience

Indirectly, through the scientific persona and mounted skill and tool consumers.

#### KV Cache effect

The composition preserves the existing request loop, transport and history. Stable pack selection avoids publishing the full library in each prompt.

## Known Limitations and Deferred Work

- Upstream skill instructions are embedded resources, not preinstalled scientific software or tested experiments.
- Actual model performance and cache savings require a real-key benchmark; presence of this bundle does not establish a hit-rate guarantee.

<a id="dev-note"></a>
### Dev Note

Applications launch through a `dsh` profile; this package has no standalone launcher.
