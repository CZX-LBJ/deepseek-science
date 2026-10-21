---
description: "科研阶段、证据与模型用量语义。"
---

# 科研

[English](science.md) | 中文

科研工具通过已有插件、文件系统与 Session API 组合。[包组](../../packages/science/README.zh.md)链接各操作与配置所属包。

## 项目和证据

项目具有 UUID、递增 revision、顺序阶段与阶段成果。每份成果保留路径、字节数、SHA-256 和不可变快照。证据记录包括论断、已保存成果、定位、摘录、支持程度和阅读深度。摘录会与真实文件内容核对；语义支持和定位有效性仍由研究者判断。跳过阶段必须保留原因。

## 文献

检索逐来源报告结果，保留论文版本、标识与元数据冲突。阅读深度区分全文、仅摘要和不可用。摘录保留页码或章节定位。DOI 核验只检查书目信息。[science-literature](../../packages/science/science-literature/README.zh.md)负责请求预算、缓存与来源访问。

## Session 视图和用量

成功科研工具结果携带版本化元数据，供科研 Session 投影使用。投影统计成功及失败的已结束模型请求。缓存比率采用互不重叠的未缓存输入、缓存读取和缓存写入量；缺失项或零分母使比率未知。响应延迟来自记录的请求时间戳。[工具包](../../packages/science/tool-science/README.zh.md)负责显示与用量预算。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
