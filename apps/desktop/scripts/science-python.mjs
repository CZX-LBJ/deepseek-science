/** Install hash-pinned plotting wheels into the application's own Python. */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import lock from './science-python.lock.json' with { type: 'json' }

/**
 * Extend the prepared Python using only local, hash-verified wheel files.
 * @param {string} runtime - Application runtime directory containing primary-runtime.
 * @param {string} wheelDirectory - Local cache of the seven pinned plotting wheels.
 */
export function installSciencePlotting(runtime, wheelDirectory) {
  const root = join(runtime, 'primary-runtime')
  const path = join(root, 'runtime.json')
  const metadata = JSON.parse(readFileSync(path, 'utf8'))
  if (metadata.platform !== 'win32' || metadata.arch !== 'x64' || !metadata.python.startsWith(lock.python + '.')) {
    throw new Error('science Python: plotting wheels require Windows x64 CPython 3.12')
  }
  const wheels = lock.wheels.map(entry => {
    const file = join(wheelDirectory, entry.filename)
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== entry.sha256) {
      throw new Error(`science Python: wheel checksum mismatch ${entry.filename}`)
    }
    return file
  })
  const python = join(root, 'dependencies', 'python', 'python.exe')
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/(?:KEY|TOKEN|SECRET|PASSWORD)/iu.test(name)))
  const options = { env: environment, encoding: 'utf8', windowsHide: true, timeout: 120000 }
  execFileSync(python, ['-I', '-B', '-m', 'pip', 'install', '--no-index', '--no-deps', ...wheels], options)
  execFileSync(python, ['-I', '-B', '-m', 'pip', 'check'], options)
  const versions = JSON.parse(execFileSync(python, ['-I', '-B', '-c',
    'import json, importlib.metadata as m; print(json.dumps({n:m.version(n) for n in ["matplotlib","contourpy","cycler","fonttools","kiwisolver","packaging","pyparsing"]}))'], options))
  metadata.pythonPackages = { ...metadata.pythonPackages, ...versions }
  const composition = { basePayloadDigest: metadata.payloadDigest, plottingWheels: lock.wheels }
  metadata.payloadDigest = createHash('sha256').update(JSON.stringify(composition)).digest('hex')
  writeFileSync(path, JSON.stringify(metadata, null, 2) + '\n')
  writeFileSync(join(runtime, 'science-python.json'), JSON.stringify({ ...composition, packages: versions }, null, 2) + '\n')
  console.log('Science plotting runtime verified:', versions.matplotlib)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { runtime: { type: 'string' }, wheels: { type: 'string' } } })
  if (!values.runtime || !values.wheels) throw new Error('Usage: science-python.mjs --runtime DIRECTORY --wheels DIRECTORY')
  installSciencePlotting(resolve(values.runtime), resolve(values.wheels))
}
