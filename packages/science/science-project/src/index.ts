/** Research projects using the active filesystem's atomic writes and version guards. */
import { createHash, randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { SCIENCE_PHASES, ScienceProjectId as parseScienceProjectId, scienceCheckpointSchema, scienceProjectSchema } from './record.ts'
import type { ScienceProjectId, ScienceArtifact, ScienceCheckpointRequest, SciencePhaseRecord, ScienceProject, ScienceProjectOptions, SciencePhase } from './types.ts'

export type * from './types.ts'
export { SCIENCE_PHASES, ScienceProjectId, scienceProjectSchema } from './record.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { scienceProjects: ScienceProjects }
}

/** Workspace storage location and complete artifact byte budget. */
export interface Config {
  /** Relative workspace directory holding projects and snapshots. */
  storageDir?: string
  /** Complete byte limit for one checkpoint artifact. */
  maxArtifactBytes?: number
  /** Aggregate artifact byte limit for one checkpoint. */
  maxCheckpointBytes?: number
  /** Complete serialized project state byte limit. */
  maxRecordBytes?: number
  /** Maximum writer lock acquisition time. */
  lockWaitMs?: number
}
/** Validated deployment settings for research persistence. */
export const Config: z<Config> = z.object({
  storageDir: z.string().default('.deepseek-science'),
  maxArtifactBytes: z.natural().min(1).default(16 * 1024 * 1024),
  maxCheckpointBytes: z.natural().min(1).default(64 * 1024 * 1024),
  maxRecordBytes: z.natural().min(1).default(2 * 1024 * 1024),
  lockWaitMs: z.natural().min(1).default(10000),
})

/** Service owning project revisions and artifact-backed phase transitions. */
export class ScienceProjects extends Service {
  static inject = ['fs']
  static Config = Config
  private readonly settings: Required<Config>

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'scienceProjects')
    this.settings = Config(config) as Required<Config>
    if (!/^[.a-zA-Z0-9_-]+(?:\/[.a-zA-Z0-9_-]+)*$/.test(this.settings.storageDir)
      || this.settings.storageDir.split('/').some(part => part === '.' || part === '..')) {
      throw new Error('science-project: storageDir must be a relative workspace directory without traversal')
    }
  }

  /** Create a project without replacing an existing state file.
   * @param cwd - calling session workspace in the active filesystem.
   * @param request - the study title and objective.
   * @param options - per-operation authority and cancellation.
   * @returns the persisted initial revision.
   */
  async create(cwd: string, request: { title: string; objective: string }, options: ScienceProjectOptions = {}): Promise<ScienceProject> {
    await this.authorize(cwd, options)
    const id = parseScienceProjectId(randomUUID())
    const now = new Date().toISOString()
    const statePath = `${this.settings.storageDir}/projects/${id}/state.json`
    const project = scienceProjectSchema.parse({
      schemaVersion: 1, id, revision: 1, title: request.title, objective: request.objective,
      statePath, currentPhase: 'question', status: 'active', createdAt: now, updatedAt: now,
      phases: SCIENCE_PHASES.map(phase => ({ phase, status: 'pending', summary: '', reason: '', artifacts: [], evidence: [] })),
    })
    const target = await this.target(cwd, statePath, options.signal)
    await this.ctx.fs.writeText(target, this.encode(project), { kind: 'createIfAbsent' }, options.signal, options.sandboxPolicy)
    return project
  }

  /** Read a stable, validated project revision.
   * @param cwd - calling session workspace.
   * @param id - project UUID.
   * @param signal - operation cancellation.
   * @returns the current durable record.
   */
  async get(cwd: string, id: ScienceProjectId, signal?: AbortSignal): Promise<ScienceProject> {
    return (await this.read(cwd, id, signal)).project
  }

  /** Mark the current phase running without executing external work.
   * @param cwd - calling session workspace.
   * @param id - project identity.
   * @param revision - expected durable revision.
   * @param options - authority and cancellation.
   * @returns the updated record.
   */
  async start(cwd: string, id: ScienceProjectId, revision: number, options: ScienceProjectOptions = {}): Promise<ScienceProject> {
    return this.update(cwd, id, revision, options, (project) => {
      const phase = this.current(project)
      phase.status = 'running'
      phase.reason = ''
    })
  }

  /** Freeze deliverable bytes and record evidence for the current phase.
   * @param cwd - calling session workspace.
   * @param id - project identity.
   * @param revision - expected revision.
   * @param request - paths and evidence to checkpoint.
   * @param options - authority and cancellation.
   * @returns the revision referencing immutable snapshots.
   */
  async checkpoint(cwd: string, id: ScienceProjectId, revision: number, request: ScienceCheckpointRequest,
    options: ScienceProjectOptions = {}): Promise<ScienceProject> {
    const input = scienceCheckpointSchema.parse(request)
    return this.update(cwd, id, revision, options, async (project) => {
      const phase = this.current(project)
      const artifacts: ScienceArtifact[] = []
      let totalBytes = 0
      for (const evidence of input.evidence) {
        if (!input.paths.includes(evidence.artifact)) {
          throw new HarnessError(`Evidence artifact ${JSON.stringify(evidence.artifact)} is not checkpointed`, 'SCIENCE_EVIDENCE_MISSING')
        }
      }
      for (const path of [...new Set(input.paths)]) {
        const target = await this.target(cwd, path, options.signal)
        const bytes = await this.stableBytes(target, options.signal)
        totalBytes += bytes.length
        if (totalBytes > this.settings.maxCheckpointBytes) {
          throw new HarnessError('Checkpoint artifacts exceed maxCheckpointBytes', 'SCIENCE_CHECKPOINT_TOO_LARGE')
        }
        const evidence = input.evidence.filter(entry => entry.artifact === path)
        if (evidence.length > 0) {
          const raw = new TextDecoder().decode(bytes)
          for (const entry of evidence) {
            if (!raw.includes(entry.quote) && !raw.includes(JSON.stringify(entry.quote).slice(1, -1))) {
              throw new HarnessError('Evidence quote is absent from its checkpointed artifact', 'SCIENCE_EVIDENCE_MISMATCH')
            }
          }
        }
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        const snapshotPath = `${this.settings.storageDir}/projects/${id}/artifacts/${sha256}.json`
        const archive = await this.target(cwd, snapshotPath, options.signal)
        const saved = await this.ctx.fs.stat(archive, options.signal)
        if (saved === undefined) {
          try {
            await this.ctx.fs.writeText(archive, JSON.stringify({ sha256, base64: Buffer.from(bytes).toString('base64') }) + '\n',
              { kind: 'createIfAbsent' }, options.signal, options.sandboxPolicy)
          } catch (error) {
            if (!(error instanceof FsError && error.code === 'FS_NOT_OBSERVED')) throw error
            await this.verifySnapshot(archive, sha256, options.signal)
          }
        } else {
          await this.verifySnapshot(archive, sha256, options.signal)
        }
        artifacts.push({ path, sha256, size: bytes.length, snapshotPath })
      }
      phase.summary = input.summary
      phase.artifacts = artifacts
      phase.evidence = input.evidence
      phase.status = 'checkpointed'
      phase.reason = ''
    })
  }

  /** Complete a phase only when its files still match the checkpoint.
   * @param cwd - calling session workspace.
   * @param id - project identity.
   * @param revision - expected revision.
   * @param options - authority and cancellation.
   * @returns the next phase or completed project.
   */
  async advance(cwd: string, id: ScienceProjectId, revision: number, options: ScienceProjectOptions = {}): Promise<ScienceProject> {
    return this.update(cwd, id, revision, options, async (project) => {
      const phase = this.current(project)
      if (phase.status !== 'checkpointed' || phase.artifacts.length === 0) {
        throw new HarnessError('Complete a deliverable checkpoint before advancing the research phase', 'SCIENCE_CHECKPOINT_REQUIRED')
      }
      if (phase.phase === 'claims' && !phase.evidence.some(item => item.support === 'supported' || item.support === 'partial')) {
        throw new HarnessError('The claims phase requires recorded supporting evidence with a locator', 'SCIENCE_EVIDENCE_REQUIRED')
      }
      await this.verifyArtifacts(cwd, phase, options.signal)
      for (const prior of project.phases.slice(0, SCIENCE_PHASES.indexOf(project.currentPhase))) {
        if (prior.status === 'completed') await this.verifyArtifacts(cwd, prior, options.signal)
      }
      phase.status = 'completed'
      this.next(project)
    })
  }

  /** Skip an inapplicable phase with a retained explicit reason.
   * @param cwd - calling session workspace.
   * @param id - project identity.
   * @param revision - expected revision.
   * @param reason - why this phase does not apply.
   * @param options - authority and cancellation.
   * @returns the next project revision.
   */
  async skip(cwd: string, id: ScienceProjectId, revision: number, reason: string,
    options: ScienceProjectOptions = {}): Promise<ScienceProject> {
    if (reason.trim().length === 0) throw new HarnessError('A nonempty skip reason is required', 'SCIENCE_SKIP_REASON')
    return this.update(cwd, id, revision, options, async (project) => {
      const phase = this.current(project)
      for (const prior of project.phases.slice(0, SCIENCE_PHASES.indexOf(project.currentPhase))) {
        if (prior.status === 'completed') await this.verifyArtifacts(cwd, prior, options.signal)
      }
      phase.status = 'skipped'
      phase.reason = reason.trim()
      this.next(project)
    })
  }

  /** Recover a project while leaving interrupted external work to explicit restart.
   * @param cwd - calling session workspace.
   * @param id - project identity.
   * @param revision - expected revision.
   * @param options - authority and cancellation.
   * @returns the resumed durable record.
   */
  async resume(cwd: string, id: ScienceProjectId, revision: number, options: ScienceProjectOptions = {}): Promise<ScienceProject> {
    return this.update(cwd, id, revision, options, async (project) => {
      for (const phase of project.phases) {
        if (phase.status === 'completed' || phase.status === 'checkpointed') await this.verifyArtifacts(cwd, phase, options.signal)
        if (phase.status === 'running') {
          phase.status = 'interrupted'
          phase.reason = 'Work was interrupted; inspect existing jobs and explicitly restart any external action.'
        }
      }
    }, true)
  }

  /** Reopen a changed phase and invalidate every following phase while retaining prior evidence records.
   * @param cwd - calling workspace.
   * @param id - project identity.
   * @param revision - expected revision.
   * @param phase - current or earlier phase to recheck.
   * @param reason - explicit reason for invalidating recorded progress.
   * @param options - authority and cancellation.
   * @returns the reopened active project revision.
   */
  async reopen(cwd: string, id: ScienceProjectId, revision: number, phase: SciencePhase, reason: string,
    options: ScienceProjectOptions = {}): Promise<ScienceProject> {
    if (!reason.trim()) throw new HarnessError('Reopening a phase requires a reason', 'SCIENCE_REOPEN_REASON')
    return this.update(cwd, id, revision, options, (project) => {
      const index = SCIENCE_PHASES.indexOf(phase)
      if (index < 0 || index > SCIENCE_PHASES.indexOf(project.currentPhase)) {
        throw new HarnessError('Only current or earlier phases can be reopened', 'SCIENCE_INVALID_ARGUMENT')
      }
      for (const entry of project.phases.slice(index)) {
        entry.status = 'pending'
        entry.reason = `Recheck required: ${reason.trim()}`
      }
      project.currentPhase = phase
      project.status = 'active'
    }, true)
  }

  private async target(cwd: string, path: string, signal?: AbortSignal): Promise<FsTarget> {
    if (cwd.trim().length === 0) throw new HarnessError('Research operations require a session workspace', 'SCIENCE_WORKSPACE_REQUIRED')
    const lifetime = signal === undefined ? {} : { signal }
    const root = await this.ctx.fs.resolve(cwd, lifetime)
    const target = await this.ctx.fs.resolve(path, { cwd, ...lifetime })
    if (!this.ctx.fs.contains(root, target)) throw new HarnessError('Research paths must stay within the session workspace', 'SCIENCE_OUTSIDE_WORKSPACE')
    return target
  }

  private async stableBytes(target: FsTarget, signal?: AbortSignal): Promise<Uint8Array> {
    const before = await this.ctx.fs.stat(target, signal)
    if (before?.type !== 'file') throw new HarnessError(`Artifact ${target.displayPath} is not a regular file`, 'SCIENCE_ARTIFACT_MISSING')
    const bytes = await this.ctx.fs.readBytes(target, signal, this.settings.maxArtifactBytes)
    const after = await this.ctx.fs.stat(target, signal)
    if (before.version !== after?.version) throw new HarnessError('Artifact changed while reading', 'SCIENCE_ARTIFACT_CHANGED')
    return bytes
  }

  private async read(cwd: string, id: ScienceProjectId, signal?: AbortSignal):
  Promise<{ project: ScienceProject; target: FsTarget; version: FsVersion }> {
    const identity = parseScienceProjectId(id)
    const path = `${this.settings.storageDir}/projects/${identity}/state.json`
    const target = await this.target(cwd, path, signal)
    const before = await this.ctx.fs.stat(target, signal)
    if (before?.type !== 'file') throw new HarnessError('Research project was not found', 'SCIENCE_PROJECT_NOT_FOUND')
    const bytes = await this.ctx.fs.readBytes(target, signal, this.settings.maxRecordBytes)
    const after = await this.ctx.fs.stat(target, signal)
    if (before.version !== after?.version) throw new HarnessError('Project changed while reading; reload its revision', 'SCIENCE_PROJECT_CONFLICT')
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    const project = scienceProjectSchema.parse(raw)
    if (project.id !== identity || project.statePath !== path) throw new HarnessError('Project identity does not match its storage path', 'SCIENCE_RECORD_INVALID')
    return { project, target, version: before.version }
  }

  private async update(cwd: string, id: ScienceProjectId, revision: number, options: ScienceProjectOptions,
    mutate: (project: ScienceProject) => void | Promise<void>, allowCompleted = false): Promise<ScienceProject> {
    await this.authorize(cwd, options)
    const identity = parseScienceProjectId(id)
    const target = await this.target(cwd, `${this.settings.storageDir}/projects/${identity}/state.json`, options.signal)
    const processPath = this.ctx.fs.processPath(target)
    if (this.ctx.fs.processPathFromHostPath(processPath) !== processPath) {
      throw new HarnessError('Research project mutation requires a filesystem shared with this host for writer locking', 'SCIENCE_STORAGE_UNSUPPORTED')
    }
    return withFileLock(processPath, () => this.commit(cwd, identity, revision, options, mutate, allowCompleted),
      { waitMs: this.settings.lockWaitMs, ...options.signal === undefined ? {} : { signal: options.signal } })
  }

  private async authorize(cwd: string, options: ScienceProjectOptions): Promise<void> {
    options.signal?.throwIfAborted()
    const policy = options.sandboxPolicy
    if (policy?.mode === 'read-only') throw new FsError('Research state cannot change in read-only mode', 'FS_SANDBOX_DENIED')
    if (policy?.mode === 'workspace-write') {
      const lifetime = options.signal === undefined ? {} : { signal: options.signal }
      const authorized = await this.ctx.fs.resolve(policy.workspaceRoot, lifetime)
      const root = await this.ctx.fs.resolve(cwd, lifetime)
      if (!this.ctx.fs.contains(authorized, root)) throw new FsError('Research workspace is outside write authority', 'FS_SANDBOX_DENIED')
    }
  }

  private async commit(cwd: string, id: ScienceProjectId, revision: number, options: ScienceProjectOptions,
    mutate: (project: ScienceProject) => void | Promise<void>, allowCompleted: boolean): Promise<ScienceProject> {
    const loaded = await this.read(cwd, id, options.signal)
    if (loaded.project.revision !== revision) throw new HarnessError('Project revision conflict; reload its current state', 'SCIENCE_PROJECT_CONFLICT')
    if (!allowCompleted && loaded.project.status === 'completed') throw new HarnessError('Research project is already complete', 'SCIENCE_PROJECT_COMPLETED')
    await mutate(loaded.project)
    options.signal?.throwIfAborted()
    const project = scienceProjectSchema.parse({ ...loaded.project, revision: revision + 1, updatedAt: new Date().toISOString() })
    try {
      await this.ctx.fs.writeText(loaded.target, this.encode(project), { kind: 'replaceIfVersion', version: loaded.version }, options.signal, options.sandboxPolicy)
    } catch (error) {
      if (error instanceof FsError && error.code === 'FS_STALE_VERSION') {
        throw new HarnessError('Project revision conflict; reload its current state', 'SCIENCE_PROJECT_CONFLICT', { cause: error })
      }
      throw error
    }
    return project
  }

  private encode(project: ScienceProject): string {
    const text = JSON.stringify(project, null, 2) + '\n'
    if (Buffer.byteLength(text) > this.settings.maxRecordBytes) throw new HarnessError('Research record exceeds maxRecordBytes', 'SCIENCE_RECORD_TOO_LARGE')
    return text
  }

  private current(project: ScienceProject): SciencePhaseRecord {
    const phase = project.phases.find(item => item.phase === project.currentPhase)
    if (phase === undefined) throw new HarnessError('Project phase is missing', 'SCIENCE_RECORD_INVALID')
    return phase
  }

  private next(project: ScienceProject): void {
    const index = SCIENCE_PHASES.indexOf(project.currentPhase)
    const next = SCIENCE_PHASES[index + 1]
    if (next === undefined) project.status = 'completed'
    else project.currentPhase = next
  }

  private async verifyArtifacts(cwd: string, phase: SciencePhaseRecord, signal?: AbortSignal): Promise<void> {
    for (const artifact of phase.artifacts) {
      const bytes = await this.stableBytes(await this.target(cwd, artifact.path, signal), signal)
      if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
        throw new HarnessError(`Checkpoint artifact ${JSON.stringify(artifact.path)} changed; repeat the affected checks`, 'SCIENCE_ARTIFACT_CHANGED')
      }
      await this.verifySnapshot(await this.target(cwd, artifact.snapshotPath, signal), artifact.sha256, signal)
    }
  }

  private async verifySnapshot(target: FsTarget, expected: string, signal?: AbortSignal): Promise<void> {
    const bytes = await this.ctx.fs.readBytes(target, signal, Math.ceil(this.settings.maxArtifactBytes * 4 / 3) + 1024)
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (typeof value !== 'object' || value === null || !('base64' in value) || typeof value.base64 !== 'string'
      || !('sha256' in value) || value.sha256 !== expected
      || createHash('sha256').update(Buffer.from(value.base64, 'base64')).digest('hex') !== expected) {
      throw new HarnessError('Research artifact snapshot checksum mismatch', 'SCIENCE_SNAPSHOT_INVALID')
    }
  }
}

export default ScienceProjects
