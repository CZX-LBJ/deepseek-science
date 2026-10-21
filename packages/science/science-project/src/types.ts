/** Workspace research records; fields remain JSON-compatible across host and client. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'

/** Identity generated for one research project. */
export type ScienceProjectId = Branded<'ScienceProjectId'>
/** Stage in an evidence-led research workflow. */
export type SciencePhase = 'question' | 'literature' | 'design' | 'analysis' | 'claims' | 'writing' | 'review' | 'delivery'
/** An observed artifact and the immutable bytes recorded at a checkpoint. */
export interface ScienceArtifact {
  path: string
  sha256: string
  size: number
  snapshotPath: string
}
/** A claim and its exact position in a checkpointed artifact. */
export interface ScienceEvidence {
  claim: string
  artifact: string
  locator: string
  quote: string
  support: 'supported' | 'partial' | 'unsupported'
  depth: 'full-text' | 'abstract-only' | 'experiment'
}
/** One phase's recorded progress, deliverables and evidence. */
export interface SciencePhaseRecord {
  phase: SciencePhase
  status: 'pending' | 'running' | 'checkpointed' | 'completed' | 'skipped' | 'interrupted' | 'failed'
  summary: string
  reason: string
  artifacts: ScienceArtifact[]
  evidence: ScienceEvidence[]
}
/** Whole post-change project state stored atomically. */
export interface ScienceProject {
  schemaVersion: 1
  id: ScienceProjectId
  revision: number
  title: string
  objective: string
  statePath: string
  currentPhase: SciencePhase
  status: 'active' | 'completed'
  createdAt: string
  updatedAt: string
  phases: SciencePhaseRecord[]
}
/** Requested deliverables and recorded claim support for the current phase. */
export interface ScienceCheckpointRequest {
  summary: string
  paths: string[]
  evidence: ScienceEvidence[]
}
/** Per-operation authority and cancellation from the calling execution. */
export interface ScienceProjectOptions {
  signal?: AbortSignal
  sandboxPolicy?: SandboxExecutionPolicy
}
