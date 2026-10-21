import { expect, it } from 'vitest'
import { PROFILE_TEMPLATES } from '../src/profile.ts'

it('ships science profiles through the supported launcher', () => {
  expect(PROFILE_TEMPLATES.science?.bundles).toEqual([
    '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-science', '@deepseek-ai/dsh-science-web',
  ])
  expect(PROFILE_TEMPLATES['science-headless']?.bundles).toEqual([
    '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', '@deepseek-ai/dsh-science',
  ])
  expect(PROFILE_TEMPLATES.web?.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
})
