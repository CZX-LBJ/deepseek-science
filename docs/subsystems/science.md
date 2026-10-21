---
description: "Research phases, scientific evidence and provider usage semantics."
---

# Science

English | [中文](science.zh.md)

Research tools compose through the existing plugin, filesystem and Session APIs. The [package group](../../packages/science/README.md) links operation and configuration owners.

## Projects and evidence

A project has a UUID, monotonic revision, ordered phases and per-phase deliverables. Each artifact records its path, byte count, SHA-256 and immutable snapshot path. Every evidence record names a claim, checkpointed artifact, locator, quote, support assessment and reading depth. Quotes are checked against artifact text; semantic support and locator validity remain researcher responsibilities. An explicit skip retains its reason.

## Literature

Search reports each provider independently and preserves distinct versioned paper identifiers and metadata conflicts. Read depth distinguishes full text, abstract only and unavailable. Excerpts retain page or section locators. DOI verification checks bibliographic metadata. [science-literature](../../packages/science/science-literature/README.md) owns request limits, caches and source access.

## Session view and usage

Successful science tool results carry versioned metadata consumed by the science Session projection. The projection also counts settled successful and failed model attempts. Cache ratio uses the disjoint uncached-input, cache-read and cache-write buckets; a missing bucket or zero denominator makes the ratio unknown. Response latency comes from logged attempt timestamps. The [tool package](../../packages/science/tool-science/README.md) owns rendering and accounting limits.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxscienceliterature--literatureservice"></a>

### `ctx.scienceLiterature` — `LiteratureService`

One configured domain service; user files remain in the composed execution world.

```ts cordis-catalog
/** Search sources independently; genuine empty results remain distinct from source failures.
 * @param query - scholarly search terms.
 * @param options - provider selection, bounded results and optional workspace cache.
 * @param signal - cancellation of all source requests and publication.
 * @returns merged papers and per-source reports; rejects when every source fails.
 */
async search(query: string, options: SearchOptions = {}, signal?: AbortSignal): Promise<SearchResult>

/** Read exact paper versions or local files, returning only selected locator-bearing evidence.
 * @param ref - DOI, arXiv version, approved OA URL or workspace file.
 * @param options - calling workspace, excerpt selection and optional cache authority.
 * @param signal - cancellation of fetch, extraction and publication.
 * @returns selected evidence with explicit depth and extraction limits.
 */
async read(ref: string, options: ReadOptions, signal?: AbortSignal): Promise<ReadResult>

/** Verify bibliographic metadata, independently of whether a paper supports a manuscript claim.
 * @param input - DOI to resolve through Crossref.
 * @param options - expected metadata and optional workspace cache.
 * @param signal - cancellation of lookup and publication.
 * @returns metadata verification status, conflicts and source diagnostics.
 */
async verify(input: string, options: VerifyOptions = {}, signal?: AbortSignal): Promise<VerifyResult>
```

Source: [`packages/science/science-literature/src/index.ts`](../../packages/science/science-literature/src/index.ts)

<a id="ctxscienceprojects--scienceprojects"></a>

### `ctx.scienceProjects` — `ScienceProjects`

Service owning project revisions and artifact-backed phase transitions.

```ts cordis-catalog
/** Create a project without replacing an existing state file.
 * @param cwd - calling session workspace in the active filesystem.
 * @param request - the study title and objective.
 * @param options - per-operation authority and cancellation.
 * @returns the persisted initial revision.
 */
async create(cwd: string, request: { title: string; objective: string }, options: ScienceProjectOptions = {}): Promise<ScienceProject>

/** Read a stable, validated project revision.
 * @param cwd - calling session workspace.
 * @param id - project UUID.
 * @param signal - operation cancellation.
 * @returns the current durable record.
 */
async get(cwd: string, id: ScienceProjectId, signal?: AbortSignal): Promise<ScienceProject>

/** Mark the current phase running without executing external work.
 * @param cwd - calling session workspace.
 * @param id - project identity.
 * @param revision - expected durable revision.
 * @param options - authority and cancellation.
 * @returns the updated record.
 */
async start(cwd: string, id: ScienceProjectId, revision: number, options: ScienceProjectOptions = {}): Promise<ScienceProject>

/** Freeze deliverable bytes and record evidence for the current phase.
 * @param cwd - calling session workspace.
 * @param id - project identity.
 * @param revision - expected revision.
 * @param request - paths and evidence to checkpoint.
 * @param options - authority and cancellation.
 * @returns the revision referencing immutable snapshots.
 */
async checkpoint(cwd: string, id: ScienceProjectId, revision: number, request: ScienceCheckpointRequest, options: ScienceProjectOptions = {}): Promise<ScienceProject>

/** Complete a phase only when its files still match the checkpoint.
 * @param cwd - calling session workspace.
 * @param id - project identity.
 * @param revision - expected revision.
 * @param options - authority and cancellation.
 * @returns the next phase or completed project.
 */
async advance(cwd: string, id: ScienceProjectId, revision: number, options: ScienceProjectOptions = {}): Promise<ScienceProject>

/** Skip an inapplicable phase with a retained explicit reason.
 * @param cwd - calling session workspace.
 * @param id - project identity.
 * @param revision - expected revision.
 * @param reason - why this phase does not apply.
 * @param options - authority and cancellation.
 * @returns the next project revision.
 */
async skip(cwd: string, id: ScienceProjectId, revision: number, reason: string, options: ScienceProjectOptions = {}): Promise<ScienceProject>

/** Recover a project while leaving interrupted external work to explicit restart.
 * @param cwd - calling session workspace.
 * @param id - project identity.
 * @param revision - expected revision.
 * @param options - authority and cancellation.
 * @returns the resumed durable record.
 */
async resume(cwd: string, id: ScienceProjectId, revision: number, options: ScienceProjectOptions = {}): Promise<ScienceProject>

/** Reopen a changed phase and invalidate every following phase while retaining prior evidence records.
 * @param cwd - calling workspace.
 * @param id - project identity.
 * @param revision - expected revision.
 * @param phase - current or earlier phase to recheck.
 * @param reason - explicit reason for invalidating recorded progress.
 * @param options - authority and cancellation.
 * @returns the reopened active project revision.
 */
async reopen(cwd: string, id: ScienceProjectId, revision: number, phase: SciencePhase, reason: string, options: ScienceProjectOptions = {}): Promise<ScienceProject>
```

Source: [`packages/science/science-project/src/index.ts`](../../packages/science/science-project/src/index.ts)
<!-- END GENERATED cordis-surface -->
