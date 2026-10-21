/** Session-addressed instruction catalog, with no claims about dependency readiness. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { Context } from '@deepseek-ai/cordis'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** State of one Session's existing skill-catalog Remote read. */
export interface ScienceCatalogSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'failed'
  readonly skills: readonly SkillEntry[]
  readonly error: string | null
}

/** The renderer binds the catalog source; components receive only its hook and reload callback. */
export interface ScienceCatalogInjected {
  readonly hooks: { readonly catalog: HostObservable<ScienceCatalogSnapshot> }
  readonly loadCatalog: () => Promise<void>
}

/** Owns a single-flight read for one Session until invalidation or plugin teardown. */
export class ScienceCatalog {
  /** Renderer-observable status and entries for this Session's current instruction catalog. */
  readonly source = createSnapshotStore<ScienceCatalogSnapshot>({ status: 'idle', skills: [], error: null })
  private pending: Promise<void> | undefined
  private request: AbortController | undefined
  private readonly reads = new Set<Promise<void>>()
  private disposed = false

  constructor(
    private readonly sessionId: SessionId,
    private readonly skills: Context['remote']['skills'],
  ) {}

  /**
   * Read current instructions; a failed refresh preserves the previous catalog.
   * @returns completion of the shared pending read, including its published failure state.
   */
  readonly load = (): Promise<void> => {
    if (this.disposed) return Promise.resolve()
    if (this.pending !== undefined) return this.pending
    const request = new AbortController()
    this.request = request
    const previous = this.source.getSnapshot()
    this.source.set({ ...previous, status: 'loading', error: null })
    this.pending = this.read(request).finally(() => {
      this.reads.delete(pending)
      if (this.request === request) { this.request = undefined; this.pending = undefined }
    })
    const pending = this.pending
    this.reads.add(pending)
    return pending
  }

  private async read(request: AbortController): Promise<void> {
    try {
      const result = await this.skills.list({ sessionId: this.sessionId }, request.signal)
      if (request.signal.aborted || this.disposed) return
      if (!result.ok) {
        this.source.set({ ...this.source.getSnapshot(), status: 'failed', error: result.error.message })
        return
      }
      this.source.set({ status: 'ready', skills: result.value.skills, error: null })
    } catch (error: unknown) {
      if (!request.signal.aborted && !this.disposed) {
        this.source.set({ ...this.source.getSnapshot(), status: 'failed', error: String(error) })
      }
    }
  }

  /** Clear instructions when the Host generation or Session preset changes. */
  invalidate(): void {
    this.request?.abort()
    this.request = undefined
    this.pending = undefined
    this.source.set({ status: 'idle', skills: [], error: null })
  }

  /**
   * Abort work and settle every pending read without publishing after teardown.
   * @returns completion of all previously started reads.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    this.request?.abort()
    await Promise.all(this.reads)
  }
}
