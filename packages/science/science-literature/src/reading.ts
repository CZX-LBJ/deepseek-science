/** Select only the evidence the model actually reads and retain accurate page locators. */
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { DocumentText, LiteratureExcerpt, ReadOptions, ReadResult, SourceReport } from './types.ts'

/** Select locator-bearing excerpts while preserving the source reading depth.
 * @param document - bounded extracted document.
 * @param ref - caller’s paper reference.
 * @param options - selected pages, query and excerpt controls.
 * @param cap - maximum returned text characters.
 * @param sources - source diagnostics to retain.
 * @param textLocator - section label for text without PDF page numbers.
 * @returns selected evidence, or an explicit OCR requirement for an empty native text layer.
 */
export function selectText(
  document: DocumentText, ref: string, options: ReadOptions, cap: number, sources: SourceReport[], textLocator?: string,
): ReadResult {
  const chars = document.pages.reduce((sum, p) => sum + p.trim().length, 0)
  if (!chars) return { status: 'needs-setup', depth: 'unavailable', ref, excerpts: [], sources, totalPages: document.totalPages, truncated: document.truncated, reason: 'No native text layer was extracted. OCR setup is required for scanned pages.' }
  const selected = options.pages ? [...new Set(options.pages)] : document.pages.map((_p, i) => i + 1)
  if (selected.some(page => page > document.totalPages || page > document.pages.length)) throw new HarnessError('requested page is outside the extracted page budget', 'SCIENCE_INVALID_ARGUMENT')
  const excerpts: LiteratureExcerpt[] = []
  let used = 0
  let truncated = document.truncated
  for (const [index, page] of selected.entries()) {
    const original = document.pages[page - 1] ?? ''
    let text = original
    if (options.query) {
      const match = text.toLowerCase().indexOf(options.query.toLowerCase())
      if (match < 0) continue
      const start = Math.max(0, match - 200)
      text = text.slice(start, match + options.query.length + 500)
      truncated ||= text.length < original.length
    }
    const remaining = cap - used
    if (text.length > remaining) { text = text.slice(0, remaining); truncated = true }
    if (text) excerpts.push(textLocator === undefined ? { page, locator: `page:${page}`, text } : { locator: textLocator, text })
    used += text.length
    if (used >= cap) { truncated ||= index < selected.length - 1; break }
  }
  return { status: 'ready', depth: 'full-text', ref, excerpts, sources,
    ...textLocator === undefined ? { totalPages: document.totalPages } : {}, truncated }
}

/** An OA landing page is insufficient; accept an identifiable scholarly article body only. */
/** Accept only a scholarly article body with identifiable research section headings.
 * @param html - retrieved open HTML text.
 * @returns plain article text, or undefined when body-section structure is insufficient.
 */
export function articleText(html: string): string | undefined {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/iu)?.[1]
  if (!article) return undefined
  const body = article.replace(/<(script|style|nav)\b[^>]*>[\s\S]*?<\/\1>/giu, ' ')
  const sections = [...body.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/giu)]
    .map(match => match[1]?.replace(/<[^>]*>/gu, ' ').trim().toLowerCase() ?? '')
  if (!sections.some(title => /\bintroduction\b/u.test(title))
    || !sections.some(title => /\b(methods|results|discussion)\b/u.test(title))) return undefined
  return body.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim()
}
