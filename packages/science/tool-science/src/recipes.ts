/** Locally maintained scientific workflows, separate from the pinned upstream catalog. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { z } from 'zod'
import type { SkillDefinition } from '@deepseek-ai/dsh-skill'

const names = ['deepseek-science-literature', 'deepseek-science-analysis', 'deepseek-science-writing'] as const
const header = z.object({ name: z.enum(names), description: z.string().min(1) })
const embeddedStandards: Partial<Record<typeof names[number], readonly { title: string; path: string }[]>> = {
  'deepseek-science-analysis': [{ title: 'Data-driven scientific figure renderer workflow', path: 'references/figure-engine-workflow.md' }],
  'deepseek-science-writing': [{ title: 'Evidence-led academic writing standard', path: 'references/nature-writing-standard.md' }],
}

/** Load packaged research recipes without executing their resource scripts.
 * @returns complete definitions with their absolute resource directories.
 */
export function readNativeRecipes(): SkillDefinition[] {
  const root = fileURLToPath(new URL('../assets/recipes/', import.meta.url))
  return names.map((name) => {
    const directory = join(root, name)
    const path = join(directory, 'SKILL.md')
    const raw = readFileSync(path, 'utf8')
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
    if (match?.[1] === undefined) throw new Error(`Research recipe frontmatter is absent: ${name}`)
    const metadata = header.parse(parse(match[1]))
    if (metadata.name !== name) throw new Error(`Research recipe identity differs from its directory: ${name}`)
    const supplemental = (embeddedStandards[name] ?? []).map((standard) => {
      const content = readFileSync(join(directory, standard.path), 'utf8').trim()
      return `## ${standard.title}\n\n${content}`
    })
    return { name, path, description: metadata.description,
      content: [raw.slice(match[0].length).trim(), ...supplemental].join('\n\n'),
      source: 'bundled', provider: 'deepseek-science-recipes', invocation: { modelInvocable: true, userInvocable: true },
      resourceBase: { kind: 'directory', path: directory },
      metadata: { owner: 'DeepSeek Science', license: 'MIT', firstParty: true } }
  })
}
