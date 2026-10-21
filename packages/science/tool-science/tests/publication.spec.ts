import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const execute = promisify(execFile)

it('runs the maintained publication CLI acceptance checks through Python', async () => {
  const test = fileURLToPath(new URL('./test_publication.py', import.meta.url))
  const python = process.env['DSH_SCIENCE_PYTHON'] ?? (process.platform === 'win32' ? 'python' : 'python3')
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD/iu.test(name)))
  const result = await execute(python, [test], { env, timeout: 60_000, maxBuffer: 1024 * 1024, encoding: 'utf8' })
  expect(result.stderr).toContain('OK')
}, 65_000)
