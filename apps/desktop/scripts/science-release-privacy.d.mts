export interface SciencePrivacyFinding { readonly path: string; readonly kind: 'private-file' | 'credential' | 'local-path' }
export function sanitizeScienceRelease(directory: string): { removedGeneratedFiles: number; rewrittenComments: number; relativeConsoleCommands: number }
export function auditScienceRelease(directory: string, forbiddenRoots: readonly string[]): { scannedFiles: number; findings: SciencePrivacyFinding[] }
