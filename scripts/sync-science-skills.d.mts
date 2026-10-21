/** Type declarations for the explicit science-resource synchronization script. */

/** Required fields used to assign stable public names. */
export interface ScienceNameCandidate {
  readonly originalName: string
  readonly source: { readonly id: string; readonly path?: string }
  readonly digest: string
}

/** Counts returned after offline integrity verification. */
export interface ScienceAssetCounts {
  readonly entries: number
  readonly files: number
}

/** Assign source-prefixed names to collisions and sort the result. */
export function assignNames<T extends ScienceNameCandidate>(entries: readonly T[], locks?: readonly { source: string; path: string; name: string }[]): (T & { name: string })[]
/** Return whether the reviewed declaration permits redistribution. */
export function permittedLicense(text: string): boolean
/** Require an upstream root license, preserving reviewed root notices. */
export function reviewedRootLegalFiles(paths: readonly string[]): string[]
/** Local adapter metadata with an explicit bounded upstream document selection. */
export interface ScienceKnowledgeGuide {
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly sourcePath: string
  readonly resourcePaths: readonly string[]
}
/** Validate that every selected official knowledge document exists and is redistributable resource material. */
export function reviewedKnowledgeResources(guide: ScienceKnowledgeGuide, paths: readonly string[]): string[]
/** Apply reviewed repository licensing to an informational notice without overriding restrictions. */
export function permittedNotice(text: string, inheritedLicense: string): boolean
/** Resolve the recognized LICENSE.txt declaration only when that skill-local file is present. */
export function declaredLicenseTerms(declared: string | undefined, referencedLicense: string | undefined): string | undefined
/** Resolve a generated relative path inside its asset root. */
export function safeAssetPath(root: string, relative: string): string
/** Resolve a package-contained destination that does not escape through a junction. */
export function safePackageTarget(target: string): string
/** Retain declared licensing plus a nested license exception. */
export function redistributionLicense(declared: string | undefined, nestedText: string, rootText: string): string
/** Return literal local Markdown file links outside code examples. */
export function localResourceLinks(content: string, format?: 'markdown' | 'rst'): string[]
/** Verify existing assets without Git or network access. */
export function verifyAssets(assetRoot: string): ScienceAssetCounts
/** Add transitive resource documents to an existing verified tree. */
export function completeResourceClosure(options: { assetRoot: string; sourceRoot: string }): ScienceAssetCounts
/** Generate resources from fixed source revisions; fetch is an explicit opt-in. */
export function syncAssets(options: {
  sourceRoot: string
  assetRoot: string
  inventoryPath?: string
  fetch?: boolean
}): ScienceAssetCounts
