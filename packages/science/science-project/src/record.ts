/** Validation of durable research records and incoming checkpoint data. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ScienceCheckpointRequest, ScienceProject, ScienceProjectId } from './types.ts'

/** Ordered research stages used by new projects and record validation. */
export const SCIENCE_PHASES = ['question', 'literature', 'design', 'analysis', 'claims', 'writing', 'review', 'delivery'] as const
/** Validate and brand a generated project identity.
 * @param value - UUID supplied by a tool or read from storage.
 * @returns the admitted nominal identity.
 */
export function ScienceProjectId(value: string): ScienceProjectId {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('Invalid research project identifier')
  }
  return brandString<ScienceProjectId>(value)
}

const artifactSchema = z.object({
  path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(), snapshotPath: z.string().min(1),
}).strict()
const evidenceSchema = z.object({
  claim: z.string().trim().min(1), artifact: z.string().min(1), locator: z.string().trim().min(1),
  quote: z.string().trim().min(1).max(20000),
  support: z.enum(['supported', 'partial', 'unsupported']),
  depth: z.enum(['full-text', 'abstract-only', 'experiment']),
}).strict()
const phaseSchema = z.object({
  phase: z.enum(SCIENCE_PHASES),
  status: z.enum(['pending', 'running', 'checkpointed', 'completed', 'skipped', 'interrupted', 'failed']),
  summary: z.string(), reason: z.string(), artifacts: z.array(artifactSchema), evidence: z.array(evidenceSchema),
}).strict()

/** Parser for records loaded from the workspace; new versions are rejected explicitly. */
export const scienceProjectSchema: z.ZodType<ScienceProject> = z.object({
  schemaVersion: z.literal(1), id: z.string().transform(ScienceProjectId), revision: z.number().int().positive(),
  title: z.string().trim().min(1), objective: z.string().trim().min(1), statePath: z.string().min(1),
  currentPhase: z.enum(SCIENCE_PHASES), status: z.enum(['active', 'completed']),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), phases: z.array(phaseSchema).length(SCIENCE_PHASES.length),
}).strict().superRefine((project, ctx) => {
  if (project.phases.some((phase, index) => phase.phase !== SCIENCE_PHASES[index])) {
    ctx.addIssue({ code: 'custom', message: 'Research phases are not in canonical order' })
  }
  const index = SCIENCE_PHASES.indexOf(project.currentPhase)
  if (project.phases.slice(0, index).some(phase => phase.status !== 'completed' && phase.status !== 'skipped')) {
    ctx.addIssue({ code: 'custom', message: 'Earlier research phases are unfinished' })
  }
  if (project.status === 'completed' && project.phases.some(phase => phase.status !== 'completed' && phase.status !== 'skipped')) {
    ctx.addIssue({ code: 'custom', message: 'A completed project has unfinished phases' })
  }
})

/** Checkpoint input parser for model JSON and stored-data admission. */
export const scienceCheckpointSchema: z.ZodType<ScienceCheckpointRequest> = z.object({
  summary: z.string().trim().min(1).max(10000), paths: z.array(z.string().min(1)).min(1).max(100),
  evidence: z.array(evidenceSchema).max(1000),
}).strict()
