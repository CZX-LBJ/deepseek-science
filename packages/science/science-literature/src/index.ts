/** Scholarly source search and evidence reading over Harness filesystem and public HTTP capabilities. */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type {} from '@deepseek-ai/dsh-fs'
import { fetchHttpResource } from '@deepseek-ai/dsh-web-fetch-http/resource'
import type { HttpResource } from '@deepseek-ai/dsh-web-fetch-http/resource'
import { arxivId, fromAtom, fromCrossref, fromOpenAlex, hash, mergePapers, metadataConflicts, normalizeDOI, object } from './metadata.ts'
import { loadDocument, saveCache } from './cache.ts'
import { extractPDF } from './pdf.ts'
import { articleText, selectText } from './reading.ts'
import type { Config, Paper, ReadOptions, ReadResult, SearchOptions, SearchResult, SourceEvidence, SourceReport, VerifyOptions, VerifyResult } from './types.ts'

export type * from './types.ts'
export { toBibTeX, toCSV } from './exports.ts'
export { normalizeDOI } from './metadata.ts'
declare module '@deepseek-ai/cordis' { interface Context { scienceLiterature: LiteratureService } }

const DEFAULTS = {
  requestTimeoutMs: 30000, maxBytes: 20 * 1024 * 1024, maxPages: 100,
  maxChars: 12000, maxDocumentChars: 2000000, maxResults: 25, maxRequests: 6,
}
type Limits = typeof DEFAULTS & Pick<Config, 'openalexApiKey' | 'openalexMailto' | 'crossrefMailto'>
interface Operation { signal: AbortSignal; requests: number; evidence: SourceEvidence[] }
class SourceError extends HarnessError {
  constructor(message: string, code: string, readonly report: SourceReport) { super(message, code) }
}
function endpoint(input: string): string {
  const url = new URL(input)
  url.searchParams.delete('api_key')
  return url.href
}
function positive(value: number, name: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new HarnessError(`${name} must be an integer between 1 and ${max}`, 'SCIENCE_INVALID_ARGUMENT')
  return value
}
function retryDelay(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const seconds = Number(raw)
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now()
  return Number.isFinite(milliseconds) ? Math.max(0, Math.min(milliseconds, 24 * 60 * 60 * 1000)) : undefined
}
function decode(resource: HttpResource): string { return new TextDecoder('utf-8', { fatal: true }).decode(resource.bytes) }
function sourceError(source: string, url: string, code: string, message: string, status?: number, retryAfterMs?: number): SourceError {
  return new SourceError(message, code, { source, endpoint: endpoint(url), retrievedAt: new Date().toISOString(), status: 'failed', count: 0, error: message,
    ...status === undefined ? {} : { httpStatus: status }, ...retryAfterMs === undefined ? {} : { retryAfterMs } })
}

/** One configured domain service; user files remain in the composed execution world. */
export default class LiteratureService extends Service {
  static inject = ['fs']
  static Config: z<Config> = z.object({
    requestTimeoutMs: z.number().step(1).min(1).max(300000).default(DEFAULTS.requestTimeoutMs),
    maxBytes: z.number().step(1).min(1).max(100 * 1024 * 1024).default(DEFAULTS.maxBytes),
    maxPages: z.number().step(1).min(1).max(1000).default(DEFAULTS.maxPages),
    maxChars: z.number().step(1).min(1).max(1000000).default(DEFAULTS.maxChars),
    maxDocumentChars: z.number().step(1).min(1).max(10000000).default(DEFAULTS.maxDocumentChars),
    maxResults: z.number().step(1).min(1).max(100).default(DEFAULTS.maxResults),
    maxRequests: z.number().step(1).min(1).max(20).default(DEFAULTS.maxRequests),
    openalexApiKey: z.string(), openalexMailto: z.string(), crossrefMailto: z.string(),
  })
  private readonly limits: Limits
  private readonly lifetime = new AbortController()
  private readonly active = new Set<Promise<unknown>>()
  private readonly heldUntil = new Map<string, number>()
  private arxivNext = 0
  private readonly approved = new Map<string, Paper>()

  /** Construct bounded scholarly operations and join them when the plugin unloads. */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'scienceLiterature')
    this.limits = { ...DEFAULTS, ...config }
    for (const name of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) positive(this.limits[name], name)
    ctx.effect(() => async () => {
      this.lifetime.abort(new HarnessError('literature service was unloaded', 'SCIENCE_UNAVAILABLE'))
      await Promise.allSettled(this.active)
      this.approved.clear()
    })
  }

  /** Search sources independently; genuine empty results remain distinct from source failures.
   * @param query - scholarly search terms.
   * @param options - provider selection, bounded results and optional workspace cache.
   * @param signal - cancellation of all source requests and publication.
   * @returns merged papers and per-source reports; rejects when every source fails.
   */
  async search(query: string, options: SearchOptions = {}, signal?: AbortSignal): Promise<SearchResult> {
    if (typeof query !== 'string' || !query.trim() || query.length > 1000) throw new HarnessError('query must contain 1–1000 characters', 'SCIENCE_INVALID_ARGUMENT')
    const limit = positive(options.limit ?? Math.min(10, this.limits.maxResults), 'limit', this.limits.maxResults)
    const sources = [...new Set(options.sources ?? ['openalex', 'arxiv'])]
    if (!sources.length || sources.some(s => !['arxiv', 'openalex'].includes(s))) throw new HarnessError('sources must name arxiv or openalex', 'SCIENCE_INVALID_ARGUMENT')
    for (const value of [options.since, options.until]) if (value !== undefined) positive(value, 'year', 9999)
    if (options.since !== undefined && options.until !== undefined && options.since > options.until) throw new HarnessError('since must precede until', 'SCIENCE_INVALID_ARGUMENT')
    return this.operation(signal, async (op) => {
      const runs = await Promise.all(sources.map(async (source) => {
        const url = source === 'arxiv' ? this.arxivURL(query, limit) : this.openalexURL(query, limit, options)
        try {
          const fetched = await this.fetch(source, url, op)
          const parsed = source === 'arxiv' ? { papers: fromAtom(decode(fetched.resource), fetched.report.retrievedAt), partial: false }
            : this.openalexResults(fetched.resource, fetched.report.retrievedAt)
          const papers = parsed.papers.slice(0, this.limits.maxResults)
          if (parsed.partial || parsed.papers.length > papers.length) {
            fetched.report.status = 'partial'
            fetched.report.error = 'Some metadata records were malformed or exceeded the source result budget'
          }
          fetched.report.count = papers.length
          return { papers, report: fetched.report }
        } catch (error: unknown) {
          op.signal.throwIfAborted()
          return { papers: [] as Paper[], report: error instanceof SourceError ? error.report : sourceError(source, url, 'SCIENCE_INVALID_RESPONSE', 'source returned invalid scholarly metadata').report }
        }
      }))
      if (runs.every(run => run.report.status === 'failed')) {
        throw new HarnessError(
          `All literature sources failed: ${runs.map(r => `${r.report.source}: ${r.report.error}`).join('; ')}`,
          'SCIENCE_SOURCES_FAILED',
        )
      }
      const merged = mergePapers(runs.flatMap(run => run.papers)).filter(p =>
        (options.since === undefined || p.year === undefined || p.year >= options.since)
        && (options.until === undefined || p.year === undefined || p.year <= options.until))
      const papers = merged.sort((a, b) => b.sources.length - a.sources.length).slice(0, limit)
      papers.forEach((p) => { this.remember(p) })
      const result: SearchResult = { query, status: runs.some(r => r.report.status !== 'completed') ? 'partial' : 'completed', papers, sources: runs.map(r => r.report), truncated: merged.length > limit }
      const path = await saveCache(this.ctx.fs, { kind: 'search', result, evidence: op.evidence }, options.cache, op.signal)
      if (path) result.cachePath = path
      return result
    })
  }

  /** Read exact paper versions or local files, returning only selected locator-bearing evidence.
   * @param ref - DOI, arXiv version, approved OA URL or workspace file.
   * @param options - calling workspace, excerpt selection and optional cache authority.
   * @param signal - cancellation of fetch, extraction and publication.
   * @returns selected evidence with explicit depth and extraction limits.
   */
  async read(ref: string, options: ReadOptions, signal?: AbortSignal): Promise<ReadResult> {
    if (typeof ref !== 'string' || !ref.trim() || ref.length > 2000) throw new HarnessError('ref must contain 1–2000 characters', 'SCIENCE_INVALID_REFERENCE')
    if (typeof options.cwd !== 'string' || !options.cwd.trim()) {
      throw new HarnessError('reading requires the calling workspace cwd', 'SCIENCE_INVALID_ARGUMENT')
    }
    const cap = positive(options.maxChars ?? this.limits.maxChars, 'maxChars', this.limits.maxChars)
    if (options.query !== undefined && (!options.query.trim() || options.query.length > 1000)) throw new HarnessError('read query must contain 1–1000 characters', 'SCIENCE_INVALID_ARGUMENT')
    if (options.pages !== undefined && (!Array.isArray(options.pages) || !options.pages.length || options.pages.length > this.limits.maxPages || options.pages.some(p => !Number.isInteger(p) || p < 1))) throw new HarnessError('pages must contain bounded positive page numbers', 'SCIENCE_INVALID_ARGUMENT')
    const value = ref.trim()
    if (/^[a-z][a-z\d+.-]*:/iu.test(value) && !/^https?:\/\//iu.test(value) && !/^arxiv:/iu.test(value) && !/^doi:/iu.test(value) && !/^[a-z]:[\\/]/iu.test(value)) throw new HarnessError('unsupported reference URI scheme', 'SCIENCE_INVALID_REFERENCE')
    return this.operation(signal, async (op) => {
      const sources: SourceReport[] = []
      const doi = normalizeDOI(value)
      const id = arxivId(value) ?? (doi?.startsWith('10.48550/arxiv.') ? arxivId(doi.slice('10.48550/arxiv.'.length)) : undefined)
      let paper: Paper | undefined
      let preferredUrl: string | undefined
      let bytes: Uint8Array | undefined
      let media = ''
      if (id) {
        try {
          const fetched = await this.fetch('arxiv', `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`, op)
          paper = fromAtom(decode(fetched.resource), fetched.report.retrievedAt)[0]
          if (paper && /v\d+$/iu.test(id) && paper.arxivId !== id) throw new HarnessError('arXiv metadata resolved a different requested version', 'SCIENCE_VERSION_CONFLICT')
          fetched.report.count = paper ? 1 : 0
          sources.push(fetched.report)
        } catch (error) {
          op.signal.throwIfAborted()
          if (error instanceof HarnessError && error.code === 'SCIENCE_VERSION_CONFLICT') throw error
          sources.push(error instanceof SourceError ? error.report : sourceError('arxiv', `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, 'SCIENCE_INVALID_RESPONSE', 'arXiv returned invalid scholarly metadata').report)
        }
        paper ??= { id: `arxiv:${id}`, arxivId: id, arxivBaseId: id.replace(/v\d+$/iu, ''), title: id, authors: [], sources: ['arxiv'], retrievedAt: new Date().toISOString(), fullTextLocations: [{ url: `https://arxiv.org/pdf/${id}`, format: 'pdf', source: 'arxiv', access: 'open' }], conflicts: [] }
      } else if (doi) {
        try {
          const fetched = await this.fetch('openalex', this.withOpenalexKey(`https://api.openalex.org/works/doi:${doi}`), op)
          paper = fromOpenAlex(JSON.parse(decode(fetched.resource)), fetched.report.retrievedAt)
          if (!paper) throw sourceError('openalex', fetched.resource.url, 'SCIENCE_INVALID_RESPONSE', 'OpenAlex returned invalid scholarly metadata')
          if (paper.doi && paper.doi !== doi) throw new HarnessError('OpenAlex resolved a different requested DOI', 'SCIENCE_METADATA_CONFLICT')
          fetched.report.count = 1
          sources.push(fetched.report)
        } catch (error) {
          op.signal.throwIfAborted()
          if (error instanceof HarnessError && error.code === 'SCIENCE_METADATA_CONFLICT') throw error
          sources.push(error instanceof SourceError ? error.report : sourceError('openalex', this.withOpenalexKey(`https://api.openalex.org/works/doi:${doi}`), 'SCIENCE_INVALID_RESPONSE', 'OpenAlex returned invalid scholarly metadata').report)
        }
      } else if (/^https?:\/\//iu.test(value)) {
        let url: URL
        try { url = new URL(value) } catch { throw new HarnessError('invalid paper URL', 'SCIENCE_INVALID_REFERENCE') }
        if (url.username || url.password) throw new HarnessError('credentials in paper URLs are not permitted', 'SCIENCE_INVALID_REFERENCE')
        paper = this.approved.get(url.href)
        if (!paper) return { status: 'unavailable', depth: 'unavailable', ref, excerpts: [], sources, truncated: false, reason: 'This URL is not a known open full-text location. Search or read its DOI/arXiv ID first.' }
        preferredUrl = url.href
      } else {
        const target = await this.ctx.fs.resolve(value, { cwd: options.cwd, signal: op.signal })
        const root = await this.ctx.fs.resolve('.', { cwd: options.cwd, signal: op.signal })
        if (!this.ctx.fs.contains(root, target)) {
          throw new HarnessError('local paper must be inside the calling workspace', 'SCIENCE_READ_DENIED')
        }
        bytes = await this.ctx.fs.readBytes(target, op.signal, this.limits.maxBytes)
        media = new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-' ? 'application/pdf' : 'text/plain'
      }
      if (paper) {
        this.remember(paper)
        const locations = preferredUrl ? [
          ...paper.fullTextLocations.filter(l => l.url === preferredUrl),
          ...paper.fullTextLocations.filter(l => l.url !== preferredUrl),
        ] : paper.fullTextLocations
        for (const location of locations.slice(0, this.limits.maxRequests)) {
          try {
            const fetched = await this.fetch(location.source, location.url, op)
            sources.push(fetched.report)
            const mime = fetched.resource.contentType?.split(';')[0]?.toLowerCase() ?? ''
            if (mime === 'application/pdf' || new TextDecoder().decode(fetched.resource.bytes.slice(0, 5)) === '%PDF-') {
              bytes = fetched.resource.bytes; media = 'application/pdf'; break
            }
            if (mime === 'text/plain') { bytes = fetched.resource.bytes; media = 'text/plain'; break }
            if (mime === 'text/html' || mime === 'application/xhtml+xml') {
              const text = articleText(decode(fetched.resource))
              if (text && text.length >= 500) { bytes = fetched.resource.bytes; media = 'text/html'; break }
            }
          } catch (error) {
            op.signal.throwIfAborted()
            if (error instanceof SourceError) sources.push(error.report)
          }
        }
      }
      if (!bytes) {
        const abstract = paper?.abstract
        const result: ReadResult = { status: abstract ? 'ready' : 'unavailable', depth: abstract ? 'abstract-only' : 'unavailable', ref,
          ...paper ? { paper } : {}, excerpts: abstract ? [{ locator: 'abstract', text: abstract.slice(0, cap) }] : [], sources, truncated: (abstract?.length ?? 0) > cap,
          reason: 'No readable open full text was located; only the reported abstract can support claims.' }
        const path = await saveCache(this.ctx.fs, { kind: 'read', result, evidence: op.evidence }, options.cache, op.signal)
        if (path) result.cachePath = path
        return result
      }
      const sha256 = hash(bytes)
      const name = `${sha256}-${this.limits.maxPages}-${this.limits.maxDocumentChars}`
      const cached = await loadDocument(this.ctx.fs, name, sha256, options.cache, op.signal, this.limits.maxDocumentChars * 6 + 4096)
      const text = media === 'application/pdf' ? '' : media === 'text/html'
        ? articleText(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) ?? ''
        : new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const document = cached?.text ?? (media === 'application/pdf'
        ? await extractPDF(bytes, this.limits.maxPages, this.limits.maxDocumentChars, op.signal)
        : { pages: [text.slice(0, this.limits.maxDocumentChars)], totalPages: 1, truncated: text.length > this.limits.maxDocumentChars })
      if (media !== 'application/pdf' && options.pages !== undefined) {
        throw new HarnessError('page selection requires a PDF source', 'SCIENCE_INVALID_ARGUMENT')
      }
      const result = selectText(document, ref, options, cap, sources,
        media === 'application/pdf' ? undefined : media === 'text/html' ? 'section:article' : 'text:document')
      result.sha256 = sha256
      if (paper) result.paper = paper
      if (cached) { result.cached = true; result.cachePath = cached.path }
      else {
        const path = await saveCache(this.ctx.fs, { kind: 'document', sha256, textSha256: hash(JSON.stringify(document.pages)), ...document }, options.cache, op.signal, name)
        if (path) result.cachePath = path
      }
      const evidencePath = await saveCache(this.ctx.fs, { kind: 'read', cwd: options.cwd, result, evidence: op.evidence }, options.cache, op.signal)
      if (evidencePath) result.evidencePath = evidencePath
      return result
    })
  }

  /** Verify bibliographic metadata, independently of whether a paper supports a manuscript claim.
   * @param input - DOI to resolve through Crossref.
   * @param options - expected metadata and optional workspace cache.
   * @param signal - cancellation of lookup and publication.
   * @returns metadata verification status, conflicts and source diagnostics.
   */
  async verify(input: string, options: VerifyOptions = {}, signal?: AbortSignal): Promise<VerifyResult> {
    const doi = typeof input === 'string' ? normalizeDOI(input) : undefined
    if (!doi || input.length > 1000) throw new HarnessError('verify requires a valid DOI', 'SCIENCE_INVALID_ARGUMENT')
    if (options.title !== undefined && (!options.title.trim() || options.title.length > 2000)) throw new HarnessError('expected title must contain 1–2000 characters', 'SCIENCE_INVALID_ARGUMENT')
    if (options.year !== undefined) positive(options.year, 'year', 9999)
    return this.operation(signal, async (op) => {
      const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)
      const mail = this.limits.crossrefMailto ?? process.env.CROSSREF_MAILTO
      if (mail?.trim()) url.searchParams.set('mailto', mail.trim())
      let result: VerifyResult
      try {
        const fetched = await this.fetch('crossref', url.href, op)
        const paper = fromCrossref(object(JSON.parse(decode(fetched.resource))).message, fetched.report.retrievedAt)
        if (!paper) throw sourceError('crossref', url.href, 'SCIENCE_INVALID_RESPONSE', 'Crossref returned invalid bibliographic metadata')
        fetched.report.count = 1
        const conflicts = metadataConflicts({
          ...options.title === undefined ? {} : { title: options.title },
          ...options.year === undefined ? {} : { year: options.year },
        }, paper)
        if (paper.doi !== doi) conflicts.push({ field: 'doi', values: [doi, paper.doi ?? 'missing'] })
        result = { status: conflicts.length ? 'conflict' : 'verified', scope: 'bibliographic-metadata', doi, conflicts, source: fetched.report, paper }
      } catch (error) {
        op.signal.throwIfAborted()
        const report = error instanceof SourceError ? error.report : sourceError('crossref', url.href, 'SCIENCE_INVALID_RESPONSE', 'Crossref returned invalid bibliographic metadata').report
        result = { status: report.httpStatus === 404 ? 'not-found' : 'unavailable', scope: 'bibliographic-metadata', doi, conflicts: [], source: report }
      }
      const path = await saveCache(this.ctx.fs, { kind: 'verification', result, evidence: op.evidence }, options.cache, op.signal)
      if (path) result.cachePath = path
      return result
    })
  }

  private operation<T>(signal: AbortSignal | undefined, body: (op: Operation) => Promise<T>): Promise<T> {
    const stopped = AbortSignal.any([this.lifetime.signal, ...signal ? [signal] : []])
    const task = Promise.resolve().then(async () => {
      using timer = deadline(stopped, this.limits.maxRequests * (this.limits.requestTimeoutMs + 3000), 'SCIENCE_OPERATION_TIMEOUT')
      try {
        timer.signal.throwIfAborted()
        return await body({ signal: timer.signal, requests: 0, evidence: [] })
      } catch (error: unknown) {
        const timeout = timeoutOf(timer.signal, 'SCIENCE_OPERATION_TIMEOUT')
        if (timeout !== undefined) throw new HarnessError('literature operation timed out', 'SCIENCE_OPERATION_TIMEOUT', { cause: timeout })
        throw error
      }
    })
    this.active.add(task)
    void task.finally(() => { this.active.delete(task) }).catch(() => {})
    return task
  }
  private arxivURL(query: string, limit: number): string {
    const url = new URL('https://export.arxiv.org/api/query')
    url.searchParams.set('search_query', /^(ti|au|abs|co|jr|cat|rn|id|all):/iu.test(query.trim()) ? query.trim() : `all:${query.trim()}`)
    url.searchParams.set('start', '0'); url.searchParams.set('max_results', String(limit)); url.searchParams.set('sortBy', 'relevance')
    return url.href
  }
  private withOpenalexKey(input: string): string {
    const url = new URL(input)
    const key = this.limits.openalexApiKey ?? process.env.OPENALEX_API_KEY
    const mail = this.limits.openalexMailto ?? process.env.OPENALEX_MAILTO
    if (key?.trim()) url.searchParams.set('api_key', key.trim())
    if (mail?.trim()) url.searchParams.set('mailto', mail.trim())
    return url.href
  }
  private openalexURL(query: string, limit: number, options: SearchOptions): string {
    const url = new URL('https://api.openalex.org/works')
    url.searchParams.set('search', query); url.searchParams.set('per-page', String(limit))
    const filter = [...options.since === undefined ? [] : [`from_publication_date:${options.since}-01-01`], ...options.until === undefined ? [] : [`to_publication_date:${options.until}-12-31`]]
    if (filter.length) url.searchParams.set('filter', filter.join(','))
    return this.withOpenalexKey(url.href)
  }
  private openalexResults(resource: HttpResource, retrievedAt: string): { papers: Paper[]; partial: boolean } {
    const results = object(JSON.parse(decode(resource))).results
    if (!Array.isArray(results)) throw new Error('OpenAlex response has no results array')
    const papers = results.slice(0, this.limits.maxResults).map(w => fromOpenAlex(w, retrievedAt))
      .filter((p): p is Paper => p !== undefined)
    if (results.length && !papers.length) throw new Error('OpenAlex results contain no paper metadata')
    return { papers, partial: papers.length !== results.length }
  }
  private remember(paper: Paper): void {
    for (const location of paper.fullTextLocations) this.approved.set(location.url, paper)
    while (this.approved.size > this.limits.maxResults * 20) {
      const first = this.approved.keys().next().value
      if (first === undefined) break
      this.approved.delete(first)
    }
  }
  private async fetch(source: string, url: string, op: Operation): Promise<{ resource: HttpResource; report: SourceReport }> {
    op.signal.throwIfAborted()
    if (op.requests >= this.limits.maxRequests) throw sourceError(source, url, 'SCIENCE_REQUEST_BUDGET', 'source request budget exhausted')
    const origin = new URL(url).origin
    const hold = (this.heldUntil.get(origin) ?? 0) - Date.now()
    if (hold > 0) throw sourceError(source, url, 'SCIENCE_RATE_LIMITED', 'source is temporarily rate limited', 429, hold)
    if (source === 'arxiv' && new URL(url).hostname === 'export.arxiv.org') {
      const delay = Math.max(0, this.arxivNext - Date.now())
      this.arxivNext = Math.max(Date.now(), this.arxivNext) + 3000
      if (delay) await wait(delay, op.signal)
    }
    op.requests++
    let resource: HttpResource
    try {
      resource = await fetchHttpResource(url, { timeoutMs: this.limits.requestTimeoutMs, maxBytes: new URL(url).hostname === 'export.arxiv.org' || new URL(url).hostname.startsWith('api.') ? Math.min(this.limits.maxBytes, 2 * 1024 * 1024) : this.limits.maxBytes, maxRedirects: 5,
        userAgent: 'DeepSeek-Science/0.2 (+https://github.com/deepseek-ai/deepseek-harness)', credentialed: new URL(url).searchParams.has('api_key') }, op.signal)
    } catch {
      op.signal.throwIfAborted()
      throw sourceError(source, url, 'SCIENCE_SOURCE_UNAVAILABLE', 'source could not be safely retrieved')
    }
    const retrievedAt = new Date().toISOString()
    const sha256 = hash(resource.bytes)
    if (resource.statusCode < 200 || resource.statusCode >= 300) {
      const delay = retryDelay(resource.retryAfter)
      if (delay !== undefined) {
        this.heldUntil.set(origin, Date.now() + delay)
        while (this.heldUntil.size > this.limits.maxResults * 20 + 3) {
          const first = this.heldUntil.keys().next().value
          if (first === undefined) break
          this.heldUntil.delete(first)
        }
      }
      throw sourceError(source, url, 'SCIENCE_SOURCE_HTTP', resource.statusCode === 401 || resource.statusCode === 403
        ? 'source unavailable: access or API key is required' : resource.statusCode === 429 ? 'source rate limit exceeded' : 'source returned an unsuccessful HTTP status', resource.statusCode, delay)
    }
    const report: SourceReport = { source, status: 'completed', count: 0, retrievedAt, endpoint: endpoint(resource.url), httpStatus: resource.statusCode, sha256 }
    if (/json|xml|text\//iu.test(resource.contentType ?? '')) op.evidence.push({ endpoint: report.endpoint, retrievedAt, sha256, body: decode(resource) })
    return { resource, report }
  }
}

async function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('literature wait aborted', { cause: signal.reason }))
    }
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve() }, milliseconds)
    signal.addEventListener('abort', aborted, { once: true })
  })
}
