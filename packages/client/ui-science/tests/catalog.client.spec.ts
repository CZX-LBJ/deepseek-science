import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Context } from '@deepseek-ai/cordis'
import { ScienceCatalog } from '../src/client/catalog.ts'

const SID = 's-science' as SessionId

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function success(name: string) {
  return { ok: true as const, value: { skills: [{ name, description: 'Instruction only', modelInvocable: true }] } }
}

describe('Science instruction catalog', () => {
  it('shares one pending read and reports the exact Session identity', async () => {
    const result = deferred<ReturnType<typeof success>>()
    const list = vi.fn<Context['remote']['skills']['list']>(() => result.promise)
    const catalog = new ScienceCatalog(SID, { list })
    const first = catalog.load()
    expect(catalog.load()).toBe(first)
    expect(list).toHaveBeenCalledOnce()
    expect(list.mock.calls[0]?.[0]).toEqual({ sessionId: SID })
    result.resolve(success('literature'))
    await first
    expect(catalog.source.getSnapshot()).toMatchObject({ status: 'ready', skills: [{ name: 'literature' }] })
  })

  it('rejects an old settlement after invalidation and permits a replacement read', async () => {
    const old = deferred<ReturnType<typeof success>>()
    const list = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(success('current'))
    const catalog = new ScienceCatalog(SID, { list })
    const first = catalog.load()
    catalog.invalidate()
    await catalog.load()
    old.resolve(success('obsolete'))
    await first
    expect(catalog.source.getSnapshot().skills[0]?.name).toBe('current')
  })

  it('keeps readable instructions on failure and retries through the same source', async () => {
    const list = vi.fn().mockResolvedValueOnce(success('kept')).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(success('recovered'))
    const catalog = new ScienceCatalog(SID, { list })
    const source = catalog.source
    await catalog.load()
    await catalog.load()
    expect(source.getSnapshot()).toMatchObject({ status: 'failed', skills: [{ name: 'kept' }], error: 'Error: offline' })
    await catalog.load()
    expect(catalog.source).toBe(source)
    expect(source.getSnapshot().skills[0]?.name).toBe('recovered')
  })

  it('awaits a cancelled pending read on teardown and never publishes its outcome', async () => {
    const result = deferred<ReturnType<typeof success>>()
    const list = vi.fn(() => result.promise)
    const catalog = new ScienceCatalog(SID, { list })
    const read = catalog.load()
    const before = catalog.source.getSnapshot()
    const finished = vi.fn()
    const disposed = catalog.dispose()
    expect(disposed).toBeInstanceOf(Promise)
    void disposed.then(finished)
    await Promise.resolve()
    expect(finished).not.toHaveBeenCalled()
    result.resolve(success('too late'))
    await disposed
    await read
    expect(catalog.source.getSnapshot()).toBe(before)
    await catalog.load()
    expect(list).toHaveBeenCalledOnce()
  })
})
