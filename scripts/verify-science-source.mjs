/** Verify the public Git index contains every hash-pinned scientific resource. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const { values } = parseArgs({ options: { root: { type: 'string' } } })
const root = resolve(values.root ?? fileURLToPath(new URL('../', import.meta.url)))
const prefix = 'packages/skill/skill-science/assets/'
const assets = resolve(root, prefix)
const manifest = JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8'))
const declared = Object.entries(manifest.files)
if (declared.length === 0) throw new Error('Science source: empty resource inventory')
const tracked = new Map(execFileSync('git', ['ls-files', '--stage', '-z', '--', prefix], {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true,
}).split('\0').filter(Boolean).map(line => {
  const tab = line.indexOf('\t')
  return [line.slice(tab + 1), line.slice(0, tab).split(' ')[1]]
}))
const missing = []
const altered = []
const gitBlobMismatches = []
for (const [name, expected] of declared) {
  const path = resolve(assets, name)
  if (!path.startsWith(assets + sep)) throw new Error('Science source: resource outside assets')
  if (!tracked.has(prefix + name)) { missing.push(name); continue }
  const bytes = readFileSync(path)
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected) altered.push(name)
  const object = tracked.get(prefix + name)
  const rawObject = createHash(object.length === 64 ? 'sha256' : 'sha1')
    .update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  if (rawObject !== object) gitBlobMismatches.push(name)
}
if (missing.length || altered.length || gitBlobMismatches.length) {
  console.error(JSON.stringify({ missingFromGit: missing, changedResourceHashes: altered, gitBlobMismatches }))
  process.exitCode = 1
} else console.log(`Science source: ${Object.keys(manifest.files).length} pinned resources tracked and hash-verified.`)
