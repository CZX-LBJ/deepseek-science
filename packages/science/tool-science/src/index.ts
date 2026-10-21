/** Scientific model tools over the existing filesystem, literature and project services. */
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-science-literature'
import type { Paper } from '@deepseek-ai/dsh-science-literature'
import { toBibTeX, toCSV } from '@deepseek-ai/dsh-science-literature'
import { ScienceProjectId } from '@deepseek-ai/dsh-science-project'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { renderSkillContent } from '@deepseek-ai/dsh-skill'
import { readScienceCatalog, searchScienceCatalog, inspectScienceSkill, loadScienceSkill } from '@deepseek-ai/dsh-skill-science'
import type { ScienceCatalogEntry } from '@deepseek-ai/dsh-skill-science'
import { isJsonValue, snapshotJsonValue } from '@deepseek-ai/dsh-util-values'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { initialScienceState, scienceProjection, scienceProjectionSchema } from './projection.ts'
import { readNativeRecipes } from './recipes.ts'
import { installScienceKernel } from './kernel.ts'
import type { ScienceProjection, ScienceSkillView } from './types.ts'

export { scienceProjectionSchema } from './projection.ts'
export type * from './types.ts'

/** Scientific tool plugin identity. */
export const name = 'tool-science'
/** Complete capability set needed by scientific operations. */
export const inject = ['agents', 'tools', 'fs', 'skills', 'sandboxPolicy', 'systemPrompt', 'sessionProjections', 'scienceProjects', 'scienceLiterature']
/** Rendering budgets and packaged skill selection. */
export interface Config {
  /** Optional absolute directory for upstream skill assets. */
  assetRoot?: string
  /** Upstream pack selection and explicit noncommercial activation. */
  enabledPacks?: string[]
  /** Workspace for calls without an owning agent. */
  workspaceRoot?: string
  /** Rendered character budget for ordinary scientific results. */
  maxResultChars?: number
  /** Maximum complete instruction body characters. */
  maxSkillChars?: number
  /** Complete cached search record input byte budget. */
  maxExportBytes?: number
  /** Maximum entries returned by one skill search. */
  maxSearchSkills?: number
  /** Complete result, content and presentation metadata byte budget. */
  maxRetainedBytes?: number
  /** Advertise and load the three locally maintained workflows. */
  enableNativeRecipes?: boolean
  /** Automatically select full scientific guidance from explicit user research requests. */
  enableAutomaticGuidance?: boolean
  /** Maximum complete native and upstream bodies admitted per automatic routing message. Defaults to 8. */
  maxAutoSkills?: number
  /** Complete automatic guidance message character budget, including its shortlist. Defaults to 200000. */
  maxAutoChars?: number
}
/** Validated scientific tool configuration. */
export const Config: z<Config> = z.object({
  assetRoot: z.string(), enabledPacks: z.array(z.string()).default(['core', 'ai', 'nature']), workspaceRoot: z.string(),
  maxResultChars: z.natural().min(200).default(24000), maxSkillChars: z.natural().min(200).default(200000),
  maxExportBytes: z.natural().min(1).default(4 * 1024 * 1024), maxSearchSkills: z.natural().min(1).max(100).default(40),
  maxRetainedBytes: z.natural().min(1).default(8 * 1024 * 1024),
  enableNativeRecipes: z.boolean().default(true),
  enableAutomaticGuidance: z.boolean().default(true),
  maxAutoSkills: z.natural().min(1).max(20).default(8),
  maxAutoChars: z.natural().min(2000).max(200000).default(200000),
})

const kernelPolicy = readFileSync(new URL('../assets/kernel/policy.md', import.meta.url), 'utf8')
const routingRules = zod.array(zod.object({
  id: zod.string().regex(/^[a-z][a-z0-9-]*$/), patterns: zod.array(zod.string().min(1)).min(1),
  skills: zod.array(zod.string().regex(/^[a-z0-9][a-z0-9-]*$/)).min(1),
})).refine(rules => new Set(rules.map(rule => rule.id)).size === rules.length, 'Duplicate science route id')
  .parse(JSON.parse(readFileSync(new URL('../assets/kernel/routes.json', import.meta.url), 'utf8')))

const OUTPUT = {
  type: 'object', additionalProperties: false, properties: {
    kind: { type: 'string', enum: ['project', 'literature', 'skills'], required: true },
    action: { type: 'string', required: true }, result: { type: 'json', required: true }, snapshot: { type: 'json', required: true },
  },
} as const
const paperSchema = zod.object({
  id: zod.string().min(1), title: zod.string().min(1), authors: zod.array(zod.string()), year: zod.number().int().optional(),
  venue: zod.string().optional(), doi: zod.string().optional(), arxivId: zod.string().optional(),
  arxivBaseId: zod.string().optional(), openalexId: zod.string().optional(),
  abstract: zod.string().optional(), url: zod.string().optional(),
  sources: zod.array(zod.string()), retrievedAt: zod.string(),
  fullTextLocations: zod.array(zod.object({ url: zod.string(), format: zod.enum(['pdf', 'html', 'unknown']), source: zod.string(), access: zod.literal('open'), license: zod.string().optional() })),
  conflicts: zod.array(zod.object({ field: zod.string(), values: zod.array(zod.string()) })),
}).transform((paper): Paper => ({
  id: paper.id, title: paper.title, authors: paper.authors, sources: paper.sources, retrievedAt: paper.retrievedAt,
  conflicts: paper.conflicts,
  fullTextLocations: paper.fullTextLocations.map(location => ({
    url: location.url, format: location.format, source: location.source, access: location.access,
    ...location.license === undefined ? {} : { license: location.license },
  })),
  ...paper.year === undefined ? {} : { year: paper.year }, ...paper.venue === undefined ? {} : { venue: paper.venue },
  ...paper.doi === undefined ? {} : { doi: paper.doi }, ...paper.arxivId === undefined ? {} : { arxivId: paper.arxivId },
  ...paper.arxivBaseId === undefined ? {} : { arxivBaseId: paper.arxivBaseId },
  ...paper.openalexId === undefined ? {} : { openalexId: paper.openalexId },
  ...paper.abstract === undefined ? {} : { abstract: paper.abstract }, ...paper.url === undefined ? {} : { url: paper.url },
}))

function json(value: unknown): JsonValue {
  const detached = snapshotJsonValue(value)
  if (!isJsonValue(detached)) throw new HarnessError('Scientific result is not lossless JSON', 'SCIENCE_INVALID_RESULT')
  return detached as JsonValue
}
function required(value: string | undefined, field: string): string {
  if (value === undefined || value.trim().length === 0) throw new HarnessError(`${field} is required for this action`, 'SCIENCE_INVALID_ARGUMENT')
  return value
}
function revision(value: number | undefined): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) throw new HarnessError('revision must name the current positive project revision', 'SCIENCE_INVALID_ARGUMENT')
  return value
}
function skillView(catalogRoot: string, entry: ScienceCatalogEntry): ScienceSkillView {
  return { name: entry.name, description: entry.description, source: entry.source.id, license: entry.license.declared,
    status: entry.readiness.status, requirements: [...entry.readiness.requirements], path: join(catalogRoot, entry.skillPath) }
}

/** Read a schema-validated snapshot from this plugin's persisted tool metadata.
 * @param meta - opaque durable tool metadata.
 * @returns the scientific view, or undefined for unrelated or malformed metadata.
 */
export function scienceSnapshotFromMeta(meta: unknown): ScienceProjection | undefined {
  const parsed = zod.object({ kind: zod.literal('science'), version: zod.literal(1), snapshot: scienceProjectionSchema }).safeParse(meta)
  return parsed.success ? parsed.data.snapshot : undefined
}

/** Register stable tool schemas, source catalog loading and the scientific Session fold.
 * @param ctx - composed scientific services and the existing model tool registry.
 * @param config - skill assets, optional agentless workspace and rendering limits.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = Config(config)
  const catalog = readScienceCatalog(resolved.assetRoot)
  const recipes = new Map((resolved.enableNativeRecipes ? readNativeRecipes() : []).map(recipe => [recipe.name, recipe]))
  for (const recipe of recipes.values()) ctx.skills.register(recipe)
  const recipeView = (name: string): ScienceSkillView => {
    const recipe = recipes.get(name)
    if (recipe === undefined) throw new HarnessError('Native recipe was not found', 'SCIENCE_SKILL_NOT_FOUND')
    return { name, description: recipe.description, source: 'deepseek-science', license: 'MIT', status: 'guidance-only',
      requirements: name.endsWith('analysis') ? ['Python 3', 'Matplotlib for plotting']
        : name.endsWith('writing') ? ['Python 3', 'A LaTeX engine for PDF compilation'] : ['science_literature'], path: recipe.path ?? null }
  }
  const enabledPacks = resolved.enabledPacks ?? catalog.defaultPacks
  const maxChars = resolved.maxResultChars ?? 24000
  const maxSkillChars = resolved.maxSkillChars ?? 200000
  const maxExportBytes = resolved.maxExportBytes ?? 4 * 1024 * 1024
  const maxSkills = resolved.maxSearchSkills ?? 40
  ctx.sessionProjections.register(scienceProjection)
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'science:workflow', order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW') + 1, text: kernelPolicy,
  }), 'science.kernel.policy()')
  installScienceKernel(ctx, {
    catalog, recipes, enabledPacks, enabled: resolved.enableAutomaticGuidance ?? true,
    maxAutoSkills: resolved.maxAutoSkills ?? 8, maxAutoChars: resolved.maxAutoChars ?? 200000, routeRules: routingRules,
  })
  const cwdFor = (exec: ToolRunContext): string => required(exec.agent?.session.header.cwd ?? resolved.workspaceRoot, 'session workspace')
  const policyFor = (exec: ToolRunContext) => ctx.sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
  const viewFor = (exec: ToolRunContext): ScienceProjection => exec.agent === undefined
    ? initialScienceState().view : (ctx.sessionProjections.stateOf(exec.agent.session, 'science')?.view ?? initialScienceState().view)
  const output = (kind: 'project' | 'literature' | 'skills', action: string, value: unknown, snapshot: ScienceProjection) => {
    const result = { kind, action, result: json(value), snapshot: json(snapshot) }
    const retained = { result, content: render(undefined, result), meta: { kind: 'science', version: 1, snapshot: result.snapshot } }
    if (Buffer.byteLength(JSON.stringify(retained)) > (resolved.maxRetainedBytes ?? 8 * 1024 * 1024)) {
      throw new HarnessError('Scientific result exceeds maxRetainedBytes; request fewer papers or shorter excerpts', 'SCIENCE_RESULT_TOO_LARGE')
    }
    return result
  }
  const render = (_args: unknown, value: { action: string; result: JsonValue }) => {
    let text: string
    if (value.action === 'load' && typeof value.result === 'object' && value.result !== null && !Array.isArray(value.result)
      && typeof value.result.instructions === 'string') text = value.result.instructions
    else text = JSON.stringify(value.result, null, 2)
    if (value.action !== 'load' && text.length > maxChars) {
      const marker = '\n[Result clipped. Use the reported cachePath or inspect one entry for the full saved record.]'
      text = text.slice(0, Math.max(0, maxChars - marker.length)) + marker
    }
    return [{ type: 'text' as const, text }]
  }
  const metadata = (_args: unknown, value: { snapshot: JsonValue }): JsonValue => ({ kind: 'science', version: 1, snapshot: value.snapshot })

  ctx.tools.register(defineTool({
    name: 'science_project', description: 'Persist a research project, checkpoint real deliverables and locator-bearing evidence, advance verified stages, or inspect/resume interrupted work. Never executes an experiment or repeats external jobs by itself.',
    parameters: {
      action: { type: 'string', enum: ['create', 'status', 'start', 'checkpoint', 'advance', 'skip', 'resume', 'reopen'], required: true },
      phase: { type: 'string', enum: ['question', 'literature', 'design', 'analysis', 'claims', 'writing', 'review', 'delivery'] },
      title: { type: 'string' }, objective: { type: 'string' }, project_id: { type: 'string' }, revision: { type: 'integer' },
      summary: { type: 'string' }, reason: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } },
      evidence: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        claim: { type: 'string', required: true }, artifact: { type: 'string', required: true }, locator: { type: 'string', required: true },
        quote: { type: 'string', required: true },
        support: { type: 'string', enum: ['supported', 'partial', 'unsupported'], required: true },
        depth: { type: 'string', enum: ['full-text', 'abstract-only', 'experiment'], required: true },
      } } },
    },
    output: { schema: OUTPUT, render, presentationMeta: metadata },
    async execute(args, exec) {
      const cwd = cwdFor(exec)
      const options = { signal: exec.signal, sandboxPolicy: policyFor(exec) }
      const service = ctx.scienceProjects
      const project = args.action === 'create'
        ? await service.create(cwd, { title: required(args.title, 'title'), objective: required(args.objective, 'objective') }, options)
        : await (async () => {
          const id = ScienceProjectId(required(args.project_id, 'project_id'))
          switch (args.action) {
            case 'status': return service.get(cwd, id, exec.signal)
            case 'start': return service.start(cwd, id, revision(args.revision), options)
            case 'checkpoint': return service.checkpoint(cwd, id, revision(args.revision), {
              summary: required(args.summary, 'summary'), paths: args.paths ?? [], evidence: args.evidence ?? [],
            }, options)
            case 'advance': return service.advance(cwd, id, revision(args.revision), options)
            case 'skip': return service.skip(cwd, id, revision(args.revision), required(args.reason, 'reason'), options)
            case 'resume': return service.resume(cwd, id, revision(args.revision), options)
            case 'reopen': {
              if (args.phase === undefined) throw new HarnessError('phase is required to reopen', 'SCIENCE_INVALID_ARGUMENT')
              return service.reopen(cwd, id, revision(args.revision), args.phase, required(args.reason, 'reason'), options)
            }
            default: throw new HarnessError('Unknown project action', 'SCIENCE_INVALID_ARGUMENT')
          }
        })()
      return output('project', args.action, project, { ...viewFor(exec), project })
    },
    presentCall: args => ({ card: 'generic', title: `Research ${args.action}` }),
  }))

  ctx.tools.register(defineTool({
    name: 'science_skills', description: 'Search the complete embedded research skill library, inspect source/license/prerequisites, report available capabilities, or explicitly load one permitted skill. Presence is distinct from tested runtime readiness.',
    parameters: {
      action: { type: 'string', enum: ['search', 'inspect', 'doctor', 'load'], required: true },
      query: { type: 'string' }, name: { type: 'string' }, packs: { type: 'array', items: { type: 'string' } }, limit: { type: 'integer' },
    },
    output: { schema: OUTPUT, render, presentationMeta: metadata },
    async execute(args, exec) {
      const limit = args.limit ?? Math.min(20, maxSkills)
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxSkills) throw new HarnessError(`limit must be between 1 and ${maxSkills}`, 'SCIENCE_INVALID_ARGUMENT')
      let entries: ScienceCatalogEntry[]
      let localViews: ScienceSkillView[] = []
      let result: unknown
      if (args.action === 'load') {
        const name = required(args.name, 'name')
        const skill = recipes.get(name) ?? await loadScienceSkill(catalog, name, { enabledPacks, invocation: 'model', signal: exec.signal })
        if (skill === undefined) throw new HarnessError(`Unknown embedded research skill ${JSON.stringify(name)}`, 'SCIENCE_SKILL_NOT_FOUND')
        const instructions = renderSkillContent(skill)
        if (instructions.length > maxSkillChars) throw new HarnessError(`Skill exceeds maxSkillChars; read its instruction file in sections: ${skill.path}`, 'SCIENCE_SKILL_TOO_LARGE')
        const entry = inspectScienceSkill(catalog, name)
        entries = entry === undefined ? [] : [entry]
        if (recipes.has(name)) localViews = [recipeView(name)]
        result = { name, instructions, path: skill.path ?? null, source: entry?.source ?? null }
      } else if (args.action === 'inspect') {
        const name = required(args.name, 'name')
        const entry = inspectScienceSkill(catalog, name)
        if (recipes.has(name)) { entries = []; localViews = [recipeView(name)]; result = { ...recipeView(name), firstParty: true } }
        else {
          if (entry === undefined) throw new HarnessError('Embedded research skill was not found', 'SCIENCE_SKILL_NOT_FOUND')
          entries = [entry]
          result = entry
        }
      } else {
        exec.signal.throwIfAborted()
        const query = (args.query ?? '').toLowerCase()
        localViews = args.packs === undefined || args.packs.includes('native')
          ? [...recipes.values()].filter(recipe => `${recipe.name} ${recipe.description}`.toLowerCase().includes(query)).map(recipe => recipeView(recipe.name)).slice(0, limit)
          : []
        const packs = args.packs?.filter(pack => pack !== 'native')
        entries = packs?.length === 0 ? [] : searchScienceCatalog(catalog, args.query ?? '', {
          limit: Math.max(1, limit - localViews.length), ...packs === undefined ? {} : { packs },
        }).slice(0, limit - localViews.length)
        result = args.action === 'doctor'
          ? { embedded: catalog.entries.length, nativeRecipes: recipes.size, enabledPacks, exclusions: catalog.excluded.length,
            capabilities: ['read', 'write', 'bash', 'pwsh', 'science_literature', 'science_project'].map(name => ({ name, available: ctx.tools.get(name, exec.agent) !== undefined })),
            skills: [...localViews, ...entries.map(entry => skillView(catalog.assetRoot, entry))], note: 'Upstream procedures and optional packages require their own setup and execution checks.' }
          : { totalEmbedded: catalog.entries.length, nativeRecipes: recipes.size,
            skills: [...localViews, ...entries.map(entry => skillView(catalog.assetRoot, entry))],
            more: entries.length === limit }
      }
      return output('skills', args.action, result, { ...viewFor(exec), skills: [...localViews, ...entries.map(entry => skillView(catalog.assetRoot, entry))] })
    },
    presentCall: args => ({ card: 'generic', title: `Research skills ${args.action}` }),
  }))

  ctx.tools.register(defineTool({
    name: 'science_literature', description: 'Search arXiv/OpenAlex with per-source reports, read exact versions or local papers with locators, verify DOI bibliographic metadata using Crossref, and export papers from saved search cache JSON. Full-text and abstract-only readings remain distinct.',
    parameters: {
      action: { type: 'string', enum: ['search', 'read', 'verify', 'export'], required: true }, query: { type: 'string' }, ref: { type: 'string' },
      sources: { type: 'array', items: { type: 'string', enum: ['arxiv', 'openalex'] } }, limit: { type: 'integer' },
      since: { type: 'integer' }, until: { type: 'integer' }, pages: { type: 'array', items: { type: 'integer' } },
      max_chars: { type: 'integer' }, title: { type: 'string' }, year: { type: 'integer' },
      file_path: { type: 'string' }, format: { type: 'string', enum: ['bibtex', 'csv'] },
    },
    output: { schema: OUTPUT, render, presentationMeta: metadata },
    async execute(args, exec) {
      const cwd = cwdFor(exec)
      const policy = policyFor(exec)
      const cache = policy.mode === 'read-only' ? undefined : { cwd, sandboxPolicy: policy }
      const cacheOptions = cache === undefined ? {} : { cache }
      const view = viewFor(exec)
      switch (args.action) {
        case 'search': {
          const result = await ctx.scienceLiterature.search(required(args.query, 'query'), {
            ...cacheOptions, ...args.sources === undefined ? {} : { sources: args.sources },
            ...args.limit === undefined ? {} : { limit: args.limit },
            ...args.since === undefined ? {} : { since: args.since }, ...args.until === undefined ? {} : { until: args.until },
          }, exec.signal)
          return output('literature', args.action, result, { ...view,
            papers: result.papers.map(paper => ({ id: paper.id, title: paper.title, url: paper.url ?? '', doi: paper.doi ?? null, arxivId: paper.arxivId ?? null, year: paper.year ?? null })),
            sources: result.sources.map(source => ({ source: source.source, status: source.status,
              count: source.count, error: source.error ?? null })),
          })
        }
        case 'read': {
          const result = await ctx.scienceLiterature.read(required(args.ref, 'ref'), {
            cwd, ...cacheOptions, ...args.pages === undefined ? {} : { pages: args.pages },
            ...args.query === undefined ? {} : { query: args.query }, ...args.max_chars === undefined ? {} : { maxChars: args.max_chars },
          }, exec.signal)
          return output('literature', args.action, result, { ...view, reading: {
            ref: result.ref, depth: result.depth, status: result.status, cachePath: result.evidencePath ?? result.cachePath ?? null,
            excerpts: result.excerpts.map(excerpt => ({ locator: excerpt.locator, text: excerpt.text })),
          } })
        }
        case 'verify': {
          const result = await ctx.scienceLiterature.verify(required(args.ref, 'ref'), {
            ...cacheOptions, ...args.title === undefined ? {} : { title: args.title },
            ...args.year === undefined ? {} : { year: args.year },
          }, exec.signal)
          return output('literature', args.action, result, { ...view, sources: [{ source: result.source.source, status: result.source.status, count: result.source.count, error: result.source.error ?? null }] })
        }
        case 'export': {
          const root = await ctx.fs.resolve(cwd, { signal: exec.signal })
          const source = await ctx.fs.resolve(required(args.ref, 'ref'), { cwd, signal: exec.signal })
          const target = await ctx.fs.resolve(required(args.file_path, 'file_path'), { cwd, signal: exec.signal })
          if (!ctx.fs.contains(root, source) || !ctx.fs.contains(root, target)) throw new HarnessError('Literature exports must stay in the session workspace', 'SCIENCE_OUTSIDE_WORKSPACE')
          if (policy.mode === 'read-only') throw new HarnessError('Literature export is unavailable in read-only mode', 'SCIENCE_EXPORT_DENIED')
          const bytes = await ctx.fs.readBytes(source, exec.signal, maxExportBytes)
          const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
          const papers = zod.object({ kind: zod.literal('search'), result: zod.object({ papers: zod.array(paperSchema).max(100) }) }).parse(raw).result.papers
          if (args.format === undefined) throw new HarnessError('format is required for export', 'SCIENCE_INVALID_ARGUMENT')
          const content = args.format === 'bibtex' ? toBibTeX(papers) : toCSV(papers)
          const intent = await ctx.waterfall('fs/write-intent', target, exec, () => undefined)
          const saved = await ctx.fs.writeText(target, content, intent, exec.signal, policy)
          ctx.emit('fs/observed', target, { kind: 'present', version: saved.version }, exec)
          return output('literature', args.action, { path: target.displayPath, format: args.format, count: papers.length }, view)
        }
        default: throw new HarnessError('Unknown literature action', 'SCIENCE_INVALID_ARGUMENT')
      }
    },
    presentCall: args => ({ card: 'generic', title: `Literature ${args.action}` }),
  }))
}
