import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { afterEach, describe, expect, it } from 'vitest'
import ScienceProjects from '../src/index.ts'

const roots: string[] = []
const contexts: Context[] = []
async function serviceAt(root: string) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(ScienceProjects)
  return ctx.scienceProjects
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'science-project-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(ScienceProjects)
  await writeFile(join(root, 'question.md'), '# Question\nDoes the measured method improve?\n')
  return { root, ctx, projects: ctx.scienceProjects }
}
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('research project checkpoints', () => {
  it('denies creation and mutation outside explicit write authority on a bare filesystem', async () => {
    const { root, projects } = await fixture()
    await expect(projects.create(root, { title: 'Denied', objective: 'Read-only' }, {
      sandboxPolicy: { mode: 'read-only', workspaceRoot: root },
    })).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
    const project = await projects.create(root, { title: 'Study', objective: 'Investigate' })
    await expect(projects.start(root, project.id, project.revision, {
      sandboxPolicy: { mode: 'workspace-write', workspaceRoot: join(root, 'different') },
    })).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })
  it('keeps a real artifact snapshot and advances only a checkpointed phase', async () => {
    const { root, projects } = await fixture()
    const created = await projects.create(root, { title: 'Cache study', objective: 'Measure cache reuse' })
    expect(created.revision).toBe(1)
    await expect(projects.advance(root, created.id, created.revision)).rejects.toThrow('checkpoint')
    const checked = await projects.checkpoint(root, created.id, created.revision, {
      summary: 'Question fixed', paths: ['question.md'], evidence: [],
    })
    expect(checked.phases[0]?.artifacts[0]?.sha256).toMatch(/^[0-9a-f]{64}$/)
    const archive = checked.phases[0]?.artifacts[0]?.snapshotPath
    expect(archive).toBeDefined()
    const snapshot = JSON.parse(await readFile(join(root, archive!), 'utf8')) as { base64: string }
    expect(Buffer.from(snapshot.base64, 'base64').toString()).toContain('Does the measured method')
    const next = await projects.advance(root, created.id, checked.revision)
    expect(next.currentPhase).toBe('literature')
    expect(next.phases[0]?.status).toBe('completed')
    expect((await projects.get(root, created.id)).revision).toBe(next.revision)
  })

  it('rejects a changed artifact and retains the prior completed evidence snapshot', async () => {
    const { root, projects } = await fixture()
    const created = await projects.create(root, { title: 'Study', objective: 'Investigate' })
    const checked = await projects.checkpoint(root, created.id, 1, {
      summary: 'Recorded', paths: ['question.md'], evidence: [],
    })
    await writeFile(join(root, 'question.md'), 'Changed evidence\n')
    await expect(projects.advance(root, created.id, checked.revision)).rejects.toThrow('changed')
    expect((await projects.get(root, created.id)).revision).toBe(checked.revision)
  })

  it('rejects competing revisions across service instances', async () => {
    const { root, projects } = await fixture()
    const created = await projects.create(root, { title: 'Study', objective: 'Investigate' })
    const other = await serviceAt(root)
    const outcomes = await Promise.allSettled([
      projects.checkpoint(root, created.id, created.revision, { summary: 'One', paths: ['question.md'], evidence: [] }),
      other.checkpoint(root, created.id, created.revision, { summary: 'Two', paths: ['question.md'], evidence: [] }),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect((await projects.get(root, created.id)).revision).toBe(2)
  })

  it('rejects outside-workspace evidence and missing evidence artifacts', async () => {
    const { root, projects } = await fixture()
    const created = await projects.create(root, { title: 'Study', objective: 'Investigate' })
    await expect(projects.checkpoint(root, created.id, 1, {
      summary: 'Outside', paths: ['../outside.txt'], evidence: [],
    })).rejects.toThrow('workspace')
    await expect(projects.checkpoint(root, created.id, 1, {
      summary: 'Unsupported', paths: ['question.md'],
      evidence: [{ claim: 'Improves', artifact: 'missing.csv', locator: 'row 1', quote: 'Measured result', support: 'supported', depth: 'experiment' }],
    })).rejects.toThrow('artifact')
  })

  it('resumes durable state without relaunching running work', async () => {
    const { root, projects } = await fixture()
    const created = await projects.create(root, { title: 'Study', objective: 'Investigate' })
    const running = await projects.start(root, created.id, created.revision)
    const other = await serviceAt(root)
    const resumed = await other.resume(root, running.id, running.revision)
    expect(resumed.phases[0]?.status).toBe('interrupted')
    expect(resumed.revision).toBe(running.revision + 1)
    expect(resumed.phases[0]?.reason).toContain('explicitly')
  })

  it('rejects invented quotations and records quotes from actual artifacts', async () => {
    const { root, projects } = await fixture()
    const project = await projects.create(root, { title: 'Study', objective: 'Investigate' })
    const evidence = { claim: 'A question is recorded', artifact: 'question.md', locator: 'line 2',
      quote: 'Invented result', support: 'partial' as const, depth: 'experiment' as const }
    await expect(projects.checkpoint(root, project.id, project.revision, {
      summary: 'Check evidence', paths: ['question.md'], evidence: [evidence],
    })).rejects.toMatchObject({ code: 'SCIENCE_EVIDENCE_MISMATCH' })
    const saved = await projects.checkpoint(root, project.id, project.revision, {
      summary: 'Question recorded', paths: ['question.md'],
      evidence: [{ ...evidence, quote: 'Does the measured method improve?' }],
    })
    expect(saved.phases[0]?.evidence[0]?.quote).toBe('Does the measured method improve?')
  })

  it('requires a skip reason and evidence at the claims phase', async () => {
    const { root, projects } = await fixture()
    let project = await projects.create(root, { title: 'Study', objective: 'Investigate' })
    await expect(projects.skip(root, project.id, project.revision, '')).rejects.toThrow('reason')
    for (let step = 0; step < 4; step++) {
      project = await projects.skip(root, project.id, project.revision, 'Not applicable to this supplied result audit')
    }
    expect(project.currentPhase).toBe('claims')
    project = await projects.checkpoint(root, project.id, project.revision, {
      summary: 'Results checked', paths: ['question.md'], evidence: [],
    })
    await expect(projects.advance(root, project.id, project.revision)).rejects.toThrow('evidence')
  })

  it('blocks stale completed inputs and reopens their downstream phases for recovery', async () => {
    const { root, projects } = await fixture()
    let project = await projects.create(root, { title: 'Study', objective: 'Investigate' })
    project = await projects.checkpoint(root, project.id, project.revision, {
      summary: 'Question fixed', paths: ['question.md'], evidence: [],
    })
    project = await projects.advance(root, project.id, project.revision)
    await writeFile(join(root, 'literature.md'), 'References inspected\n')
    project = await projects.checkpoint(root, project.id, project.revision, {
      summary: 'Literature checked', paths: ['literature.md'], evidence: [],
    })
    await writeFile(join(root, 'question.md'), 'Revised question\n')
    await expect(projects.advance(root, project.id, project.revision)).rejects.toMatchObject({ code: 'SCIENCE_ARTIFACT_CHANGED' })
    await expect(projects.skip(root, project.id, project.revision, 'Not applicable'))
      .rejects.toMatchObject({ code: 'SCIENCE_ARTIFACT_CHANGED' })
    project = await projects.reopen(root, project.id, project.revision, 'question', 'Question revised')
    expect(project.currentPhase).toBe('question')
    expect(project.phases.slice(0, 2).map(phase => phase.status)).toEqual(['pending', 'pending'])
    project = await projects.checkpoint(root, project.id, project.revision, {
      summary: 'Revised question checked', paths: ['question.md'], evidence: [],
    })
    project = await projects.advance(root, project.id, project.revision)
    expect(project.currentPhase).toBe('literature')
    expect(project.phases[1]?.status).toBe('pending')
  })

  it('refuses malformed persisted records and invalid project identifiers', async () => {
    const { root, projects } = await fixture()
    const created = await projects.create(root, { title: 'Study', objective: 'Investigate' })
    await writeFile(join(root, created.statePath), '{"schemaVersion":999}')
    await expect(projects.get(root, created.id)).rejects.toThrow()
    await expect(projects.get(root, '../other' as typeof created.id)).rejects.toThrow('identifier')
  })
})
