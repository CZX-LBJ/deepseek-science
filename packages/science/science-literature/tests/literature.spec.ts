import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as resource from '../../../web/web-fetch-http/src/resource.ts'
import LiteratureService, { toBibTeX, toCSV } from '../src/index.ts'
import { atom, tinyPDF } from './fixtures.ts'
import { fromInverted } from '../src/metadata.ts'

let ctx: Context
let directory: string
let fibers: Awaited<ReturnType<Context['plugin']>>[]
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dsh-literature-'))
  ctx = new Context()
  fibers = []
  fibers.push(await ctx.plugin(LocalFileSystem, { cwd: directory }))
  fibers.push(await ctx.plugin(LiteratureService, { requestTimeoutMs: 1000 }))
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const fiber of fibers.reverse()) await fiber.dispose()
  await rm(directory, { recursive: true, force: true })
})

function routes(handler: (url: URL) => Response) {
  return vi.spyOn(resource, 'fetchHttpResource').mockImplementation(async (input, _options, signal) => {
    signal?.throwIfAborted()
    const response = handler(new URL(input))
    return {
      url: input, statusCode: response.status, bytes: new Uint8Array(await response.arrayBuffer()),
      ...(response.headers.get('content-type') ? { contentType: response.headers.get('content-type')! } : {}),
      ...(response.headers.get('retry-after') ? { retryAfter: response.headers.get('retry-after')! } : {}),
    }
  })
}

const alex = (works: unknown[]) => Response.json({ results: works })
const work = (doi: string, title = 'Same title') => ({
  id: `https://openalex.org/W${doi.slice(-1)}`, doi: `https://doi.org/${doi}`, title,
  publication_year: 2024, authorships: [{ author: { display_name: 'Ada Lovelace' } }],
  abstract_inverted_index: { First: [0], evidence: [1] },
})

it('keeps distinct DOI records despite identical titles and omits undefined metadata', async () => {
  routes(url => url.hostname === 'api.openalex.org' ? alex([work('10.1000/one'), work('10.1000/two')]) : new Response(atom([]), { headers: { 'content-type': 'application/atom+xml' } }))
  const result = await ctx.scienceLiterature.search('same title')
  expect(result.status).toBe('completed')
  expect(result.papers).toHaveLength(2)
  expect(result.sources.every(s => s.status === 'completed')).toBe(true)
  expect(JSON.stringify(result)).not.toContain('undefined')
  expect(result.papers[0]).not.toHaveProperty('venue', undefined)
})

it('preserves separate arXiv versions and reports metadata conflicts for equal DOI', async () => {
  routes(url => url.hostname === 'api.openalex.org' ? alex([work('10.1000/shared', 'Published title')]) : new Response(atom([
    { id: '2401.00001v1', title: 'Preprint title', doi: '10.1000/shared' },
    { id: '2401.00001v2', title: 'Preprint title' },
  ]), { headers: { 'content-type': 'application/atom+xml' } }))
  const result = await ctx.scienceLiterature.search('version test')
  expect(result.papers).toHaveLength(2)
  expect(result.papers.map(p => p.arxivId).sort()).toEqual(['2401.00001v1', '2401.00001v2'])
  expect(result.papers.find(p => p.doi)?.conflicts).toContainEqual(expect.objectContaining({ field: 'title' }))
})

it('reports a source failure separately from a successful empty source', async () => {
  routes(url => url.hostname === 'api.openalex.org' ? new Response('limit', { status: 429, headers: { 'retry-after': '30' } }) : new Response(atom([]), { headers: { 'content-type': 'application/atom+xml' } }))
  const result = await ctx.scienceLiterature.search('none')
  expect(result.status).toBe('partial')
  expect(result.papers).toEqual([])
  expect(result.sources.find(s => s.source === 'openalex')).toMatchObject({ status: 'failed', httpStatus: 429, retryAfterMs: 30000 })
  expect(result.sources.find(s => s.source === 'arxiv')).toMatchObject({ status: 'completed', count: 0 })
})

it('rejects all-source failures and HTTP-200 HTML source errors', async () => {
  routes(() => new Response('<html>Unavailable</html>', { headers: { 'content-type': 'text/html' } }))
  await expect(ctx.scienceLiterature.search('none')).rejects.toMatchObject({ code: 'SCIENCE_SOURCES_FAILED' })
})

it('propagates caller cancellation instead of turning it into partial success', async () => {
  const controller = new AbortController()
  controller.abort(new Error('stop'))
  const transport = routes(() => alex([]))
  await expect(ctx.scienceLiterature.search('test', {}, controller.signal)).rejects.toThrow()
  expect(transport).not.toHaveBeenCalled()
})

it('verifies DOI metadata with conflicts and explicitly scopes the result', async () => {
  routes(() => Response.json({ message: { DOI: '10.1000/example', title: ['Actual Title'], issued: { 'date-parts': [[2023]] }, author: [{ given: 'Ada', family: 'Lovelace' }] } }))
  const result = await ctx.scienceLiterature.verify('https://doi.org/10.1000/EXAMPLE', { title: 'Other Title', year: 2024 })
  expect(result).toMatchObject({ status: 'conflict', scope: 'bibliographic-metadata', doi: '10.1000/example' })
  expect(result.conflicts.map(c => c.field).sort()).toEqual(['title', 'year'])
})

it('treats a Crossref 404 as not-found and a 503 as unavailable', async () => {
  const transport = routes(() => new Response('not found', { status: 404 }))
  expect((await ctx.scienceLiterature.verify('10.1000/missing')).status).toBe('not-found')
  transport.mockRestore()
  routes(() => new Response('down', { status: 503 }))
  expect((await ctx.scienceLiterature.verify('10.1000/missing')).status).toBe('unavailable')
})

it('extracts actual local PDF text with page locators and an immutable cache', async () => {
  await writeFile(join(directory, 'paper.pdf'), tinyPDF(['First page evidence', 'Second page results']))
  const cache = { cwd: directory, sandboxPolicy: { mode: 'workspace-write' as const, workspaceRoot: directory } }
  const result = await ctx.scienceLiterature.read('paper.pdf', { cwd: directory, pages: [2], cache })
  expect(result).toMatchObject({ status: 'ready', depth: 'full-text', truncated: false })
  expect(result.excerpts).toHaveLength(1)
  expect(result.excerpts[0]).toMatchObject({ page: 2, locator: 'page:2' })
  expect(result.excerpts[0]?.text).toContain('Second page results')
  expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
  const cachedRecord = JSON.parse(await readFile(result.cachePath!, 'utf8')) as { sha256: string }
  expect(cachedRecord.sha256).toBe(result.sha256)
  const readEvidence = JSON.parse(await readFile(result.evidencePath!, 'utf8')) as { result: { ref: string } }
  expect(readEvidence.result.ref).toBe('paper.pdf')
  const again = await ctx.scienceLiterature.read('paper.pdf', { cwd: directory, pages: [1], cache })
  expect(again.cached).toBe(true)
  expect(again.excerpts[0]?.text).toContain('First page evidence')
})

it('marks image-only PDF extraction as OCR needs-setup', async () => {
  await writeFile(join(directory, 'scan.pdf'), tinyPDF(['']))
  const result = await ctx.scienceLiterature.read('scan.pdf', { cwd: directory })
  expect(result).toMatchObject({ status: 'needs-setup', depth: 'unavailable', excerpts: [] })
  expect(result.reason).toMatch(/OCR/i)
})

it('reads a versioned arXiv PDF and retains the requested version', async () => {
  const transport = routes(url => url.pathname === '/api/query'
    ? new Response(atom([{ id: '2401.00001v2' }]), { headers: { 'content-type': 'application/atom+xml' } })
    : new Response(new Uint8Array(tinyPDF(['Actual full text'])).buffer, { headers: { 'content-type': 'application/pdf' } }))
  const result = await ctx.scienceLiterature.read('2401.00001v2', { cwd: directory })
  expect(result).toMatchObject({ status: 'ready', depth: 'full-text', ref: '2401.00001v2' })
  expect(result.paper?.arxivId).toBe('2401.00001v2')
  expect(transport.mock.calls.map(c => c[0])).toContain('https://arxiv.org/pdf/2401.00001v2')
})

it('returns abstract-only for DOI records whose primary PDF is not OA', async () => {
  const transport = routes(() => Response.json({ ...work('10.1000/closed'), primary_location: { pdf_url: 'https://example.com/closed.pdf', is_oa: false } }))
  const result = await ctx.scienceLiterature.read('10.1000/closed', { cwd: directory })
  expect(result).toMatchObject({ depth: 'abstract-only' })
  expect(result.excerpts[0]?.text).toContain('First evidence')
  expect(transport).toHaveBeenCalledOnce()
})

it('refuses unsafe URLs and does not classify an arbitrary landing page as full text', async () => {
  const transport = routes(() => new Response('<html><main>Paywall page</main></html>'))
  await expect(ctx.scienceLiterature.read('file:///etc/passwd', { cwd: directory })).rejects.toMatchObject({ code: 'SCIENCE_INVALID_REFERENCE' })
  const result = await ctx.scienceLiterature.read('https://example.com/landing', { cwd: directory })
  expect(result.depth).toBe('unavailable')
  expect(transport).not.toHaveBeenCalled()
})

it('renders deterministic BibTeX and CSV with escaped source metadata', async () => {
  routes(() => alex([work('10.1000/example', 'A & B, "quoted"')]))
  const papers = (await ctx.scienceLiterature.search('test', { sources: ['openalex'] })).papers
  expect(toBibTeX(papers)).toContain('title = {A \\& B, "quoted"}')
  expect(toBibTeX(papers)).toBe(toBibTeX(papers))
  expect(toCSV(papers)).toContain('"A & B, ""quoted"""')
  expect(toCSV(papers).split('\r\n')[0]).toContain('doi')
})

it('validates bounded caller controls before transport', async () => {
  const transport = routes(() => alex([]))
  await expect(ctx.scienceLiterature.search('x', { limit: 0 })).rejects.toThrow(/limit/)
  await expect(ctx.scienceLiterature.search('x', { sources: ['unknown' as never] })).rejects.toThrow(/source/)
  await expect(ctx.scienceLiterature.read('paper.pdf', { cwd: directory, pages: [0] })).rejects.toThrow(/page/)
  expect(transport).not.toHaveBeenCalled()
})

it('bounds repeated inverted-index tokens before constructing an abstract', () => {
  const abstract = fromInverted({ ['word'.repeat(500)]: Array.from({ length: 10000 }, (_, i) => i) })
  expect(abstract!.length).toBeLessThanOrEqual(12000)
})

it('keeps arXiv DOI references at their exact requested version', async () => {
  const transport = routes(url => url.pathname === '/api/query'
    ? new Response(atom([{ id: '2401.00001v3' }]), { headers: { 'content-type': 'application/atom+xml' } })
    : new Response(new Uint8Array(tinyPDF(['Version three text'])).buffer, { headers: { 'content-type': 'application/pdf' } }))
  const result = await ctx.scienceLiterature.read('10.48550/arXiv.2401.00001v3', { cwd: directory })
  expect(result.depth).toBe('full-text')
  expect(result.paper?.arxivId).toBe('2401.00001v3')
  expect(transport.mock.calls.map(c => c[0])).toContain('https://arxiv.org/pdf/2401.00001v3')
})

it('records parsing failures as failed metadata instead of completed source reads', async () => {
  routes(() => new Response('<html>Unavailable</html>', { headers: { 'content-type': 'text/html' } }))
  const result = await ctx.scienceLiterature.read('2401.00001v1', { cwd: directory })
  expect(result.depth).toBe('unavailable')
  expect(result.sources[0]?.status).toBe('failed')
})

it('enforces the result text cap and preserves page locators', async () => {
  await writeFile(join(directory, 'paper.pdf'), tinyPDF(['Long sentence on page one', 'Page two evidence']))
  const result = await ctx.scienceLiterature.read('paper.pdf', { cwd: directory, maxChars: 8 })
  expect(result.excerpts.reduce((n, e) => n + e.text.length, 0)).toBe(8)
  expect(result.truncated).toBe(true)
  expect(result.excerpts[0]?.locator).toBe('page:1')
})

it('rejects a cache publication outside the calling workspace even on a bare filesystem', async () => {
  await writeFile(join(directory, 'paper.pdf'), tinyPDF(['Evidence']))
  await expect(ctx.scienceLiterature.read('paper.pdf', {
    cwd: directory,
    cache: { cwd: directory, sandboxPolicy: { mode: 'workspace-write', workspaceRoot: join(directory, 'different-workspace') } },
  })).rejects.toMatchObject({ code: 'SCIENCE_CACHE_DENIED' })
})

it('keeps read-only cache requests from writing through a bare filesystem', async () => {
  await writeFile(join(directory, 'paper.pdf'), tinyPDF(['Evidence']))
  await expect(ctx.scienceLiterature.read('paper.pdf', {
    cwd: directory, cache: { cwd: directory, sandboxPolicy: { mode: 'read-only', workspaceRoot: directory } },
  })).rejects.toMatchObject({ code: 'SCIENCE_CACHE_DENIED' })
})

it('honors Retry-After on a later call without repeating a known limited request', async () => {
  const transport = routes(() => new Response('limited', { status: 429, headers: { 'retry-after': '60' } }))
  await expect(ctx.scienceLiterature.search('test', { sources: ['openalex'] })).rejects.toMatchObject({ code: 'SCIENCE_SOURCES_FAILED' })
  await expect(ctx.scienceLiterature.search('test', { sources: ['openalex'] })).rejects.toMatchObject({ code: 'SCIENCE_SOURCES_FAILED' })
  expect(transport).toHaveBeenCalledOnce()
})

it('does not expose API keys in source diagnostics or persisted evidence', async () => {
  await fibers.pop()!.dispose()
  fibers.push(await ctx.plugin(LiteratureService, { openalexApiKey: 'test-secret-key' }))
  const transport = routes(() => alex([work('10.1000/example')]))
  const result = await ctx.scienceLiterature.search('test', { sources: ['openalex'], cache: { cwd: directory, sandboxPolicy: { mode: 'workspace-write', workspaceRoot: directory } } })
  expect(transport.mock.calls[0]?.[1]?.credentialed).toBe(true)
  expect(JSON.stringify(result)).not.toContain('test-secret-key')
  expect(await readFile(result.cachePath!, 'utf8')).not.toContain('test-secret-key')
})

it('reports an OpenAlex response with discarded malformed records as partial', async () => {
  routes(() => alex([work('10.1000/example'), { id: 'https://openalex.org/W2' }]))
  const result = await ctx.scienceLiterature.search('test', { sources: ['openalex'] })
  expect(result.papers).toHaveLength(1)
  expect(result.status).toBe('partial')
  expect(result.sources[0]).toMatchObject({ status: 'partial', count: 1 })
})

it('reads the exact approved full-text URL selected from search', async () => {
  const transport = routes(url => url.hostname === 'api.openalex.org' ? alex([{
    ...work('10.1000/example'), best_oa_location: { pdf_url: 'https://example.com/first.pdf' },
    locations: [{ is_oa: true, pdf_url: 'https://example.com/second.pdf' }],
  }]) : new Response(new Uint8Array(tinyPDF([url.pathname])).buffer, { headers: { 'content-type': 'application/pdf' } }))
  await ctx.scienceLiterature.search('test', { sources: ['openalex'] })
  const result = await ctx.scienceLiterature.read('https://example.com/second.pdf', { cwd: directory })
  expect(result.excerpts[0]?.text).toContain('/second.pdf')
  expect(transport.mock.calls[1]?.[0]).toBe('https://example.com/second.pdf')
})

it('uses only an OA article body and keeps its raw source hash', async () => {
  const html = `<html><nav>Site navigation</nav><article><h1>Introduction</h1><p>${'Evidence text. '.repeat(80)}</p><h2>Results</h2><p>Measured findings.</p></article><script>untrusted()</script></html>`
  routes(url => url.hostname === 'api.openalex.org' ? Response.json({ ...work('10.1000/example'), locations: [{ is_oa: true, landing_page_url: 'https://example.com/article' }] })
    : new Response(html, { headers: { 'content-type': 'text/html' } }))
  const result = await ctx.scienceLiterature.read('10.1000/example', { cwd: directory })
  expect(result.depth).toBe('full-text')
  expect(result.excerpts[0]?.text).toContain('Evidence text.')
  expect(result.excerpts[0]?.text).not.toContain('untrusted()')
  expect(result.sha256).toBe(result.sources.at(-1)?.sha256)
  expect(result.excerpts[0]).not.toHaveProperty('page')
  expect(result.excerpts[0]?.locator).toBe('section:article')
})

it('rejects a corrupt PDF as an extraction failure', async () => {
  await writeFile(join(directory, 'corrupt.pdf'), '%PDF-1.4\ninvalid')
  await expect(ctx.scienceLiterature.read('corrupt.pdf', { cwd: directory })).rejects.toMatchObject({ code: 'SCIENCE_PDF_EXTRACTION' })
})

it('keeps abstract-only landing pages with reference navigation out of full-text results', async () => {
  const html = `<article><h2>Abstract</h2><p>${'Only the abstract. '.repeat(40)}</p><a href="#references">References</a></article>`
  routes(url => url.hostname === 'api.openalex.org'
    ? Response.json({ ...work('10.1000/example'), locations: [{ is_oa: true, landing_page_url: 'https://example.com/article' }] })
    : new Response(html, { headers: { 'content-type': 'text/html' } }))
  const result = await ctx.scienceLiterature.read('10.1000/example', { cwd: directory })
  expect(result.depth).toBe('abstract-only')
  expect(result.excerpts[0]?.locator).toBe('abstract')
})

it('denies reading local files outside the calling workspace', async () => {
  await expect(ctx.scienceLiterature.read('../outside.pdf', { cwd: directory }))
    .rejects.toMatchObject({ code: 'SCIENCE_READ_DENIED' })
})

it('does not let an arXiv metadata rate limit prevent reading its separate PDF host', async () => {
  routes(url => url.hostname === 'export.arxiv.org'
    ? new Response('limited', { status: 429, headers: { 'retry-after': '60' } })
    : new Response(new Uint8Array(tinyPDF(['Full text despite metadata limit'])).buffer, { headers: { 'content-type': 'application/pdf' } }))
  const result = await ctx.scienceLiterature.read('2401.00001v1', { cwd: directory })
  expect(result.depth).toBe('full-text')
  expect(result.sources[0]).toMatchObject({ status: 'failed', httpStatus: 429 })
})

it('bounds an operation while it waits behind other arXiv requests', async () => {
  await fibers.pop()!.dispose()
  fibers.push(await ctx.plugin(LiteratureService, { requestTimeoutMs: 20, maxRequests: 1 }))
  routes(() => new Response(atom([]), { headers: { 'content-type': 'application/atom+xml' } }))
  const controller = new AbortController()
  const pending: Promise<unknown>[] = []
  vi.useFakeTimers()
  try {
    await ctx.scienceLiterature.search('first', { sources: ['arxiv'] }, controller.signal)
    pending.push(ctx.scienceLiterature.search('second', { sources: ['arxiv'] }, controller.signal).catch(() => {}))
    let state = 'pending'
    pending.push(ctx.scienceLiterature.search('third', { sources: ['arxiv'] }, controller.signal).then(
      () => { state = 'completed' }, (error: unknown) => { state = (error as { code: string }).code },
    ))
    await vi.advanceTimersByTimeAsync(3021)
    expect(state).toBe('SCIENCE_OPERATION_TIMEOUT')
  } finally {
    controller.abort()
    await Promise.allSettled(pending)
    vi.useRealTimers()
  }
})
