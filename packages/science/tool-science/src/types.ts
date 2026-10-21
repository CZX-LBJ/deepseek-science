/** Client-safe projections of scientific tool outputs and actual model accounting. */
import type { ScienceProject } from '@deepseek-ai/dsh-science-project/types'
import type {} from '@deepseek-ai/dsh-session-projection/types'

/** A paper summary actually returned by a scientific source. */
export interface SciencePaperView {
  id: string
  title: string
  url: string
  doi: string | null
  arxivId: string | null
  year: number | null
}
/** Independent status of a requested literature source. */
export interface ScienceSourceView {
  source: string
  status: 'completed' | 'partial' | 'failed'
  count: number
  error: string | null
}
/** Skill readiness is separate from the presence of its instruction files. */
export interface ScienceSkillView {
  name: string
  description: string
  source: string
  license: string
  status: 'support' | 'guidance-only' | 'needs-setup'
  requirements: string[]
  path: string | null
}
/** Most recent bounded paper reading, including what reached the model. */
export interface ScienceReadView {
  ref: string
  depth: 'full-text' | 'abstract-only' | 'unavailable'
  status: string
  cachePath: string | null
  excerpts: { locator: string; text: string }[]
}
/** Aggregate of settled attempts; missing provider buckets remain unknown. */
export interface ScienceMetrics {
  attempts: number
  uncachedInputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  outputTokens: number | null
  cacheReadRatio: number | null
  totalMs: number | null
  firstVisibleMs: number | null
  estimatedCost: number | null
  currency: string | null
}
/** Latest domain data and run accounting reconstructed from the Session. */
export interface ScienceProjection {
  project: ScienceProject | null
  papers: SciencePaperView[]
  sources: ScienceSourceView[]
  skills: ScienceSkillView[]
  reading: ScienceReadView | null
  metrics: ScienceMetrics
}
/** Internal state adds the one unsettled step's timestamp for latency measurement. */
export interface ScienceProjectionState {
  view: ScienceProjection
  requestStartedAt: number | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap { science: ScienceProjection }
  interface SessionProjectionStateMap { science: ScienceProjectionState }
}
