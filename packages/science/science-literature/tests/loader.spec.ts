/** Real Loader/app-process composition, independent of the in-process service fixture. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { tinyPDF } from './fixtures.ts'
import type { ReadResult } from '../src/types.ts'

it('boots YAML through the real app Loader and commits readable page evidence', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-literature-loader-'))
  const config = join(cwd, 'cordis.yml')
  const root = fileURLToPath(new URL('../../../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./loader.fixture.ts', import.meta.url))
  try {
    await writeFile(join(cwd, 'paper.pdf'), tinyPDF(['First page', 'Loader-backed second page']))
    await writeFile(config, `- id: fs\n  name: '@deepseek-ai/dsh-fs-local'\n  config:\n    cwd: ${JSON.stringify(cwd)}\n- id: literature\n  name: '@deepseek-ai/dsh-science-literature'\n`)
    const result = await promisify(execFile)(process.execPath, ['--expose-internals', '--import', import.meta.resolve('tsx'), fixture, config, cwd], {
      cwd: root, timeout: 30000, env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.base.json') }, maxBuffer: 1024 * 1024,
    })
    const line = result.stdout.split(/\r?\n/u).find(l => l.startsWith('SCIENCE_RESULT='))!
    const read = JSON.parse(line.slice('SCIENCE_RESULT='.length)) as ReadResult
    expect(read).toMatchObject({ status: 'ready', depth: 'full-text' })
    expect(read.excerpts[0]).toMatchObject({ page: 2, locator: 'page:2' })
    expect(read.excerpts[0]?.text).toContain('Loader-backed second page')
    const evidence = JSON.parse(await readFile(read.cachePath!, 'utf8')) as { sha256: string }
    expect(evidence.sha256).toBe(read.sha256)
  } finally { await rm(cwd, { recursive: true, force: true }) }
}, 40000)
