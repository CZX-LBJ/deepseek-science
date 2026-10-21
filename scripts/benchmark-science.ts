/** Compare real provider accounting through the shipped baseline and scientific one-shot profiles. */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { z } from 'zod'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const usageSchema = z.object({
  inputTokens: count, outputTokens: count, cacheReadTokens: count.optional(),
  cacheWriteTokens: count.optional(), totalTokens: count.optional(), reasoningTokens: count.optional(),
})
type Usage = z.infer<typeof usageSchema>
const rowSchema = z.object({ type: z.string(), time: z.number().optional(), data: z.unknown().optional() })
const streamSchema = z.array(z.union([
  z.object({ type: z.literal('chunk'), time: z.number(), chunk: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.enum(['text-chunks', 'reasoning-chunks', 'tool-call-chunks']), time0: z.number(), dt: z.array(z.number()) }),
]))

/** One settled model attempt; times describe Session observation rather than provider server timing. */
export interface ScienceBenchmarkAttempt {
  turn: number
  step: number
  outcome: 'message' | 'attempt'
  provider: string | null
  model: string | null
  finish: string | null
  usage: Usage | null
  firstChunkDelayMs: number | null
  observedLatencyMs: number | null
  streamSpanMs: number | null
}

/** Available totals; missing provider samples or optional buckets remain null. */
export interface ScienceBenchmarkTotals {
  complete: boolean
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  totalTokens: number | null
  cacheHitRatio: number | null
}

/** Extract every settled attempt, including failed or retried attempts, from raw writer JSONL.
 * @param log - Current raw Session JSONL with original event and embedded stream times.
 * @returns Attempt observations and complete-only aggregate token totals.
 */
export function measureScienceSession(log: string): { attempts: ScienceBenchmarkAttempt[]; totals: ScienceBenchmarkTotals } {
  const rows = log.split(/\r?\n/u).filter(Boolean).map(line => rowSchema.parse(JSON.parse(line)))
  const starts = new Map<string, number>()
  const attempts: ScienceBenchmarkAttempt[] = []
  let route: { provider: string; model: string } | undefined
  for (const row of rows) {
    if (row.type === 'request/context') {
      route = z.object({ provider: z.string(), model: z.string() }).parse(row.data)
    }
    if (row.type === 'step/start') {
      const step = z.object({ turn: count, step: count }).parse(row.data)
      if (row.time !== undefined) starts.set(`${step.turn}/${step.step}`, row.time)
    }
    if (row.type !== 'assistant/message' && row.type !== 'assistant/attempt') continue
    const data = z.object({ turn: count, step: count, stream: streamSchema, usage: usageSchema.optional() }).parse(row.data)
    const key = `${data.turn}/${data.step}`
    const times = data.stream.flatMap(record => record.type === 'chunk'
      ? [record.time] : [record.time0, record.time0 + record.dt.reduce((a, b) => a + b, 0)])
    const first = times.length === 0 ? undefined : Math.min(...times)
    const last = times.length === 0 ? undefined : Math.max(...times)
    let usage = data.usage ?? null
    let finish: string | null = null
    for (const record of data.stream) {
      if (record.type !== 'chunk') continue
      if (record.chunk.type === 'usage') usage = usageSchema.parse(record.chunk.usage)
      if (record.chunk.type === 'finish') finish = z.object({ kind: z.string() }).parse(record.chunk.reason).kind
    }
    if (usage !== null && usage.totalTokens !== undefined && usage.cacheReadTokens !== undefined && usage.cacheWriteTokens !== undefined) {
      const expectedTotal = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens
      if (!Number.isSafeInteger(expectedTotal) || expectedTotal !== usage.totalTokens) usage = null
    }
    const start = starts.get(key)
    const elapsed = (end: number | undefined, begin: number | undefined) => end === undefined || begin === undefined
      ? null : Math.max(0, end - begin)
    attempts.push({ turn: data.turn, step: data.step, outcome: row.type === 'assistant/message' ? 'message' : 'attempt',
      provider: route?.provider ?? null, model: route?.model ?? null, finish, usage,
      firstChunkDelayMs: elapsed(first, start), observedLatencyMs: elapsed(row.time ?? last, start),
      streamSpanMs: elapsed(last, first) })
    // Retries have no durable request-start event; their interval begins at the previous settlement.
    if (row.time !== undefined) starts.set(key, row.time)
    else starts.delete(key)
  }
  const samplesComplete = attempts.length > 0 && attempts.every(attempt => attempt.usage !== null)
  const sum = (field: keyof Usage): number | null => {
    if (!samplesComplete || attempts.some(attempt => attempt.usage?.[field] === undefined)) return null
    const value = attempts.reduce((total, attempt) => total + (attempt.usage?.[field] ?? 0), 0)
    return Number.isSafeInteger(value) ? value : null
  }
  const inputTokens = sum('inputTokens')
  const outputTokens = sum('outputTokens')
  const cacheReadTokens = sum('cacheReadTokens')
  const cacheWriteTokens = sum('cacheWriteTokens')
  const prompt = inputTokens === null || cacheReadTokens === null || cacheWriteTokens === null
    ? null : inputTokens + cacheReadTokens + cacheWriteTokens
  return { attempts, totals: { complete: samplesComplete && inputTokens !== null && outputTokens !== null,
    inputTokens, outputTokens, cacheReadTokens,
    cacheWriteTokens, totalTokens: sum('totalTokens'), cacheHitRatio: cacheReadTokens === null || prompt === null
      || !Number.isSafeInteger(prompt) || prompt === 0 ? null : cacheReadTokens / prompt } }
}

interface Sample {
  profile: 'headless' | 'science-headless'
  repetition: number
  wallMs: number
  exitCode: number
  timedOut: boolean
  answerMatches: boolean
  researchArtifactsMatch: boolean | null
  artifactFiles: string[]
  sessionFiles: string[]
  estimatedCost: null
  currency: null
  attempts: ScienceBenchmarkAttempt[]
  totals: ScienceBenchmarkTotals
}

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const researchFixture = fileURLToPath(new URL('./fixtures/science-benchmark/', import.meta.url))
const probePrompt = 'Reply with exactly SCIENCE BENCHMARK READY. Do not call tools.'
const researchPrompt = 'Read synthetic-study.md and observations.csv using the tools available in this profile. '
  + 'Compute the unweighted arithmetic mean for each group and the difference B minus A. '
  + 'Write analysis.json with numeric groupAMean, groupBMean, and difference fields. '
  + 'Write research-note.md containing the exact quote "Observed values describe this synthetic fixture only." '
  + 'from synthetic-study.md line 4 and the exact locator string synthetic-study.md:4, '
  + 'the descriptive results, and the exact disclosure: Synthetic data do not establish a real-world or causal finding. '
  + 'Do not use network services. After saving both files, reply exactly SCIENCE BENCHMARK READY.'
const researchOutputs = ['analysis.json', 'research-note.md'] as const

/** Check independent persisted artifacts for the fixed synthetic scientific workload.
 * @param cwd - The sample's private workspace.
 * @returns Whether the numeric results, quoted limitation and locator were saved.
 */
export async function verifyScienceBenchmarkArtifacts(cwd: string): Promise<boolean> {
  try {
    const analysis = z.object({ groupAMean: z.literal(3), groupBMean: z.literal(4), difference: z.literal(1) })
      .safeParse(JSON.parse(await readFile(join(cwd, 'analysis.json'), 'utf8')))
    const note = await readFile(join(cwd, 'research-note.md'), 'utf8')
    const inputsUnchanged = (await Promise.all(['synthetic-study.md', 'observations.csv'].map(async file =>
      (await readFile(join(cwd, file))).equals(await readFile(join(researchFixture, file)))))).every(Boolean)
    return analysis.success && inputsUnchanged && note.includes('Observed values describe this synthetic fixture only.')
      && note.includes('synthetic-study.md:4') && note.includes('Synthetic data do not establish a real-world or causal finding.')
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function sessions(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { recursive: true }))
      .filter(path => /(?:^|[/\\])session(?:\.v[1-9]\d*)?\.jsonl$/u.test(path)).sort()
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return []
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    process.stdout.write('Usage: node --import tsx/esm scripts/benchmark-science.ts [--out DIRECTORY] [--samples COUNT] [--mode src|lib] [--model MODEL] [--workload research|probe]\nMeasures real headless/science-headless provider attempts. No key writes status=unrun.\n')
    return
  }
  let output = resolve(repoRoot, 'artifacts', `science-benchmark-${new Date().toISOString().replace(/[:.]/gu, '-')}`)
  let repetitions = 2
  let mode: 'src' | 'lib' = 'src'
  let model = 'deepseek-flash'
  let workload: 'research' | 'probe' = 'research'
  for (let index = 0; index < args.length; index++) {
    const value = args[index + 1]
    switch (args[index]) {
      case '--out': if (value === undefined) throw new Error('--out needs a directory'); output = resolve(value); index++; break
      case '--samples': repetitions = Number(value); index++; break
      case '--mode': if (value !== 'src' && value !== 'lib') throw new Error('--mode must be src or lib'); mode = value; index++; break
      case '--model': if (value === undefined || !value.trim()) throw new Error('--model needs a model id'); model = value; index++; break
      case '--workload': if (value !== 'research' && value !== 'probe') throw new Error('--workload must be research or probe'); workload = value; index++; break
      default: throw new Error(`Unknown argument: ${args[index]}`)
    }
  }
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 20) throw new Error('--samples must be between 1 and 20')
  try { process.loadEnvFile(join(repoRoot, '.env')) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  await mkdir(output, { recursive: true })
  const report = {
    schemaVersion: 1, measurement: 'real-provider' as const, status: 'unrun', reason: '', mode, workload,
    prompt: workload === 'research' ? researchPrompt : probePrompt,
    generatedAt: new Date().toISOString(), samplesPerProfile: repetitions, samples: [] as Sample[],
    requestedRoute: { provider: 'deepseek-official', model },
    timing: 'wallMs includes CLI boot. First attempt starts at step/start; retry intervals start at prior settlement, including backoff. Embedded chunk times measure stream span. These are client observations, not server latency.',
    accounting: 'Usage is provider-reported across every settled attempt. Missing samples and buckets are null. No currency cost or billing invoice is inferred. Repeated requests may benefit from provider cache; no guaranteed cold cache is assumed.',
  }
  if (!process.env.DEEPSEEK_API_KEY?.trim()) report.reason = 'DEEPSEEK_API_KEY is unavailable; no provider request was made.'
  else {
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-science-benchmark-'))
    try {
      const patch = join(workspace, 'benchmark.patch.yml')
      await writeFile(patch, '- id: session-persistence-jsonl\n  config:\n    root: !!js dshHomePath("sessions")\n    compression: none\n- id: session-title-llm\n  disabled: true\n- id: plugin-package-inventory-deepseek\n  disabled: true\n- id: session-log-deepseek\n  config:\n    enabled: false\n'
        + `- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: ${JSON.stringify(model)}\n`)
      for (let repetition = 1; repetition <= repetitions; repetition++) {
        // Alternate order to limit a fixed profile-order effect on shared provider cache.
        const profiles: ('headless' | 'science-headless')[] = repetition % 2 === 1
          ? ['headless', 'science-headless'] : ['science-headless', 'headless']
        for (const profile of profiles) {
          const cwd = join(workspace, profile)
          await mkdir(cwd, { recursive: true })
          const home = join(cwd, '.dsh')
          const root = join(home, 'sessions')
          const previous = new Set(await sessions(root))
          if (workload === 'research') {
            for (const file of ['synthetic-study.md', 'observations.csv']) {
              await writeFile(join(cwd, file), await readFile(join(researchFixture, file)))
            }
            for (const file of researchOutputs) await rm(join(cwd, file), { force: true })
          }
          const launch = resolveExampleLaunch({ srcBin: join(repoRoot, 'apps/cli/src/bin.ts'), mode,
            sourceImport: 'tsx/esm', tsconfigPath: join(repoRoot, 'tsconfig.json'),
            configArgs: ['--profile', profile, '--patch', patch, report.prompt],
            env: { DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', DSH_SCIENCE_NONCOMMERCIAL: '0' } })
          process.stdout.write(`${profile} sample ${repetition}/${repetitions}\n`)
          const start = performance.now()
          const result = await execa(launch.command, launch.args, { cwd, env: launch.env, reject: false,
            timeout: 180000, forceKillAfterDelay: 5000, maxBuffer: 16 * 1024 * 1024 })
          const wallMs = performance.now() - start
          const files = (await sessions(root)).filter(path => !previous.has(path))
          const destination = join(output, `${profile}-${repetition}`)
          await mkdir(destination, { recursive: true })
          const measured: ReturnType<typeof measureScienceSession>[] = []
          for (const [index, path] of files.entries()) {
            const log = await readFile(join(root, path), 'utf8')
            await writeFile(join(destination, `session-${index + 1}.jsonl`), log)
            measured.push(measureScienceSession(log))
          }
          if (measured.length > 1) throw new Error('Simple benchmark task unexpectedly created multiple Sessions')
          const observation = measured[0] ?? measureScienceSession('')
          const researchArtifactsMatch = workload === 'research' ? await verifyScienceBenchmarkArtifacts(cwd) : null
          const artifactFiles: string[] = []
          if (workload === 'research') {
            for (const file of researchOutputs) {
              try {
                await writeFile(join(destination, file), await readFile(join(cwd, file)))
                artifactFiles.push(`${profile}-${repetition}/${file}`)
              } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
            }
          }
          report.samples.push({ profile, repetition, wallMs, exitCode: result.exitCode ?? -1, timedOut: result.timedOut,
            answerMatches: result.stdout.trim() === 'SCIENCE BENCHMARK READY',
            researchArtifactsMatch, artifactFiles,
            estimatedCost: null, currency: null,
            sessionFiles: files.map((_, index) => `${profile}-${repetition}/session-${index + 1}.jsonl`), ...observation })
          // Save after each sample so interrupted runs retain their completed observations.
          report.status = 'partial'
          await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
        }
      }
      report.status = report.samples.every(sample => sample.exitCode === 0 && !sample.timedOut && sample.answerMatches
        && sample.researchArtifactsMatch !== false && sample.attempts.length > 0 && sample.totals.complete) ? 'completed' : 'partial'
      if (report.status === 'partial') report.reason = 'At least one sample failed or omitted provider usage; inspect retained raw Sessions.'
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(`${report.status}: ${join(output, 'report.json')}\n`)
  if (report.status === 'partial') process.exitCode = 1
}

if (import.meta.main) {
  try { await main() }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 }
}
