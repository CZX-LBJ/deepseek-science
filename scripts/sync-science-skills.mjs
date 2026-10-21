/** Reproducible, explicit science asset synchronization; never runs upstream scripts. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, posix, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(new URL('../packages/skill/skill-science/package.json', import.meta.url))
const { parse: parseYaml } = require('yaml')
const packageRoot = fileURLToPath(new URL('../packages/skill/skill-science/', import.meta.url))
const defaultPacks = ['core', 'ai', 'nature']
const supportName = 'nature-shared'
const prohibitedNames = new Set(['docx', 'pdf', 'pptx', 'xlsx'])
const curated = {
  openscience: new Set(['acceptance-checks', 'analysis-report', 'citations', 'execution-hygiene', 'figures', 'hypotheses', 'literature-review', 'paper-writing', 'peer-review', 'reproduce', 'sources', 'statistical-conventions', 'submitted-code', 'brainstorming']),
  'nature-skills': new Set(['nature-writing', 'nature-polishing', 'nature-response', 'nature-reader', 'nature-ref-verifier', 'nature-statistics', 'nature-reviewer', 'nature-paper-card', 'nature-citation', 'nature-data', 'nature-shared']),
  superpowers: new Set(['systematic-debugging', 'writing-plans', 'verification-before-completion', 'receiving-code-review', 'requesting-code-review']),
  'ai-research-skills': new Set(['ml-paper-writing', 'systems-paper-writing', 'brainstorming-research-ideas', 'creative-thinking-for-research', 'academic-plotting', 'ml-training-recipes']),
  'scientific-agent-skills': new Set(['scientific-critical-thinking', 'scientific-brainstorming', 'experimental-design', 'statistical-analysis', 'hypothesis-generation']),
}
const packBySource = {
  openscience: 'extended', superpowers: 'engineering', 'nature-skills': 'nature-extended',
  'mattpocock-skills': 'engineering', 'academic-research-skills': 'academic-noncommercial',
  'scientific-agent-skills': 'scientific', 'claude-scientific-writer': 'scientific',
  'ai-research-skills': 'ai-extended', 'huggingface-skills': 'huggingface',
  'claude-scholar': 'scholar', aris: 'aris',
  'academic-research-skills-codex': 'academic-codex-noncommercial',
  bioskills: 'biology', 'kicad-happy': 'electronics', 'lean4-skills': 'mathematics',
  'sympy-guides': 'mathematics', 'scipy-guides': 'numerical',
  'control-guides': 'control', 'qutip-guides': 'physics',
}
const authorBySource = {
  openscience: 'Synthetic Sciences', superpowers: 'Jesse Vincent', 'nature-skills': 'Nature Skills contributors',
  'mattpocock-skills': 'Matt Pocock', 'academic-research-skills': 'Cheng-I Wu',
  'scientific-agent-skills': 'K-Dense Inc.', 'claude-scientific-writer': 'K-Dense Inc.',
  'ai-research-skills': 'Orchestra Research', 'huggingface-skills': 'Hugging Face contributors',
  'claude-scholar': 'Galaxy Dawn contributors', aris: 'ARIS contributors',
  'academic-research-skills-codex': 'Cheng-I Wu',
  bioskills: 'GPTomics contributors', 'kicad-happy': 'Andrew Klofas and contributors',
  'lean4-skills': 'Cameron Freer and contributors', 'sympy-guides': 'SymPy Development Team',
  'scipy-guides': 'SciPy Developers', 'control-guides': 'python-control developers',
  'qutip-guides': 'QuTiP developers and contributors',
}
const platformResources = {
  aris: ['mcp-servers', 'tools', 'templates', 'skills/shared-references', 'skills/skills-codex/shared-references'],
  'claude-scholar': ['agents', 'commands', 'hooks', 'rules', 'scripts', 'templates', 'utils'],
  'lean4-skills': ['plugins/lean4/commands', 'plugins/lean4/lib', 'plugins/lean4/agents', 'plugins/lean4/bin'],
}

/** Assign stable public names to source entries. */
export function assignNames(entries, locks = []) {
  const locked = new Map(locks.map(entry => [`${entry.source}:${entry.path}`, entry.name]))
  const reserved = new Set(locks.map(entry => entry.name))
  const counts = new Map()
  for (const entry of entries) counts.set(entry.originalName, (counts.get(entry.originalName) ?? 0) + 1)
  const named = entries.map(entry => {
    const lockedName = locked.get(`${entry.source.id}:${entry.source.path}`)
    if (lockedName !== undefined) return { ...entry, name: lockedName }
    const name = reserved.has(entry.originalName) || counts.get(entry.originalName) > 1 && entry.source.id !== 'nature-skills'
      ? `${entry.source.id}-${entry.originalName}` : entry.originalName
    return { ...entry, name: reserved.has(name) ? `${name}-${entry.digest.slice(0, 16)}` : name }
  })
  const nameCounts = new Map()
  for (const entry of named) nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + 1)
  return named.map(entry => nameCounts.get(entry.name) > 1 && !locked.has(`${entry.source.id}:${entry.source.path}`)
    ? { ...entry, name: `${entry.name}-${entry.digest.slice(0, 16)}` }
    : entry).sort((left, right) => compare(left.name, right.name))
}

/** Whether a reviewed license permits redistribution. */
export function permittedLicense(text) {
  if (/Anthropic.*(?:All rights reserved|agreement)|governed by your agreement|proprietary|no redistribution/isu.test(text)) return false
  return isBsdThreeClause(text) || /\bMIT\b|\bApache\b|\bBSD\b|Creative Commons|Attribution|CC-BY(?:-NC)?-4\.0|creativecommons\.org\/licenses\/by\/4\.0|CC0|public domain|GNU (?:General|Lesser)/iu.test(text)
}

function isBsdThreeClause(text) {
  return /Redistribution and use in source and binary forms[\s\S]*are permitted/iu.test(text)
    && /(?:^|\n)\s*(?:3[.)]|c\.)\s*Neither the name/iu.test(text)
    && /THIS SOFTWARE IS PROVIDED[\s\S]*AS IS/iu.test(text)
}

/** Require a present upstream root license before selecting resource files. */
export function reviewedRootLegalFiles(paths) {
  const legal = paths.filter(path => /^(?:LICENSE(?:\.[a-z]+)?|NOTICE(?:\.[a-z]+)?|THIRD_PARTY\.md)$/iu.test(path))
  if (!legal.some(path => /^LICENSE/iu.test(path))) throw new Error('Source has no root license')
  return legal
}

/** Validate explicit upstream document selections for locally authored knowledge adapters. */
export function reviewedKnowledgeResources(guide, paths) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(guide.name) || typeof guide.description !== 'string' || guide.description.trim() === '') throw new Error('Invalid knowledge guide metadata')
  if (typeof guide.instructions !== 'string' || guide.instructions.trim() === '') throw new Error('Knowledge guide requires local instructions')
  const resources = [...new Set([guide.sourcePath, ...guide.resourcePaths])].sort(compare)
  const tree = new Set(paths)
  for (const path of resources) {
    safeAssetPath(packageRoot, path)
    if (!tree.has(path) || !keepResource(path)) throw new Error(`Missing or excluded reviewed knowledge resource: ${path}`)
  }
  return resources
}

/** Apply reviewed repository terms to an informational notice, retaining its restrictions. */
export function permittedNotice(text, inheritedLicense) {
  return permittedLicense(`${inheritedLicense}\n${text}`)
}

/** Resolve the supported local license pointer only when its referenced file exists. */
export function declaredLicenseTerms(declared, referencedLicense) {
  return /^Complete terms in LICENSE\.txt$/iu.test(declared ?? '') && referencedLicense !== undefined
    ? referencedLicense : declared
}

/** Resolve a generated relative path under an asset root. */
export function safeAssetPath(root, relative) {
  if (isAbsolute(relative) || /^[a-z]:/iu.test(relative) || relative.includes('\\')) throw new Error('Asset path must be relative with forward slashes')
  const target = resolve(root, relative)
  if (!target.startsWith(resolve(root) + sep)) throw new Error('Asset path is outside asset root')
  return target
}
/** Validate the package-contained destination before writing or replacing assets. */
export function safePackageTarget(target) {
  const resolved = resolve(target)
  const packageDirectory = resolve(packageRoot)
  if (!resolved.startsWith(packageDirectory + sep)) throw new Error('Asset destination must stay inside the skill-science package')
  if (existsSync(resolved) && !lstatSync(resolved).isDirectory()) throw new Error('Asset destination must be a real directory inside skill-science')
  let ancestor = resolved
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  const physicalPackage = realpathSync(packageDirectory)
  const physicalAncestor = realpathSync(ancestor)
  if (physicalAncestor !== physicalPackage && !physicalAncestor.startsWith(physicalPackage + sep)) throw new Error('Asset destination must stay physically inside skill-science')
  return resolved
}

function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0 }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function jsonFile(path) { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, '')) }
function git(repository, args, binary = false) {
  const result = spawnSync('git', ['-C', repository, ...args], { encoding: binary ? undefined : 'utf8', maxBuffer: 128 * 1024 * 1024, windowsHide: true })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${String(result.stderr)}`)
  return result.stdout
}
function extractPinnedFiles(repository, commit, paths, destination) {
  const result = spawnSync('git', ['-C', repository, 'cat-file', '--batch'], { input: Buffer.from(paths.map(path => `${commit}:${path}\n`).join('')), maxBuffer: 128 * 1024 * 1024, windowsHide: true })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`git cat-file failed: ${String(result.stderr)}`)
  let offset = 0
  for (const path of paths) {
    const end = result.stdout.indexOf(10, offset)
    const header = result.stdout.subarray(offset, end).toString('utf8')
    const match = /^[a-f0-9]{40} blob (\d+)$/u.exec(header)
    if (end < 0 || match === null) throw new Error(`Pinned resource is not a readable blob: ${path}`)
    const length = Number(match[1])
    const start = end + 1
    if (!Number.isSafeInteger(length) || start + length >= result.stdout.length || result.stdout[start + length] !== 10) throw new Error(`Truncated pinned resource: ${path}`)
    const target = safeAssetPath(destination, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, result.stdout.subarray(start, start + length))
    offset = start + length + 1
  }
  if (offset !== result.stdout.length) throw new Error('Unexpected trailing pinned resource data')
}
function keepResource(path) {
  return !/(?:^|\/)(?:\.git|node_modules|__pycache__|\.pytest_cache|build|dist|data|tests?|fixtures?|input_fixture)(?:\/|$)/u.test(path)
    && !/(?:^|\/)(?:test_[^/]*|[^/]*\.spec)\.(?:py|ts|js)$/u.test(path)
    && !/\.(?:pyc|pyo|tsbuildinfo)$/u.test(path)
}
function legalResource(path) {
  return /(?:^|\/)(?:LICENSE|NOTICE)(?:[._-][^/]*)?$/iu.test(path) || /(?:^|\/)LICENSES\//iu.test(path)
}
function frontmatter(raw, path) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match?.[1] === undefined) throw new Error(`No frontmatter: ${path}`)
  const fields = parseYaml(match[1])
  if (fields === null || typeof fields !== 'object' || typeof fields.description !== 'string' || fields.description.trim() === '') throw new Error(`No skill description: ${path}`)
  return { fields, content: raw.slice(match[0].length).trim() }
}
function invocationFlag(fields, key, fallback) {
  if (fields[key] === undefined) return fallback
  if (typeof fields[key] !== 'boolean') throw new Error(`Nonboolean invocation field: ${key}`)
  return fields[key]
}
function licenseId(text) {
  if (/Attribution-NonCommercial|CC-BY-NC/iu.test(text)) return 'CC-BY-NC-4.0'
  if (/Apache/iu.test(text)) return 'Apache-2.0'
  if (isBsdThreeClause(text)) return 'BSD-3-Clause'
  if (/BSD[- ]?3|3-Clause/iu.test(text)) return 'BSD-3-Clause'
  if (/BSD[- ]?2|2-Clause/iu.test(text)) return 'BSD-2-Clause'
  if (/MIT|Permission is hereby granted/iu.test(text)) return 'MIT'
  if (/CC0|public domain/iu.test(text)) return 'CC0-1.0'
  if (/Attribution 4|CC-BY-4/iu.test(text)) return 'CC-BY-4.0'
  if (/creativecommons\.org\/licenses\/by\/4\.0/iu.test(text)) return 'CC-BY-4.0'
  return text.trim().split('\n')[0]
}
/** Preserve individual skill licensing and additional nested license exceptions. */
export function redistributionLicense(declared, nestedText, rootText) {
  const primary = licenseId(declared ?? rootText)
  const nested = nestedText === '' ? undefined : licenseId(nestedText)
  return nested === undefined || nested === primary ? primary : `${primary} AND ${nested}`
}
/** Find literal local file links outside Markdown code examples. */
export function localResourceLinks(content, format = 'markdown') {
  if (format === 'rst') return [...new Set([...content.matchAll(/^\s*\.\.\s+(?:include|literalinclude|image|figure|plot)::\s+(\S+)\s*$/gmu)].map(match => match[1]).filter(reference => !/^(?:[a-z]+:|\/|\$|<)/iu.test(reference)))].sort(compare)
  const prose = content.replace(/^(?:```|~~~)[\s\S]*?^(?:```|~~~)[^\n]*(?:\n|$)/gmu, '').replace(/`[^`\n]*`/gu, '')
  const references = []
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu)) {
    let reference = match[1].split('#')[0]
    if (!reference || /^(?:[a-z]+:|\/|\$|<)/iu.test(reference) || /[{}]/u.test(reference)
      || !/\.(?:md|rst|ipynb|py|sh|ya?ml|json|txt|toml|js|ts|png|svg|pdf|csv)$/iu.test(reference)) continue
    try { reference = decodeURIComponent(reference) } catch (error) { throw new Error(`Invalid resource link encoding: ${reference}`, { cause: error }) }
    references.push(reference)
  }
  return [...new Set(references)].sort(compare)
}
function sourceTree(repository, commit) {
  return new Map(git(repository, ['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean).map(record => {
    const [attributes, path] = record.split('\t')
    const [mode] = attributes.split(' ')
    return [path, mode]
  }))
}
function copyPinnedResource(repository, commit, sourcePrefix, assetRoot, path, hashes) {
  const relative = `${sourcePrefix}/${path}`
  const target = safeAssetPath(assetRoot, relative)
  const bytes = git(repository, ['show', `${commit}:${path}`], true)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, bytes)
  hashes[relative] = hash(bytes)
  return relative
}
function ancestorLicenses(path, tree) {
  const result = []
  let directory = posix.dirname(path)
  while (directory !== '.') {
    for (const candidate of tree.keys()) if (legalResource(candidate) && (posix.dirname(candidate) === directory || candidate.startsWith(directory + '/LICENSES/'))) result.push(candidate)
    directory = posix.dirname(directory)
  }
  return result.sort(compare)
}
function closeSourceResources(manifest, source, sourceRoot, assetRoot, repositoryPath) {
  const repository = repositoryPath ?? join(sourceRoot, source.id)
  if (!existsSync(repository)) throw new Error(`Missing review clone for resource closure: ${source.id}`)
  const tree = sourceTree(repository, source.commit)
  const sourcePrefix = source.resourceRoot ?? (source.id.startsWith('academic-research-skills') ? `noncommercial/${source.id}` : `sources/${source.id}`)
  const excludedRoots = manifest.excluded.filter(entry => entry.source === source.id).map(entry => posix.dirname(entry.path))
  const cachedLinks = new Map()
  const cachedLegal = new Map()
  const cachedAncestorLicenses = new Map()
  const sourceEntries = manifest.entries.filter(entry => entry.source.id === source.id)
  for (const entry of manifest.entries.filter(entry => entry.source.id === source.id)) {
    const previousAdded = entry.metadata.resourceAudit?.included ?? []
    const original = new Set(entry.files.filter(path => !previousAdded.some(item => item.path === path)))
    const queue = [...entry.files]
    const visited = new Set()
    const missing = []
    const included = []
    while (queue.length > 0) {
      const file = queue.shift()
      if (visited.has(file)) continue
      visited.add(file)
      if (!/\.(?:md|rst)$/u.test(file)) continue
      let references = cachedLinks.get(file)
      if (references === undefined) {
        references = localResourceLinks(readFileSync(safeAssetPath(assetRoot, file), 'utf8'), file.endsWith('.rst') ? 'rst' : 'markdown')
        cachedLinks.set(file, references)
      }
      for (const reference of references) {
        const target = posix.normalize(posix.join(posix.dirname(file), reference))
        if (!target.startsWith(sourcePrefix + '/')) { missing.push({ from: file, reference, reason: 'outside-source-tree' }); continue }
        const upstreamPath = target.slice(sourcePrefix.length + 1)
        if (!tree.has(upstreamPath)) { missing.push({ from: file, reference, reason: 'upstream-missing' }); continue }
        if (!keepResource(upstreamPath) || excludedRoots.some(directory => upstreamPath.startsWith(directory + '/'))) { missing.push({ from: file, reference, reason: 'excluded-resource' }); continue }
        if (!['100644', '100755'].includes(tree.get(upstreamPath))) throw new Error(`Referenced resource is not a regular file: ${source.id}/${upstreamPath}`)
        const directory = posix.dirname(upstreamPath)
        let legalPaths = cachedAncestorLicenses.get(directory)
        if (legalPaths === undefined) { legalPaths = ancestorLicenses(upstreamPath, tree); cachedAncestorLicenses.set(directory, legalPaths) }
        const licenses = []
        let permitted = true
        for (const legal of legalPaths) {
          let text = cachedLegal.get(legal)
          if (text === undefined) { text = git(repository, ['show', `${source.commit}:${legal}`]); cachedLegal.set(legal, text) }
          const notice = /(?:^|\/)NOTICE(?:[._-][^/]*)?$/iu.test(legal)
          if (!(notice ? permittedNotice(text, source.license) : permittedLicense(text))) { permitted = false; break }
          if (!notice || permittedLicense(text)) licenses.push(licenseId(text))
        }
        if (!permitted) { missing.push({ from: file, reference, reason: 'restricted-license' }); continue }
        if (manifest.files[target] === undefined) copyPinnedResource(repository, source.commit, sourcePrefix, assetRoot, upstreamPath, manifest.files)
        const owner = sourceEntries.find(candidate => upstreamPath.startsWith(posix.dirname(candidate.source.path) + '/'))
        if (!original.has(target)) included.push({ path: target, license: [...new Set([owner?.license.redistribution ?? source.license, ...licenses])].join(' AND ') })
        for (const legal of legalPaths) {
          const legalTarget = `${sourcePrefix}/${legal}`
          if (manifest.files[legalTarget] === undefined) copyPinnedResource(repository, source.commit, sourcePrefix, assetRoot, legal, manifest.files)
          if (!entry.license.files.includes(legalTarget)) entry.license.files.push(legalTarget)
          queue.push(legalTarget)
        }
        queue.push(target)
      }
    }
    const missingUnique = [...new Map(missing.map(item => [item.from + ':' + item.reference, item])).values()].sort((a, b) => compare(a.from + a.reference, b.from + b.reference))
    const includedUnique = [...new Map(included.map(item => [item.path, item])).values()].sort((a, b) => compare(a.path, b.path))
    entry.files = [...new Set([...original, ...visited])].sort(compare)
    entry.license.files.sort(compare)
    entry.metadata.resourceAudit = { included: includedUnique, unresolved: missingUnique, scope: 'Literal Markdown file links outside code examples and reStructuredText include/image/figure/plot directives; dynamic paths and Sphinx cross-references are not a complete documentation build.' }
    const missingInstructions = missingUnique.filter(item => item.from === entry.skillPath)
    entry.readiness.requirements = entry.readiness.requirements.filter(value => !value.startsWith('Missing upstream resource: '))
    entry.readiness.requirements.push(...missingInstructions.map(item => `Missing upstream resource: ${item.reference} (${item.reason})`))
    if (missingInstructions.length > 0 && entry.readiness.status !== 'support') entry.readiness.status = 'needs-setup'
  }
}

/** Repair only linked source resources in an existing verified asset tree. */
export function completeResourceClosure({ assetRoot, sourceRoot }) {
  const target = safePackageTarget(assetRoot)
  verifyAssets(target)
  const manifest = jsonFile(join(target, 'manifest.json'))
  for (const source of manifest.sources) closeSourceResources(manifest, source, sourceRoot, target)
  manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => compare(a, b)))
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return verifyAssets(target)
}
function requirements(fields, content) {
  const dependencies = Array.isArray(fields.dependencies) ? fields.dependencies.map(String) : []
  const compatibility = typeof fields.compatibility === 'string' ? [fields.compatibility] : []
  const keys = [...new Set(content.match(/\b[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|ACCESS_KEY)\b/gu) ?? [])]
  return [...dependencies, ...compatibility, ...keys]
}
function copyRelative(extracted, destination, path, hashes) {
  if (!keepResource(path)) return
  const source = safeAssetPath(extracted, path)
  if (!lstatSync(source).isFile()) throw new Error(`Resource is not a regular file: ${path}`)
  const target = safeAssetPath(destination, path)
  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target)
  hashes[path] = hash(readFileSync(target))
}

/** Validate hashes without Git, network access, or running third-party code. */
export function verifyAssets(assetRoot) {
  const manifest = jsonFile(join(assetRoot, 'manifest.json'))
  for (const [path, expected] of Object.entries(manifest.files)) {
    const file = safeAssetPath(assetRoot, path)
    if (!existsSync(file) || !lstatSync(file).isFile()) throw new Error(`Missing science resource: ${path}`)
    if (hash(readFileSync(file)) !== expected) throw new Error(`Science resource hash mismatch: ${path}`)
  }
  return { entries: manifest.entries.length, files: Object.keys(manifest.files).length }
}

/** Build assets from pinned review clones, fetching only when explicitly requested. */
export function syncAssets({ sourceRoot, assetRoot, inventoryPath = join(packageRoot, 'sources.json'), fetch = false }) {
  const inventory = jsonFile(inventoryPath)
  const locks = jsonFile(join(packageRoot, 'names.lock.json'))
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-science-sync-'))
  const staged = join(temporary, 'assets')
  mkdirSync(staged)
  const entries = []
  const excluded = []
  const files = {}
  const sources = []
  const repositories = new Map()
  try {
    for (const source of [...inventory].sort((a, b) => compare(a.id, b.id))) {
      if (!packBySource[source.id] || !authorBySource[source.id]) throw new Error(`Unreviewed source metadata: ${source.id}`)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(source.id) || !/^[a-f0-9]{40}$/u.test(source.commit)) throw new Error('Invalid pinned science source')
      let repository = join(sourceRoot, source.id)
      if (!existsSync(repository)) {
        if (!fetch) throw new Error(`Missing review clone: ${source.id}; use --fetch explicitly`)
        repository = join(temporary, source.id)
        mkdirSync(repository)
        git(repository, ['init', '--bare'])
        git(repository, ['fetch', '--depth=1', source.repository, source.commit])
      }
      repositories.set(source.id, repository)
      const tree = git(repository, ['ls-tree', '-r', '-z', source.commit]).split('\0').filter(Boolean).map(record => {
        const [attributes, path] = record.split('\t')
        const [mode] = attributes.split(' ')
        safeAssetPath(staged, path)
        return { mode, path }
      })
      const rootLegalPaths = reviewedRootLegalFiles(tree.map(item => item.path))
      const rootLegal = tree.filter(item => rootLegalPaths.includes(item.path))
      const knowledgeGuides = source.knowledgeGuides ?? []
      const knowledgePaths = [...new Set(knowledgeGuides.flatMap(guide => reviewedKnowledgeResources(guide, tree.map(item => item.path))))]
      const candidates = source.candidateSkillPaths.filter(path => {
        const basename = posix.basename(posix.dirname(path))
        let reason
        if (prohibitedNames.has(basename)) reason = 'Anthropic proprietary document skill excluded; repository license does not override file terms'
        else if (source.id === 'mattpocock-skills' && !path.startsWith('skills/engineering/') && !path.includes('/writing-for-agents/')) reason = 'Outside engineering research support selection'
        if (reason !== undefined) excluded.push({ source: source.id, path, reason })
        return reason === undefined
      })
      const selectedRoots = candidates.map(path => posix.dirname(path))
      selectedRoots.push(...knowledgePaths)
      const platformRoots = (platformResources[source.id] ?? []).filter(path => tree.some(item => item.path.startsWith(path + '/')))
      selectedRoots.push(...platformRoots)
      const noncommercial = source.id.startsWith('academic-research-skills')
      if (noncommercial) selectedRoots.push(...['shared', 'scripts'].filter(path => tree.some(item => item.path.startsWith(path + '/'))))
      const selected = tree.filter(item => rootLegal.includes(item) || selectedRoots.some(directory => item.path === directory || item.path.startsWith(directory + '/')))
      for (const item of selected) if (item.mode !== '100644' && item.mode !== '100755') throw new Error(`Pinned source contains a nonregular resource: ${source.id}/${item.path}`)
      const extracted = join(temporary, `tree-${source.id}`)
      mkdirSync(extracted)
      extractPinnedFiles(repository, source.commit, selected.map(item => item.path), extracted)
      const sourcePrefix = knowledgeGuides.length > 0 ? `knowledge/${source.id}` : noncommercial ? `noncommercial/${source.id}` : `sources/${source.id}`
      const sourceDestination = safeAssetPath(staged, sourcePrefix)
      mkdirSync(sourceDestination, { recursive: true })
      const sourceHashes = {}
      const rootLicenseText = rootLegal.filter(item => /^LICENSE/iu.test(item.path)).map(item => readFileSync(safeAssetPath(extracted, item.path), 'utf8')).join('\n')
      if (!permittedLicense(rootLicenseText)) throw new Error(`Unsupported root license: ${source.id}`)
      for (const item of rootLegal) copyRelative(extracted, sourceDestination, item.path, sourceHashes)
      for (const guide of knowledgeGuides) {
        const resourcePaths = reviewedKnowledgeResources(guide, tree.map(item => item.path))
        const nestedLegalPaths = [...new Set(resourcePaths.flatMap(path => ancestorLicenses(path, new Map(tree.map(item => [item.path, item.mode])))))]
        const nestedTerms = nestedLegalPaths.map(path => git(repository, ['show', `${source.commit}:${path}`])).join('\n')
        if (nestedTerms !== '' && !permittedLicense(nestedTerms)) throw new Error(`Unsupported knowledge resource license: ${source.id}/${guide.name}`)
        for (const path of [...resourcePaths, ...nestedLegalPaths]) {
          if (!['100644', '100755'].includes(tree.find(item => item.path === path)?.mode)) throw new Error(`Knowledge resource is not a regular file: ${path}`)
          if (existsSync(safeAssetPath(extracted, path))) copyRelative(extracted, sourceDestination, path, sourceHashes)
          else {
            copyPinnedResource(repository, source.commit, sourcePrefix, staged, path, files)
            sourceHashes[path] = files[`${sourcePrefix}/${path}`]
          }
        }
        const directory = `guides/${guide.name}`
        const instructionPath = `${directory}/SKILL.md`
        const links = resourcePaths.map(path => `- [${path}](${posix.relative(directory, path)})`).join('\n')
        const body = `---\nname: ${guide.name}\ndescription: ${JSON.stringify(guide.description)}\nlicense: ${licenseId(rootLicenseText)}\n---\n\n# ${guide.name}\n\nThis is a locally authored DeepSeek Science knowledge adapter, not an upstream agent skill. The official upstream documents below are copied without modification from ${source.repository} at ${source.commit}. This subset is portable documentation; the scientific library, full documentation site, datasets and execution environment are not installed by this adapter.\n\n${guide.instructions}\n\n## Preserved official resources\n\n${links}\n\nCheck the installed library version and current official documentation before execution. Report assumptions, numerical tolerances, diagnostics and limitations. Do not present a copied example or successful parse as an executed scientific result.\n`
        const target = safeAssetPath(sourceDestination, instructionPath)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, body)
        sourceHashes[instructionPath] = hash(Buffer.from(body))
        entries.push({
          name: guide.name, originalName: guide.name, description: guide.description,
          source: { id: source.id, repository: source.repository, commit: source.commit, path: guide.sourcePath, author: authorBySource[source.id], version: 'pinned-documentation-subset' },
          license: { declared: licenseId(rootLicenseText), redistribution: redistributionLicense(undefined, nestedTerms, rootLicenseText), files: [...rootLegalPaths, ...nestedLegalPaths].map(path => `${sourcePrefix}/${path}`), noncommercial },
          packs: [packBySource[source.id]], invocation: { modelInvocable: true, userInvocable: true },
          adaptation: { status: 'guidance-adapted', notes: 'Locally authored knowledge adapter; upstream documentation bytes are preserved separately and hashed. No upstream SKILL.md or installed dependency is claimed.' },
          readiness: { status: 'guidance-only', requirements: guide.requirements ?? [], testedHere: false },
          skillPath: `${sourcePrefix}/${instructionPath}`, resourceDirectory: `${sourcePrefix}/${directory}`,
          files: [...resourcePaths, ...nestedLegalPaths, instructionPath].map(path => `${sourcePrefix}/${path}`).sort(compare), dependencies: [],
          digest: hash([instructionPath, ...resourcePaths].map(path => `${path}\0${sourceHashes[path]}`).join('\n')),
          metadata: { generatedKnowledgeGuide: { repositoryRoot: sourcePrefix, upstreamResourcePath: `${sourcePrefix}/${guide.sourcePath}` }, domains: source.domains ?? [], reviewedDate: source.observedDate },
        })
      }
      for (const skillPath of candidates) {
        const directory = posix.dirname(skillPath)
        const { fields, content } = frontmatter(readFileSync(safeAssetPath(extracted, skillPath), 'utf8'), skillPath)
        const originalName = typeof fields.name === 'string' ? fields.name : posix.basename(directory)
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(originalName)) throw new Error(`Invalid skill name: ${source.id}/${skillPath}`)
        const skillFiles = selected.filter(item => item.path.startsWith(directory + '/') && keepResource(item.path))
        const nestedLegal = skillFiles.filter(item => legalResource(item.path))
        const licenseText = nestedLegal.map(item => readFileSync(safeAssetPath(extracted, item.path), 'utf8')).join('\n')
        if (licenseText !== '' && !permittedLicense(licenseText)) {
          excluded.push({ source: source.id, path: skillPath, reason: 'File-level redistribution restrictions' })
          continue
        }
        const declared = typeof fields.license === 'string' ? fields.license : undefined
        const licenseFile = nestedLegal.find(item => item.path === directory + '/LICENSE.txt')
        const declaredTerms = declaredLicenseTerms(declared, licenseFile === undefined ? undefined : readFileSync(safeAssetPath(extracted, licenseFile.path), 'utf8'))
        if (declaredTerms !== undefined && !permittedLicense(declaredTerms)) {
          excluded.push({ source: source.id, path: skillPath, reason: `Unsupported declared license: ${fields.license}` })
          continue
        }
        for (const item of skillFiles) copyRelative(extracted, sourceDestination, item.path, sourceHashes)
        const isCurated = source.id === 'nature-skills'
          || curated[source.id]?.has(originalName) === true && (source.id !== 'openscience' || directory.includes('/core/'))
        const isSupport = originalName === supportName
        const sourcePack = packBySource[source.id]
        const pack = source.id === 'nature-skills' ? 'nature' : source.id === 'ai-research-skills' ? 'ai' : 'core'
        const resourcePaths = skillFiles.map(item => `${sourcePrefix}/${item.path}`).sort(compare)
        const digest = hash(skillFiles.map(item => `${item.path.slice(directory.length + 1)}\0${sourceHashes[item.path]}`).join('\n'))
        entries.push({
          name: originalName, originalName, description: fields.description.trim(),
          source: { id: source.id, repository: source.repository, commit: source.commit, path: skillPath, author: fields.author ?? fields.metadata?.['skill-author'] ?? authorBySource[source.id], version: String(fields.version ?? fields.metadata?.version ?? 'unspecified') },
          license: { declared: declared ?? licenseId(rootLicenseText), redistribution: redistributionLicense(declaredTerms, licenseText, rootLicenseText), files: [...rootLegal, ...nestedLegal].map(item => `${sourcePrefix}/${item.path}`), noncommercial },
          packs: isCurated ? [pack, sourcePack] : [sourcePack],
          invocation: { modelInvocable: !isSupport && !invocationFlag(fields, 'disable-model-invocation', false), userInvocable: !isSupport && invocationFlag(fields, 'user-invocable', true) },
          adaptation: { status: isSupport ? 'support' : isCurated ? 'guidance-adapted' : 'upstream', notes: isCurated ? 'Harness resource and tool guidance is prepended at load; upstream workflow and scripts have not been executed here.' : 'Preserved upstream instructions; referenced tools and platform assumptions require review.' },
          readiness: { status: isSupport ? 'support' : isCurated ? 'guidance-only' : 'needs-setup', requirements: requirements(fields, content), testedHere: false },
          skillPath: `${sourcePrefix}/${skillPath}`, resourceDirectory: `${sourcePrefix}/${directory}`, files: resourcePaths,
          dependencies: [], digest,
          metadata: fields.metadata !== null && typeof fields.metadata === 'object' ? fields.metadata : {},
        })
      }
      if (noncommercial) {
        for (const item of selected.filter(item => item.path.startsWith('shared/') || item.path.startsWith('scripts/'))) copyRelative(extracted, sourceDestination, item.path, sourceHashes)
        const sharedFiles = Object.keys(sourceHashes).filter(path => path.startsWith('shared/') || path.startsWith('scripts/')).map(path => `${sourcePrefix}/${path}`)
        for (const entry of entries.filter(entry => entry.source.id === source.id)) { entry.files.push(...sharedFiles); entry.dependencies.push('shared/', 'scripts/') }
      }
      if (platformRoots.length > 0) {
        const platformFiles = selected.filter(item => platformRoots.some(directory => item.path.startsWith(directory + '/')) && keepResource(item.path))
        const platformLegal = platformFiles.filter(item => legalResource(item.path))
        const terms = platformLegal.map(item => readFileSync(safeAssetPath(extracted, item.path), 'utf8')).join('\n')
        if (terms !== '' && !permittedLicense(terms)) throw new Error(`Unsupported platform resource license: ${source.id}`)
        for (const item of platformFiles) copyRelative(extracted, sourceDestination, item.path, sourceHashes)
        for (const entry of entries.filter(entry => entry.source.id === source.id)) {
          entry.files.push(...platformFiles.map(item => `${sourcePrefix}/${item.path}`))
          entry.license.files.push(...platformLegal.map(item => `${sourcePrefix}/${item.path}`))
          entry.dependencies.push(...platformRoots.map(path => path + '/'))
        }
      }
      if (source.id === 'nature-skills') {
        const shared = entries.find(entry => entry.originalName === supportName && entry.source.id === source.id)
        if (shared === undefined) throw new Error('Nature shared references are missing')
        for (const entry of entries.filter(entry => entry.source.id === source.id && entry !== shared)) { entry.files.push(...shared.files); entry.dependencies.push(supportName) }
      }
      for (const [path, digest] of Object.entries(sourceHashes)) files[`${sourcePrefix}/${path}`] = digest
      sources.push({ id: source.id, repository: source.repository, commit: source.commit, author: authorBySource[source.id], license: licenseId(rootLicenseText), licenseFiles: rootLegal.map(item => `${sourcePrefix}/${item.path}`), ...(knowledgeGuides.length > 0 ? { resourceRoot: sourcePrefix } : {}) })
    }
    const deduplicated = []
    const byDigest = new Map()
    const isLocked = entry => locks.some(lock => lock.source === entry.source.id && lock.path === entry.source.path)
    for (const entry of entries.sort((left, right) => Number(isLocked(right)) - Number(isLocked(left)) || compare(left.source.id, right.source.id) || compare(left.source.path, right.source.path))) {
      const key = `${entry.originalName}:${entry.digest}`
      const existing = byDigest.get(key)
      if (existing === undefined || entry.license.noncommercial !== existing.license.noncommercial) { byDigest.set(key, entry); entry.alternateSources = []; deduplicated.push(entry) }
      else { existing.alternateSources.push(entry.source); existing.packs = [...new Set([...existing.packs, ...entry.packs])].sort(compare) }
    }
    const named = assignNames(deduplicated, locks)
    const manifest = { schemaVersion: 1, defaultPacks, packs: [...new Set(named.flatMap(entry => entry.packs))].sort(compare), sources, entries: named, excluded: excluded.sort((a, b) => compare(a.source + a.path, b.source + b.path)), files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => compare(a, b))) }
    for (const source of sources) closeSourceResources(manifest, source, sourceRoot, staged, repositories.get(source.id))
    manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => compare(a, b)))
    writeFileSync(join(staged, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    writeFileSync(join(staged, 'NOTICE.md'), '# Embedded Science Skills\n\nThe Harness provider code is MIT. Embedded instructions and resources retain their source licenses; root and nested license texts are included at the paths in manifest.json. Individual declared licenses and nested exceptions remain separate from root repository licenses. CC-BY-4.0 terms: https://creativecommons.org/licenses/by/4.0/ . The academic-noncommercial and academic-codex-noncommercial packs are CC-BY-NC-4.0, isolated under noncommercial/ and disabled by default. Each requires its own explicit activation. Enabling either pack does not grant commercial-use rights.\n\nPinned upstream files and hashes identify copied content. They do not establish that workflows, dependencies, scripts, or scientific claims were tested in this Harness. Source tool names may require local equivalents. No third-party installer or script is run by synchronization or loading. Guidance-adapted entries prepend local tool/resource guidance at load; copied files are unmodified.\n\n' + sources.map(source => `- ${source.id}: ${source.repository} at ${source.commit}; ${source.license}; ${source.author}.`).join('\n') + '\n')
    const resolvedTarget = safePackageTarget(assetRoot)
    if (existsSync(resolvedTarget)) rmSync(resolvedTarget, { recursive: true })
    cpSync(staged, resolvedTarget, { recursive: true })
    return verifyAssets(resolvedTarget)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

function main() {
  const argv = process.argv.slice(2)
  function option(name, fallback) { const index = argv.indexOf(name); if (index === -1) return fallback; if (argv[index + 1] === undefined || argv[index + 1].startsWith('--')) throw new Error(`Missing ${name}`); return resolve(argv[index + 1]) }
  const assetRoot = option('--asset-root', join(packageRoot, 'assets'))
  const sourceRoot = option('--source-root', resolve(packageRoot, '../../../../.research-sources'))
  const result = argv.includes('--verify-only') ? verifyAssets(assetRoot) : argv.includes('--complete-resources') ? completeResourceClosure({ assetRoot, sourceRoot }) : syncAssets({ sourceRoot, assetRoot, inventoryPath: option('--inventory', join(packageRoot, 'sources.json')), fetch: argv.includes('--fetch') })
  process.stdout.write(JSON.stringify(result) + '\n')
}
if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main()
