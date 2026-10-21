---
description: "Bounded scholarly search, versioned full-text reading, citation metadata checks, and evidence files."
kind: "package-reference"
---

# @deepseek-ai/dsh-science-literature

English | [中文](README.zh.md)

## Summary

`ctx.scienceLiterature` searches arXiv and OpenAlex, reads local or identified open-access papers, and checks DOI metadata against Crossref. The service keeps source failures, paper versions, reading depth, content hashes and evidence locators in its results. It uses the composed Harness filesystem and bounded public HTTP retrieval; PDF text extraction uses the bundled PDF.js dependency.

## Use this package

Mount the service beside a filesystem provider:

```yaml
- name: '@deepseek-ai/dsh-science-literature'
```

The service default export is `LiteratureService`, with `static inject = ['fs']`. Its operations are:

- `search(query, options?, signal?)`: `options` selects `sources`, `limit`, `since`, `until` and optional `cache`. Results contain `status`, `papers`, per-source `sources`, `truncated` and an optional `cachePath`.
- `read(ref, options, signal?)`: `options.cwd` is the calling workspace; `pages`, `query` and `maxChars` select excerpts. References accept a DOI, arXiv ID or URL, local path, or an exact OA URL already identified by this service. Results report `status`, `depth`, `ref`, `sha256`, `excerpts`, source reports and optional cache paths.
- `verify(doi, options?, signal?)`: optional `title` and `year` are compared with Crossref. The result's scope is always `bibliographic-metadata`; `verified` does not establish support for a manuscript claim.
- `toBibTeX(papers)` and `toCSV(papers)` are named exports returning deterministic strings. The consumer writes them through its normal authorized file operation.

Search defaults to OpenAlex and arXiv. A successful empty source is `completed`; a malformed subset or mixed source success is `partial`. When all requested sources fail, search throws `SCIENCE_SOURCES_FAILED`. DOI, exact versioned arXiv ID and OpenAlex ID drive merging. Similar titles alone never merge papers; conflicting metadata stays recorded.

### Limits and credentials

| Configuration | Default | Meaning |
| --- | ---: | --- |
| `requestTimeoutMs` | 30000 | One HTTP request's deadline |
| `maxBytes` | 20971520 | Complete local or downloaded document bytes |
| `maxPages` | 100 | Largest extracted PDF page prefix |
| `maxChars` | 12000 | Largest returned excerpt text; a call may request less |
| `maxDocumentChars` | 2000000 | Largest retained native document text |
| `maxResults` | 25 | Largest search result count |
| `maxRequests` | 6 | HTTP requests admitted by one operation |

Metadata requests have an additional 2 MiB byte cap. An operation deadline includes its request budget and arXiv spacing; caller cancellation and plugin disposal stop and join active operations. `Retry-After` is respected by origin, with no automatic infinite retries. arXiv API requests are spaced by three seconds within the service instance.

`openalexApiKey`, `openalexMailto` and `crossrefMailto` may be configured, or read from `OPENALEX_API_KEY`, `OPENALEX_MAILTO` and `CROSSREF_MAILTO`. Missing or rejected access is reported as source failure. Keys are removed from source diagnostics and persisted endpoints; key-bearing requests reject every redirect.

### Reading and evidence

`depth` is `full-text`, `abstract-only` or `unavailable`. PDF excerpts carry real `page` numbers and `page:N` locators. HTML reads use an identifiable scholarly article body and `section:article`; an arbitrary landing page is insufficient. Only known open locations are followed, and the exact selected URL is tried first. Closed primary PDF locations are excluded. Source content remains data and never authorizes execution.

An empty native PDF text layer returns `needs-setup` with an OCR requirement. Corrupt PDFs throw `SCIENCE_PDF_EXTRACTION`; password-protected PDFs throw `SCIENCE_PDF_PASSWORD`. PDF reading does not require Python or Poppler. Extraction and returned text caps are explicit; `truncated` means the complete source or selected text was not returned.

### Optional cache

Pass `cache: { cwd, sandboxPolicy }` to persist evidence under `.deepseek-science/literature/` in that workspace. The policy is supplied by the caller's session. Read-only writes and paths outside its workspace are rejected, including on a bare filesystem. Omitting `cache` makes no filesystem writes.

Writes create immutable, hash-addressed JSON records with a no-replace guard. Search and verification records retain source evidence. Reading returns `cachePath` for extracted text and `evidencePath` for the reference, workspace, source reports and excerpts actually returned. A fresh source-byte hash is checked before reusing extracted text; cache record size and extracted-text integrity are checked. Cache publication must succeed before its path is returned.

## Understand the implementation

`src/index.ts` owns service operations and their lifetimes. `metadata.ts` adapts bounded API data and merges identities; `pdf.ts` owns native text extraction and cleanup. `reading.ts` selects locators and excerpts; `cache.ts` publishes immutable records through `ctx.fs`; `exports.ts` serializes citation metadata.

## Model Experience

Indirectly, through scientific tool consumers rendering source reports and selected evidence.

#### KV Cache effect

This service does not rewrite the system prefix; its consumer records results and file paths through the existing tool loop.

## Known Limitations and Deferred Work

OCR, institution-authenticated downloads and claim-support verification are separate capabilities. Direct URL approval is retained only for this service instance; resolve a DOI or arXiv ID again after restart. The cache reuses extracted text but does not provide a stale offline replacement for unavailable source metadata. PDF extraction is bounded by pages and characters; complex column layout may still require visual inspection.

### Validation

Tests cover source failures, malformed metadata, version preservation, metadata conflicts, native PDF and OA article reading, source cancellation, queue deadlines, guarded caches and citation exports. A subprocess test boots an actual Cordis YAML composition through app-boot and reads a two-page PDF. Public HTTP tests cover proxy routing, private destinations, redirects, complete byte caps and cancellation cleanup.
