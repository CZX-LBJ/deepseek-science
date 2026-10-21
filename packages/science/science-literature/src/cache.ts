/** Immutable evidence records use the composed filesystem and the caller's write authority. */
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { hash, object } from './metadata.ts'
import type { CacheScope, DocumentText } from './types.ts'

async function targetFor(fs: FileSystem, name: string, scope: CacheScope, signal: AbortSignal) {
  if (!scope.cwd.trim() || !scope.sandboxPolicy.workspaceRoot.trim()) {
    throw new HarnessError('cache requires a workspace and its execution policy', 'SCIENCE_CACHE_DENIED')
  }
  const target = await fs.resolve(`.deepseek-science/literature/${name}.json`, { cwd: scope.cwd, signal })
  const root = await fs.resolve(scope.sandboxPolicy.workspaceRoot, { signal })
  if (!fs.contains(root, target)) throw new HarnessError('literature cache must stay inside the calling workspace', 'SCIENCE_CACHE_DENIED')
  return target
}

/** Publish immutable workspace evidence under the caller’s write authority.
 * @param fs - composed filesystem.
 * @param value - complete JSON-compatible evidence to store.
 * @param scope - authorized workspace, or undefined to omit publication.
 * @param signal - operation cancellation.
 * @param name - optional cache identifier; otherwise the content hash.
 * @returns the committed path, or undefined when caching is omitted; collisions and denied writes reject.
 */
export async function saveCache(
  fs: FileSystem, value: unknown, scope: CacheScope | undefined, signal: AbortSignal, name?: string,
): Promise<string | undefined> {
  if (scope === undefined) return undefined
  if (scope.sandboxPolicy.mode === 'read-only') throw new HarnessError('literature cache writes are denied in read-only mode', 'SCIENCE_CACHE_DENIED')
  const text = JSON.stringify(value)
  const bytes = Buffer.byteLength(text)
  if (bytes > 64 * 1024 * 1024) throw new HarnessError('literature evidence exceeds the 64 MiB cache record cap', 'SCIENCE_CACHE_TOO_LARGE')
  const target = await targetFor(fs, name ?? hash(text), scope, signal)
  const identical = async () => {
    const previous = new TextDecoder().decode(await fs.readBytes(target, signal, bytes))
    if (previous !== text) throw new HarnessError('immutable literature evidence differs from the cached record', 'SCIENCE_CACHE_CONFLICT')
  }
  if (await fs.stat(target, signal) !== undefined) { await identical(); return target.displayPath }
  try { await fs.writeText(target, text, { kind: 'createIfAbsent' }, signal, scope.sandboxPolicy) }
  catch (error: unknown) {
    if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'FS_NOT_OBSERVED') throw error
    await identical()
  }
  return target.displayPath
}

/** Read an extracted document only after its current authorized source bytes have been hashed. */
/** Load extracted text after the caller hashes current authorized source bytes.
 * @param fs - composed filesystem.
 * @param name - extracted-document cache identifier.
 * @param sha256 - current source-byte digest.
 * @param scope - workspace and its access policy.
 * @param signal - operation cancellation.
 * @param maxBytes - complete cached-record read budget.
 * @returns verified text and its path, or undefined when no cached record exists.
 */
export async function loadDocument(
  fs: FileSystem, name: string, sha256: string, scope: CacheScope | undefined, signal: AbortSignal, maxBytes: number,
): Promise<{ text: DocumentText; path: string } | undefined> {
  if (scope === undefined) return undefined
  const target = await targetFor(fs, name, scope, signal)
  if (await fs.stat(target, signal) === undefined) return undefined
  const value = object(JSON.parse(new TextDecoder().decode(await fs.readBytes(target, signal, maxBytes))))
  if (value.kind !== 'document' || value.sha256 !== sha256 || !Array.isArray(value.pages)
    || !value.pages.every(p => typeof p === 'string') || !Number.isInteger(value.totalPages) || typeof value.truncated !== 'boolean'
    || value.textSha256 !== hash(JSON.stringify(value.pages))) {
    throw new HarnessError('cached literature text has an invalid evidence identity', 'SCIENCE_CACHE_INVALID')
  }
  return { text: { pages: value.pages, totalPages: Number(value.totalPages), truncated: value.truncated }, path: target.displayPath }
}
