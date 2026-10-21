export function copyPortableTree(source: string, destination: string, workspaces?: ReadonlyMap<string, string>, ancestors?: ReadonlySet<string>): void
export function collectPortableWorkspaceClosure(workspaces: ReadonlyMap<string, string>, roots: readonly string[]): string[]
export function buildSciencePortable(options: { deployment: string; output: string; runtime: string; wheels?: string; finalizeOnly?: boolean }): Promise<void>
