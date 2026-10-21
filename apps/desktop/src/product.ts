/** Product identity selected by the installed desktop manifest. */
import type { DesktopLocale } from './locale.ts'

/** One desktop product's installation and user-data identity. */
export interface DesktopProduct {
  readonly name: string
  readonly profile: 'desktop' | 'science-desktop'
  readonly appId: string
  readonly homeDirectory: string
  readonly science: boolean
}

/**
 * Resolve installed identity, with an explicit development selector.
 * @param manifest - Parsed installed package metadata.
 * @param environment - Development environment; installed science metadata takes precedence.
 * @returns Product paths and branding, without credentials.
 */
export function resolveDesktopProduct(manifest: unknown, environment: NodeJS.ProcessEnv = process.env): DesktopProduct {
  const selector = environment.DSH_DESKTOP_SCIENCE
  if (selector !== undefined && selector !== '0' && selector !== '1') {
    throw new Error('DSH_DESKTOP_SCIENCE must be 0 or 1')
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('desktop product: package metadata must be an object')
  }
  if ('dshScience' in manifest && typeof manifest.dshScience !== 'boolean') {
    throw new Error('desktop product: dshScience must be boolean')
  }
  const science = ('dshScience' in manifest && manifest.dshScience === true) || selector === '1'
  return science
    ? { name: 'DeepSeek Science', profile: 'science-desktop', appId: 'org.deepseek-science.desktop',
        homeDirectory: '.deepseek-science', science: true }
    : { name: 'DeepSeek Science', profile: 'desktop', appId: 'com.deepseek.harness',
        homeDirectory: '.dsh', science: false }
}

/**
 * Apply product naming to translated native actions without mutating their dictionary.
 * @param locale - Resolved desktop dictionary.
 * @param productName - Installed product's display name.
 * @returns A locale retaining its language and translated actions.
 */
export function brandDesktopLocale(locale: DesktopLocale, productName: string): DesktopLocale {
  const messages = { ...locale.messages }
  for (const key of Object.keys(messages) as Array<keyof typeof messages>) {
    messages[key] = messages[key].replaceAll('DeepSeek Science', productName)
  }
  return { id: locale.id, messages }
}
