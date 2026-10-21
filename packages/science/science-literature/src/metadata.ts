/** Bounded adapters for scholarly JSON and arXiv Atom, with version-aware merging. */
import { createHash } from 'node:crypto'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { FullTextLocation, MetadataConflict, Paper } from './types.ts'

/** Hash a source body with SHA-256.
 * @param bytes - exact source bytes or UTF-8 text.
 * @returns the lowercase hexadecimal digest.
 */
export function hash(bytes: string | Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }
/** Admit a plain API object; absent or non-object values become an empty record.
 * @param value - untrusted decoded metadata.
 * @returns an object record for field inspection.
 */
export function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
/** Read a nonempty trimmed metadata string.
 * @param value - untrusted field value.
 * @returns the trimmed string, or undefined for other values.
 */
export function string(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
/** Normalize a metadata field that allows one item or a list.
 * @param value - decoded API or XML field.
 * @returns the items, an empty list for undefined, or one scalar item.
 */
export function array(value: unknown): unknown[] { return Array.isArray(value) ? value : value === undefined ? [] : [value] }
/** Normalize a DOI or doi.org reference without resolving it.
 * @param input - candidate DOI reference.
 * @returns a lowercase DOI, or undefined when its syntax is invalid.
 */
export function normalizeDOI(input: string): string | undefined {
  const value = input.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)/iu, '')
  return /^10\.\d{4,9}\/\S+$/iu.test(value) ? value.toLowerCase() : undefined
}
/** Recognize an arXiv reference while retaining its requested version.
 * @param input - identifier, abs URL or PDF URL.
 * @returns the exact identifier, or undefined for an unrecognized reference.
 */
export function arxivId(input: string): string | undefined {
  let value = input.trim().replace(/^arxiv:/iu, '')
  if (/^https?:\/\//iu.test(value)) {
    let url: URL
    try { url = new URL(value) } catch { return undefined }
    if (url.hostname !== 'arxiv.org' || !/^\/(abs|pdf)\//u.test(url.pathname)) return undefined
    value = url.pathname.replace(/^\/(abs|pdf)\//u, '').replace(/\.pdf$/iu, '')
  }
  return /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v[1-9]\d*)?$/iu.test(value) ? value : undefined
}
function year(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) >= 1000 && Number(value) <= 9999 ? Number(value) : undefined
}
function optional<T>(key: string, value: T | undefined): Record<string, T> { return value === undefined ? {} : { [key]: value } }
function validUrl(value: unknown): string | undefined {
  const raw = string(value)
  if (!raw) return undefined
  try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}

/** Recover a bounded abstract from an OpenAlex inverted word index.
 * @param value - decoded word-position metadata.
 * @returns at most 12000 characters, or undefined for absent text.
 */
export function fromInverted(value: unknown): string | undefined {
  const slots = new Map<number, Set<string>>()
  for (const [word, positions] of Object.entries(object(value))) {
    for (const position of array(positions)) {
      if (!Number.isInteger(position) || Number(position) < 0) continue
      const index = Number(position)
      if (!slots.has(index)) {
        if (slots.size >= 12000) continue
        slots.set(index, new Set())
      }
      slots.get(index)?.add(word)
    }
  }
  let text = ''
  for (const index of [...slots.keys()].sort((a, b) => a - b)) {
    for (const word of slots.get(index) ?? []) {
      const remaining = 12000 - text.length
      if (!remaining) return string(text)
      text += `${text ? ' ' : ''}${word}`.slice(0, remaining)
    }
  }
  return string(text)
}

/** Adapt one OpenAlex work, retaining reported open locations and exact versions.
 * @param input - decoded API work.
 * @param retrievedAt - lookup timestamp to retain.
 * @returns the paper, or undefined when its title is absent.
 */
export function fromOpenAlex(input: unknown, retrievedAt: string): Paper | undefined {
  const work = object(input)
  const title = string(work.display_name) ?? string(work.title)
  if (!title) return undefined
  const rawDOI = string(work.doi)
  const doi = rawDOI ? normalizeDOI(rawDOI) : undefined
  const primary = object(work.primary_location)
  const best = object(work.best_oa_location)
  const locations = [best, primary, ...array(work.locations).map(object)]
  const urls = locations.flatMap(location => [string(location.landing_page_url), string(location.pdf_url)])
    .filter((u): u is string => u !== undefined)
  const id = urls.map(arxivId).find(Boolean) ?? (doi?.startsWith('10.48550/arxiv.') ? arxivId(doi.slice('10.48550/arxiv.'.length)) : undefined)
  const fullTextLocations: FullTextLocation[] = []
  if (id) fullTextLocations.push({ url: `https://arxiv.org/pdf/${id}`, format: 'pdf', source: 'arxiv', access: 'open' })
  for (const location of locations) {
    if (location !== best && location.is_oa !== true) continue
    const pdf = validUrl(location.pdf_url)
    if (pdf && !fullTextLocations.some(l => l.url === pdf)) {
      fullTextLocations.push({ url: pdf, format: 'pdf', source: 'openalex', access: 'open', ...optional('license', string(location.license)) })
    }
    const landing = validUrl(location.landing_page_url)
    if (!pdf && landing && location.is_oa === true && !fullTextLocations.some(l => l.url === landing)) {
      fullTextLocations.push({ url: landing, format: 'unknown', source: 'openalex', access: 'open', ...optional('license', string(location.license)) })
    }
  }
  const openalexId = string(work.id)
  const publicationDOI = doi?.startsWith('10.48550/arxiv.') ? undefined : doi
  return {
    id: publicationDOI ? `doi:${publicationDOI}` : id ? `arxiv:${id}` : openalexId ?? `title:${hash(title)}`,
    title, authors: array(work.authorships).flatMap((a) => {
      const name = string(object(object(a).author).display_name)
      return name ? [name] : []
    }),
    ...optional('doi', publicationDOI), ...optional('arxivId', id), ...optional('arxivBaseId', id?.replace(/v\d+$/iu, '')),
    ...optional('openalexId', openalexId), ...optional('year', year(work.publication_year)),
    ...optional('venue', string(object(primary.source).display_name)), ...optional('abstract', fromInverted(work.abstract_inverted_index)),
    ...optional('url', validUrl(primary.landing_page_url) ?? (publicationDOI ? `https://doi.org/${publicationDOI}` : validUrl(work.id))),
    sources: ['openalex'], retrievedAt, fullTextLocations, conflicts: [],
  }
}

/** Parse arXiv Atom records, rejecting invalid XML and API error entries.
 * @param xml - complete bounded response text.
 * @param retrievedAt - lookup timestamp to retain.
 * @returns the versioned paper entries; malformed source data throws.
 */
export function fromAtom(xml: string, retrievedAt: string): Paper[] {
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new Error('arXiv returned unsafe Atom XML')
  // oxlint-disable-next-line typescript/no-deprecated -- The pinned 5.11.1 dependency bundles its validator.
  if (XMLValidator.validate(xml) !== true) throw new Error('arXiv returned invalid Atom XML')
  const parsed: unknown = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false,
    isArray: name => ['entry', 'author', 'link'].includes(name) }).parse(xml)
  const root = object(parsed)
  if (!Object.hasOwn(root, 'feed')) throw new Error('arXiv returned a non-Atom response')
  const text = (value: unknown) => string(value) ?? string(object(value)['#text'])
  return array(object(root.feed).entry).map((input) => {
    const entry = object(input)
    const rawId = text(entry.id)
    if (rawId?.includes('/api/errors') || text(entry.title) === 'Error') throw new Error('arXiv rejected the query')
    const id = rawId ? arxivId(rawId) : undefined
    const title = text(entry.title)?.replace(/\s+/gu, ' ')
    if (!id || !title) throw new Error('arXiv returned an entry without a valid ID or title')
    const doi = text(entry['arxiv:doi'])
    const published = text(entry.published)
    return {
      id: `arxiv:${id}`, arxivId: id, arxivBaseId: id.replace(/v\d+$/iu, ''), title,
      authors: array(entry.author).flatMap((a) => { const name = text(object(a).name); return name ? [name] : [] }),
      ...optional('doi', doi ? normalizeDOI(doi) : undefined), ...optional('abstract', text(entry.summary)?.replace(/\s+/gu, ' ')),
      ...optional('year', published ? year(Number(published.slice(0, 4))) : undefined),
      url: `https://arxiv.org/abs/${id}`, sources: ['arxiv'], retrievedAt,
      fullTextLocations: [{ url: `https://arxiv.org/pdf/${id}`, format: 'pdf' as const, source: 'arxiv', access: 'open' as const }], conflicts: [],
    }
  })
}

/** Adapt Crossref bibliographic metadata without assuming access to full text.
 * @param input - decoded API work.
 * @param retrievedAt - lookup timestamp to retain.
 * @returns the paper, or undefined when its DOI or title is missing.
 */
export function fromCrossref(input: unknown, retrievedAt: string): Paper | undefined {
  const work = object(input)
  const doi = string(work.DOI)
  const normalized = doi ? normalizeDOI(doi) : undefined
  const title = string(array(work.title)[0])
  if (!normalized || !title) return undefined
  return {
    id: `doi:${normalized}`, doi: normalized, title,
    authors: array(work.author).flatMap((a) => { const author = object(a); const name = string(author.name) ?? string([string(author.given), string(author.family)].filter(Boolean).join(' ')); return name ? [name] : [] }),
    ...optional('year', year(array(array(object(work.issued)['date-parts'])[0])[0])),
    ...optional('venue', string(array(work['container-title'])[0])),
    url: `https://doi.org/${normalized}`, sources: ['crossref'], retrievedAt, fullTextLocations: [], conflicts: [],
  }
}

/** Compare supplied title, year and venue values while retaining disagreements.
 * @param first - first provider metadata.
 * @param second - second provider metadata.
 * @returns conflicting fields and both reported values.
 */
export function metadataConflicts(first: Partial<Paper>, second: Partial<Paper>): MetadataConflict[] {
  const result: MetadataConflict[] = []
  for (const field of ['title', 'year', 'venue'] as const) {
    const a = first[field], b = second[field]
    if (a !== undefined && b !== undefined && String(a).toLowerCase().replace(/\s+/gu, ' ').trim() !== String(b).toLowerCase().replace(/\s+/gu, ' ').trim()) {
      result.push({ field, values: [String(a), String(b)] })
    }
  }
  return result
}

/** Merge exact paper identities while keeping distinct arXiv versions separate.
 * @param input - provider paper records.
 * @returns merged records with source lists, open locations and metadata conflicts.
 */
export function mergePapers(input: Paper[]): Paper[] {
  const papers: Paper[] = []
  for (const paper of input) {
    const existing = papers.find((p) => {
      if (p.arxivId && paper.arxivId && p.arxivId !== paper.arxivId) return false
      return Boolean(p.doi && p.doi === paper.doi || p.arxivId && p.arxivId === paper.arxivId
        || p.openalexId && p.openalexId === paper.openalexId)
    })
    if (!existing) { papers.push({ ...paper }); continue }
    existing.conflicts.push(...metadataConflicts(existing, paper))
    existing.sources = [...new Set([...existing.sources, ...paper.sources])]
    existing.fullTextLocations.push(...paper.fullTextLocations.filter(l => !existing.fullTextLocations.some(p => p.url === l.url)))
    for (const key of ['doi', 'arxivId', 'arxivBaseId', 'openalexId', 'abstract', 'year', 'venue', 'url'] as const) {
      if (existing[key] === undefined && paper[key] !== undefined) Object.assign(existing, { [key]: paper[key] })
    }
    if (!existing.authors.length) existing.authors = paper.authors
  }
  return papers
}
