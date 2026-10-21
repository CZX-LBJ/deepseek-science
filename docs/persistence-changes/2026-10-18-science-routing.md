---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-18-science-routing

English | [中文](2026-10-18-science-routing.zh.md)

## Summary

Adds the science-routing message source for automatically selected scientific instruction bodies and their loaded/deferred attribution.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-18-science-routing
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-21-user-question-reply"
    after: "43488d8fe7fe371f7593a6023ea3eade46477a9f388e01a6f72e53cfe69f7f52"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "d758b5b5e73714540e49656cc2d727d065066a6433132fa5e0d594a4e545c303"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "5e330687ee52d89593bb076128eef65ad8342e7d04d10e5e4e7906f7ca517cd2"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "bfbe9933af226d7c7a2e3e49fc3163946a596e44c660f796dd5d1ab6ad955415"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

An additive attribution-only source kind. User/developer message readers preserve the complete logged content without the science plugin. Only the producer inspects its own route key for visible-message duplicate suppression; the metadata does not change replay authority or reconstruct missing instructions. Existing messages remain valid and the fixed classifier requires no Session writer-version change.

<a id="verification"></a>
## Verification

Direct Vitest: kernel.spec.ts and kernel-composition.spec.ts passed 19 checks including real Loader/AgentLoop admission, first-request content, cancellation, visible-message deduplication, compaction and disposal. tool-science.spec.ts passed 4 real-composition checks including a Chinese biology manuscript request with default LaTeX guidance and a routing snapshot. kernel-assets.spec.ts passed 16 checks against packaged resources. Host TypeScript passed.

<a id="dev-note"></a>
## Dev Note

None.
