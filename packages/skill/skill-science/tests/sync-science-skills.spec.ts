import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { assignNames, declaredLicenseTerms, localResourceLinks, permittedLicense, permittedNotice, redistributionLicense, reviewedKnowledgeResources, reviewedRootLegalFiles, safeAssetPath, safePackageTarget, syncAssets, verifyAssets } from '../../../../scripts/sync-science-skills.mjs'

describe('science asset generation', () => {
  it('assigns collisions using stable source names regardless of input order', () => {
    const entries = [
      { originalName: 'peer-review', source: { id: 'zeta' }, digest: 'one' },
      { originalName: 'peer-review', source: { id: 'alpha' }, digest: 'two' },
      { originalName: 'nature-writing', source: { id: 'nature-skills' }, digest: 'three' },
    ]
    expect(assignNames(entries).map(entry => entry.name)).toEqual(['alpha-peer-review', 'nature-writing', 'zeta-peer-review'])
    expect(assignNames([...entries].reverse())).toEqual(assignNames(entries))
  })

  it('distinguishes same-source name collisions by their content hashes', () => {
    const entries = [
      { originalName: 'review', source: { id: 'alpha' }, digest: '1'.repeat(64) },
      { originalName: 'review', source: { id: 'alpha' }, digest: '2'.repeat(64) },
    ]
    expect(assignNames(entries).map(entry => entry.name)).toEqual([
      'alpha-review-' + '1'.repeat(16),
      'alpha-review-' + '2'.repeat(16),
    ])
  })

  it('retains locked public names when new sources or same-source variants collide', () => {
    const entries = [
      { originalName: 'review', source: { id: 'alpha', path: 'review/SKILL.md' }, digest: '1'.repeat(64) },
      { originalName: 'review', source: { id: 'beta', path: 'review/SKILL.md' }, digest: '2'.repeat(64) },
      { originalName: 'review', source: { id: 'beta', path: 'codex/review/SKILL.md' }, digest: '3'.repeat(64) },
    ]
    const locks = [
      { source: 'alpha', path: 'review/SKILL.md', name: 'review' },
      { source: 'beta', path: 'review/SKILL.md', name: 'beta-review' },
    ]
    expect(assignNames(entries, locks).map(entry => entry.name)).toEqual([
      'beta-review', 'beta-review-' + '3'.repeat(16), 'review',
    ])
    expect(assignNames([...entries].reverse(), locks)).toEqual(assignNames(entries, locks))
  })

  it('rejects license terms restricted to Anthropic services', () => {
    expect(permittedLicense('© 2025 Anthropic, PBC. All rights reserved. Use is governed by your agreement with Anthropic.')).toBe(false)
    expect(permittedLicense('MIT License\nPermission is hereby granted, free of charge')).toBe(true)
    expect(permittedLicense('Attribution-NonCommercial 4.0 International')).toBe(true)
  })

  it('admits complete BSD three-clause terms without relying on a BSD label', () => {
    const terms = [
      'Copyright (c) Example contributors. All rights reserved.',
      'Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:',
      '1. Redistributions of source code must retain the above copyright notice.',
      '2. Redistributions in binary form must reproduce the above copyright notice.',
      '3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse products.',
      'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS".',
    ].join('\n')
    expect(permittedLicense(terms)).toBe(true)
    expect(redistributionLicense(undefined, '', terms)).toBe('BSD-3-Clause')
    expect(permittedLicense(terms.replace('3. Neither', 'c. Neither'))).toBe(true)
    expect(permittedLicense(terms.replace('3. Neither the name', 'Reserved name'))).toBe(false)
    expect(permittedLicense(terms + '\nNo redistribution permitted.')).toBe(false)
  })

  it('excludes repositories without a root license despite licensed-looking nested skills', () => {
    expect(() => reviewedRootLegalFiles(['README.md', 'skills/bio/SKILL.md', 'skills/bio/LICENSE'])).toThrow('no root license')
    expect(reviewedRootLegalFiles(['LICENSE.md', 'NOTICE', 'README.md', 'skills/bio/LICENSE'])).toEqual(['LICENSE.md', 'NOTICE'])
  })

  it('keeps official knowledge selections bounded to reviewed upstream files', () => {
    const guide = { name: 'symbolic-mathematics', description: 'Official symbolic mathematics reference.', instructions: 'Verify assumptions and exact solutions.', sourcePath: 'doc/solvers.rst', resourcePaths: ['doc/calculus.rst', 'doc/solvers.rst'] }
    expect(reviewedKnowledgeResources(guide, ['doc/solvers.rst', 'doc/calculus.rst', 'other-unreviewed-file.py'])).toEqual(['doc/calculus.rst', 'doc/solvers.rst'])
    expect(() => reviewedKnowledgeResources(guide, ['doc/solvers.rst'])).toThrow('Missing or excluded')
    expect(() => reviewedKnowledgeResources({ ...guide, resourcePaths: ['../outside.rst'] }, ['doc/solvers.rst', '../outside.rst'])).toThrow('outside')
    expect(() => reviewedKnowledgeResources({ ...guide, resourcePaths: ['tests/unreviewed.py'] }, ['doc/solvers.rst', 'tests/unreviewed.py'])).toThrow('Missing or excluded')
    expect(() => reviewedKnowledgeResources({ ...guide, instructions: '' }, ['doc/solvers.rst', 'doc/calculus.rst'])).toThrow('local instructions')
  })

  it('follows reStructuredText support directives without treating executable code as a file dependency', () => {
    expect(localResourceLinks([
      '.. include:: ../shared/notation.rst',
      '.. literalinclude:: examples/solver.py',
      '.. image:: figures/phase.svg',
      '.. plot::',
      '   print("do not execute")',
      '.. figure:: https://example.com/remote.png',
    ].join('\n'), 'rst')).toEqual(['../shared/notation.rst', 'examples/solver.py', 'figures/phase.svg'])
  })

  it('embeds a local knowledge adapter with pinned unmodified official documents and transitive support', async () => {
    const packageRoot = fileURLToPath(new URL('../', import.meta.url))
    const target = await mkdtemp(join(packageRoot, '.knowledge-test-'))
    const temporary = await mkdtemp(join(tmpdir(), 'dsh-science-knowledge-'))
    const repository = join(temporary, 'sympy-guides')
    const inventoryPath = join(temporary, 'sources.json')
    const git = (...args: string[]) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true }).trim()
    const original = 'Official symbolic mathematics reference.\n\n.. include:: notation.txt\n'
    try {
      await mkdir(join(repository, 'doc'), { recursive: true })
      await writeFile(join(repository, 'LICENSE'), 'MIT License\nPermission is hereby granted, free of charge.\n')
      await writeFile(join(repository, 'doc/topic.rst'), original)
      await writeFile(join(repository, 'doc/notation.txt'), 'Unmodified notation definitions.\n')
      git('init', '--quiet')
      git('add', '.')
      git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture documents')
      const commit = git('rev-parse', 'HEAD')
      await writeFile(inventoryPath, JSON.stringify([{
        id: 'sympy-guides', repository: 'https://github.com/sympy/sympy', commit,
        observedDate: '2026-10-18', candidateSkillPaths: [],
        knowledgeGuides: [{ name: 'symbolic-reference', description: 'Official symbolic reference subset.', instructions: 'Check assumptions and verify solutions.', sourcePath: 'doc/topic.rst', resourcePaths: [] }],
      }]))
      await writeFile(join(repository, 'doc/topic.rst'), 'Dirty uncommitted content must not be embedded.\n')
      const result = syncAssets({ sourceRoot: temporary, assetRoot: target, inventoryPath })
      expect(result.entries).toBe(1)
      expect(await readFile(join(target, 'knowledge/sympy-guides/doc/topic.rst'), 'utf8')).toBe(original)
      expect(await readFile(join(target, 'knowledge/sympy-guides/doc/notation.txt'), 'utf8')).toBe('Unmodified notation definitions.\n')
      const manifest = z.object({ entries: z.array(z.object({
        source: z.object({ path: z.string() }), skillPath: z.string(),
        metadata: z.object({ generatedKnowledgeGuide: z.object({ repositoryRoot: z.string(), upstreamResourcePath: z.string() }) }),
      })) }).parse(JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')))
      expect(manifest.entries[0]?.source.path).toBe('doc/topic.rst')
      expect(manifest.entries[0]?.skillPath).toBe('knowledge/sympy-guides/guides/symbolic-reference/SKILL.md')
      expect(manifest.entries[0]?.metadata.generatedKnowledgeGuide).toEqual({ repositoryRoot: 'knowledge/sympy-guides', upstreamResourcePath: 'knowledge/sympy-guides/doc/topic.rst' })
      expect(verifyAssets(target)).toEqual(result)
      await writeFile(join(target, 'knowledge/sympy-guides/doc/topic.rst'), 'tampered')
      expect(() => verifyAssets(target)).toThrow('hash mismatch')
    } finally {
      await rm(target, { recursive: true, force: true })
      await rm(temporary, { recursive: true, force: true })
    }
  })

  it('preserves reviewed ARIS shared references named in plain backticks with load-time hashes', async () => {
    const packageRoot = fileURLToPath(new URL('../', import.meta.url))
    const target = await mkdtemp(join(packageRoot, '.aris-support-test-'))
    const temporary = await mkdtemp(join(tmpdir(), 'dsh-science-aris-support-'))
    const repository = join(temporary, 'aris')
    const inventoryPath = join(temporary, 'sources.json')
    const git = (...args: string[]) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true }).trim()
    try {
      for (const path of ['skills/paper-write', 'skills/shared-references', 'skills/skills-codex/shared-references', 'tools']) await mkdir(join(repository, path), { recursive: true })
      await writeFile(join(repository, 'LICENSE'), 'MIT License\nPermission is hereby granted, free of charge.\n')
      await writeFile(join(repository, 'skills/paper-write/SKILL.md'), '---\nname: paper-write\ndescription: Draft an evidence-grounded manuscript.\n---\nRead `../shared-references/writing-principles.md` and `../shared-references/venue-checklists.md`.\n')
      for (const variant of ['skills/shared-references', 'skills/skills-codex/shared-references']) {
        await writeFile(join(repository, variant, 'writing-principles.md'), 'Keep claims and evidence aligned.\n')
        await writeFile(join(repository, variant, 'venue-checklists.md'), 'Use the actual venue template and page budget.\n')
      }
      await writeFile(join(repository, 'tools/style-profile.schema.json'), '{"type":"object"}\n')
      git('init', '--quiet')
      git('add', '.')
      git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture shared references')
      await writeFile(inventoryPath, JSON.stringify([{ id: 'aris', repository: 'https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep', commit: git('rev-parse', 'HEAD'), candidateSkillPaths: ['skills/paper-write/SKILL.md'] }]))
      const result = syncAssets({ sourceRoot: temporary, assetRoot: target, inventoryPath })
      const manifest = z.object({ entries: z.array(z.object({ files: z.array(z.string()), dependencies: z.array(z.string()) })),
        files: z.record(z.string(), z.string()),
      }).parse(JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')))
      for (const variant of ['skills/shared-references', 'skills/skills-codex/shared-references']) {
        expect(manifest.entries[0]?.dependencies).toContain(variant + '/')
        for (const reference of ['writing-principles.md', 'venue-checklists.md']) {
          const path = `sources/aris/${variant}/${reference}`
          expect(manifest.entries[0]?.files).toContain(path)
          expect(manifest.files[path]).toMatch(/^[a-f0-9]{64}$/u)
        }
      }
      expect(manifest.entries[0]?.files).toContain('sources/aris/tools/style-profile.schema.json')
      expect(verifyAssets(target)).toEqual(result)
      await writeFile(join(target, 'sources/aris/skills/shared-references/writing-principles.md'), 'tampered')
      expect(() => verifyAssets(target)).toThrow('hash mismatch')
    } finally {
      await rm(target, { recursive: true, force: true })
      await rm(temporary, { recursive: true, force: true })
    }
  })

  it('retains individual and nested licensing separately from the repository license', () => {
    expect(permittedLicense('CC-BY-4.0')).toBe(true)
    expect(permittedLicense('https://creativecommons.org/licenses/by/4.0/')).toBe(true)
    expect(redistributionLicense('BSD-3-Clause license', '', 'MIT License')).toBe('BSD-3-Clause')
    expect(redistributionLicense(undefined, 'MIT License', 'Apache License')).toBe('Apache-2.0 AND MIT')
  })

  it('inherits reviewed terms for informational notices while retaining redistribution restrictions', () => {
    const notice = '# NOTICE\nPersonal project by its author. See LICENSE file for terms.'
    expect(permittedLicense(notice)).toBe(false)
    expect(permittedNotice(notice, 'CC-BY-NC-4.0')).toBe(true)
    expect(permittedNotice('No redistribution permitted.', 'MIT')).toBe(false)
    expect(permittedNotice('Anthropic, PBC. All rights reserved.', 'MIT')).toBe(false)
  })

  it('resolves a local license declaration without treating a missing or restricted file as permitted', () => {
    const declaration = 'Complete terms in LICENSE.txt'
    const terms = declaredLicenseTerms(declaration, 'Apache License Version 2.0')
    expect(permittedLicense(terms ?? '')).toBe(true)
    expect(redistributionLicense(terms, 'Apache License Version 2.0', 'MIT License')).toBe('Apache-2.0')
    expect(permittedLicense(declaredLicenseTerms(declaration, undefined) ?? '')).toBe(false)
    expect(permittedLicense(declaredLicenseTerms(declaration, 'Anthropic, PBC. All rights reserved.') ?? '')).toBe(false)
    expect(declaredLicenseTerms('Unknown terms', 'MIT License')).toBe('Unknown terms')
  })

  it('finds local resources without treating code, URLs, or output placeholders as dependencies', () => {
    expect(localResourceLinks([
      '[Shared](../shared/rules.md#checks)',
      '[中文](references/%E4%B8%AD%E6%96%87.md)',
      '[Web](https://example.com/paper.pdf)',
      '[Template](figures/{name}.md)',
      '```python',
      'array[index](checkpoint="model.pdf")',
      '```',
      '`[Example](fake.md)`',
    ].join('\n'))).toEqual(['../shared/rules.md', 'references/中文.md'])
  })

  it('keeps generated file paths inside the selected asset directory', () => {
    expect(() => safeAssetPath('D:/assets', '../outside')).toThrow('outside')
    expect(() => safeAssetPath('D:/assets', 'C:/outside')).toThrow('relative')
    expect(safeAssetPath('D:/assets', 'sources/nature/SKILL.md')).toContain('SKILL.md')
  })

  it('rejects replacement outside the package or through a directory junction', async () => {
    const packageRoot = fileURLToPath(new URL('../', import.meta.url))
    const owned = await mkdtemp(join(packageRoot, '.target-test-'))
    const external = await mkdtemp(join(tmpdir(), 'dsh-science-outside-'))
    const link = join(owned, 'linked')
    try {
      expect(() => safePackageTarget(external)).toThrow('inside')
      expect(() => safePackageTarget(packageRoot)).toThrow('inside')
      await symlink(external, link, 'junction')
      expect(() => safePackageTarget(join(link, 'assets'))).toThrow('inside')
      expect(safePackageTarget(join(owned, 'assets'))).toBe(join(owned, 'assets'))
    } finally {
      await unlink(link).catch((error: unknown) => {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      })
      await rm(owned, { recursive: true, force: true })
      await rm(external, { recursive: true, force: true })
    }
  })
})
