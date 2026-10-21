import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import ScienceProjects from '@deepseek-ai/dsh-science-project'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import LiteratureService from '@deepseek-ai/dsh-science-literature'
import LlmRuntime, { LlmAdapter, ToolCallId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it } from 'vitest'
import * as ToolScience from '../src/index.ts'

const contexts: Context[] = []
const roots: string[] = []
class ScientificCaptureAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  async * stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(request)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Captured scientific guidance.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function composition() {
  const root = await mkdtemp(join(tmpdir(), 'science-tool-composition-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  const adapter = new ScientificCaptureAdapter()
  Object.assign(ctx.loader.builtins, {
    include: Include, 'science-test-agents': AgentRegistry, 'science-test-fs': LocalFileSystem, 'science-test-prompt': SystemPrompt,
    'science-test-tools': ToolRuntime, 'science-test-session': SessionStore,
    'science-test-projection': SessionProjectionRegistry, 'science-test-policy': SandboxPolicy,
    'science-test-project': ScienceProjects, 'science-test-literature': LiteratureService,
    'science-test-consumer': ToolScience, 'science-test-skills': SkillRegistry,
    'science-test-llm': LlmRuntime, 'science-test-loop': AgentLoop,
    'science-test-adapter': { name: 'science-test-adapter', inject: ['llm'], apply(child: Context) { child.llm.registerAdapter(['science-kernel-product'], adapter) } },
  })
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- name: cordis:science-test-fs', `  config: { cwd: ${JSON.stringify(root)} }`,
    '- name: cordis:science-test-prompt', '- name: cordis:science-test-tools',
    '- name: cordis:science-test-session', '- name: cordis:science-test-projection', '- name: cordis:science-test-agents',
    '- name: cordis:science-test-policy', `  config: { mode: workspace-write, workspaceRoot: ${JSON.stringify(root)} }`,
    '- name: cordis:science-test-project', '- name: cordis:science-test-literature', '- name: cordis:science-test-skills',
    '- name: cordis:science-test-llm', '- name: cordis:science-test-adapter', '- name: cordis:science-test-loop', '  config: { agents: [] }',
    '- name: cordis:science-test-consumer', `  config: { workspaceRoot: ${JSON.stringify(root)} }`, '',
  ].join('\n'))
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return { ctx, root, adapter }
}
async function call(ctx: Context, name: string, args: unknown) {
  return ctx.tools.execute({ name, callId: ToolCallId(`science-${Math.random()}`), arguments: args, signal: new AbortController().signal })
}

it('loads a real composition and executes checkpointed project tools', async () => {
  const { ctx, root } = await composition()
  expect(ctx.tools.get('science_project')).toBeDefined()
  const created = await call(ctx, 'science_project', { action: 'create', title: 'Measured study', objective: 'Audit actual results' })
  expect(created.isError, JSON.stringify(created)).toBe(false)
  expect(created.meta).toMatchObject({ kind: 'science', version: 1 })
  const project = ToolScience.scienceProjectionSchema.parse(ToolScience.scienceSnapshotFromMeta(created.meta)).project
  expect(project).not.toBeNull()
  await writeFile(join(root, 'question.md'), 'Actual question\n')
  const checked = await call(ctx, 'science_project', {
    action: 'checkpoint', project_id: project!.id, revision: project!.revision, summary: 'Question framed', paths: ['question.md'],
  })
  expect(checked.isError).toBe(false)
  const state = ToolScience.scienceProjectionSchema.parse(ToolScience.scienceSnapshotFromMeta(checked.meta)).project
  expect(state?.phases[0]?.status).toBe('checkpointed')
  const stale = await call(ctx, 'science_project', { action: 'advance', project_id: project!.id, revision: project!.revision })
  expect(stale.isError).toBe(true)
})

it('searches and explicitly loads real embedded skill resources with source metadata', async () => {
  const { ctx } = await composition()
  const found = await call(ctx, 'science_skills', { action: 'search', query: 'nature-polishing', limit: 3 })
  expect(found.isError, JSON.stringify(found)).toBe(false)
  expect(found.content.some(block => block.type === 'text' && block.text.includes('nature-polishing'))).toBe(true)
  const loaded = await call(ctx, 'science_skills', { action: 'load', name: 'nature-polishing' })
  expect(loaded.isError).toBe(false)
  expect(loaded.content.some(block => block.type === 'text' && block.text.includes('skill_content'))).toBe(true)
  expect((await call(ctx, 'science_skills', { action: 'load', name: 'nature-shared' })).isError).toBe(true)
  expect((await call(ctx, 'science_skills', { action: 'load', name: 'academic-pipeline' })).isError).toBe(true)
  const local = await call(ctx, 'science_skills', { action: 'search', packs: ['native'], limit: 3 })
  expect(local.isError).toBe(false)
  expect(local.content.some(block => block.type === 'text' && block.text.includes('deepseek-science-analysis'))).toBe(true)
  const recipe = await call(ctx, 'science_skills', { action: 'load', name: 'deepseek-science-analysis' })
  expect(recipe.isError).toBe(false)
  expect(recipe.content.some(block => block.type === 'text' && block.text.includes('analyze_csv.py'))).toBe(true)
  expect((await ctx.skills.list()).map(skill => skill.name)).toContain('deepseek-science-writing')
})

it('reports malformed actions and prevents workspace escape on exports', async () => {
  const { ctx } = await composition()
  expect((await call(ctx, 'science_project', { action: 'create' })).isError).toBe(true)
  expect((await call(ctx, 'science_literature', { action: 'export', ref: '../private.json', file_path: 'papers.bib', format: 'bibtex' })).isError).toBe(true)
})

it('automatically supplies complete biological and LaTeX guidance on the first ordinary-language research request', async () => {
  const { ctx, adapter } = await composition()
  const agent = await ctx.agentLoop.create(SessionId('science-kernel-product'), { provider: 'science-kernel-product', model: 'capture' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '请研究单细胞转录组的批次效应，完成一篇完整生物学论文。' }] }))
  await agent.whenIdle()
  expect(adapter.requests).toHaveLength(1)
  const request = adapter.requests[0]!
  expect(JSON.stringify(request.messages.filter(message => message.role === 'system'))).toContain('LaTeX is the required delivery format')
  expect(JSON.stringify(request.messages.filter(message => message.role === 'system'))).toContain('professional two-column journal article')
  expect(JSON.stringify(request.messages.filter(message => message.role === 'system'))).toContain("column's top or bottom")
  expect(JSON.stringify(request.messages.filter(message => message.role === 'system'))).toContain('math_commands.tex')
  expect(JSON.stringify(request.messages.filter(message => message.role === 'system'))).toContain('IEEEtran[journal]')
  const event = agent.session.snapshotEvents().find(item => item.type === 'user/message' && item.data.source.kind === 'science-routing')
  if (event?.type !== 'user/message' || event.data.source.kind !== 'science-routing') throw new Error('Automatic scientific guidance was not durably logged')
  expect(event.data.source.loadedNames).toContain('deepseek-science-writing')
  expect(event.data.source.loadedNames).toContain('nature-writing')
  expect(event.data.source.loadedNames).toContain('nature-statistics')
  expect(event.data.source.loadedNames).toContain('scientific-agent-skills-experimental-design')
  const content = JSON.stringify(event.data.content)
  expect(content).toContain('publication.py')
  expect(content).toContain('<skill_content name=')
  expect(request.messages.some(message => message.role === 'user' && message.content === event.data.content)).toBe(true)
  expect({ kind: event.data.source.kind, loadedNames: event.data.source.loadedNames }).toMatchInlineSnapshot(`
    {
      "kind": "science-routing",
      "loadedNames": [
        "nature-writing",
        "nature-statistics",
        "deepseek-science-literature",
        "deepseek-science-analysis",
        "deepseek-science-writing",
        "scientific-agent-skills-experimental-design",
        "scientific-agent-skills-genomic-coordinates",
        "scientific-agent-skills-scikit-bio",
      ],
    }
  `)
})
