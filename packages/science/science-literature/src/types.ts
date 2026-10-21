/** Portable scholarly evidence; optional metadata is omitted rather than invented. */
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'

/** Search metadata source selectable by a caller. */
export type LiteratureSource = 'arxiv' | 'openalex'
/** Independent source completion status. */
export type SourceStatus = 'completed' | 'partial' | 'failed'
/** Evidence depth actually available to the caller. */
export type ReadDepth = 'full-text' | 'abstract-only' | 'unavailable'
/** Workspace and caller authority for optional evidence storage. */
export interface CacheScope { cwd: string; sandboxPolicy: SandboxExecutionPolicy }
/** One source’s lookup outcome, content identity and diagnostics. */
export interface SourceReport {
  source: string
  status: SourceStatus
  retrievedAt: string
  count: number
  endpoint: string
  sha256?: string
  httpStatus?: number
  retryAfterMs?: number
  error?: string
}
/** A bibliographic field with incompatible reported values. */
export interface MetadataConflict { field: string; values: string[] }
/** Reported open location for identified paper content. */
export interface FullTextLocation {
  url: string
  format: 'pdf' | 'html' | 'unknown'
  source: string
  access: 'open'
  license?: string
}
/** Bibliographic metadata with version identifiers and reported access locations. */
export interface Paper {
  id: string
  title: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  arxivId?: string
  arxivBaseId?: string
  openalexId?: string
  abstract?: string
  url?: string
  sources: string[]
  retrievedAt: string
  fullTextLocations: FullTextLocation[]
  conflicts: MetadataConflict[]
}
/** Source selection, result bounds and optional workspace cache. */
export interface SearchOptions {
  sources?: LiteratureSource[]
  limit?: number
  since?: number
  until?: number
  cache?: CacheScope
}
/** Merged papers with independent source outcomes and saved evidence. */
export interface SearchResult {
  query: string
  status: 'completed' | 'partial'
  papers: Paper[]
  sources: SourceReport[]
  truncated: boolean
  cachePath?: string
}
/** Calling workspace and requested paper excerpts. */
export interface ReadOptions {
  cwd: string
  pages?: number[]
  query?: string
  /** Maximum excerpt characters returned by one read. */
  maxChars?: number
  cache?: CacheScope
}
/** Text actually returned with its page or section locator. */
export interface LiteratureExcerpt { page?: number; locator: string; text: string }
/** Paper reading outcome with honest depth and extraction limits. */
export interface ReadResult {
  status: 'ready' | 'needs-setup' | 'unavailable'
  depth: ReadDepth
  ref: string
  sha256?: string
  paper?: Paper
  excerpts: LiteratureExcerpt[]
  truncated: boolean
  totalPages?: number
  sources: SourceReport[]
  reason?: string
  cached?: boolean
  cachePath?: string
  /** Immutable read request, source reports and the excerpts actually returned. */
  evidencePath?: string
}
/** Expected DOI metadata and optional evidence cache. */
export interface VerifyOptions { title?: string; year?: number; cache?: CacheScope }
/** Bibliographic metadata check; does not establish claim support. */
export interface VerifyResult {
  status: 'verified' | 'conflict' | 'not-found' | 'unavailable'
  scope: 'bibliographic-metadata'
  doi: string
  conflicts: MetadataConflict[]
  source: SourceReport
  paper?: Paper
  cachePath?: string
}
/** Deployment request, document and credential settings. */
export interface Config {
  /** Maximum duration of one HTTP request. */
  requestTimeoutMs?: number
  /** Maximum complete local or fetched document bytes. */
  maxBytes?: number
  /** Maximum PDF page prefix extracted. */
  maxPages?: number
  /** Maximum excerpt characters returned by one read. */
  maxChars?: number
  /** Maximum native document text retained. */
  maxDocumentChars?: number
  /** Maximum papers returned by one search. */
  maxResults?: number
  /** Maximum HTTP requests in one operation. */
  maxRequests?: number
  /** Optional OpenAlex credential; missing configuration uses the environment. */
  openalexApiKey?: string
  /** Optional contact for OpenAlex requests. */
  openalexMailto?: string
  /** Optional contact for Crossref requests. */
  crossrefMailto?: string
}
/** Native text extracted under aggregate page and character limits. */
export interface DocumentText {
  pages: string[]
  totalPages: number
  truncated: boolean
}
/** Bounded fetched metadata body and its exact source hash. */
export interface SourceEvidence {
  endpoint: string
  retrievedAt: string
  sha256: string
  body: string
}
