import { afterEach, expect, it, vi } from 'vitest'
import { publicHttpNetwork } from '../src/network.ts'
import { fetchHttpResource } from '../src/resource.ts'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { installProxyFromEnvironment } from '@deepseek-ai/dsh-http-proxy'

const options = { timeoutMs: 1000, maxBytes: 64, maxRedirects: 2, userAgent: 'science-test' }
afterEach(() => { vi.restoreAllMocks() })

function transport(responses: Response[]) {
  const close = vi.fn(async () => {})
  const request = vi.spyOn(publicHttpNetwork, 'request').mockImplementation(async () => ({ response: responses.shift()! as never, close }))
  vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  return { request, close }
}

it('returns bounded PDF bytes and Retry-After without text decoding', async () => {
  const { close } = transport([new Response('%PDF-1.4', { status: 429, headers: { 'content-type': 'application/pdf', 'retry-after': '3' } })])
  const result = await fetchHttpResource('https://example.com/paper.pdf', options)
  expect(result.statusCode).toBe(429)
  expect(result.retryAfter).toBe('3')
  expect(new TextDecoder().decode(result.bytes)).toBe('%PDF-1.4')
  expect(close).toHaveBeenCalledOnce()
})

it('rejects overlong streams rather than returning a truncated PDF', async () => {
  const { close } = transport([new Response('x'.repeat(65))])
  await expect(fetchHttpResource('https://example.com/paper.pdf', options)).rejects.toMatchObject({ code: 'WEB_FETCH_TOO_LARGE' })
  expect(close).toHaveBeenCalledOnce()
})

it('accepts an exactly capped response', async () => {
  transport([new Response('x'.repeat(64))])
  expect((await fetchHttpResource('https://example.com/x', options)).bytes.length).toBe(64)
})

it('refuses cross-origin redirects before contacting the new host', async () => {
  const { request, close } = transport([new Response(null, { status: 302, headers: { location: 'https://other.example/x' } })])
  await expect(fetchHttpResource('https://example.com/x', options)).rejects.toMatchObject({ code: 'WEB_REDIRECT_BLOCKED' })
  expect(request).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})

it('refuses every redirect on a credential-bearing request', async () => {
  const { request } = transport([new Response(null, { status: 302, headers: { location: '/other' } })])
  await expect(fetchHttpResource('https://example.com/x?api_key=secret', { ...options, credentialed: true })).rejects.toMatchObject({ code: 'WEB_REDIRECT_BLOCKED' })
  expect(request).toHaveBeenCalledOnce()
})

it('validates user URLs before transport', async () => {
  const request = vi.spyOn(publicHttpNetwork, 'request')
  await expect(fetchHttpResource('file:///etc/passwd', options)).rejects.toMatchObject({ code: 'WEB_INVALID_URL' })
  await expect(fetchHttpResource('https://user:pass@example.com', options)).rejects.toMatchObject({ code: 'WEB_BLOCKED_URL' })
  expect(request).not.toHaveBeenCalled()
})

it('propagates cancellation without a request', async () => {
  const controller = new AbortController()
  controller.abort()
  const request = vi.spyOn(publicHttpNetwork, 'request')
  await expect(fetchHttpResource('https://example.com/x', options, controller.signal)).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  expect(request).not.toHaveBeenCalled()
})

it('cancels an in-progress body read and closes its dispatcher', async () => {
  const cancelled = vi.fn()
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])) }, cancel: cancelled })
  const { request, close } = transport([new Response(body)])
  const controller = new AbortController()
  const pending = fetchHttpResource('https://example.com/x', options, controller.signal)
  await vi.waitFor(() => { expect(request).toHaveBeenCalledOnce() })
  controller.abort()
  await expect(pending).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  expect(cancelled).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})

it('times out a body that never completes and cleans up', async () => {
  const cancelled = vi.fn()
  const { close } = transport([new Response(new ReadableStream({ cancel: cancelled }))])
  await expect(fetchHttpResource('https://example.com/x', { ...options, timeoutMs: 20 })).rejects.toMatchObject({ code: 'WEB_FETCH_TIMEOUT' })
  expect(cancelled).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})

it('blocks a private destination before opening a connection', async () => {
  const request = vi.spyOn(publicHttpNetwork, 'request')
  await expect(fetchHttpResource('https://127.0.0.1/paper', options)).rejects.toMatchObject({ code: 'WEB_BLOCKED_URL' })
  expect(request).not.toHaveBeenCalled()
})

it('retrieves raw bytes through the configured proxy without resolving the origin locally', async () => {
  const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'application/pdf' }); response.end('%PDF-proxy') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const proxyUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const dispose = await installProxyFromEnvironment({ get: name => name === 'HTTP_PROXY' ? { value: proxyUrl } : undefined }, () => undefined)
  const resolve = vi.spyOn(publicHttpNetwork, 'resolve')
  try {
    const result = await fetchHttpResource('http://origin.test/paper', options)
    expect(new TextDecoder().decode(result.bytes)).toBe('%PDF-proxy')
    expect(resolve).not.toHaveBeenCalled()
  } finally {
    await dispose()
    await new Promise<void>(done => server.close(() => { done() }))
  }
})
