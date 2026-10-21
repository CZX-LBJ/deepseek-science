/** Metadata retained for embedded research instructions and their resources. */

/** Pinned upstream identity; a pin does not imply testing in this Harness. */
export interface ScienceSource {
  readonly id: string
  readonly repository: string
  readonly commit: string
  readonly path: string
  readonly author: string
  readonly version: string
}

/** One embedded skill, including its independent legal and runtime status. */
export interface ScienceCatalogEntry {
  readonly name: string
  readonly originalName: string
  readonly description: string
  readonly source: ScienceSource
  readonly alternateSources: readonly ScienceSource[]
  readonly license: {
    readonly declared: string
    readonly redistribution: string
    readonly files: readonly string[]
    readonly noncommercial: boolean
  }
  readonly packs: readonly string[]
  readonly invocation: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
  readonly adaptation: { readonly status: 'support' | 'guidance-adapted' | 'upstream'; readonly notes: string }
  readonly readiness: {
    readonly status: 'support' | 'guidance-only' | 'needs-setup'
    readonly requirements: readonly string[]
    readonly testedHere: boolean
  }
  readonly skillPath: string
  readonly resourceDirectory: string
  readonly files: readonly string[]
  readonly dependencies: readonly string[]
  readonly digest: string
  readonly metadata: Readonly<Record<string, unknown>>
}

/** Parsed catalog tied to one relocated on-disk asset tree. */
export interface ScienceCatalog {
  readonly schemaVersion: 1
  readonly assetRoot: string
  readonly defaultPacks: readonly string[]
  readonly packs: readonly string[]
  readonly entries: readonly ScienceCatalogEntry[]
  readonly files: Readonly<Record<string, string>>
  readonly excluded: readonly { readonly source: string; readonly path: string; readonly reason: string }[]
}

/** Full-catalog search filters; omitted packs searches every embedded entry. */
export interface ScienceSearchOptions {
  readonly packs?: readonly string[]
  readonly limit?: number
}

/** Explicit invocation controls for loading one catalog entry. */
export interface ScienceLoadOptions {
  readonly enabledPacks?: readonly string[] | undefined
  readonly invocation?: 'model' | 'user' | undefined
  readonly signal?: AbortSignal | undefined
}

/** One verified UTF-8 resource declared by an embedded skill. */
export interface ScienceSkillResource {
  /** Path relative to the catalog asset directory. */
  readonly catalogPath: string
  /** Absolute contained resource path, usable by local file tools. */
  readonly path: string
  /** Exact SHA-256 recorded in the packaged catalog. */
  readonly digest: string
  /** Complete file text; never a truncated instruction fragment. */
  readonly content: string
}
