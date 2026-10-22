/** Assemble an independent Windows application from compiled, production-only inputs. */
import { cpSync, existsSync, globSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { installSciencePlotting } from './science-python.mjs'
import { auditScienceRelease, sanitizeScienceRelease } from './science-release-privacy.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = resolve(appRoot, '..', '..')
const require = createRequire(join(appRoot, 'package.json'))
const excluded = new Set(['.env', '.env.local', '.credentials.yaml', '.git', '.cache', '__pycache__'])

function manifest(directory) { return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) }

/** Collect release-owned dependencies and required peers; production deploy alone omits some peers. */
export function collectPortableWorkspaceClosure(workspaces, roots) {
  const visited = new Set()
  const visit = name => {
    if (visited.has(name)) return
    const directory = workspaces.get(name)
    if (directory === undefined) return
    visited.add(name)
    const metadata = manifest(directory)
    for (const dependency of Object.keys({ ...metadata.dependencies, ...metadata.peerDependencies })) visit(dependency)
    for (const dependency of Object.keys(metadata.optionalDependencies ?? {})) {
      const optional = workspaces.get(dependency)
      if (optional === undefined) continue
      const os = manifest(optional).os
      if (os && ((!os.some(value => !value.startsWith('!')) && os.includes(`!${process.platform}`))
        || (os.some(value => !value.startsWith('!')) && !os.includes(process.platform)))) continue
      visit(dependency)
    }
  }
  for (const name of roots) visit(name)
  return [...visited]
}

/** Copy bytes rather than junctions so moving the application preserves every dependency. */
export function copyPortableTree(source, destination, workspaces = new Map(), ancestors = new Set()) {
  if (excluded.has(basename(source)) || source.endsWith('.pyc')) return
  const physical = realpathSync(source)
  const info = lstatSync(physical)
  if (!info.isDirectory()) { mkdirSync(dirname(destination), { recursive: true }); cpSync(physical, destination); return }
  if (ancestors.has(physical)) throw new Error(`science portable: cyclic directory dependency ${physical}`)
  const next = new Set(ancestors).add(physical)
  mkdirSync(destination, { recursive: true })
  const packageFile = join(physical, 'package.json')
  const owned = existsSync(packageFile) ? workspaces.get(manifest(physical).name) : undefined
  if (owned !== undefined) {
    const metadata = manifest(owned)
    const patterns = [...(metadata.files ?? ['lib']), 'package.json', 'LICENSE*', 'NOTICE*', 'README*']
    const selected = [...globSync(patterns, { cwd: owned })].sort((a, b) => a.length - b.length)
    const copiedDirectories = []
    for (const entry of selected) {
      if (excluded.has(entry) || entry.split(/[\\/]/u).includes('node_modules')) continue
      if (copiedDirectories.some(parent => entry.startsWith(parent + '/') || entry.startsWith(parent + '\\'))) continue
      copyPortableTree(join(owned, entry), join(destination, entry), new Map(), next)
      if (lstatSync(join(owned, entry)).isDirectory()) copiedDirectories.push(entry)
    }
    return
  }
  for (const entry of readdirSync(physical)) {
    if (excluded.has(entry)) continue
    copyPortableTree(join(physical, entry), join(destination, entry), workspaces, next)
  }
}

function dependencyDirectory(directory, name) {
  let cursor = directory
  for (;;) {
    const candidate = join(cursor, 'node_modules', ...name.split('/'))
    if (existsSync(candidate)) return realpathSync(candidate)
    const parent = dirname(cursor)
    if (parent === cursor) throw new Error(`science portable: unresolved shell dependency ${name}`)
    cursor = parent
  }
}

function copyShellDependency(source, destination, chain = new Set()) {
  const metadata = manifest(source)
  const identity = `${metadata.name}@${metadata.version}`
  if (chain.has(identity)) throw new Error(`science portable: cyclic shell dependency ${identity}`)
  cpSync(source, destination, { recursive: true, dereference: true,
    filter: path => !excluded.has(path.slice(path.lastIndexOf('/') + 1).split('\\').at(-1))
      && path !== join(source, 'node_modules') })
  const next = new Set(chain).add(identity)
  for (const name of Object.keys({ ...metadata.dependencies, ...metadata.optionalDependencies })) {
    const dependency = dependencyDirectory(source, name)
    const target = manifest(dependency)
    if (target.os && !target.os.includes(process.platform) && !target.os.includes(`!${process.platform}`)) continue
    copyShellDependency(dependency, join(destination, 'node_modules', ...name.split('/')), next)
  }
}

/** Assemble into a fresh directory, refusing to overwrite an existing application. */
export async function buildSciencePortable({ deployment, output, runtime, wheels, finalizeOnly = false }) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('science portable: this build targets Windows x64')
  if (existsSync(output) && !finalizeOnly) throw new Error('science portable: output must be a new directory')
  if (finalizeOnly && (!existsSync(join(output, 'resources', 'app', 'package.json'))
    || manifest(join(output, 'resources', 'app')).dshScience !== true || existsSync(join(output, 'science-build.json')))) {
    throw new Error('science portable: finalization requires an unfinished science staging directory')
  }
  for (const path of [join(deployment, 'node_modules'), join(runtime, 'primary-runtime', 'runtime.json'),
    join(appRoot, 'lib', 'main.js'), join(repository, 'apps', 'web', 'dist', 'index.html')]) {
    if (!existsSync(path)) throw new Error(`science portable: missing prepared input ${path}`)
  }
  const electron = require('electron')
  const shellManifest = manifest(appRoot)
  const workspaces = new Map(globSync(['vendor/*/package.json', 'packages/*/*/package.json', 'native/system/package.json',
    'native/system/packages/*/package.json', 'apps/*/package.json'], { cwd: repository })
    .map(file => { const directory = join(repository, dirname(file)); return [manifest(directory).name, directory] }))
  const closure = collectPortableWorkspaceClosure(workspaces, ['@deepseek-ai/dsh', '@deepseek-ai/dsh-desktop-host'])
  if (!existsSync(join(deployment, 'node_modules', 'js-yaml', 'package.json'))) {
    throw new Error('science portable: prepare production deploy with node-linker=hoisted')
  }
  const application = join(output, 'resources', 'app')
  const backend = join(application, 'dsh')
  if (!finalizeOnly) {
  copyPortableTree(dirname(electron), output)
  renameSync(join(output, 'electron.exe'), join(output, 'DeepSeek Science.exe'))
  mkdirSync(application, { recursive: true })
  copyPortableTree(join(appRoot, 'lib'), join(application, 'lib'))
  copyPortableTree(join(repository, 'apps', 'web', 'dist'), join(application, 'renderer'))
  writeFileSync(join(application, 'package.json'), JSON.stringify({
    name: 'deepseek-science-desktop', productName: 'DeepSeek Science', version: shellManifest.version,
    private: true, type: 'module', main: 'lib/main.js', dshScience: true,
    dshDesktopAppId: 'org.deepseek-science.desktop', license: 'MIT', dependencies: shellManifest.dependencies,
  }, null, 2) + '\n')
  for (const name of Object.keys(shellManifest.dependencies)) {
    copyShellDependency(dependencyDirectory(appRoot, name), join(application, 'node_modules', ...name.split('/')))
  }
  mkdirSync(backend, { recursive: true })
  for (const entry of readdirSync(deployment)) {
    if (excluded.has(entry)) continue
    copyPortableTree(join(deployment, entry), join(backend, entry), entry === 'node_modules' ? workspaces : new Map())
  }
  }
  // Make every required workspace peer a canonical root package; profiles and the shell resolve here.
  console.log('Materializing required workspace closure:', closure.length)
  for (const [index, name] of closure.entries()) {
    const destination = join(backend, 'node_modules', ...name.split('/'))
    if (existsSync(join(destination, 'package.json'))) {
      if (manifest(destination).version !== manifest(workspaces.get(name)).version) {
        throw new Error(`science portable: deployed workspace version mismatch ${name}`)
      }
      continue
    }
    writeFileSync(join(output, 'science-stage-progress.json'), JSON.stringify({ stage: 'workspace-payload', index, name }))
    try {
      copyPortableTree(workspaces.get(name), destination, workspaces)
    } catch (error) {
      console.log('Workspace payload failed:', name, String(error))
      throw error
    }
    if (index % 40 === 0) console.log('Workspace payloads:', index + 1, '/', closure.length)
  }
  console.log('Required workspace payloads copied')
  const shared = []
  for (const name of workspaces.keys()) {
    if (existsSync(join(backend, 'node_modules', ...name.split('/'), 'package.json'))) shared.push(name)
  }
  const { writeDesktopRuntime, verifyDesktopRuntime } = await import('../lib/types/runtime-tree.js')
  const { DESKTOP_HOST_PROTOCOL_VERSION } = await import('../lib/types/host-protocol.js')
  console.log('Runtime descriptor module loaded')
  const nodeVersion = execFileSync(electron, ['-p', 'process.versions.node'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true,
  }).trim()
  console.log('Bundled Electron Node version:', nodeVersion)
  const pnpmVersion = manifest(join(appRoot, 'node_modules', 'pnpm')).version
  writeDesktopRuntime(backend, { schemaVersion: 1, version: shellManifest.version,
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION, nodeVersion, pnpmVersion }, shared)
  console.log('Runtime descriptor written; checking file hashes')
  await verifyDesktopRuntime(backend, shellManifest.version)
  const smokeHome = join(output, '.build-smoke-home')
  console.log('Checking built scientific profile through bundled Electron Node mode')
  execFileSync(join(output, 'DeepSeek Science.exe'), [join(backend, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    '--profile', 'science', '--dump-default-config'], {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/(?:KEY|TOKEN|SECRET|PASSWORD)/iu.test(name))),
      ELECTRON_RUN_AS_NODE: '1', DSH_HOME: smokeHome }, windowsHide: true, encoding: 'utf8', timeout: 120000,
  })
  const resources = join(output, 'resources')
  copyPortableTree(runtime, join(resources, 'runtime'))
  if (wheels) installSciencePlotting(join(resources, 'runtime'), wheels)
  copyPortableTree(join(appRoot, 'node_modules', 'pnpm'), join(resources, 'runtime', 'pnpm'))
  copyPortableTree(join(appRoot, 'scripts', 'node-bin'), join(resources, 'runtime', 'bin'))
  mkdirSync(join(resources, 'runtime', 'cli'), { recursive: true })
  copyPortableTree(join(appRoot, 'lib', 'command-manager-entry.js'), join(resources, 'runtime', 'cli', 'command-manager.js'))
  const sharp = require('sharp')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="56" fill="#10242b"/><g fill="none" stroke="#54d8c6" stroke-width="12"><ellipse cx="128" cy="128" rx="91" ry="36" transform="rotate(45 128 128)"/><ellipse cx="128" cy="128" rx="91" ry="36" transform="rotate(-45 128 128)"/></g><circle cx="128" cy="128" r="17" fill="#f7c96a"/></svg>'
  const icon = await sharp(Buffer.from(svg)).png().toBuffer()
  writeFileSync(join(resources, 'icon.png'), icon)
  const header = Buffer.alloc(22)
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12)
  header.writeUInt32LE(icon.length, 14); header.writeUInt32LE(22, 18)
  writeFileSync(join(resources, 'science.ico'), Buffer.concat([header, icon]))
  copyPortableTree(join(appRoot, 'resources', 'tray-windows.ico'), join(resources, 'tray.ico'))
  const privacyCleanup = sanitizeScienceRelease(output)
  // Record final runtime bytes after removing generated build metadata.
  writeDesktopRuntime(backend, { schemaVersion: 1, version: shellManifest.version,
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION, nodeVersion, pnpmVersion }, shared)
  await verifyDesktopRuntime(backend, shellManifest.version)
  const privacyRoots = [repository, homedir(), output]
  const buildParent = dirname(repository)
  if (dirname(buildParent) !== buildParent) privacyRoots.push(buildParent)
  const privacy = auditScienceRelease(output, privacyRoots)
  if (privacy.findings.length > 0) throw new Error(`Science release privacy check failed: ${JSON.stringify(privacy.findings)}`)
  writeFileSync(join(output, '使用说明.txt'), '双击 DeepSeek Science.exe。模型在应用的“设置 → 模型”中配置。用户数据与密钥保存于用户目录 .deepseek-science；此应用包不含密钥。请保持整个目录完整，可搬移整个文件夹。科研 Python/Node 已内嵌，LaTeX、GPU 和其他外部服务仍需按任务配置。\n')
  writeFileSync(join(output, 'science-build.json'), JSON.stringify({ product: 'DeepSeek Science',
    version: shellManifest.version, target: 'win32-x64', generatedAt: new Date().toISOString(),
    credentialsIncluded: false, sharedPackages: shared.length, runtimeVerified: true, signed: false,
    privacyVerified: true, privacyScannedFiles: privacy.scannedFiles, privacyCleanup }, null, 2) + '\n')
  console.log(`Science portable prepared: ${output}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { deployment: { type: 'string' }, out: { type: 'string' }, runtime: { type: 'string' }, wheels: { type: 'string' }, finalize: { type: 'boolean' } } })
  if (!values.deployment || !values.out || !values.runtime) throw new Error('Usage: science-portable.mjs --deployment DIRECTORY --runtime DIRECTORY --out NEW_DIRECTORY')
  await buildSciencePortable({ deployment: resolve(values.deployment), runtime: resolve(values.runtime), output: resolve(values.out),
    wheels: values.wheels && resolve(values.wheels), finalizeOnly: values.finalize })
}
