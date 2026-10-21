/** Contended writer cancellation preserves the current holder's lock. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { withFileLock } from '../src/index.ts'

it('cancels a waiting writer without removing the current holder or executing its operation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-lock-cancel-'))
  const filename = join(directory, 'state.json')
  const signal = new AbortController()
  const operation = vi.fn(async () => 'unexpected')
  try {
    await writeFile(`${filename}.lock`, `${process.pid}\n`)
    const waiting = withFileLock(filename, operation, { waitMs: 10000, signal: signal.signal })
    signal.abort(new Error('cancelled writer'))
    await expect(waiting).rejects.toThrow('cancelled writer')
    expect(operation).not.toHaveBeenCalled()
    expect(await readFile(`${filename}.lock`, 'utf8')).toBe(`${process.pid}\n`)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
