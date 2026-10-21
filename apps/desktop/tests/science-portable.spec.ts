import { expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { copyPortableTree, collectPortableWorkspaceClosure } from '../scripts/science-portable.mjs'

it('materializes directory links and omits local credentials in a moved application', () => {
  const root = mkdtempSync(join(tmpdir(), 'science-portable-'))
  try {
    const source = join(root, 'source'), packageDir = join(root, 'package'), output = join(root, 'output')
    mkdirSync(source); mkdirSync(packageDir)
    writeFileSync(join(packageDir, 'module.js'), 'export const value = 4\n')
    writeFileSync(join(packageDir, '.env'), 'SECRET=test-only\n')
    mkdirSync(join(packageDir, '__pycache__'))
    writeFileSync(join(packageDir, '__pycache__', 'compiled.pyc'), 'generated cache')
    writeFileSync(join(packageDir, 'loose.pyc'), 'generated cache')
    symlinkSync(packageDir, join(source, 'dependency'), process.platform === 'win32' ? 'junction' : 'dir')
    copyPortableTree(source, output)
    rmSync(source, { recursive: true }); rmSync(packageDir, { recursive: true })
    expect(lstatSync(join(output, 'dependency')).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(output, 'dependency', 'module.js'), 'utf8')).toContain('value = 4')
    expect(() => readFileSync(join(output, 'dependency', '.env'))).toThrow()
    expect(() => readFileSync(join(output, 'dependency', '__pycache__', 'compiled.pyc'))).toThrow()
    expect(() => readFileSync(join(output, 'dependency', 'loose.pyc'))).toThrow()
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('includes required peers in the production closure even when deploy omits them', () => {
  const root = mkdtempSync(join(tmpdir(), 'science-peer-'))
  try {
    const workspaces = new Map<string, string>()
    for (const metadata of [
      { name: 'app', dependencies: { provider: 'workspace:*' } },
      { name: 'provider', peerDependencies: { 'peer-library': 'workspace:~' } },
      { name: 'peer-library', dependencies: { provider: 'workspace:*' } },
    ]) {
      const directory = join(root, metadata.name)
      mkdirSync(directory); writeFileSync(join(directory, 'package.json'), JSON.stringify(metadata))
      workspaces.set(metadata.name, directory)
    }
    expect(collectPortableWorkspaceClosure(workspaces, ['app']).sort()).toEqual(['app', 'peer-library', 'provider'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
