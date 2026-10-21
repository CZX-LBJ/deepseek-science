---
description: "Scientific web agent preset preserving standard Harness tools."
kind: "package-bundle"
---

# @deepseek-ai/dsh-science-web

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

The science web profile uses this layer to select the DeepSeek Science agent preset. It keeps the standard web tool set and scientific persona in the preset’s scoped system prompt.

<a id="table-of-contents"></a>
## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The shipped science profile already selects this bundle. Inspect the resolved composition with:

```sh
pnpm dsh --profile science --dump-default-config
```

The science-web layer follows science in the web composition. It is omitted from science-headless.

<a id="understand-the-implementation"></a>
## Understand the implementation

[The patch](cordis.patch.yml) selects a scientific preset derived from the standard web composition, preserving its scoped tool providers. The [source entry](src/index.ts) carries no application launcher.

## Model Experience

Indirectly, through the selected scientific persona and tool-owning packages.

#### KV Cache effect

The composition preserves the existing request loop, transport and history. Stable pack selection avoids publishing the full library in each prompt.

## Known Limitations and Deferred Work

- The scoped preset mirrors standard web tool composition; maintainers must review relevant upstream tool-set changes.
- Actual model performance and cache savings require a real-key benchmark; presence of this bundle does not establish a hit-rate guarantee.

<a id="dev-note"></a>
### Dev Note

Applications launch through a `dsh` profile; this package has no standalone launcher.
