/** Embedded research skills with curated registry discovery and explicit catalog selection. */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, posix, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BUNDLED_SKILL_RANK, type SkillCandidate, type SkillDefinition, type SkillLookupOptions, type SkillProvider } from '@deepseek-ai/dsh-skill'
import { parse as parseYaml } from 'yaml'
import type { ScienceCatalog, ScienceCatalogEntry, ScienceLoadOptions, ScienceSearchOptions, ScienceSource, ScienceSkillResource } from './types.ts'

export type { ScienceCatalog, ScienceCatalogEntry, ScienceSource, ScienceLoadOptions, ScienceSearchOptions, ScienceSkillResource } from './types.ts'

const PROVIDER = 'dsh-science'
const DEFAULT_ASSETS = fileURLToPath(new URL('../assets/', import.meta.url))
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const HASH = /^[a-f0-9]{64}$/u
const GUIDANCE = '## DeepSeek Science resource and tool guidance\n\nResolve relative files against the resource directory supplied with this skill. Use available Harness tools for the capabilities described by upstream tool names. Do not assume optional MCP servers, credentials, packages, GPUs, or provider-specific agent APIs are installed. Check prerequisites before running a resource script; upstream scripts and workflows have not been executed in this Harness. Preserve the evidence limits and citation requirements in the upstream instructions.\n\n'

/** Bundled science provider configuration. */
export interface Config {
  /** Absolute directory containing manifest.json and the embedded resource trees. */
  readonly assetRoot?: string
  /** Packs advertised through ctx.skills; defaults to curated core, ai, and nature packs. */
  readonly enabledPacks?: string[]
}
/** Validated science asset configuration. */
export const Config: z<Config> = z.object({ assetRoot: z.string().min(1), enabledPacks: z.array(z.string().min(1)).default(['core', 'ai', 'nature']) })
/** Plugin identity. */
export const name = 'skill-science'
/** Required skill registry. */
export const inject = ['skills']

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid science ${label}`)
  return value as Record<string, unknown>
}
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid science ${label}`)
  return value
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid science ${label}`)
  return value
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid science ${label}`)
  return value
}
function strings(value: unknown, label: string): string[] { return array(value, label).map(item => string(item, label)) }
function parseSource(value: unknown): ScienceSource {
  const data = object(value, 'source')
  return { id: string(data.id, 'source id'), repository: string(data.repository, 'repository'), commit: string(data.commit, 'commit'), path: string(data.path, 'source path'), author: string(data.author, 'author'), version: string(data.version, 'version') }
}
function parseEntry(value: unknown): ScienceCatalogEntry {
  const data = object(value, 'entry')
  const license = object(data.license, 'license')
  const invocation = object(data.invocation, 'invocation')
  const adaptation = object(data.adaptation, 'adaptation')
  const readiness = object(data.readiness, 'readiness')
  const adaptationStatus = adaptation.status
  const readinessStatus = readiness.status
  if (adaptationStatus !== 'support' && adaptationStatus !== 'guidance-adapted' && adaptationStatus !== 'upstream') throw new Error('Invalid science adaptation status')
  if (readinessStatus !== 'support' && readinessStatus !== 'guidance-only' && readinessStatus !== 'needs-setup') throw new Error('Invalid science readiness status')
  const name = string(data.name, 'name')
  if (!NAME.test(name)) throw new Error(`Invalid science skill name: ${name}`)
  const entry: ScienceCatalogEntry = {
    name, originalName: string(data.originalName, 'original name'), description: string(data.description, 'description'),
    source: parseSource(data.source), alternateSources: array(data.alternateSources, 'alternate sources').map(parseSource),
    license: { declared: string(license.declared, 'declared license'), redistribution: string(license.redistribution, 'redistribution license'), files: strings(license.files, 'license files'), noncommercial: boolean(license.noncommercial, 'noncommercial') },
    packs: strings(data.packs, 'packs'),
    invocation: { modelInvocable: boolean(invocation.modelInvocable, 'model invocation'), userInvocable: boolean(invocation.userInvocable, 'user invocation') },
    adaptation: { status: adaptationStatus, notes: string(adaptation.notes, 'adaptation notes') },
    readiness: { status: readinessStatus, requirements: strings(readiness.requirements, 'requirements'), testedHere: boolean(readiness.testedHere, 'tested here') },
    skillPath: string(data.skillPath, 'instruction path'), resourceDirectory: string(data.resourceDirectory, 'resource directory'),
    files: strings(data.files, 'resource files'), dependencies: strings(data.dependencies, 'dependencies'), digest: string(data.digest, 'digest'), metadata: object(data.metadata, 'metadata'),
  }
  if (entry.originalName === 'nature-shared' && (entry.invocation.modelInvocable || entry.invocation.userInvocable)) throw new Error('nature-shared must remain noninvocable')
  return entry
}
function resourcePath(assetRoot: string, path: string): string {
  if (isAbsolute(path) || path.includes('\\') || /^[a-z]:/iu.test(path)) throw new Error('Science resource path must be relative with forward slashes')
  const absolute = resolve(assetRoot, path)
  if (!absolute.startsWith(resolve(assetRoot) + sep)) throw new Error(`Science resource path is outside assetRoot: ${path}`)
  return absolute
}
function knowledgeRepositoryRoot(assetRoot: string, entry: ScienceCatalogEntry): string | undefined {
  const value = entry.metadata.generatedKnowledgeGuide
  if (value === undefined) return undefined
  const guide = object(value, 'generated knowledge guide')
  const root = resourcePath(assetRoot, string(guide.repositoryRoot, 'knowledge repository root'))
  const upstreamPath = string(guide.upstreamResourcePath, 'knowledge upstream resource')
  const upstream = resourcePath(assetRoot, upstreamPath)
  if (!upstream.startsWith(root + sep) || !resourcePath(assetRoot, entry.skillPath).startsWith(root + sep)
    || upstreamPath === entry.skillPath || !upstreamPath.endsWith('/' + entry.source.path)
    || !entry.files.includes(upstreamPath)) throw new Error(`Invalid science knowledge guide mapping: ${entry.name}`)
  return root
}
function checkFile(assetRoot: string, path: string): string {
  const absolute = resourcePath(assetRoot, path)
  let stat
  try { stat = lstatSync(absolute) } catch (error) { throw new Error(`Missing science resource: ${path}`, { cause: error }) }
  if (!stat.isFile() || !realpathSync(absolute).startsWith(realpathSync(assetRoot) + sep)) throw new Error(`Science resource must be a contained regular file: ${path}`)
  return absolute
}
function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }
function verifyFile(catalog: ScienceCatalog, path: string): void {
  const expected = catalog.files[path]
  if (expected === undefined) throw new Error(`Science resource has no hash: ${path}`)
  if (digest(readFileSync(checkFile(catalog.assetRoot, path))) !== expected) throw new Error(`Science resource hash mismatch: ${path}`)
}
function packsOf(catalog: ScienceCatalog, enabledPacks?: readonly string[]): readonly string[] {
  const packs = enabledPacks ?? catalog.defaultPacks
  for (const pack of packs) if (!catalog.packs.includes(pack)) throw new Error(`Unknown science pack: ${pack}`)
  return packs
}

/**
 * Parse one asset catalog and check resource presence, without hashing the complete library.
 * @param assetRoot - Absolute external asset directory; omitted uses packaged assets.
 * @returns Catalog reusable by search, inspection, and load operations.
 */
export function readScienceCatalog(assetRoot = DEFAULT_ASSETS): ScienceCatalog {
  if (!isAbsolute(assetRoot)) throw new Error('skill-science: assetRoot must be an absolute directory')
  const data = object(JSON.parse(readFileSync(join(assetRoot, 'manifest.json'), 'utf8')), 'manifest')
  if (data.schemaVersion !== 1) throw new Error('Unsupported science catalog schemaVersion')
  const hashes = object(data.files, 'file hashes')
  const files: Record<string, string> = {}
  for (const [path, value] of Object.entries(hashes)) {
    const hash = string(value, 'file hash')
    if (!HASH.test(hash)) throw new Error(`Invalid science file hash: ${path}`)
    checkFile(assetRoot, path)
    files[path] = hash
  }
  const entries = array(data.entries, 'entries').map(parseEntry)
  const names = new Set<string>()
  const packs = strings(data.packs, 'available packs')
  for (const entry of entries) {
    if (names.has(entry.name)) throw new Error(`Duplicate science skill: ${entry.name}`)
    names.add(entry.name)
    const instructionDirectory = resourcePath(assetRoot, entry.resourceDirectory) + sep
    if (!resourcePath(assetRoot, entry.skillPath).startsWith(instructionDirectory)) throw new Error(`Science instruction is outside its resource directory: ${entry.name}`)
    if (!entry.files.includes(entry.skillPath)) throw new Error(`Science instruction is missing from resources: ${entry.name}`)
    if (knowledgeRepositoryRoot(assetRoot, entry) === undefined && !entry.skillPath.endsWith('/' + entry.source.path)) {
      throw new Error(`Science source path differs from its embedded location: ${entry.name}`)
    }
    for (const path of [...entry.files, ...entry.license.files]) if (files[path] === undefined) throw new Error(`Science resource has no hash: ${path}`)
    for (const pack of entry.packs) if (!packs.includes(pack)) throw new Error(`Unknown science entry pack: ${pack}`)
  }
  const excluded = array(data.excluded, 'exclusions').map((value) => {
    const item = object(value, 'exclusion')
    return { source: string(item.source, 'excluded source'), path: string(item.path, 'excluded path'), reason: string(item.reason, 'excluded reason') }
  })
  const catalog: ScienceCatalog = { schemaVersion: 1, assetRoot: resolve(assetRoot), defaultPacks: strings(data.defaultPacks, 'default packs'), packs, entries: entries.sort((a, b) => a.name.localeCompare(b.name)), files, excluded }
  packsOf(catalog)
  return catalog
}

/**
 * Search metadata across all embedded skills, including disabled packs.
 * @param catalog - Previously read catalog.
 * @param query - Case-insensitive terms matched across name, description, author, source id/path, and prerequisites.
 * @param options - Optional pack filter and positive result limit.
 * @returns Matching entries in public-name order.
 */
export function searchScienceCatalog(catalog: ScienceCatalog, query = '', options: ScienceSearchOptions = {}): ScienceCatalogEntry[] {
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error('Science search limit must be a positive integer')
  const packs = options.packs === undefined ? undefined : packsOf(catalog, options.packs)
  const terms = query.toLowerCase().trim().split(/\s+/u).filter(Boolean)
  const result = catalog.entries.filter((entry) => {
    if (packs !== undefined && !entry.packs.some(pack => packs.includes(pack))) return false
    const text = [entry.name, entry.originalName, entry.description, entry.source.id, entry.source.path, entry.source.author, ...entry.readiness.requirements].join(' ').toLowerCase()
    return terms.every(term => text.includes(term))
  })
  return options.limit === undefined ? [...result] : result.slice(0, options.limit)
}
/**
 * Inspect one catalog entry.
 * @param catalog - Parsed catalog.
 * @param name - Public skill name.
 * @returns Matching entry, or undefined for an absent name.
 */
export function inspectScienceSkill(catalog: ScienceCatalog, name: string): ScienceCatalogEntry | undefined {
  return catalog.entries.find(entry => entry.name === name)
}

function assertLoadAllowed(catalog: ScienceCatalog, entry: ScienceCatalogEntry, options: ScienceLoadOptions): void {
  const packs = packsOf(catalog, options.enabledPacks)
  if (entry.license.noncommercial && !entry.packs.some(pack => pack.endsWith('-noncommercial') && packs.includes(pack))) throw new Error('Enable this skill’s noncommercial pack explicitly before loading its CC-BY-NC-4.0 instructions')
  if (options.invocation === 'user' ? !entry.invocation.userInvocable : !entry.invocation.modelInvocable) throw new Error(`Science skill ${entry.name} does not permit ${options.invocation ?? 'model'} invocation`)
}

/** Load a complete declared text resource with the same invocation and license rules as its skill.
 * @param catalog - Catalog tied to the resource tree.
 * @param name - Exact public skill name.
 * @param relative - Forward-slash path relative to its resource directory; declared shared dependencies may use ../.
 * @param options - Invocation, license opt-in and cancellation controls.
 * @returns Verified complete UTF-8 text, or undefined for an absent skill; undeclared or altered files throw.
 */
export async function loadScienceSkillResource(
  catalog: ScienceCatalog, name: string, relative: string, options: ScienceLoadOptions = {},
): Promise<ScienceSkillResource | undefined> {
  const entry = inspectScienceSkill(catalog, name)
  if (entry === undefined) return undefined
  assertLoadAllowed(catalog, entry, options)
  options.signal?.throwIfAborted()
  if (relative.length === 0 || relative.includes('\\') || relative.startsWith('/') || /^[a-z]:/iu.test(relative)) throw new Error('Science resource reference must be a relative forward-slash path')
  const catalogPath = posix.normalize(`${entry.resourceDirectory}/${relative}`)
  if (!entry.files.includes(catalogPath)) throw new Error(`Science resource is not declared by ${name}: ${relative}`)
  const expected = catalog.files[catalogPath]
  if (expected === undefined) throw new Error(`Science resource has no hash: ${catalogPath}`)
  const path = checkFile(catalog.assetRoot, catalogPath)
  const bytes = await readFile(path, { signal: options.signal })
  if (digest(bytes) !== expected) throw new Error(`Science resource hash mismatch: ${catalogPath}`)
  options.signal?.throwIfAborted()
  return { catalogPath, path, digest: expected, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
}
/**
 * Load an explicitly selected entry without advertising the entire library through ctx.skills.
 * @param catalog - Previously read catalog.
 * @param name - Exact public skill name.
 * @param options - Invocation policy and explicit noncommercial opt-in; model invocation is the default.
 * @returns The verified definition, or undefined for an absent name; disallowed invocation throws.
 */
export async function loadScienceSkill(
  catalog: ScienceCatalog,
  name: string,
  options: ScienceLoadOptions = {},
): Promise<SkillDefinition | undefined> {
  const entry = inspectScienceSkill(catalog, name)
  if (entry === undefined) return undefined
  assertLoadAllowed(catalog, entry, options)
  options.signal?.throwIfAborted()
  for (const path of new Set([...entry.files, ...entry.license.files])) {
    options.signal?.throwIfAborted()
    if (path !== entry.skillPath) verifyFile(catalog, path)
  }
  const bytes = await readFile(checkFile(catalog.assetRoot, entry.skillPath), { signal: options.signal })
  if (digest(bytes) !== catalog.files[entry.skillPath]) throw new Error(`Science resource hash mismatch: ${entry.skillPath}`)
  const raw = bytes.toString('utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match?.[1] === undefined) throw new Error(`Science skill has no frontmatter: ${name}`)
  const frontmatter: unknown = parseYaml(match[1])
  object(frontmatter, 'skill frontmatter')
  const repositoryRoot = knowledgeRepositoryRoot(catalog.assetRoot, entry)
    ?? resourcePath(catalog.assetRoot, entry.skillPath.slice(0, -entry.source.path.length).replace(/\/$/u, ''))
  const repositoryHint = entry.license.noncommercial
    ? `Repository resources: ${repositoryRoot}\nResolve shared/ and repository-level scripts/ paths in the upstream instructions against this directory. Skill-local references/ paths use the skill resource directory.\n\n`
    : entry.dependencies.some(dependency => dependency.endsWith('/'))
      ? `Repository resources: ${repositoryRoot}\nResolve repository-level resource paths in the upstream instructions against this directory. Skill-local paths use the skill resource directory.\n\n`
      : ''
  const sourceHint = [
    '## Embedded skill source',
    '',
    `Source: ${entry.source.repository} at ${entry.source.commit}.`,
    ...(entry.metadata.generatedKnowledgeGuide === undefined ? [] : [
      'This is a locally authored knowledge guide, not an upstream-authored skill. The pinned upstream document is preserved separately in its resource directory.',
    ]),
    `Harness readiness: ${entry.readiness.status}.`,
    'Workflow and script execution have not been tested in this Harness.',
    '',
    '',
  ].join('\n')
  return {
    ...summary(catalog, entry),
    content: sourceHint + (entry.adaptation.status === 'guidance-adapted' ? GUIDANCE : '') + repositoryHint + raw.slice(match[0].length).trim(),
    metadata: { ...entry.metadata, science: entry, scienceSourceRoot: repositoryRoot },
  }
}

/**
 * Check every declared asset hash offline; this does not execute or test upstream workflows.
 * @param catalog - Catalog tied to the asset tree to verify.
 */
export function verifyScienceCatalog(catalog: ScienceCatalog): void {
  for (const path of Object.keys(catalog.files)) verifyFile(catalog, path)
}

function summary(catalog: ScienceCatalog, entry: ScienceCatalogEntry) {
  return { name: entry.name, description: entry.description, path: resourcePath(catalog.assetRoot, entry.skillPath), invocation: entry.invocation, provider: PROVIDER, source: 'bundled' as const, resourceBase: { kind: 'directory' as const, path: resourcePath(catalog.assetRoot, entry.resourceDirectory) } }
}

/**
 * Register enabled packs at the standard bundled rank, removed on plugin disposal.
 * @param ctx - Context carrying the skill registry.
 * @param config - Optional external assets and advertised pack selection.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const catalog = readScienceCatalog(config.assetRoot)
  const packs = packsOf(catalog, config.enabledPacks)
  const candidates: SkillCandidate[] = catalog.entries.filter(entry => entry.packs.some(pack => packs.includes(pack)) && (!entry.license.noncommercial || entry.packs.some(pack => pack.endsWith('-noncommercial') && packs.includes(pack)))).map(entry => ({ ...summary(catalog, entry), rank: BUNDLED_SKILL_RANK, locator: entry.name, metadata: { ...entry.metadata, science: entry } }))
  const provider: SkillProvider = {
    name: PROVIDER,
    list(options: SkillLookupOptions) { options.signal?.throwIfAborted(); return Promise.resolve(candidates) },
    get(candidate: SkillCandidate, options: SkillLookupOptions) { return loadScienceSkill(catalog, candidate.name, { enabledPacks: packs, signal: options.signal, invocation: candidate.invocation.modelInvocable ? 'model' : 'user' }) },
  }
  ctx.skills.registerProvider(() => provider)
}
