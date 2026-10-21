/** Synthetic Session samples test accounting; their tokens are not provider measurements. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { measureScienceSession, verifyScienceBenchmarkArtifacts } from './benchmark-science.ts'

const ownedRoots: string[] = []
afterEach(async () => {
  await Promise.all(ownedRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function artifactWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'science-benchmark-spec-'))
  ownedRoots.push(cwd)
  const inputRoot = fileURLToPath(new URL('./fixtures/science-benchmark/', import.meta.url))
  for (const file of ['synthetic-study.md', 'observations.csv']) {
    await writeFile(join(cwd, file), await readFile(join(inputRoot, file)))
  }
  return cwd
}

function fixture(missingUsage = false): string {
  const stream = (time: number, usage?: object) => [
    { type: 'chunk', time, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
    { type: 'text-chunks', time0: time + 5, dt: [10, 20], index: 0, texts: ['a', 'b', 'c'] },
    ...usage === undefined ? [] : [{ type: 'chunk', time: time + 40, chunk: { type: 'usage', usage } }],
    { type: 'chunk', time: time + 50, chunk: { type: 'finish', reason: { kind: 'stop' } } },
  ]
  return [
    { type: 'step/start', time: 100, data: { turn: 1, step: 1 } },
    { type: 'request/context', data: { provider: 'synthetic', model: 'mock' } },
    { type: 'assistant/attempt', time: 200, data: { turn: 1, step: 1,
      stream: stream(130, missingUsage ? undefined : {
        inputTokens: 10, outputTokens: 2, cacheReadTokens: 20, cacheWriteTokens: 0, totalTokens: 32,
      }) } },
    { type: 'assistant/message', time: 350, data: { turn: 1, step: 1,
      stream: stream(250, { inputTokens: 20, outputTokens: 3, cacheReadTokens: 10, cacheWriteTokens: 0, totalTokens: 33 }) } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n'
}

describe('science benchmark accounting', () => {
  it('verifies persisted research artifacts and rejects modified source data', async () => {
    const cwd = await artifactWorkspace()
    await writeFile(join(cwd, 'analysis.json'), '{"groupAMean":3,"groupBMean":4,"difference":1}\n')
    await writeFile(join(cwd, 'research-note.md'), 'Observed values describe this synthetic fixture only. synthetic-study.md:4\n'
      + 'Synthetic data do not establish a real-world or causal finding.\n')
    expect(await verifyScienceBenchmarkArtifacts(cwd)).toBe(true)
    await writeFile(join(cwd, 'observations.csv'), 'group,value\nA,999\n')
    expect(await verifyScienceBenchmarkArtifacts(cwd)).toBe(false)
  })

  it('rejects self-reported success with missing or incorrect analysis files', async () => {
    const cwd = await artifactWorkspace()
    expect(await verifyScienceBenchmarkArtifacts(cwd)).toBe(false)
    await writeFile(join(cwd, 'analysis.json'), '{"groupAMean":999,"groupBMean":4,"difference":1}\n')
    await writeFile(join(cwd, 'research-note.md'), 'SCIENCE BENCHMARK READY\n')
    expect(await verifyScienceBenchmarkArtifacts(cwd)).toBe(false)
  })

  it('includes retries and computes latency from the logged observation intervals', () => {
    const measured = measureScienceSession(fixture())
    expect(measured.attempts).toHaveLength(2)
    expect(measured.attempts[0]).toMatchObject({ outcome: 'attempt', provider: 'synthetic', model: 'mock',
      firstChunkDelayMs: 30, observedLatencyMs: 100, streamSpanMs: 50 })
    expect(measured.attempts[1]).toMatchObject({ outcome: 'message', firstChunkDelayMs: 50, observedLatencyMs: 150 })
    expect(measured.totals).toEqual({ complete: true, inputTokens: 30, outputTokens: 5,
      cacheReadTokens: 30, cacheWriteTokens: 0, totalTokens: 65, cacheHitRatio: 0.5 })
  })

  it('keeps every aggregate unavailable when one attempt omitted usage', () => {
    expect(measureScienceSession(fixture(true)).totals).toEqual({ complete: false,
      inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null,
      totalTokens: null, cacheHitRatio: null })
  })

  it.each(['cacheReadTokens', 'cacheWriteTokens', 'inputTokens'])(
    'refuses to infer a cache ratio without %s', (field) => {
      const rows = fixture().trim().split('\n').map(line => JSON.parse(line) as { type: string; data?: { stream: { chunk?: { type: string; usage?: Record<string, number> } }[] } })
      for (const row of rows) for (const entry of row.data?.stream ?? []) {
        if (entry.chunk?.usage !== undefined) {
          entry.chunk.usage = Object.fromEntries(Object.entries(entry.chunk.usage).filter(([key]) => key !== field))
        }
      }
      const log = rows.map(row => JSON.stringify(row)).join('\n')
      // Required input accounting is malformed; absent optional cache buckets remain unknown.
      if (field === 'inputTokens') expect(() => measureScienceSession(log)).toThrow()
      else expect(measureScienceSession(log).totals.cacheHitRatio).toBeNull()
    },
  )

  it('does not interpret an empty recording as zero billed tokens', () => {
    expect(measureScienceSession('').totals).toMatchObject({ complete: false, inputTokens: null, cacheHitRatio: null })
  })

  it('rejects conflicting provider totals instead of deriving a cache ratio', () => {
    const contradictory = fixture().replace('"totalTokens":32', '"totalTokens":999')
    expect(measureScienceSession(contradictory).totals).toMatchObject({ complete: false, cacheHitRatio: null, inputTokens: null })
  })

  it('keeps aggregate overflow unavailable even when each provider counter is safe', () => {
    const log = fixture().replaceAll('"inputTokens":10', `"inputTokens":${Number.MAX_SAFE_INTEGER}`)
      .replaceAll('"inputTokens":20', `"inputTokens":${Number.MAX_SAFE_INTEGER}`)
      .replaceAll(/,"totalTokens":\d+/gu, '')
    expect(measureScienceSession(log).totals).toMatchObject({ inputTokens: null, cacheHitRatio: null, totalTokens: null })
  })

  it('keeps timing unknown when normalized fixtures omitted event times', () => {
    const rows = fixture().trim().split('\n').map((line) => {
      const row = JSON.parse(line) as { time?: number }
      delete row.time
      return row
    })
    expect(measureScienceSession(rows.map(row => JSON.stringify(row)).join('\n')).attempts.every(attempt => attempt.firstChunkDelayMs === null)).toBe(true)
  })
})
