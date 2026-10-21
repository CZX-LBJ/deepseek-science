import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SkillRegistry from '../../skill/src/index.ts'
import * as Science from '../src/index.ts'
import type { ScienceCatalogEntry } from '../src/types.ts'
import { describe, expect, it } from 'vitest'

const packaged = fileURLToPath(new URL('../assets/', import.meta.url))
const body = '---\nname: evidence\ndescription: Appraise evidence\n---\n# Evidence\n\nRead references/rules.md.'

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-science-test-'))
  const files: Record<string, string> = {}
  const content = { 'sources/test/evidence/SKILL.md': body, 'sources/test/evidence/references/rules.md': 'Check uncertainty.\n' }
  for (const [path, raw] of Object.entries(content)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), raw)
    files[path] = createHash('sha256').update(raw).digest('hex')
  }
  const entry: ScienceCatalogEntry = {
    name: 'evidence', originalName: 'evidence', description: 'Appraise evidence',
    source: { id: 'test', repository: 'https://example.com/test', commit: 'a'.repeat(40), path: 'evidence/SKILL.md', author: 'Test Author', version: '1' },
    alternateSources: [], license: { declared: 'MIT', redistribution: 'MIT', files: [], noncommercial: false },
    packs: ['core'], invocation: { modelInvocable: true, userInvocable: true },
    adaptation: { status: 'guidance-adapted', notes: 'Guidance only' }, readiness: { status: 'guidance-only', requirements: [], testedHere: false },
    skillPath: 'sources/test/evidence/SKILL.md', resourceDirectory: 'sources/test/evidence', files: Object.keys(files), dependencies: [], digest: 'b'.repeat(64), metadata: {},
  }
  const entries = [entry,
    { ...entry, name: 'advanced', packs: ['extended'], adaptation: { status: 'upstream', notes: 'Unreviewed' } },
    { ...entry, name: 'private', packs: ['academic-noncommercial'], license: { ...entry.license, noncommercial: true } },
    { ...entry, name: 'private-codex', packs: ['academic-codex-noncommercial'], license: { ...entry.license, noncommercial: true } },
    { ...entry, name: 'nature-shared', invocation: { modelInvocable: false, userInvocable: false }, packs: ['nature'], adaptation: { status: 'support', notes: 'Support' } },
    { ...entry, name: 'human-only', invocation: { modelInvocable: false, userInvocable: true }, packs: ['core'] },
  ]
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 1, defaultPacks: ['core', 'ai', 'nature'], packs: ['core', 'ai', 'nature', 'extended', 'academic-noncommercial', 'academic-codex-noncommercial'], entries, files, excluded: [] }))
  return root
}

describe('science skill catalog', () => {
  it('loads complete declared resources and rejects changed or undeclared instructions', async () => {
    const root = await fixture()
    try {
      const catalog = Science.readScienceCatalog(root)
      const resource = await Science.loadScienceSkillResource(catalog, 'evidence', 'references/rules.md')
      expect(resource?.content).toBe('Check uncertainty.\n')
      expect(resource?.catalogPath).toBe('sources/test/evidence/references/rules.md')
      expect(resource?.digest).toBe(catalog.files[resource!.catalogPath])
      await expect(Science.loadScienceSkillResource(catalog, 'evidence', '../../../manifest.json')).rejects.toThrow('not declared')
      await writeFile(join(root, 'sources/test/evidence/references/rules.md'), 'Altered guidance.')
      await expect(Science.loadScienceSkillResource(catalog, 'evidence', 'references/rules.md')).rejects.toThrow('hash mismatch')
      expect(await Science.loadScienceSkillResource(catalog, 'missing', 'references/rules.md')).toBeUndefined()
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('applies invocation, license and cancellation controls when reading individual resources', async () => {
    const root = await fixture()
    try {
      const catalog = Science.readScienceCatalog(root)
      await expect(Science.loadScienceSkillResource(catalog, 'private', 'references/rules.md')).rejects.toThrow('noncommercial pack explicitly')
      await expect(Science.loadScienceSkillResource(catalog, 'nature-shared', 'references/rules.md')).rejects.toThrow('invocation')
      await expect(Science.loadScienceSkillResource(catalog, 'human-only', 'references/rules.md')).rejects.toThrow('invocation')
      expect((await Science.loadScienceSkillResource(catalog, 'human-only', 'references/rules.md', { invocation: 'user' }))?.content).toContain('uncertainty')
      const controller = new AbortController()
      controller.abort(new Error('cancelled resource read'))
      await expect(Science.loadScienceSkillResource(catalog, 'evidence', 'references/rules.md', { signal: controller.signal })).rejects.toThrow('cancelled resource read')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('resolves only declared shared dependencies outside a skill directory', async () => {
    const catalog = Science.readScienceCatalog(packaged)
    const resource = await Science.loadScienceSkillResource(catalog, 'nature-writing', '../nature-shared/core/main-text-discipline.md')
    expect(resource?.content).toContain('main text')
    expect(resource?.catalogPath).toBe('sources/nature-skills/skills/nature-shared/core/main-text-discipline.md')
    for (const reference of ['C:/secret.md', '/secret.md', '..\\secret.md']) {
      await expect(Science.loadScienceSkillResource(catalog, 'nature-writing', reference)).rejects.toThrow('relative forward-slash')
    }
  })

  it('advertises only enabled packs while searching and explicitly loading the full commercial catalog', async () => {
    const root = await fixture()
    const ctx = new Context()
    try {
      const catalog = Science.readScienceCatalog(root)
      expect(Science.searchScienceCatalog(catalog, 'advanced').map(entry => entry.name)).toEqual(['advanced'])
      expect(Science.inspectScienceSkill(catalog, 'evidence')?.source.author).toBe('Test Author')
      const advanced = await Science.loadScienceSkill(catalog, 'advanced')
      expect(advanced?.content).toContain('# Evidence')
      expect(advanced?.content).toContain('Workflow and script execution have not been tested in this Harness.')
      await ctx.plugin(SkillRegistry)
      const fiber = await ctx.plugin(Science, { assetRoot: root })
      expect((await ctx.skills.list()).map(entry => entry.name)).toEqual(['evidence', 'human-only', 'nature-shared'])
      expect(await ctx.skills.get('advanced')).toBeUndefined()
      expect((await ctx.skills.get('evidence'))?.resourceBase).toEqual({ kind: 'directory', path: join(root, 'sources/test/evidence') })
      await fiber.dispose()
      expect(await ctx.skills.list()).toEqual([])
    } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
  })

  it('enforces both invocation policies and requires explicit noncommercial pack activation', async () => {
    const root = await fixture()
    try {
      const catalog = Science.readScienceCatalog(root)
      await expect(Science.loadScienceSkill(catalog, 'nature-shared')).rejects.toThrow('invocation')
      await expect(Science.loadScienceSkill(catalog, 'human-only')).rejects.toThrow('invocation')
      expect(await Science.loadScienceSkill(catalog, 'human-only', { invocation: 'user' })).toBeDefined()
      await expect(Science.loadScienceSkill(catalog, 'private')).rejects.toThrow('noncommercial pack explicitly')
      const academic = await Science.loadScienceSkill(catalog, 'private', { enabledPacks: ['academic-noncommercial'] })
      expect(academic?.content).toContain(`Repository resources: ${join(root, 'sources/test')}`)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('requires each noncommercial pack separately for loading and registry discovery', async () => {
    const root = await fixture()
    const ctx = new Context()
    try {
      const catalog = Science.readScienceCatalog(root)
      await expect(Science.loadScienceSkill(catalog, 'private-codex')).rejects.toThrow('noncommercial pack explicitly')
      await expect(Science.loadScienceSkill(catalog, 'private-codex', { enabledPacks: ['academic-noncommercial'], invocation: 'user' })).rejects.toThrow('noncommercial pack explicitly')
      await expect(Science.loadScienceSkill(catalog, 'private', { enabledPacks: ['academic-codex-noncommercial'] })).rejects.toThrow('noncommercial pack explicitly')
      expect(await Science.loadScienceSkill(catalog, 'private-codex', { enabledPacks: ['academic-codex-noncommercial'] })).toBeDefined()
      await ctx.plugin(SkillRegistry)
      const fiber = await ctx.plugin(Science, { assetRoot: root, enabledPacks: ['academic-codex-noncommercial'] })
      expect((await ctx.skills.list()).map(entry => entry.name)).toEqual(['private-codex'])
      expect(await ctx.skills.get('private')).toBeUndefined()
      expect(await ctx.skills.get('private-codex')).toBeDefined()
      await fiber.dispose()
      expect(await ctx.skills.list()).toEqual([])
    } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
  })

  it('rejects missing resources at initialization and tampered resources at loading', async () => {
    const root = await fixture()
    try {
      const catalog = Science.readScienceCatalog(root)
      await writeFile(join(root, 'sources/test/evidence/references/rules.md'), 'Changed content')
      await expect(Science.loadScienceSkill(catalog, 'evidence')).rejects.toThrow('hash mismatch')
      expect(() => { Science.verifyScienceCatalog(catalog) }).toThrow('hash mismatch')
      await rm(join(root, 'sources/test/evidence/references/rules.md'))
      expect(() => Science.readScienceCatalog(root)).toThrow('Missing science resource')
      expect(() => Science.readScienceCatalog('assets')).toThrow('absolute')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('loads relocated assets through a real Loader composition and disposes its catalog', async () => {
    const root = await fixture()
    const ctx = new Context()
    try {
      const external = join(root, '中文 assets')
      await mkdir(external)
      await cp(join(root, 'sources'), join(external, 'sources'), { recursive: true })
      await cp(join(root, 'manifest.json'), join(external, 'manifest.json'))
      const config = join(root, 'cordis.yml')
      await writeFile(config, `- name: cordis:skills\n- name: cordis:science\n  config:\n    assetRoot: ${JSON.stringify(external)}\n    enabledPacks: [extended]\n`)
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      ctx.loader.builtins.skills = SkillRegistry
      ctx.loader.builtins.science = Science
      const entry = await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
      await ctx.loader.await()
      expect((await ctx.skills.list()).map(skill => skill.name)).toEqual(['advanced'])
      expect((await ctx.skills.get('advanced'))?.resourceBase).toEqual({ kind: 'directory', path: join(external, 'sources/test/evidence') })
      ctx.loader.remove(entry)
      await ctx.loader.await()
      expect(ctx.get('skills')).toBeUndefined()
    } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
  })

  // This integrity read hashes about 196 MB across 11,510 files on Windows.
  it('ships pinned source metadata, complete Nature and Superpowers trees, and isolated academic resources', () => {
    const catalog = Science.readScienceCatalog(packaged)
    expect(new Set(catalog.entries.flatMap(entry => [entry.source.id, ...entry.alternateSources.map(source => source.id)])).size).toBe(19)
    expect(catalog.entries.filter(entry => entry.source.id === 'nature-skills')).toHaveLength(23)
    expect(catalog.entries.filter(entry => entry.source.id === 'nature-skills').every(entry => entry.packs.includes('nature'))).toBe(true)
    expect(catalog.entries.filter(entry => entry.source.id === 'superpowers')).toHaveLength(15)
    expect(catalog.entries.filter(entry => entry.source.id === 'academic-research-skills')).toHaveLength(5)
    const support = Science.inspectScienceSkill(catalog, 'nature-shared')
    expect(support?.invocation).toEqual({ modelInvocable: false, userInvocable: false })
    expect(support?.files.some(path => path.endsWith('/core/main-text-discipline.md'))).toBe(true)
    const academic = catalog.entries.find(entry => entry.source.id === 'academic-research-skills')
    expect(academic?.skillPath).toMatch(/^noncommercial\//u)
    expect(academic?.files.some(path => path.includes('/shared/agents/'))).toBe(true)
    expect(academic?.files.some(path => path.includes('/scripts/'))).toBe(true)
    const codex = catalog.entries.find(entry => entry.source.id === 'academic-research-skills-codex')
    expect(codex?.packs).toEqual(['academic-codex-noncommercial'])
    expect(codex?.files.some(path => path.endsWith('/codex/model-runtime-policy.md'))).toBe(true)
    expect(catalog.entries.filter(entry => entry.license.noncommercial)
      .every(entry => [...entry.files, ...entry.license.files].every(path => path.startsWith('noncommercial/')))).toBe(true)
    const scholar = catalog.entries.find(entry => entry.source.id === 'claude-scholar')
    expect(scholar?.dependencies).toContain('scripts/')
    expect(scholar?.files.some(path => path.includes('/agents/'))).toBe(true)
    expect(catalog.entries.filter(entry => entry.source.id === 'claude-scholar')).toHaveLength(45)
    for (const originalName of ['frontend-design', 'webapp-testing']) {
      const skill = catalog.entries.find(entry => entry.source.id === 'claude-scholar' && entry.originalName === originalName)
      expect(skill?.license.declared).toBe('Complete terms in LICENSE.txt')
      expect(skill?.license.redistribution).toBe('Apache-2.0')
      expect(skill?.license.files.some(path => path.endsWith('/LICENSE.txt'))).toBe(true)
    }
    expect(catalog.excluded).toContainEqual({
      source: 'huggingface-skills', path: 'skills/huggingface-llm-trainer/SKILL.md',
      reason: 'Unsupported declared license: Complete terms in LICENSE.txt',
    })
    const aris = catalog.entries.find(entry => entry.source.id === 'aris')
    expect(aris?.files.some(path => path.endsWith('/tools/research_wiki.py'))).toBe(true)
    expect(aris?.files.some(path => path.endsWith('/mcp-servers/llm-chat/server.py'))).toBe(true)
    for (const sourcePath of ['skills/paper-write/SKILL.md', 'skills/paper-writing/SKILL.md', 'skills/skills-codex/paper-write/SKILL.md']) {
      const writer = catalog.entries.find(entry => entry.source.id === 'aris' && entry.source.path === sourcePath)
      expect(writer).toBeDefined()
      for (const variant of ['skills/shared-references', 'skills/skills-codex/shared-references']) {
        expect(writer?.dependencies).toContain(variant + '/')
        for (const reference of ['writing-principles.md', 'venue-checklists.md', 'citation-discipline.md']) {
          const path = `sources/aris/${variant}/${reference}`
          expect(writer?.files).toContain(path)
          expect(catalog.files[path]).toMatch(/^[a-f0-9]{64}$/u)
        }
      }
    }
    const poster = catalog.entries.find(entry => entry.source.id === 'aris' && entry.source.path === 'skills/paper-poster-html/SKILL.md')
    expect(poster?.license.files.some(path => path.endsWith('/LICENSES/posterly-MIT.txt'))).toBe(true)
    expect(catalog.entries.some(entry => ['docx', 'pdf', 'pptx', 'xlsx'].includes(entry.originalName))).toBe(false)
    expect(catalog.excluded.some(entry => entry.reason.includes('Anthropic'))).toBe(true)
    expect(catalog.entries.every(entry => !entry.readiness.testedHere)).toBe(true)
    const curated = catalog.entries.filter(entry => entry.packs.some(pack => catalog.defaultPacks.includes(pack)))
    expect(curated.length).toBeGreaterThanOrEqual(25)
    expect(curated.length).toBeLessThanOrEqual(60)
  }, 30_000)

  it('retains every pre-expansion public name and exposes source paths for selecting ARIS variants', async () => {
    const catalog = Science.readScienceCatalog(packaged)
    const lockedNames: unknown = JSON.parse(await readFile(new URL('../names.lock.json', import.meta.url), 'utf8'))
    if (!Array.isArray(lockedNames)) throw new Error('Invalid public name lock')
    const locks = lockedNames.map((item: unknown) => {
      if (item === null || typeof item !== 'object'
        || !('source' in item) || typeof item.source !== 'string'
        || !('path' in item) || typeof item.path !== 'string'
        || !('name' in item) || typeof item.name !== 'string') throw new Error('Invalid public name lock entry')
      return { source: item.source, path: item.path, name: item.name }
    })
    expect(locks).toHaveLength(968)
    for (const lock of locks) {
      const entry = Science.inspectScienceSkill(catalog, lock.name)
      expect(entry?.source.id).toBe(lock.source)
      expect(entry?.source.path).toBe(lock.path)
    }
    const variants = Science.searchScienceCatalog(catalog, 'aris research-review')
      .filter(entry => entry.originalName === 'research-review')
    expect(variants).toHaveLength(4)
    expect(new Set(variants.map(entry => entry.name)).size).toBe(4)
    const selected = Science.searchScienceCatalog(catalog, 'aris skills-codex-gemini-review/research-review')
    expect(selected).toHaveLength(1)
    const loaded = await Science.loadScienceSkill(catalog, selected[0]?.name ?? '')
    expect(loaded?.content).toContain('Gemini')
    expect(loaded?.content).toContain(`Repository resources: ${join(packaged, 'sources/aris')}`)
  })

  it('retains transitive source documents and reports resources absent at the pinned source', () => {
    const catalog = Science.readScienceCatalog(packaged)
    const academic = Science.inspectScienceSkill(catalog, 'academic-pipeline')
    expect(academic?.files.some(path => path.endsWith('/docs/PERFORMANCE.md'))).toBe(true)
    expect(Science.inspectScienceSkill(catalog, 'nature-paper-card')?.files.some(path => path.endsWith('/docs/nature-paper-card-tutorial_EN.md'))).toBe(true)
    const optional = Science.inspectScienceSkill(catalog, 'ai-research-skills-constitutional-ai')
    expect(optional?.readiness.status).toBe('needs-setup')
    const audit = optional?.metadata.resourceAudit
    if (optional === undefined || audit === null || typeof audit !== 'object' || !('unresolved' in audit)) throw new Error('Missing resource audit')
    expect(audit.unresolved).toContainEqual({
      from: optional.skillPath,
      reference: 'references/constitution-design.md',
      reason: 'upstream-missing',
    })
    const codex = catalog.entries.find(entry => entry.source.id === 'academic-research-skills-codex')
    const codexAudit = codex?.metadata.resourceAudit
    if (codexAudit === null || typeof codexAudit !== 'object' || !('unresolved' in codexAudit)) throw new Error('Missing Codex resource audit')
    expect(codexAudit.unresolved).not.toContainEqual({
      from: 'noncommercial/academic-research-skills-codex/plugins/ars-codex/skills/academic-research-suite/ars/.github/copilot-instructions.md',
      reference: '../docs/ARCHITECTURE.md',
      reason: 'restricted-license',
    })
  })
})
