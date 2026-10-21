/** Native extraction from already-authorized bytes, with page/text bounds and owned cancellation. */
import type { DocumentText } from './types.ts'
import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Extract bounded native PDF text from already-authorized bytes.
 * @param bytes - complete PDF source bytes.
 * @param maxPages - largest page prefix to extract.
 * @param maxDocumentChars - aggregate native text budget.
 * @param signal - cancels extraction and destroys the PDF task.
 * @returns page text, original page count and truncation status; corrupt or protected PDFs reject.
 */
export async function extractPDF(
  bytes: Uint8Array, maxPages: number, maxDocumentChars: number, signal: AbortSignal,
): Promise<DocumentText> {
  signal.throwIfAborted()
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Some filesystem backends return Buffer (a Uint8Array subclass); PDF.js requires a plain owned typed array.
  const task = getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, stopAtErrors: true, enableXfa: false, verbosity: 0 })
  const abort = () => { void task.destroy().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    signal.throwIfAborted()
    const document = await task.promise
    const pages: string[] = []
    let used = 0
    let truncated = document.numPages > maxPages
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, maxPages); pageNumber++) {
      signal.throwIfAborted()
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      signal.throwIfAborted()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str + (item.hasEOL ? '\n' : ' ')
        if (used + text.length > maxDocumentChars) { text = text.slice(0, Math.max(0, maxDocumentChars - used)); truncated = true; break }
      }
      pages.push(text.trim()); used += text.length; page.cleanup()
      if (used >= maxDocumentChars) { truncated ||= pageNumber < document.numPages; break }
    }
    return { pages, totalPages: document.numPages, truncated }
  } catch (error: unknown) {
    signal.throwIfAborted()
    const password = typeof error === 'object' && error !== null && 'name' in error && error.name === 'PasswordException'
    throw new HarnessError(password ? 'The PDF requires a password before text can be read.' : 'Native text extraction failed for this PDF.', password ? 'SCIENCE_PDF_PASSWORD' : 'SCIENCE_PDF_EXTRACTION', { cause: error })
  } finally {
    signal.removeEventListener('abort', abort)
    await task.destroy()
  }
}
