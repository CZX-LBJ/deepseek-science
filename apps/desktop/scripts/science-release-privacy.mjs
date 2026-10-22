/** Remove generated build metadata and inspect unpacked Science release bytes before publication. */
import { existsSync, lstatSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

function releaseRoot(directory) {
  const root = resolve(directory)
  const manifest = JSON.parse(readFileSync(join(root, 'resources', 'app', 'package.json'), 'utf8'))
  if (manifest.dshScience !== true) throw new Error('Science privacy: expected a prepared Science application')
  return root
}

function filesWithin(root) {
  const files = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (!path.startsWith(root + sep) || lstatSync(path).isSymbolicLink()) throw new Error('Science privacy: resource escapes application')
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
      else throw new Error('Science privacy: unsupported resource entry')
    }
  }
  visit(root)
  return files
}

function relativeFontToolsCommands(root) {
  const python = join(root, 'resources', 'runtime', 'primary-runtime', 'dependencies', 'python')
  const libraries = join(python, 'Lib', 'site-packages')
  if (!existsSync(libraries)) return 0
  const distributions = readdirSync(libraries).filter(name => /^fonttools-[\d.]+\.dist-info$/u.test(name))
  let changed = 0
  for (const distribution of distributions) {
    const entries = readFileSync(join(libraries, distribution, 'entry_points.txt'), 'utf8')
      .split('[console_scripts]')[1]?.split(/\n\[/u)[0] ?? ''
    for (const line of entries.split(/\r?\n/u)) {
      const match = /^([a-z][\w-]*)\s*=\s*([\w.]+):([a-zA-Z_]\w*)$/u.exec(line.trim())
      if (match === null) continue
      const [, command, module, method] = match
      const launcher = join(python, 'Scripts', `${command}.exe`)
      if (!existsSync(launcher)) continue
      writeFileSync(join(python, 'Scripts', `${command}.cmd`),
        `@echo off\r\n"%~dp0..\\python.exe" -I -B -c "from ${module} import ${method}; ${method}()" %*\r\n`)
      unlinkSync(launcher)
      changed++
    }
  }
  return changed
}

/** Remove bytecode caches, installer metadata and generated comments, preserving executable JS and pinned resources.
 * @param directory - A prepared application carrying dshScience metadata.
 * @returns Counts of removed or rewritten generated files; no source paths or credentials are returned.
 */
export function sanitizeScienceRelease(directory) {
  const root = releaseRoot(directory)
  const counts = { removedGeneratedFiles: 0, rewrittenComments: 0, relativeConsoleCommands: relativeFontToolsCommands(root) }
  for (const path of filesWithin(root)) {
    if (path.endsWith('.pyc') || basename(path) === '.modules.yaml'
      || basename(path) === 'direct_url.json' && dirname(path).endsWith('.dist-info')) {
      unlinkSync(path)
      counts.removedGeneratedFiles++
      continue
    }
    if (!path.endsWith('.js') && !path.includes(`${sep}.bin${sep}`)) continue
    const original = readFileSync(path, 'utf8')
    const cleaned = original.replace(/^[ \t]*\/\/#(?:end)?region[^\r\n]*(?:\r?\n|$)/gmu, '')
      .replace(/^# cmd-shim-target=[^\r\n]*(?:\r?\n|$)/gmu, '')
    if (cleaned === original) continue
    writeFileSync(path, cleaned)
    counts.rewrittenComments++
  }
  return counts
}

/** Check actual unpacked files, including binary UTF-16 strings; findings never include matched secret values.
 * @param directory - Prepared Science application directory.
 * @param forbiddenRoots - Build workspace and user-profile roots forbidden in published bytes.
 * @returns File count and relative paths of unresolved credentials, private files or local paths.
 */
export function auditScienceRelease(directory, forbiddenRoots) {
  const root = releaseRoot(directory)
  const normalized = forbiddenRoots.map(value => value.replaceAll('\\', '/').toLowerCase().replace(/\/$/u, ''))
  if (normalized.length === 0 || normalized.some(value => value.length < 5)) throw new Error('Science privacy: explicit build or profile roots are required')
  const findings = []
  const files = filesWithin(root)
  for (const path of files) {
    const name = relative(root, path).split(sep).join('/')
    if (/^(?:\.env(?:\.(?!example$|sample$|template$).*)?|\.credentials\.(?:yaml|json))$/u.test(basename(path))) {
      findings.push({ path: name, kind: 'private-file' })
    }
    const bytes = readFileSync(path)
    const texts = [bytes.toString('utf8')]
    if (bytes.includes(0)) texts.push(bytes.toString('utf16le'))
    if (texts.some(text => /\b(?:sk-[a-f0-9]{32}|sk-proj-[\w-]{35,}|github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,})\b/u.test(text))) {
      findings.push({ path: name, kind: 'credential' })
    }
    if (texts.some(text => {
      const value = text.replaceAll('\\\\', '\\').replaceAll('\\', '/').toLowerCase()
      return normalized.some(prefix => value.includes(prefix))
    })) findings.push({ path: name, kind: 'local-path' })
  }
  return { scannedFiles: files.length, findings }
}
