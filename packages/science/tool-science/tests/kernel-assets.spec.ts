import { readFileSync } from 'node:fs'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { loadScienceSkill, readScienceCatalog } from '@deepseek-ai/dsh-skill-science'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { selectScienceRoutes } from '../src/kernel.ts'

const rules = z.array(z.object({ id: z.string(), patterns: z.array(z.string()), skills: z.array(z.string()) }))
  .parse(JSON.parse(readFileSync(new URL('../assets/kernel/routes.json', import.meta.url), 'utf8')))
const catalog = readScienceCatalog()

it('routes every default candidate to an actual permitted embedded instruction resource', () => {
  expect(new Set(rules.map(rule => rule.id)).size).toBe(rules.length)
  for (const rule of rules) {
    for (const name of rule.skills) {
      const entry = catalog.entries.find(candidate => candidate.name === name)
      expect(entry, `${rule.id}: ${name} is not packaged`).toBeDefined()
      expect(entry?.invocation.modelInvocable, name).toBe(true)
      expect(entry?.license.noncommercial, name).toBe(false)
    }
  }
})

it.each([
  ['biology', '研究单细胞转录组并完成一篇生物学论文'],
  ['medicine', '研究临床队列并完成一篇医学论文'],
  ['chemistry', '研究分子催化并完成一篇化学论文'],
  ['physics', '研究量子动力学并完成一篇物理论文'],
  ['mathematics', '研究微分方程并完成一篇数学论文'],
  ['engineering', '研究控制系统稳定性并完成一篇工程论文'],
  ['electronics', '研究电子电路并完成一篇论文'],
  ['earth-environment', '研究海洋环境并完成一篇论文'],
  ['computing', '研究机器学习并完成一篇论文'],
])('recognizes the shipped %s route without a skill name', (id, request) => {
  const selected = selectScienceRoutes([createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: request }] })], rules)
  expect(selected?.routes).toContain(id)
  expect(selected?.nativeNames).toContain('deepseek-science-writing')
  const domain = rules.find(rule => rule.id === id)!
  expect(selected?.domainNames).toContain(domain.skills[0])
  expect(selected!.domainNames.indexOf(domain.skills[0]!)).toBeLessThan(selected!.domainNames.indexOf('nature-writing'))
})

it.each(['sympy-symbolic-mathematics', 'qutip-quantum-dynamics', 'control-systems-engineering', 'kicad', 'lean4', 'bio-workflows-rnaseq-to-de'])(
  'loads the complete locally retained %s specialization with source metadata', async (name) => {
    const definition = await loadScienceSkill(catalog, name, { invocation: 'model' })
    expect(definition?.content.length).toBeGreaterThan(500)
    expect(definition?.path?.startsWith(catalog.assetRoot)).toBe(true)
    expect(definition?.content.startsWith('## Embedded skill source')).toBe(true)
  },
)
