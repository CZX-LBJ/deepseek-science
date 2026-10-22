import { it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

it('rejects a locally present ignored resource until it is tracked, and then rejects changed bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'science-source-'))
  try {
    const prefix = 'packages/skill/skill-science/assets/'
    const assets = join(root, prefix)
    mkdirSync(join(assets, 'snapshots'), { recursive: true })
    const text = 'Pinned upstream guidance.\n'
    writeFileSync(join(root, '.gitignore'), 'snapshots/\n')
    writeFileSync(join(assets, 'snapshots/guide.md'), text)
    writeFileSync(join(assets, 'manifest.json'), JSON.stringify({ files: {
      'snapshots/guide.md': createHash('sha256').update(text).digest('hex'),
    } }))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe', windowsHide: true })
    git('init', '--quiet')
    git('add', prefix + 'manifest.json')
    const verify = () => spawnSync(process.execPath, [fileURLToPath(new URL('./verify-science-source.mjs', import.meta.url)), '--root', root],
      { cwd: root, encoding: 'utf8', windowsHide: true })
    const missing = verify()
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('missingFromGit')
    git('add', '-f', prefix + 'snapshots/guide.md')
    const complete = verify()
    expect(complete.status).toBe(0)
    expect(complete.stdout).toContain('1 pinned resources tracked')
    writeFileSync(join(assets, 'snapshots/guide.md'), 'Unreviewed replacement.\n')
    const changed = verify()
    expect(changed.status).toBe(1)
    expect(changed.stderr).toContain('changedResourceHashes')
    writeFileSync(join(assets, 'manifest.json'), JSON.stringify({ files: {} }))
    const empty = verify()
    expect(empty.status).toBe(1)
    expect(empty.stderr).toContain('empty resource inventory')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('rejects Git line-ending conversion even when working-tree bytes match the pinned manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'science-source-eol-'))
  try {
    const prefix = 'packages/skill/skill-science/assets/'
    mkdirSync(join(root, prefix), { recursive: true })
    const bytes = Buffer.from('Pinned upstream resource.\r\n')
    writeFileSync(join(root, '.gitattributes'), '* text eol=lf\n')
    writeFileSync(join(root, prefix, 'guide.md'), bytes)
    writeFileSync(join(root, prefix, 'manifest.json'), JSON.stringify({ files: {
      'guide.md': createHash('sha256').update(bytes).digest('hex'),
    } }))
    execFileSync('git', ['init', '--quiet'], { cwd: root, stdio: 'pipe', windowsHide: true })
    execFileSync('git', ['add', '.'], { cwd: root, stdio: 'pipe', windowsHide: true })
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-science-source.mjs', import.meta.url)), '--root', root],
      { cwd: root, encoding: 'utf8', windowsHide: true })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('gitBlobMismatches')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
