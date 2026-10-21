/** Replayable scientific tool state and exact, nullable provider usage buckets. */
import { z } from 'zod'
import { lastAssistantStreamChunk, chunkHasVisibleText, runFirstVisibleTime } from '@deepseek-ai/dsh-llm/assistant-stream'
import type { AssistantStreamRecord } from '@deepseek-ai/dsh-llm/assistant-stream'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { scienceProjectSchema } from '@deepseek-ai/dsh-science-project'
import type { ScienceMetrics, ScienceProjection, ScienceProjectionState } from './types.ts'

const count = z.number().int().nonnegative().nullable()
const metricsSchema: z.ZodType<ScienceMetrics> = z.object({
  attempts: z.number().int().nonnegative(), uncachedInputTokens: count,
  cacheReadTokens: count, cacheWriteTokens: count, outputTokens: count,
  cacheReadRatio: z.number().min(0).max(1).nullable(),
  totalMs: z.number().nonnegative().nullable(), firstVisibleMs: z.number().nonnegative().nullable(),
  estimatedCost: z.number().nonnegative().nullable(), currency: z.string().nullable(),
}).strict()

/** Validates persisted scientific views before Host or Client consumption. */
export const scienceProjectionSchema: z.ZodType<ScienceProjection> = z.object({
  project: scienceProjectSchema.nullable(),
  papers: z.array(z.object({
    id: z.string(), title: z.string(), url: z.string(), doi: z.string().nullable(),
    arxivId: z.string().nullable(), year: z.number().int().nullable(),
  }).strict()),
  sources: z.array(z.object({
    source: z.string(), status: z.enum(['completed', 'partial', 'failed']), count: z.number().int().nonnegative(), error: z.string().nullable(),
  }).strict()),
  skills: z.array(z.object({
    name: z.string(), description: z.string(), source: z.string(), license: z.string(),
    status: z.enum(['support', 'guidance-only', 'needs-setup']), requirements: z.array(z.string()), path: z.string().nullable(),
  }).strict()),
  reading: z.object({
    ref: z.string(), depth: z.enum(['full-text', 'abstract-only', 'unavailable']), status: z.string(),
    cachePath: z.string().nullable(), excerpts: z.array(z.object({ locator: z.string(), text: z.string() }).strict()),
  }).strict().nullable(),
  metrics: metricsSchema,
}).strict()
const stateSchema: z.ZodType<ScienceProjectionState> = z.object({
  view: scienceProjectionSchema, requestStartedAt: z.number().nullable(),
}).strict()
const metaSchema = z.object({ kind: z.literal('science'), version: z.literal(1), snapshot: scienceProjectionSchema }).strict()

/** Initial state has no asserted billing or settled request.
 * @returns the empty scientific Session state.
 */
export function initialScienceState(): ScienceProjectionState {
  return { requestStartedAt: null, view: {
    project: null, papers: [], sources: [], skills: [], reading: null,
    metrics: { attempts: 0, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      outputTokens: 0, cacheReadRatio: null, totalMs: 0, firstVisibleMs: null, estimatedCost: null, currency: null },
  } }
}

function addKnown(total: number | null, value: number | undefined): number | null {
  if (total === null || value === undefined || !Number.isSafeInteger(value) || value < 0) return null
  const next = total + value
  return Number.isSafeInteger(next) ? next : null
}

/** Cache reads divided by all disjoint prompt buckets; missing or empty input stays unknown.
 * @param metrics - settled provider buckets.
 * @returns the ratio, or null when a denominator cannot be established.
 */
export function scienceCacheRatio(metrics: Pick<ScienceMetrics, 'uncachedInputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>): number | null {
  const { uncachedInputTokens, cacheReadTokens, cacheWriteTokens } = metrics
  if (uncachedInputTokens === null || cacheReadTokens === null || cacheWriteTokens === null) return null
  const total = uncachedInputTokens + cacheReadTokens + cacheWriteTokens
  return Number.isSafeInteger(total) && total > 0 ? cacheReadTokens / total : null
}

function firstTextTime(stream: readonly AssistantStreamRecord[]): number | undefined {
  for (const record of stream) {
    if (record.type === 'text-chunks') {
      const time = runFirstVisibleTime(record)
      if (time !== undefined) return time
    } else if (record.type === 'chunk' && chunkHasVisibleText(record.chunk)) return record.time
  }
  return undefined
}

function settled(state: ScienceProjectionState, usage: TokenUsage | undefined,
  stream: readonly AssistantStreamRecord[], time: number): ScienceProjectionState {
  const previous = state.view.metrics
  const metrics: ScienceMetrics = {
    ...previous, attempts: previous.attempts + 1,
    uncachedInputTokens: addKnown(previous.uncachedInputTokens, usage?.inputTokens),
    cacheReadTokens: addKnown(previous.cacheReadTokens, usage?.cacheReadTokens),
    cacheWriteTokens: addKnown(previous.cacheWriteTokens, usage?.cacheWriteTokens),
    outputTokens: addKnown(previous.outputTokens, usage?.outputTokens),
    cacheReadRatio: null,
    totalMs: previous.totalMs === null || state.requestStartedAt === null
      ? null : previous.totalMs + Math.max(0, time - state.requestStartedAt),
    firstVisibleMs: null,
  }
  if (usage?.totalTokens !== undefined && usage.cacheReadTokens !== undefined && usage.cacheWriteTokens !== undefined
    && usage.totalTokens !== usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens) {
    metrics.uncachedInputTokens = null
    metrics.cacheReadTokens = null
    metrics.cacheWriteTokens = null
    metrics.outputTokens = null
  }
  const visible = firstTextTime(stream)
  if (visible !== undefined && state.requestStartedAt !== null && visible >= state.requestStartedAt) {
    metrics.firstVisibleMs = visible - state.requestStartedAt
  }
  metrics.cacheReadRatio = scienceCacheRatio(metrics)
  return { requestStartedAt: null, view: { ...state.view, metrics } }
}

/** Fold only scientific metadata and settled model attempts; other events preserve identity.
 * @param state - prior projection state.
 * @param event - one committed Session event.
 * @returns the whole next state or the same reference for an unrelated event.
 */
export function applyScienceEvent(state: ScienceProjectionState, event: SessionEvent): ScienceProjectionState {
  if (event.type === 'step/start' || event.type === 'llm/retry-started') {
    return { ...state, requestStartedAt: event.time }
  }
  if (event.type === 'assistant/message') return settled(state,
    event.data.usage ?? lastAssistantStreamChunk(event.data.stream, 'usage')?.usage, event.data.stream, event.time)
  if (event.type === 'assistant/attempt') return settled(state,
    lastAssistantStreamChunk(event.data.stream, 'usage')?.usage, event.data.stream, event.time)
  if (event.type !== 'tool/result' || event.data.message.isError === true) return state
  const meta = metaSchema.safeParse(event.data.meta)
  if (!meta.success) return state
  return { ...state, view: { ...meta.data.snapshot, metrics: state.view.metrics } }
}

/** Registerable computation unit driven by the existing Session projection service. */
export const scienceProjection = {
  key: 'science', stateVersion: 1, stateSchema,
  init: () => initialScienceState(), apply: applyScienceEvent,
  wire: { viewSchema: scienceProjectionSchema, view: state => state.view },
} satisfies ProjectionDefinition<'science'>
