/** Deterministic citation exports; writing files remains the consumer's authorized operation. */
import { hash } from './metadata.ts'
import type { Paper } from './types.ts'

function tex(value: string): string { return value.replace(/[\\{}%&#_$]/gu, char => char === '\\' ? '\\textbackslash{}' : `\\${char}`) }

/** Serialize citation metadata, preserving versioned arXiv eprints and stable keys.
 * @param papers - retrieved paper records.
 * @returns escaped BibTeX text without filesystem writes.
 */
export function toBibTeX(papers: readonly Paper[]): string {
  return papers.map((paper) => {
    const key = `paper${hash(paper.arxivId ?? paper.doi ?? paper.id).slice(0, 12)}`
    const fields: Array<[string, string | undefined]> = [
      ['title', paper.title], ['author', paper.authors.join(' and ') || undefined], ['year', paper.year?.toString()],
      ['journal', paper.venue], ['doi', paper.doi], ['url', paper.url], ['eprint', paper.arxivId], ['archivePrefix', paper.arxivId ? 'arXiv' : undefined],
    ]
    return `@${paper.venue && paper.doi ? 'article' : 'misc'}{${key},\n${fields.filter((f): f is [string, string] => f[1] !== undefined).map(([name, value]) => `  ${name} = {${tex(value)}}`).join(',\n')}\n}`
  }).join('\n\n') + (papers.length ? '\n' : '')
}
/** Serialize RFC-4180 quoted metadata rows without inventing missing values. */
/** Serialize RFC-4180 quoted metadata without inventing missing values.
 * @param papers - retrieved paper records.
 * @returns CSV text with a header and CRLF row endings.
 */
export function toCSV(papers: readonly Paper[]): string {
  const headers = ['id', 'title', 'authors', 'year', 'venue', 'doi', 'arxiv_id', 'url', 'sources', 'retrieved_at']
  const rows = papers.map(p => [p.id, p.title, p.authors.join('; '), p.year?.toString() ?? '', p.venue ?? '', p.doi ?? '', p.arxivId ?? '', p.url ?? '', p.sources.join('; '), p.retrievedAt])
  return [headers, ...rows].map(row => row.map(value => `"${value.replace(/"/gu, '""')}"`).join(',')).join('\r\n') + '\r\n'
}
