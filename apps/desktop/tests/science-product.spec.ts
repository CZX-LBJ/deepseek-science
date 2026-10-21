import { describe, expect, it } from 'vitest'
import { resolveDesktopProduct, brandDesktopLocale } from '../src/product.ts'
import { resolveDesktopLocale } from '../src/locale.ts'
import { resolveDesktopPaths } from '../src/paths.ts'

describe('independent science product', () => {
  it('selects the installed scientific identity without environment settings', () => {
    expect(resolveDesktopProduct({ dshScience: true }, {})).toEqual({
      name: 'DeepSeek Science', profile: 'science-desktop', appId: 'org.deepseek-science.desktop',
      homeDirectory: '.deepseek-science', science: true,
    })
    expect(resolveDesktopPaths('C:/Users/test/.deepseek-science', 'science-desktop').profile)
      .toMatch(/profiles[\\/]science-desktop$/)
  })

  it('preserves the ordinary desktop and accepts an explicit science development launch', () => {
    expect(resolveDesktopProduct({}, {}).science).toBe(false)
    expect(resolveDesktopProduct({}, { DSH_DESKTOP_SCIENCE: '1' }).science).toBe(true)
    expect(() => resolveDesktopProduct({}, { DSH_DESKTOP_SCIENCE: 'yes' })).toThrow(/0 or 1/)
    expect(() => resolveDesktopProduct({ dshScience: 'true' }, {})).toThrow(/boolean/)
  })

  it.each(['en', 'zh-CN'])('brands native copy while preserving translated actions (%s)', locale => {
    const original = resolveDesktopLocale(locale)
    const branded = brandDesktopLocale(original, 'DeepSeek Science')
    expect(branded.messages.aboutProduct).toBe('DeepSeek Science')
    expect(branded.messages.quitApplication).toContain('DeepSeek Science')
    expect(branded.messages.cliCommandClose).toBe(original.messages.cliCommandClose)
    expect(original.messages.aboutProduct).toBe('DeepSeek Science')
  })
})
