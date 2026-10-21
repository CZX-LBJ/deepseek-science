/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @param profileName - Installed product's isolated desktop profile name.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome: string = resolveDshHome(), profileName: 'desktop' | 'science-desktop' = 'desktop'): DesktopPaths {
  return {
    profile: join(dshHome, 'profiles', profileName),
    lock: join(dshHome, 'profiles', profileName, 'lock'),
  }
}
