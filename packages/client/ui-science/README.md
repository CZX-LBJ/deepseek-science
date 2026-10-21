---
description: "Session-scoped scientific workbench in the existing web sidebar."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-science

English | [中文](README.zh.md)

## Summary

The Science sidebar shows a research project's recorded phases, artifacts and evidence, retrieved papers, reading excerpts, skill readiness and measured model usage. It reads the Host's scientific Session projection and keeps missing accounting values explicit.

## Use this package

Compose this browser plugin with the existing right sidebar, locale and Session adapters, generated skill Remote, and the Host science tools. Open Science from the right-sidebar guide. Describe a research task in the conversation; the page updates as tools record results.

Six task templates cover literature review, ideas and novelty, experiment analysis, writing and polishing, figures and peer review. Selecting one displays a request to copy and edit in the conversation; it does not start a model request. Evidence rows show the saved quote and reading depth, with support explicitly labeled as the author's assessment.

Project, artifact and cached-reading buttons open the recorded paths through the ordinary Session file preview. Paper links open only valid HTTP(S) addresses. Failed literature sources retain their diagnostic beside the returned results. Abstract-only reading remains labeled as such.

Search skills by name, description, source, license or requirements. Checked scientific entries carry the Host's readiness classification. The existing skill catalog supplies instruction entries before a scientific tool result exists; these entries explicitly have unchecked requirements. Catalog failures preserve previous entries and offer Retry. A Session preset change or connection reset clears the catalog.

## Understand the implementation

The plugin registers the `science` page type and its body and title in the existing keyed sidebar slots. Framework hooks read the `science` projection, Session lifecycle, workspace directory and the catalog observable. Components contain no external subscription machinery, and the page creates no Session events. The Node entry is an empty roster entry.

Usage comes from `ScienceMetrics`: settled attempts, provider buckets, cache-read share, cumulative response time, first visible response and estimated cost. Missing buckets, latency or cost are displayed as unavailable or unknown rather than replaced with zeros. The plugin does not calculate pricing or infer cache hits from estimates.

## Model Experience

None, as the sidebar reads scientific projections and registers no model input.

#### KV Cache effect

None. Viewing, filtering and opening recorded files does not alter the request prefix or invoke a model.

## Known Limitations and Deferred Work

- The page reports the latest persisted scientific state, not unrecorded filesystem edits.
- Instruction-catalog presence does not establish dependency readiness; ask the conversation to check scientific skills for the detailed classification.
- Provider-reported metrics can remain unavailable, and estimated cost requires known pricing and currency.

### Dev Note

None.
