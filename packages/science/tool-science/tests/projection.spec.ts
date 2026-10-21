import { describe, expect, it } from 'vitest'
import { ToolCallId, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { initialScienceState, applyScienceEvent } from '../src/projection.ts'

function event<T extends SessionEvent['type']>(type: T, data: Extract<SessionEvent, { type: T }>['data'], time = 100): Extract<SessionEvent, { type: T }> {
  return { type, data, seq: SessionSeq(0), time } as Extract<SessionEvent, { type: T }>
}

describe('scientific session projection', () => {
  it('preserves irrelevant event identity and rejects malformed tool metadata', () => {
    const state = initialScienceState()
    expect(applyScienceEvent(state, event('user/message', createUserMessage({
      content: [{ type: 'text', text: 'question' }], source: { kind: 'user' },
    })))).toBe(state)
    expect(applyScienceEvent(state, event('tool/result', {
      turn: 0, step: 0, message: createToolResultMessage({ callId: ToolCallId('c'), content: [], isError: false }),
      meta: { kind: 'science', version: 1, snapshot: 'invalid' },
    }))).toBe(state)
  })

  it('keeps unknown cache accounting unknown instead of treating it as zero', () => {
    let state = initialScienceState()
    state = applyScienceEvent(state, event('step/start', { turn: 0, step: 0 }, 10))
    state = applyScienceEvent(state, event('assistant/message', {
      turn: 0, step: 0,
      message: createAssistantMessage({ content: [], source: { provider: 'deepseek-official', model: 'configured' } }),
      stream: [], usage: { inputTokens: 100, outputTokens: 20 },
    }, 100))
    expect(state.view.metrics.attempts).toBe(1)
    expect(state.view.metrics.cacheReadTokens).toBeNull()
    expect(state.view.metrics.cacheReadRatio).toBeNull()
    expect(state.view.metrics.estimatedCost).toBeNull()
  })

  it('counts failed and completed settled attempts using disjoint Messages buckets', () => {
    let state = initialScienceState()
    state = applyScienceEvent(state, event('step/start', { turn: 0, step: 0 }, 10))
    const usage = { inputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 0, outputTokens: 10, totalTokens: 110 }
    state = applyScienceEvent(state, event('assistant/attempt', {
      turn: 0, step: 0, stream: [{ type: 'chunk', time: 40, chunk: { type: 'usage', usage } }],
    }, 40))
    state = applyScienceEvent(state, event('assistant/message', {
      turn: 0, step: 0,
      message: createAssistantMessage({ content: [], source: { provider: 'deepseek-official', model: 'configured' } }),
      stream: [{ type: 'text-chunks', time0: 80, index: 0, dt: [], texts: ['Result'] }], usage,
    }, 100))
    expect(state.view.metrics.attempts).toBe(2)
    expect(state.view.metrics.uncachedInputTokens).toBe(40)
    expect(state.view.metrics.cacheReadTokens).toBe(160)
    expect(state.view.metrics.outputTokens).toBe(20)
    expect(state.view.metrics.cacheReadRatio).toBe(0.8)
  })
})
