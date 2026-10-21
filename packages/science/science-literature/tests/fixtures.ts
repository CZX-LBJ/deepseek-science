/** Small complete research inputs owned by these tests. */
export function atom(entries: Array<{ id: string; title?: string; doi?: string }>): string {
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${entries.map(e => `<entry><id>https://arxiv.org/abs/${e.id}</id><title>${e.title ?? 'Test Paper'}</title><summary>Evidence from an abstract.</summary><published>2024-01-01T00:00:00Z</published><author><name>Ada Lovelace</name></author><link href="https://arxiv.org/pdf/${e.id}" title="pdf" type="application/pdf"/>${e.doi ? `<arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">${e.doi}</arxiv:doi>` : ''}</entry>`).join('')}</feed>`
}

export function tinyPDF(lines: string[]): Uint8Array<ArrayBuffer> {
  const objects: string[] = []
  const add = (body: string) => (objects.push(body), objects.length)
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const parent = 2 + lines.length * 2
  const kids: number[] = []
  for (const line of lines) {
    const stream = `BT /F1 12 Tf 72 720 Td (${line.replace(/[()\\]/g, '\\$&')}) Tj ET`
    const contents = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    kids.push(add(`<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 612 792] /Contents ${contents} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`))
  }
  const pages = add(`<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`)
  const catalog = add(`<< /Type /Catalog /Pages ${pages} 0 R >>`)
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((obj, i) => {
    const offset = Buffer.byteLength(pdf)
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
    return offset
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}
