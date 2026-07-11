/**
 * Demo-device hooks. The onboarding tour registers handlers here so
 * device-facing services can answer without a real transport.
 */

export type DemoDirEntry =
    | { name: string; path: string; isDir: true }
    | { name: string; path: string; size: number; isDir: false }

let demoListDir: ((path: string) => DemoDirEntry[] | undefined) | null = null

export function setDemoListDir(fn: ((path: string) => DemoDirEntry[] | undefined) | null) {
    demoListDir = fn
}

export function tryDemoListDir(path: string): DemoDirEntry[] | undefined | null {
    return demoListDir ? demoListDir(path) : null
}

export function isDemoActive(): boolean {
    return demoListDir !== null
}
