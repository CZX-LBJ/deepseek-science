import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { loadScienceSkill, readScienceCatalog, verifyScienceCatalog } from '../src/index.ts'
import type { ScienceCatalogEntry } from '../src/types.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'science-knowledge-'))
  const wrapper = 'knowledge/symbolic/guides/algebra/SKILL.md'
  const upstream = 'knowledge/symbolic/docs/solvers.rst'
  const original = 'Solve exact symbolic systems.\n'
  const raw = '---\nname: algebra\ndescription: Symbolic mathematics\n---\nRead the original documentation.\n'
  const files: Record<string, string> = {}
  for (const [path, content] of [[wrapper, raw], [upstream, original]]) {
    await mkdir(dirname(join(root, path!)), { recursive: true })
    await writeFile(join(root, path!), content!)
    files[path!] = createHash('sha256').update(content!).digest('hex')
  }
  const entry: ScienceCatalogEntry = {
    name: 'algebra', originalName: 'algebra', description: 'Symbolic mathematics',
    source: { id: 'symbolic', repository: 'https://example.org/symbolic', commit: 'a'.repeat(40), path: 'docs/solvers.rst', author: 'Test', version: 'pinned' },
    alternateSources: [], license: { declared: 'BSD-3-Clause', redistribution: 'BSD-3-Clause', files: [], noncommercial: false },
    packs: ['scientific'], invocation: { modelInvocable: true, userInvocable: true },
    adaptation: { status: 'guidance-adapted', notes: 'Locally authored adapter; original document retained' },
    readiness: { status: 'guidance-only', requirements: ['Symbolic library'], testedHere: false },
    skillPath: wrapper, resourceDirectory: 'knowledge/symbolic/guides/algebra', files: Object.keys(files), dependencies: ['docs/'],
    digest: createHash('sha256').update(raw).digest('hex'),
    metadata: { generatedKnowledgeGuide: { repositoryRoot: 'knowledge/symbolic', upstreamResourcePath: upstream } },
  }
  const manifest = { schemaVersion: 1, defaultPacks: ['scientific'], packs: ['scientific'], entries: [entry], files, excluded: [] }
  const save = (selected: ScienceCatalogEntry = entry) => writeFile(join(root, 'manifest.json'), JSON.stringify({ ...manifest, entries: [selected] }))
  await save()
  return { root, entry, upstream, original, save }
}

it('retains an original pinned document separately from its identified local guide after relocation', async () => {
  const data = await fixture()
  try {
    const catalog = readScienceCatalog(data.root)
    verifyScienceCatalog(catalog)
    const loaded = await loadScienceSkill(catalog, 'algebra')
    expect(loaded?.content).toContain('locally authored knowledge guide, not an upstream-authored skill')
    expect(loaded?.content).toContain(join(data.root, 'knowledge/symbolic'))
    expect(await readFile(join(data.root, data.upstream), 'utf8')).toBe(data.original)
    await writeFile(join(data.root, data.upstream), 'Altered documentation')
    await expect(loadScienceSkill(catalog, 'algebra')).rejects.toThrow('hash mismatch')
  } finally { await rm(data.root, { recursive: true, force: true }) }
})

it('rejects a generated guide whose recorded original differs from its pinned source path', async () => {
  const data = await fixture()
  try {
    await data.save({ ...data.entry, source: { ...data.entry.source, path: 'another/document.rst' } })
    expect(() => readScienceCatalog(data.root)).toThrow('knowledge guide mapping')
    await data.save({ ...data.entry, metadata: { generatedKnowledgeGuide: { repositoryRoot: '../outside', upstreamResourcePath: data.upstream } } })
    expect(() => readScienceCatalog(data.root)).toThrow('outside assetRoot')
  } finally { await rm(data.root, { recursive: true, force: true }) }
})
