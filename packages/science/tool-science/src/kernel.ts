/** Automatic, logged scientific guidance selected from trusted user requests. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { isModelInvocable, renderSkillContent } from '@deepseek-ai/dsh-skill'
import type { SkillDefinition } from '@deepseek-ai/dsh-skill'
import { loadScienceSkill } from '@deepseek-ai/dsh-skill-science'
import type { ScienceCatalog, ScienceCatalogEntry } from '@deepseek-ai/dsh-skill-science'
import { matchesNatureGuidanceRequest, renderNatureGuidance, resolveNatureGuidance } from './nature-guidance.ts'

/** Ordered bilingual demand patterns and their embedded instruction candidates. */
export interface ScienceRoutingRule {
  /** Stable route identity retained in routing decisions. */
  readonly id: string
  /** Case-insensitive Unicode regular-expression sources, matched with OR. */
  readonly patterns: readonly string[]
  /** Ordered public skill names; native names are also accepted. */
  readonly skills: readonly string[]
}

/** Scientific guidance selected for one explicit research operation. */
export interface ScienceRoutingSelection {
  readonly routes: readonly string[]
  readonly nativeNames: readonly string[]
  readonly domainNames: readonly string[]
}

/** A full instruction block and its already-resolved resource location. */
export interface ScienceRoutingBody {
  readonly name: string
  readonly instructions: string
}

/** Durable automatic routing identity; this is not a user-explicit skill invocation. */
export interface ScienceRoutingSource {
  readonly kind: 'science-routing'
  readonly form: 'instructions'
  readonly routeKey: string
  readonly contentDigest: string
  readonly selectedNames: readonly string[]
  readonly loadedNames: readonly string[]
  readonly deferredNames: readonly string[]
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Guidance attribution; readers preserve the text without this producer.
     * The producer reads its metadata only to suppress repeated guidance.
     * @persistenceAttribution
     */
    'science-routing': ScienceRoutingSource
  }
}

/** Plugin-owned assets and deployment budgets for automatic guidance. */
export interface ScienceKernelOptions {
  readonly catalog: ScienceCatalog
  readonly recipes: ReadonlyMap<string, SkillDefinition>
  readonly enabledPacks: readonly string[]
  readonly enabled: boolean
  readonly maxAutoSkills: number
  readonly maxAutoChars: number
  readonly routeRules: readonly ScienceRoutingRule[]
}

interface RoutingCandidate {
  readonly name: string
  readonly recipe: SkillDefinition | undefined
  readonly entry: ScienceCatalogEntry | undefined
}

function alternatives(...patterns: RegExp[]): RegExp {
  return new RegExp(patterns.map(pattern => pattern.source).join('|'), 'iu')
}

const CONCEPTUAL = alternatives(
  /^\s*(?:(?:can|could|would)\s+you\s+|please\s+)?(?:what|why|how|explain|define)\b/,
  /^\s*(?:请|只|仅|仅仅|请你|请帮我|帮我)?(?:解释|说明|介绍)|^\s*(?:什么|为什么|如何|怎样)/,
)
const ADDITIONAL_ACTION = alternatives(
  /\b(?:then|and\s+also)\s+(?:write|draft|create|run|analy[sz]e|search)\b/,
  /(?:然后|并且|并|随后|再)(?:撰写|写|运行|分析|检索)/,
)
const WRITING = alternatives(
  /\b(?:write|draft|compose)\b/,
  /\b(?:prepare|create|generate|build).{0,80}\b(?:paper|manuscript|article)\b/,
  /撰写|起草|写一篇|写论文|写作|(?:写|重写).{0,8}(?:摘要|引言|讨论|结果|方法)|(?:生成|完成).{0,80}(?:论文|稿件|手稿)/,
)
const AUTHORING_ACTION = /\b(?:write|draft|compose)\b|撰写|起草|写一篇|写论文|写作/iu
const FORMATTING = alternatives(
  /\b(?:reformat|typeset|retypeset|formatting|typesetting)\b/,
  /\b(?:compile|build).{0,40}\b(?:latex|tex|manuscript|paper)\b/,
  /\b(?:latex|tex)\b.{0,40}\bcompil(?:e|ation)\b/,
  /\b(?:change|adjust|fix|convert)\b.{0,40}\blayout\b/,
  /排版|编译/,
)
const FORMAT_SCOPE = /\b(?:latex|tex|manuscript|paper|article|equations?|figures?|tables?|two.columns?)\b|论文|稿件|手稿|双栏|两栏|公式|图表/iu
const NO_WRITING = alternatives(
  /\b(?:do\s+not|don't|without|no\s+need\s+to)\s+(?:\w+\s+){0,3}(?:write|draft|compose|generate|produce|create|prepare|build)\b/,
  /\b(?:no|without)\s+(?:\w+\s+){0,3}(?:paper|manuscript|article|thesis|dissertation)\b/,
  /(?:不要|不用|无需|不必|别).{0,10}(?:写|论文|稿件|手稿)/,
  /不(?:再)?(?:写|撰写|起草)|不(?:再)?(?:生成|输出|制作|完成).{0,10}(?:论文|稿件|手稿)/,
)
const MANUSCRIPT = /\b(?:paper|manuscript|article|thesis|dissertation)\b|论文|稿件|手稿/iu
const LITERATURE = alternatives(
  /\b(?:literature\s+(?:review|search)|search|find|retrieve|verify\s+(?:citations?|references?)|systematic\s+review)\b/,
  /文献(?:检索|综述|调研)|检索|查找.{0,8}(?:文献|论文)|核验.{0,8}(?:引文|引用|参考文献)/,
)
const ANALYSIS = alternatives(
  /\b(?:analy[sz]e|plot|simulate|derive|prove|calculate|evaluate|design|statistical\s+analysis)\b/,
  /\b(?:run|conduct)\s+(?:an?\s+)?experiment\b/,
  /分析|计算|推导|证明|评估|设计|绘图|绘制|画图|作图|配图|仿真|(?:运行|开展|进行).{0,8}实验|统计分析/,
)
const RESEARCH_OPERATION = alternatives(
  /\b(?:conduct|perform|carry\s+out|do)\s+(?:a\s+)?(?:research\s+project|study|research)\b/,
  /(?:^|[.!?]\s*)(?:(?:please|help\s+me|can\s+you|could\s+you)\s+)?(?:research|investigate)\b/,
  /(?:自主|开展|进行).{0,10}(?:研究|科研)|^\s*(?:请|帮我|请帮我)?研究/,
)
const RESEARCH = alternatives(
  RESEARCH_OPERATION,
  /\b(?:full\s+paper|complete\s+paper|end.to.end)\b/,
  /完整论文|全流程/,
)
const REVIEW = /\b(?:review|audit|critique|polish|revise|translate|proofread)\b|评审|审稿|审查|核验|润色|修改|翻译|校对/iu
const IDEATION = /\b(?:brainstorm|ideas?|hypothes[ei]s|proposals?|novelty|research\s+direction|topics?)\b|选题|课题|假设|查新|科研方向|研究方向/iu
const CORRECTION = /\b(?:instead|actually|switch\s+to|focus\s+on)\b|改为|改成|换成|转向|更正/iu
const NATURE_OPERATION = /\b(?:read|download|summari[sz]e|screen|convert|slides?|presentation|availability)\b|阅读|精读|下载|文献筛选|数据声明|可用性声明|审稿回复|回应审稿|论文卡片|论文解剖|论文透视|转专利|转为专利|幻灯片|演示文稿|检查统计|检查引用/iu
const SCIENCE_SCOPE = alternatives(
  /\b(?:scientific|science|papers?|manuscripts?|articles?|thesis|dissertation)\b/,
  /\b(?:hypothes[ei]s|experiments?|stud(?:y|ies)|data(?:set)?s?|csv|measurements?|observations?)\b/,
  /\b(?:statistics?|citations?|literature|abstract|bibliography|research\s+(?:project|ideas?|direction|proposal|question))\b/,
  /科学|科研|文献|论文|稿件|手稿|假设|实验|数据|观测|统计|摘要|引言|讨论|参考文献|选题|课题|查新|绘图|画图|作图|配图|学术图|专利/,
)

/** Select task phases and matching domains from direct user input only.
 * @param messages - the downstream accepted batch; injected or external text is ignored.
 * @param rules - ordered demand rules supplied by the plugin's validated assets.
 * @returns guidance candidates, or undefined for conceptual and unrelated requests.
 */
export function selectScienceRoutes(
  messages: readonly UserMessage[], rules: readonly ScienceRoutingRule[],
): ScienceRoutingSelection | undefined {
  const text = messages.filter(message => message.source.kind === 'user')
    .flatMap(message => message.content.filter(block => block.type === 'text').map(block => block.text)).join('\n')
  if (text.length === 0 || (CONCEPTUAL.test(text) && !ADDITIONAL_ACTION.test(text))) return
  const natureOperation = matchesNatureGuidanceRequest(text) || NATURE_OPERATION.test(text)
  const noWriting = NO_WRITING.test(text)
  const writing = WRITING.test(text) && !noWriting && !(IDEATION.test(text) && !MANUSCRIPT.test(text))
  const literature = LITERATURE.test(text)
  const analysis = ANALYSIS.test(text)
  const research = RESEARCH.test(text)
  const formattingOnly = FORMATTING.test(text) && FORMAT_SCOPE.test(text)
    && (noWriting || (!AUTHORING_ACTION.test(text) && !literature && !analysis && !RESEARCH_OPERATION.test(text)))
  const matched = rules.filter(rule => (!formattingOnly || rule.id === 'publication')
    && !(noWriting && !formattingOnly && rule.id === 'publication')
    && rule.patterns.some(pattern => new RegExp(pattern, 'iu').test(text)))
  const taskRoutes = new Set(['ideation', 'publication', 'figure', 'polishing', 'statistics', 'citation'])
  const fieldMatched = matched.some(rule => !taskRoutes.has(rule.id))
  if (!formattingOnly && !fieldMatched && !SCIENCE_SCOPE.test(text) && !natureOperation) return
  if (!formattingOnly && !writing && !literature && !analysis && !research && !REVIEW.test(text) && !IDEATION.test(text) && !natureOperation
    && !(CORRECTION.test(text) && matched.length > 0)) return
  const nativeNames = formattingOnly ? ['deepseek-science-writing'] : writing || research
    ? ['deepseek-science-literature', 'deepseek-science-analysis', 'deepseek-science-writing']
    : [...literature ? ['deepseek-science-literature'] : [], ...analysis ? ['deepseek-science-analysis'] : []]
  // Explicit non-writing requests never inherit the writing phase from a broad research term.
  const scopedNatives = noWriting && !formattingOnly ? nativeNames.filter(name => name !== 'deepseek-science-writing') : nativeNames
  return {
    routes: matched.map(rule => rule.id), nativeNames: scopedNatives,
    domainNames: [...new Set(matched.flatMap(rule => rule.skills))],
  }
}

/** Render complete bodies and an honest shortlist; deferred bodies are never instruction fragments.
 * @param shortlist - permitted names and resource locations, including deferred candidates.
 * @param bodies - complete rendered skill bodies admitted within the budget.
 * @param deferredNames - candidates whose instructions have not been loaded into this message.
 * @returns the complete model-facing routing message.
 */
export function renderScienceRouting(
  shortlist: readonly { name: string; path?: string }[], bodies: readonly ScienceRoutingBody[], deferredNames: readonly string[],
): string {
  return [
    '<science_guidance>',
    'Apply this guidance only to the user\'s current requested work. User scope, configured policy, model selection and available Harness capabilities override upstream workflow assumptions. A conceptual explanation does not authorize a research project, experiments, manuscript, installation or scheduled work.',
    'Adapt upstream tool and agent names to available Harness tools. Do not install dependencies, delegate to a different model, start jobs or schedule future work unless the user requested that action. Preserve explicit non-writing and read-only requests.',
    'For formatting-only work, preserve the supplied content and scientific claims. Change layout only; do not start literature searches, analysis, experiments or a new study merely because a loaded writing workflow describes them.',
    'Relevant local guidance (a shortlist is not loaded content; Nature task assemblies identify complete loaded and deferred resource files separately):',
    ...shortlist.map(entry => `- ${entry.name}${entry.path === undefined ? '' : `: ${entry.path}`}`),
    ...deferredNames.length === 0 ? [] : [
      `Full instructions deferred by the automatic context budget: ${deferredNames.join(', ')}.`,
      'Before applying a deferred skill, use science_skills with action load and its exact name, or the skill tool when that name is listed in the session catalog. Do not infer instructions from this shortlist.',
    ],
    ...bodies.map(body => body.instructions),
    '</science_guidance>',
  ].join('\n\n')
}

function digest(value: string): string { return createHash('sha256').update(value).digest('hex') }

function allowed(entry: ScienceCatalogEntry, enabledPacks: readonly string[]): boolean {
  return entry.invocation.modelInvocable && (!entry.license.noncommercial
    || entry.packs.some(pack => pack.endsWith('-noncommercial') && enabledPacks.includes(pack)))
}

function visibleRoute(agent: Agent, routeKey: string): boolean {
  for (const seq of agent.session.surface.nodes) {
    // oxlint-disable-next-line typescript/no-deprecated -- Read committed visible guidance for resume and compaction-safe deduplication.
    const event = agent.session.eventAt(SessionSeq(seq))
    if (event?.type === 'user/message' && event.data.source.kind === 'science-routing'
      && event.data.source.routeKey === routeKey) return true
  }
  return false
}

/** Install a reversible pre-step listener that contributes logged, bounded full guidance.
 * @param ctx - plugin context; Cordis removes the listener when its fiber is disposed.
 * @param options - immutable packaged catalog, native recipes and deployment limits.
 */
export function installScienceKernel(ctx: Context, options: ScienceKernelOptions): void {
  if (!options.enabled) return
  for (const rule of options.routeRules) for (const pattern of rule.patterns) new RegExp(pattern, 'iu')
  const lifecycle = new AbortController()
  ctx.effect(() => () => { lifecycle.abort(new Error('Scientific routing plugin disposed')) })
  // This app-wide policy is mounted below the shared AgentLoop context. The
  // event carrier scopes individual agents, so this cross-composition hook
  // must be global to observe their pre-step dispatches.
  ctx.on('agent/pre-step', async ({ agent, signal: stepSignal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const signal = AbortSignal.any([stepSignal, lifecycle.signal])
    signal.throwIfAborted()
    const selection = selectScienceRoutes(decision.messages, options.routeRules)
    if (selection === undefined) return decision
    const userText = decision.messages.filter(message => message.source.kind === 'user')
      .flatMap(message => message.content.filter(block => block.type === 'text').map(block => block.text)).join('\n')
    const loadOptions = { enabledPacks: options.enabledPacks, invocation: 'model' as const, signal }
    const naturePlans = await resolveNatureGuidance(options.catalog, userText, loadOptions)
    signal.throwIfAborted()
    const natureByName = new Map(naturePlans.map(plan => [plan.name, plan]))
    const candidates = [...new Set([...naturePlans.map(plan => plan.name), ...selection.nativeNames, ...selection.domainNames])].flatMap<RoutingCandidate>((name) => {
      const recipe = options.recipes.get(name)
      if (recipe !== undefined) return isModelInvocable(recipe) ? [{ name, recipe, entry: undefined }] : []
      const entry = options.catalog.entries.find(candidate => candidate.name === name)
      return entry !== undefined && allowed(entry, options.enabledPacks) ? [{ name, recipe: undefined, entry }] : []
    })
    if (candidates.length === 0) return decision
    const routeKey = digest(JSON.stringify({ maxAutoSkills: options.maxAutoSkills, maxAutoChars: options.maxAutoChars,
      candidates: candidates.map(candidate => [candidate.name,
        candidate.recipe === undefined ? candidate.entry?.digest : digest(renderSkillContent(candidate.recipe)),
        natureByName.get(candidate.name)?.identity]) }))
    if (visibleRoute(agent, routeKey) || decision.messages.some(message => message.source.kind === 'science-routing' && message.source.routeKey === routeKey)) return decision
    const shortlist = candidates.map(candidate => ({ name: candidate.name,
      ...candidate.recipe?.path === undefined && candidate.entry === undefined ? {} : {
        path: candidate.recipe?.path ?? `${options.catalog.assetRoot}/${candidate.entry?.skillPath ?? ''}`,
      } }))
    const bodies: ScienceRoutingBody[] = []
    let deferredNames = candidates.map(candidate => candidate.name)
    // Even the complete shortlist and wrapper must fit; never emit an oversized fallback.
    if (renderScienceRouting(shortlist, bodies, deferredNames).length > options.maxAutoChars) return decision
    for (const candidate of candidates) {
      if (bodies.length >= options.maxAutoSkills) break
      signal.throwIfAborted()
      const remaining = deferredNames.filter(name => name !== candidate.name)
      const naturePlan = natureByName.get(candidate.name)
      if (naturePlan !== undefined) {
        const available = options.maxAutoChars - renderScienceRouting(shortlist, [...bodies, { name: candidate.name, instructions: '' }], remaining).length
        const instructions = await renderNatureGuidance(options.catalog, naturePlan, available, loadOptions)
        signal.throwIfAborted()
        if (instructions === undefined) continue
        const proposed = [...bodies, { name: candidate.name, instructions }]
        if (renderScienceRouting(shortlist, proposed, remaining).length > options.maxAutoChars) continue
        bodies.push({ name: candidate.name, instructions })
        deferredNames = remaining
        continue
      }
      const definition = candidate.recipe ?? await loadScienceSkill(options.catalog, candidate.name, loadOptions)
      signal.throwIfAborted()
      if (definition === undefined || !isModelInvocable(definition)) continue
      const body = { name: candidate.name, instructions: renderSkillContent(definition) }
      const proposed = [...bodies, body]
      if (renderScienceRouting(shortlist, proposed, remaining).length > options.maxAutoChars) continue
      bodies.push(body)
      deferredNames = remaining
    }
    const text = renderScienceRouting(shortlist, bodies, deferredNames)
    signal.throwIfAborted()
    const source: ScienceRoutingSource = {
      kind: 'science-routing', form: 'instructions', routeKey, contentDigest: digest(text),
      selectedNames: candidates.map(candidate => candidate.name), loadedNames: bodies.map(body => body.name), deferredNames,
    }
    return { ...decision, messages: [...decision.messages, createUserMessage({ content: [{ type: 'text', text }], source })] }
  }, { global: true })
}
