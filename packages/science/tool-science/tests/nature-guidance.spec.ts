import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { loadScienceSkillResource, readScienceCatalog } from '@deepseek-ai/dsh-skill-science'
import { renderNatureGuidance, resolveNatureGuidance } from '../src/nature-guidance.ts'

const catalog = readScienceCatalog()
const natureEntries = catalog.entries.filter(entry => entry.source.id === 'nature-skills' && entry.invocation.modelInvocable)
const entryNamed = (directory: string) => natureEntries.find(entry => entry.resourceDirectory.endsWith(`/${directory}`))!

it('resolves every invocable Nature workflow, retaining shared as support only', async () => {
  expect(natureEntries).toHaveLength(22)
  expect(natureEntries.every(entry => entry.packs.includes('nature'))).toBe(true)
  for (const entry of natureEntries) {
    const plans = await resolveNatureGuidance(catalog, `Use ${entry.name}`)
    const plan = plans.find(plan => plan.name === entry.name)
    expect(plan, entry.name).toBeDefined()
    expect(plan?.resources.length, entry.name).toBeGreaterThan(0)
    expect(plan?.resources.every(resource => catalog.files[resource.path.replaceAll('\\', '/').slice(catalog.assetRoot.replaceAll('\\', '/').length + 1)] !== undefined), entry.name).toBe(true)
  }
  expect(await resolveNatureGuidance(catalog, 'Use nature-shared')).toEqual([])
})

it('retains every conditional Nature reference with its upstream loading condition', async () => {
  const plan = (await resolveNatureGuidance(catalog, 'Create a scientific multi-panel plot in Python')).find(plan => plan.name === 'nature-figure')!
  const conditional = plan.resources.filter(resource => resource.condition !== undefined)
  expect(conditional.length).toBeGreaterThan(0)
  expect(conditional.some(resource => resource.required)).toBe(true)
  const deferred = conditional.find(resource => !resource.required)!
  const rendered = await renderNatureGuidance(catalog, plan, 200000)
  expect(rendered).toContain('For a condition-labelled reference, read it when that condition matches the task')
  expect(rendered).toContain(`— load when: ${deferred.condition}`)
})

it('includes complete plotting and rendered QA instructions with exclusive backend selection', async () => {
  for (const [request, backend, omitted] of [
    ['Create a scientific multi-panel plot in Python', 'python', 'r'],
    ['用 R 绘制科研多面板图', 'r', 'python'],
    ['请绘制科研图', 'python', 'r'],
  ]) {
    const plan = (await resolveNatureGuidance(catalog, request!)).find(plan => plan.name === 'nature-figure')!
    const paths = plan.resources.map(resource => resource.relative)
    expect(paths).toContain(`static/fragments/backend/${backend}.md`)
    expect(paths).not.toContain(`static/fragments/backend/${omitted}.md`)
    expect(paths).toContain('references/qa-contract.md')
    const text = await renderNatureGuidance(catalog, plan, 200000)
    const qa = await loadScienceSkillResource(catalog, plan.name, 'references/qa-contract.md')
    expect(text).toContain(qa.content)
    expect(text).toContain('5 pt')
    expect(text).toContain('1.5 pt')
  }
})

it('uses the dedicated vector schematic guidance without injecting plotting backend instructions', async () => {
  const plan = (await resolveNatureGuidance(catalog, '绘制可编辑SVG机制示意图')).find(plan => plan.name === 'nature-figure')!
  expect(plan.axes.backend).toBeUndefined()
  expect(plan.resources.map(resource => resource.relative)).toContain('references/vector-schematic-workflow.md')
  expect(plan.resources.map(resource => resource.relative)).toContain('references/vector-schematic-style-rules.md')
})

it('loads writing section dependencies and changes identity when the section or journal changes', async () => {
  const abstract = (await resolveNatureGuidance(catalog, 'Draft a Nature-family abstract')).find(plan => plan.name === 'nature-writing')!
  const results = (await resolveNatureGuidance(catalog, 'Draft Nature-family Results')).find(plan => plan.name === 'nature-writing')!
  const discussion = (await resolveNatureGuidance(catalog, 'Draft Nature Machine Intelligence Discussion')).find(plan => plan.name === 'nature-writing')!
  expect(abstract.resources.map(resource => resource.relative)).toContain('../nature-shared/core/nature-abstract.md')
  expect(results.axes.section).toEqual(['experiments'])
  expect(results.resources.map(resource => resource.relative)).toEqual(expect.arrayContaining([
    '../nature-shared/core/main-text-discipline.md', '../nature-shared/core/nature-results-discussion.md',
  ]))
  expect(discussion.resources.map(resource => resource.relative)).toEqual(expect.arrayContaining([
    '../nature-shared/core/discussion-argument-language.md', '../nature-shared/journal-formats/nature-machine-intelligence.md',
  ]))
  expect(new Set([abstract.identity, results.identity, discussion.identity]).size).toBe(3)
  expect((await resolveNatureGuidance(catalog, 'Please draft a Nature-family abstract'))[0]?.identity).toBe(abstract.identity)
})

it('preserves Chinese output and only selects Chinese-to-English repair when translation is requested', async () => {
  const chinese = (await resolveNatureGuidance(catalog, '请用中文润色论文结果')).find(plan => plan.name === 'nature-polishing')!
  const english = (await resolveNatureGuidance(catalog, '请将结果段落中译英并润色')).find(plan => plan.name === 'nature-polishing')!
  expect(chinese.axes.language).toEqual(['en'])
  expect(english.axes.language).toEqual(['zh-to-en'])
  expect(english.resources.map(resource => resource.relative)).toContain('static/fragments/language/en.md')
  expect(await renderNatureGuidance(catalog, chinese, 200000)).toContain('Use the requested output language')
})

it('restricts layout-only tasks to the self-contained layout workflow', async () => {
  const plans = await resolveNatureGuidance(catalog, '不要重写论文，只做双栏排版')
  expect(plans.map(plan => plan.name)).toEqual(['nature-polishing'])
  expect(plans[0]?.resources.map(resource => resource.relative)).toEqual(['references/latex-layout.md'])
  expect(plans[0]?.axes).toEqual({})
})

it('does not narrow unrestricted literature discovery to Nature/CNS', async () => {
  const broad = await resolveNatureGuidance(catalog, 'Search literature and citations in biology')
  expect(broad.map(plan => plan.name)).toContain('nature-academic-search')
  expect(broad.map(plan => plan.name)).not.toContain('nature-citation')
  const narrow = await resolveNatureGuidance(catalog, '为这段补Nature系列引用')
  expect(narrow.map(plan => plan.name)).toContain('nature-citation')
})

it('includes only entire resources and accounts for all deferred paths in the full rendered budget', async () => {
  const plan = (await resolveNatureGuidance(catalog, 'Use nature-writing to draft a Nature-family abstract')).find(plan => plan.name === 'nature-writing')!
  const complete = (await renderNatureGuidance(catalog, plan, 200000))!
  const exact = await renderNatureGuidance(catalog, plan, complete.length)
  expect(exact).toBe(complete)
  expect(await renderNatureGuidance(catalog, plan, 1)).toBeUndefined()
  const bounded = (await renderNatureGuidance(catalog, plan, 12000))!
  expect(bounded.length).toBeLessThanOrEqual(12000)
  for (const resource of plan.resources) {
    const raw = await loadScienceSkillResource(catalog, plan.name, resource.relative)
    expect(bounded).toContain(resource.path)
    if (bounded.includes(`<nature_resource path="${resource.path}" sha256="${raw.digest}">`)) expect(bounded).toContain(raw.content)
    else expect(bounded).not.toContain(raw.content)
  }
  expect(bounded).toContain('Deferred resources (not loaded')
})

it('verifies resource identities at render time and observes cancellation', async () => {
  const plan = (await resolveNatureGuidance(catalog, 'Use nature-statistics'))[0]!
  const changed = { ...plan, resources: plan.resources.map((resource, index) => index === 0 ? { ...resource, digest: '0'.repeat(64) } : resource) }
  await expect(renderNatureGuidance(catalog, changed, 200000)).rejects.toThrow('changed after selection')
  const controller = new AbortController()
  controller.abort(new Error('cancelled Nature read'))
  await expect(resolveNatureGuidance(catalog, 'Use nature-writing', { signal: controller.signal })).rejects.toThrow('cancelled Nature read')
})

it('retains pinned upstream instruction bytes and all verified resources', () => {
  const entry = entryNamed('nature-figure')
  const manifest = readFileSync(fileURLToPath(new URL('../../../skill/skill-science/assets/manifest.json', import.meta.url)), 'utf8')
  expect(manifest).toContain(entry.source.commit)
  expect(entry.files.some(path => path.endsWith('/references/vector-schematic-workflow.md'))).toBe(true)
})
