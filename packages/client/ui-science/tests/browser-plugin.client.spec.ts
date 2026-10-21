import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '../../ui-renderer/src/client/registry.ts'
import { LocaleRuntime } from '../../locale/src/client/index.ts'
import { apply, inject } from '../src/client/index.ts'

describe('Science plugin registration', () => {
  it('waits for sidebar slots, registers a discoverable page and disposes cleanly', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const removeType = vi.fn()
    const register = vi.fn<Context['sidebarRightTabs']['register']>(() => removeType)
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('sidebarRightTabs', { register })
    const list = vi.fn(async () => ({ ok: true, value: { skills: [] } }))
    ctx.provide('remote', { skills: { list }, $on: vi.fn(() => vi.fn()) })
    ctx.provide('remote.skills', { list })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(register).toHaveBeenCalledOnce()
    expect(register.mock.calls[0]![0]).toMatchObject({ kind: 'science', guide: [expect.objectContaining({ id: 'science' })] })
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toEqual([])
    const disposeOwner = ctx.slots.register({ name: 'root', children: { 'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' }, 'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' } } } as never, () => null)
    await Promise.resolve()
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(1)
    expect(ctx.slots.entries('sidebar.right.pane.tab.title')).toHaveLength(1)
    disposeOwner()
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toEqual([])
    const secondOwner = ctx.slots.register({ name: 'root', children: { 'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' }, 'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' } } } as never, () => null)
    await Promise.resolve()
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(1)
    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toEqual([])
    expect(removeType).toHaveBeenCalledOnce()
    secondOwner()
  })
})
