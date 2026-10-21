import { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AgentRegistry, { agentEvents, type Agent, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SkillDefinition } from '@deepseek-ai/dsh-skill'
import type { ScienceCatalog, ScienceCatalogEntry } from '@deepseek-ai/dsh-skill-science'
import { afterEach, expect, it } from 'vitest'
import { installScienceKernel, renderScienceRouting, selectScienceRoutes, type ScienceKernelOptions, type ScienceRoutingRule } from '../src/kernel.ts'

const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const domains = [
  ['life', 'biology|生物', 'biology'], ['medicine', 'clinical|临床', 'clinical'],
  ['chemistry', 'chemistry|化学', 'chemistry'], ['physics', 'physics|物理', 'physics'],
  ['engineering', 'engineering|工程', 'engineering'], ['earth', 'climate|气候', 'climate'],
  ['social', 'sociology|社会学', 'sociology'], ['computing', 'neural|神经网络', 'neural'],
] as const
const rules: ScienceRoutingRule[] = domains.map(([id, pattern]) => ({ id, patterns: [pattern], skills: [`domain-${id}`] }))
const nativeNames = ['deepseek-science-literature', 'deepseek-science-analysis', 'deepseek-science-writing']
const catalog: ScienceCatalog = { schemaVersion: 1, assetRoot: '/embedded', defaultPacks: ['core'], packs: ['core', 'academic-noncommercial'], entries: [], files: {}, excluded: [] }

function recipe(name: string, content = `Complete instructions for ${name}.`): SkillDefinition {
  return { name, description: name, content, provider: 'test-native', source: 'bundled',
    invocation: { modelInvocable: true, userInvocable: true }, resourceBase: { kind: 'directory', path: `/skills/${name}` } }
}
function message(text: string): UserMessage { return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }) }
function options(overrides: Partial<ScienceKernelOptions> = {}): ScienceKernelOptions {
  const recipes = new Map([...nativeNames, ...rules.flatMap(rule => rule.skills)].map(name => [name, recipe(name)]))
  return { enabled: true, catalog, recipes,
    enabledPacks: ['core'], maxAutoSkills: 5, maxAutoChars: 48000, routeRules: rules, ...overrides }
}
function agent(session = Session.create(SessionId('kernel-test'))): Agent {
  return { id: session.id, session, ctx: new Context(), options: {}, status: 'idle',
    inbox: { nextTurn: [], nextStep: [], clear() {}, append() {}, prepend() {},
      replace: () => false, remove: () => false, splice: () => [] },
    send() {}, followup() {}, steer() {},
    inject() { throw new Error('Kernel must enter the current admitted batch') }, cancel() {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: () => Promise.resolve() }
}
async function setup(config: ScienceKernelOptions = options()) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(AgentRegistry)
  const fiber = await ctx.plugin({ name: 'test-science-kernel', apply: (child: Context) => { installScienceKernel(child, config) } })
  return { ctx, fiber, subject: agent() }
}
async function propose(
  ctx: Context, subject: Agent, messages: UserMessage[], signal = new AbortController().signal,
): Promise<PreStepDecision> {
  return agentEvents(ctx, subject).waterfall('agent/pre-step', { messages, signal, turn: 1, step: 1 },
    () => Promise.resolve({ kind: 'enter' as const, messages }))
}
function routed(decision: PreStepDecision): UserMessage | undefined {
  return decision.kind === 'enter' ? decision.messages.find(item => item.source.kind === 'science-routing') : undefined
}

it.each(domains)('routes English and Chinese scientific work in %s', (id, pattern, english) => {
  const chinese = pattern.split('|')[1]!
  for (const text of [`Analyze ${english} observations`, `分析${chinese}观测结果`]) {
    const selected = selectScienceRoutes([message(text)], rules)
    expect(selected?.routes).toContain(id)
    expect(selected?.domainNames).toContain(`domain-${id}`)
    expect(selected?.nativeNames).toEqual(['deepseek-science-analysis'])
  }
})

it('keeps conceptual, irrelevant and external material out of automatic workflow selection', () => {
  for (const text of ['What is statistical analysis in biology?', 'Explain neural network research', '请解释如何写一篇物理论文', 'Change the button color', 'Write a TypeScript function', 'Search hotels', 'Analyze frontend code', 'Hello']) {
    expect(selectScienceRoutes([message(text)], rules)).toBeUndefined()
  }
  expect(selectScienceRoutes([message('Can you explain biology research?')], rules)).toBeUndefined()
  expect(selectScienceRoutes([message('请帮我解释这项物理研究')], rules)).toBeUndefined()
  expect(selectScienceRoutes([createUserMessage({ content: [{ type: 'text', text: 'Write a biology paper' }], source: { kind: 'runtime-context' } })], rules)).toBeUndefined()
})

it('opens the route gate for Nature-only workflows in ordinary user language', () => {
  for (const text of [
    'Turn this screenshot into editable PowerPoint slides',
    'Create a paper card with its evidence chain',
    '请把这篇论文做成图文对应的中英文 reader',
    'Prepare a daily literature digest for my field',
    '帮我写一份基金申请研究计划书',
    '请把扫描版论文逐页翻译',
  ]) expect(selectScienceRoutes([message(text)], rules), text).toBeDefined()
})

it('retains non-writing scope and accepts a later explicit artifact request', () => {
  expect(selectScienceRoutes([message('Analyze biology results; do not write a paper')], rules)?.nativeNames).toEqual(['deepseek-science-analysis'])
  expect(selectScienceRoutes([message('What is biology? Then write a paper')], rules)?.nativeNames).toContain('deepseek-science-writing')
  expect(selectScienceRoutes([message('请自主完成一篇关于机器学习在物理观测中的应用的完整论文')], rules)?.nativeNames).toEqual(nativeNames)
  expect(selectScienceRoutes([message('Review this biology research paper')], rules)?.nativeNames).toEqual([])
})

it('selects ideation guidance without starting a full project for English and Chinese topic requests', () => {
  const ideationRules = [...rules, { id: 'ideation', patterns: ['idea|选题'], skills: ['research-brainstorming'] }]
  for (const text of ['Generate biology research ideas', 'Write three biology research ideas', '请给我几个物理学研究选题']) {
    const selected = selectScienceRoutes([message(text)], ideationRules)
    expect(selected?.domainNames).toContain('research-brainstorming')
    expect(selected?.nativeNames).toEqual([])
  }
  expect(selectScienceRoutes([message('Brainstorm birthday party ideas')], ideationRules)).toBeUndefined()
  expect(selectScienceRoutes([message('Write a biology paper about research ideas')], ideationRules)?.nativeNames).toEqual(nativeNames)
})

it('suppresses manuscript workflows and publication guidance for explicit non-writing requests', () => {
  const scopedRules = [...rules, { id: 'publication', patterns: ['paper|manuscript|论文'], skills: ['publication-writing'] }]
  for (const text of [
    'Research biology, but do not generate a manuscript',
    'Investigate quantum physics; no paper or manuscript',
    '请研究物理，只分析结果，不生成论文',
    'Analyze biology results; do not write a paper',
  ]) {
    const selected = selectScienceRoutes([message(text)], scopedRules)
    expect(selected).toBeDefined()
    expect(selected?.nativeNames).not.toContain('deepseek-science-writing')
    expect(selected?.routes).not.toContain('publication')
    expect(selected?.domainNames).not.toContain('publication-writing')
  }
})

it.each([
  '请把这份稿件排版成双栏，图表放页顶或页底',
  'Reformat this biology manuscript into two columns',
  'Compile this LaTeX manuscript',
  '不要重写论文，只做双栏排版',
  'Do not write a new paper; only typeset the existing manuscript',
])('routes formatting-only work without restarting research: %s', (text) => {
  const scopedRules = [...rules, {
    id: 'publication', patterns: ['稿件|论文|双栏|manuscript|latex|paper|typeset|reformat'], skills: ['publication-writing'],
  }]
  const selected = selectScienceRoutes([message(text)], scopedRules)
  expect(selected?.nativeNames).toEqual(['deepseek-science-writing'])
  expect(selected?.routes).toEqual(['publication'])
  expect(selected?.domainNames).toEqual(['publication-writing'])
})

it('keeps formatting questions conceptual and does not treat code formatting as a manuscript request', () => {
  expect(selectScienceRoutes([message('How should I typeset a two-column manuscript?')], rules)).toBeUndefined()
  expect(selectScienceRoutes([message('请解释双栏论文的排版规则')], rules)).toBeUndefined()
  expect(selectScienceRoutes([message('Reformat this TypeScript code')], rules)).toBeUndefined()
})

it('includes complete native and domain bodies on the first admitted request and deduplicates committed context', async () => {
  const { ctx, subject } = await setup()
  const first = await propose(ctx, subject, [message('Write a complete biology paper')])
  const injection = routed(first)
  expect(injection?.source).toMatchObject({ kind: 'science-routing', form: 'instructions', loadedNames: [...nativeNames, 'domain-life'], deferredNames: [] })
  expect(JSON.stringify(injection?.content)).toContain('Complete instructions for domain-life.')
  expect(subject.session.deriveMessages()).toEqual([])
  // Admission is the commit point; an uncommitted preparation cannot suppress a retry.
  expect(routed(await propose(ctx, subject, [message('Write a complete biology paper')]))).toBeDefined()
  subject.session.append('user/message', injection!, { surfaceOp: 'append' })
  expect(routed(await propose(ctx, subject, [message('Write a complete biology paper')]))).toBeUndefined()
  const resumed = agent(Session.create(SessionId('kernel-resumed'), subject.session.snapshotEvents()))
  expect(routed(await propose(ctx, resumed, [message('Write a complete biology paper')]))).toBeUndefined()
  expect(routed(await propose(ctx, subject, [message('Analyze chemistry observations')]))?.source).toMatchObject({ loadedNames: ['deepseek-science-analysis', 'domain-chemistry'] })
  expect(routed(await propose(ctx, subject, [message('Actually focus on physics instead')]))?.source).toMatchObject({ loadedNames: ['domain-physics'] })
})

it('preserves downstream messages and new-series decisions, and ignores rejected batches', async () => {
  const { ctx, subject } = await setup()
  const late = message('Analyze physics measurements')
  const stop = ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    return decision.kind === 'reject' ? decision : { ...decision, messages: [...decision.messages, late], startsRequestSeries: true }
  })
  const decision = await propose(ctx, subject, [message('hello')])
  expect(decision.kind === 'enter' && decision.startsRequestSeries).toBe(true)
  expect(decision.kind === 'enter' && decision.messages).toContain(late)
  expect(routed(decision)).toBeDefined()
  stop()
  ctx.on('agent/pre-step', () => Promise.resolve({ kind: 'reject' as const }))
  expect(await propose(ctx, subject, [message('Write a paper')])).toEqual({ kind: 'reject' })
})

it('reestablishes guidance when compaction removes its visible instructions', async () => {
  const { ctx, subject } = await setup()
  const injection = routed(await propose(ctx, subject, [message('Analyze biology data')]))!
  const initial = subject.session.append('user/message', injection, { surfaceOp: 'append' })
  subject.session.append('user/message', message('Compacted research history'), {
    surfaceOp: { op: 'replace', startSeq: initial.seq, endSeq: initial.seq }, sourceEventSeqs: [initial.seq],
  })
  expect(routed(await propose(ctx, subject, [message('Analyze biology data')]))).toBeDefined()
})

it('fits the entire message budget and defers oversized bodies without fragmenting instructions', async () => {
  const huge = 'WHOLE_BODY_MARKER'.repeat(1000)
  const config = options({ maxAutoSkills: 1, maxAutoChars: 4000 })
  const recipes = new Map(config.recipes)
  recipes.set('deepseek-science-analysis', recipe('deepseek-science-analysis', huge))
  const { ctx, subject } = await setup({ ...config, recipes })
  const injection = routed(await propose(ctx, subject, [message('Analyze biology data')]))!
  const text = injection.content.filter(block => block.type === 'text').map(block => block.text).join('')
  expect(text.length).toBeLessThanOrEqual(4000)
  expect(text).not.toContain('WHOLE_BODY_MARKER')
  expect(text).toContain('domain-life')
  expect(text).toContain('science_skills')
  expect(injection.source).toMatchObject({ loadedNames: ['domain-life'], deferredNames: ['deepseek-science-analysis'] })
  expect(renderScienceRouting([], [], []).length).toBeGreaterThan(0)
  const tiny = await setup(options({ maxAutoChars: 10 }))
  expect(routed(await propose(tiny.ctx, tiny.subject, [message('Analyze biology data')]))).toBeUndefined()
})

it('filters noninvocable and noncommercial candidates until the noncommercial pack is enabled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-kernel-nc-'))
  roots.push(root)
  await mkdir(join(root, 'nc'))
  const raw = '---\nname: nc-guide\ndescription: Noncommercial test\n---\n\nComplete permitted NC instructions.\n'
  await writeFile(join(root, 'nc', 'SKILL.md'), raw)
  const entry: ScienceCatalogEntry = { name: 'nc-guide', originalName: 'nc-guide', description: 'NC', source: { id: 'nc', repository: 'local', commit: 'a', path: 'SKILL.md', author: 'test', version: '1' },
    alternateSources: [], license: { declared: 'CC-BY-NC-4.0', redistribution: 'CC-BY-NC-4.0', files: [], noncommercial: true }, packs: ['academic-noncommercial'],
    invocation: { modelInvocable: true, userInvocable: true }, adaptation: { status: 'upstream', notes: '' }, readiness: { status: 'guidance-only', requirements: [], testedHere: false },
    skillPath: 'nc/SKILL.md', resourceDirectory: 'nc', files: ['nc/SKILL.md'], dependencies: [], digest: 'nc-digest', metadata: {} }
  const hidden = recipe('hidden')
  const config = options({ catalog: { ...catalog, assetRoot: root, files: { 'nc/SKILL.md': createHash('sha256').update(raw).digest('hex') }, entries: [entry, { ...entry, name: 'blocked', invocation: { modelInvocable: false, userInvocable: true } }] },
    recipes: new Map([['hidden', { ...hidden, invocation: { modelInvocable: false, userInvocable: true } }]]),
    routeRules: [{ id: 'nc', patterns: ['biology'], skills: ['nc-guide', 'blocked', 'hidden'] }] })
  const first = await setup(config)
  expect(routed(await propose(first.ctx, first.subject, [message('Analyze biology data')]))).toBeUndefined()
  const second = await setup({ ...config, enabledPacks: ['core', 'academic-noncommercial'] })
  expect(routed(await propose(second.ctx, second.subject, [message('Analyze biology data')]))?.source).toMatchObject({ selectedNames: ['nc-guide'], loadedNames: ['nc-guide'], deferredNames: [] })
})

it('does not publish aborted preparations and removes the listener on disposal', async () => {
  const { ctx, fiber, subject } = await setup()
  const cancellation = new AbortController()
  cancellation.abort(new Error('test canceled'))
  await expect(propose(ctx, subject, [message('Analyze biology data')], cancellation.signal)).rejects.toThrow('test canceled')
  expect(subject.session.deriveMessages()).toEqual([])
  expect(routed(await propose(ctx, subject, [message('Analyze biology data')]))).toBeDefined()
  await fiber.dispose()
  expect(routed(await propose(ctx, subject, [message('Analyze biology data')]))).toBeUndefined()
  const disabled = await setup(options({ enabled: false }))
  expect(routed(await propose(disabled.ctx, disabled.subject, [message('Analyze biology data')]))).toBeUndefined()
})

it('aborts an in-flight preparation when its plugin unloads without retaining a routing mark', async () => {
  const { ctx, fiber, subject } = await setup()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  ctx.on('agent/pre-step', async (_payload, next) => {
    entered.resolve(undefined)
    await release.promise
    return next()
  })
  const pending = propose(ctx, subject, [message('Analyze biology data')])
  const rejected = expect(pending).rejects.toThrow('Scientific routing plugin disposed')
  await entered.promise
  await fiber.dispose()
  release.resolve(undefined)
  await rejected
  expect(subject.session.deriveMessages()).toEqual([])
})
