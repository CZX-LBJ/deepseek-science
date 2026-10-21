/** Loader-mounted routing reaches the first frozen model request through durable Session events. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { readScienceCatalog } from '@deepseek-ai/dsh-skill-science'
import { afterEach, expect, it } from 'vitest'
import { installScienceKernel } from '../src/kernel.ts'
import { readNativeRecipes } from '../src/recipes.ts'

const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

class CaptureAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  async * stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(request)
    const text = 'Evidence checked.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

// Loader startup verifies the full 11,527-file catalog; allow Windows disk I/O.
it('boots routing through real Loader YAML, logs first-request guidance, deduplicates and disposes it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'science-kernel-loader-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  const adapter = new CaptureAdapter()
  let kernelContext: Context | undefined
  Object.assign(ctx.loader.builtins, {
    include: Include, 'kernel-session': SessionStore, 'kernel-projections': SessionProjectionRegistry,
    'kernel-prompt': SystemPrompt, 'kernel-tools': ToolRuntime, 'kernel-agents': AgentRegistry,
    'kernel-llm': LlmRuntime, 'kernel-loop': AgentLoop,
    'kernel-adapter': { name: 'kernel-adapter', inject: ['llm'], apply(child: Context) { child.llm.registerAdapter(['kernel-test'], adapter) } },
    'kernel-consumer': { name: 'kernel-consumer', inject: ['agents'], apply(child: Context) {
      kernelContext = child
      installScienceKernel(child, {
        enabled: true, catalog: readScienceCatalog(), recipes: new Map(readNativeRecipes().map(recipe => [recipe.name, recipe])),
        enabledPacks: ['core', 'ai', 'nature'], maxAutoSkills: 8, maxAutoChars: 200000,
        routeRules: [{ id: 'biology', patterns: ['biology|生物'], skills: ['nature-polishing'] }],
      })
    } },
  })
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- name: cordis:kernel-session', '- name: cordis:kernel-projections', '- name: cordis:kernel-prompt',
    '- name: cordis:kernel-tools', '- name: cordis:kernel-agents', '- name: cordis:kernel-llm',
    '- name: cordis:kernel-adapter', '- name: cordis:kernel-loop', '  config: { agents: [] }', '- name: cordis:kernel-consumer', '',
  ].join('\n'))
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  const subject = await ctx.agentLoop.create(SessionId('science-kernel-composition'), { provider: 'kernel-test', model: 'kernel-test' })
  const followup = async (text: string) => {
    subject.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await subject.whenIdle()
  }
  const cancelPreparation = ctx.on('agent/request', async ({ agent }, next) => {
    agent.cancel({ kind: 'user' })
    return next()
  })
  await followup('Write a complete biology paper')
  expect(adapter.requests).toHaveLength(0)
  expect(subject.session.snapshotEvents().filter(event => event.type === 'user/message')).toHaveLength(0)
  cancelPreparation()
  await followup('Write a complete biology paper')
  expect(adapter.requests).toHaveLength(1)
  const request = adapter.requests[0]!
  expect(Object.isFrozen(request.messages)).toBe(true)
  const guidance = subject.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'science-routing')
  expect(guidance).toHaveLength(1)
  const first = guidance[0]!
  if (first.type !== 'user/message') throw new Error('Expected logged guidance')
  expect(first.surfaceOp).toBe('append')
  expect(first.data.source).toMatchObject({ kind: 'science-routing', loadedNames: expect.arrayContaining([
    'nature-writing', 'nature-statistics',
    'deepseek-science-literature', 'deepseek-science-analysis', 'deepseek-science-writing',
  ]) })
  expect(request.messages.some(message => message.role === 'user' && message.content === first.data.content)).toBe(true)
  const header = subject.session.snapshotEvents().find(event => event.type === 'request/header')
  expect(header!.seq).toBeGreaterThan(first.seq)
  expect(JSON.stringify(request.messages)).toContain('<skill_content name=')
  await followup('Write a complete biology paper')
  expect(subject.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'science-routing')).toHaveLength(1)
  await kernelContext!.fiber.dispose()
  await followup('Analyze physics measurements')
  expect(adapter.requests).toHaveLength(3)
  expect(subject.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'science-routing')).toHaveLength(1)
}, 30_000)
