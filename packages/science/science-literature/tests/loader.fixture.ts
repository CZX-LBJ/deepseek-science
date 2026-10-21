/** Test-only app boot entry: load an actual Cordis YAML composition and read an owned fixture. */
import { boot } from '../../../boot/app-boot/src/index.ts'
import type {} from '../src/index.ts'

const config = process.argv[2]!
const cwd = process.argv[3]!
const ctx = await boot('science-literature-test', config)
try {
  const result = await ctx.scienceLiterature.read('paper.pdf', { cwd, pages: [2], cache: { cwd, sandboxPolicy: { mode: 'workspace-write', workspaceRoot: cwd } } })
  console.log(`SCIENCE_RESULT=${JSON.stringify(result)}`)
} finally { await ctx.fiber.dispose() }
