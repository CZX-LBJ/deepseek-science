---
description: "Durable research stages, immutable deliverable snapshots and traceable claim excerpts."
kind: "package-reference"
---

# @deepseek-ai/dsh-science-project

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

Save a research project in its workspace, checkpoint actual deliverables, and resume interrupted work without relaunching jobs. Phase transitions require unchanged checkpoint files; the claims phase requires recorded supporting evidence. Quotes must exist in their checkpointed artifact, while support remains the researcher’s assessment.

<a id="table-of-contents"></a>
## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The `science` and `science-headless` profiles compose this service with a filesystem and the model tools. A custom composition mounts:

```yaml
- name: '@deepseek-ai/dsh-science-project'
```

| Field | Default | Meaning |
|---|---|---|
| `storageDir` | `.deepseek-science` | Relative workspace storage directory |
| `maxArtifactBytes` | 16777216 | Maximum bytes in one deliverable |
| `maxCheckpointBytes` | 67108864 | Aggregate deliverable byte budget per checkpoint |
| `maxRecordBytes` | 2097152 | Maximum complete state record bytes |
| `lockWaitMs` | 10000 | Cross-process writer lock wait |

Projects use the ordered question, literature, design, analysis, claims, writing, review and delivery phases. Each mutation requires the current revision. Checkpoint evidence supplies claim, artifact, locator, quote, support and reading depth. Skips retain an explicit reason; resuming marks running work interrupted.

<a id="understand-the-implementation"></a>
## Understand the implementation

[State validation](src/record.ts) rejects malformed durable data. [The service](src/index.ts) uses the composed filesystem, atomic version-checked replacement and a host writer lock. Files are hashed into immutable snapshots before state is published. Reads and writes stay within the calling workspace and use its filesystem authority.

## Model Experience

Indirectly, through the science tools that render committed project state.

#### KV Cache effect

This service contributes no system text or tool schema. Its consumer appends ordinary logged tool results.

## Known Limitations and Deferred Work

- Quote matching establishes source traceability, not the scientific truth of a claim or the correctness of a locator.
- Mutation requires filesystem paths shared with the current host; remote filesystem writer locking is not supported.
- Resuming verifies retained deliverables. If a file changed, use `reopen` on the earliest changed phase, then inspect and checkpoint it explicitly. The service never runs experiments, submissions or deployments.

<a id="dev-note"></a>
### Dev Note

Applications launch through a `dsh` profile; this package has no standalone launcher.
