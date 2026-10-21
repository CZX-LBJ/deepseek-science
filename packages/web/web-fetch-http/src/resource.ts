/** Bounded public HTTP resource retrieval, including binary research documents. */
import { WebError } from '@deepseek-ai/dsh-web'
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { proxyRouteFor } from '@deepseek-ai/dsh-http-proxy'
import type { Response } from 'undici'
import { isNonPublicIpLiteral, publicHttpNetwork } from './network.ts'
import { isSameOrigin, validateFetchUrl } from './policy.ts'

/** Complete limits, chosen by the resource consumer rather than an untrusted document. */
export interface HttpResourceOptions {
  timeoutMs: number
  maxBytes: number
  maxRedirects: number
  userAgent: string
  /** Credential-bearing requests refuse every redirect, including same-origin hops. */
  credentialed?: boolean
}

/** Complete raw response; oversized bodies fail rather than masquerading as complete files. */
export interface HttpResource {
  url: string
  statusCode: number
  bytes: Uint8Array
  contentType?: string
  retryAfter?: string
}

/**
 * Fetch complete, bounded bytes through the existing public-address/proxy policy.
 * No ambient credentials are sent. Non-2xx HTTP responses remain inspectable data.
 * @param url - HTTP(S) URL without embedded credentials.
 * @param options - timeout, byte and same-origin redirect budgets.
 * @param signal - caller cancellation, forwarded through DNS, transport and body reads.
 * @returns complete response bytes plus source status and selected diagnostic headers.
 */
export async function fetchHttpResource(url: string, options: HttpResourceOptions, signal?: AbortSignal): Promise<HttpResource> {
  if (signal?.aborted) throw new WebError('resource fetch aborted', 'WEB_ABORTED')
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1
    || !Number.isSafeInteger(options.maxRedirects) || options.maxRedirects < 0
    || typeof options.userAgent !== 'string' || options.userAgent.trim().length === 0) {
    throw new WebError('invalid resource byte, redirect or user-agent limits', 'WEB_INVALID_REQUEST')
  }
  let current = validateFetchUrl(url)
  using timer = deadline(signal, options.timeoutMs, 'WEB_FETCH_TIMEOUT')
  const stopped = timer.signal
  try {
    for (let redirects = 0; ; redirects++) {
      stopped.throwIfAborted()
      const headers = { 'user-agent': options.userAgent, accept: 'application/pdf,application/json,application/xml,text/*;q=0.9,*/*;q=0.1' }
      const route = proxyRouteFor(current)
      const request = route.proxied && !isNonPublicIpLiteral(current.hostname)
        ? await publicHttpNetwork.requestVia(route.dispatcher, current, headers, stopped)
        : await publicHttpNetwork.request(current, await publicHttpNetwork.resolve(current.hostname, stopped), headers, stopped)
      const { response } = request
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel()
          if (options.credentialed === true || redirects >= options.maxRedirects) {
            throw new WebError('resource redirect is blocked by the request policy', 'WEB_REDIRECT_BLOCKED')
          }
          const location = response.headers.get('location')
          if (location === null) throw new WebError('resource redirect has no Location', 'WEB_REDIRECT_BLOCKED')
          const next = validateFetchUrl(new URL(location, current).href)
          if (!isSameOrigin(current, next)) throw new WebError('cross-origin resource redirect is blocked', 'WEB_REDIRECT_BLOCKED')
          current = next
          continue
        }
        const bytes = await readComplete(response, options.maxBytes, stopped)
        const contentType = response.headers.get('content-type')
        const retryAfter = response.headers.get('retry-after')
        return {
          url: current.href,
          statusCode: response.status,
          bytes,
          ...contentType === null ? {} : { contentType },
          ...retryAfter === null ? {} : { retryAfter },
        }
      } finally {
        await request.close()
      }
    }
  } catch (error: unknown) {
    if (error instanceof WebError) throw error
    const timeout = timeoutOf(stopped, 'WEB_FETCH_TIMEOUT')
    if (timeout !== undefined) throw new WebError('resource fetch timed out', 'WEB_FETCH_TIMEOUT', { cause: timeout })
    if (stopped.aborted) throw new WebError('resource fetch aborted', 'WEB_ABORTED', { cause: error })
    throw new WebError('resource transport failed', 'WEB_PROVIDER_ERROR', { cause: error })
  }
}

async function readComplete(response: Response, cap: number, signal: AbortSignal): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > cap) {
    await response.body?.cancel()
    throw new WebError(`resource exceeds ${cap} bytes`, 'WEB_FETCH_TOO_LARGE')
  }
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > cap) throw new WebError(`resource exceeds ${cap} bytes`, 'WEB_FETCH_TOO_LARGE')
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
  }
}
