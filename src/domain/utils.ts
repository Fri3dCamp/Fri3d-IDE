/*
 * Framework-free utilities shared by the domain layer.
 * SPDX-License-Identifier: MIT
 */

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Promise-chain mutex: `const release = await mutex.acquire(); … release()` */
export class Mutex {
    private lock: Promise<unknown> = Promise.resolve()

    acquire(): Promise<() => void> {
        let release!: () => void
        const next = new Promise<void>((resolve) => (release = resolve))
        const acquired = this.lock.then(() => release)
        this.lock = this.lock.then(() => next)
        return acquired
    }
}

export async function fetchJSON(url: string): Promise<any> {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    return response.json()
}

export async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    return response.arrayBuffer()
}

/** Split "/a/b/c.py" → ["a/b", "c.py"] */
export function splitPath(path: string): [string, string] {
    const parts = path.split('/').filter((p) => p !== '')
    const filename = parts.pop() ?? ''
    return [parts.join('/'), filename]
}

export function sizeFmt(size: number | null | undefined, places = 1): string {
    if (size == null) return 'unknown'
    const suffixes = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let i = 0
    while (size > 1024 && i < suffixes.length - 1) {
        i++
        size /= 1024
    }
    return i === 0 ? `${size}${suffixes[i]}` : `${size.toFixed(places)}${suffixes[i]}`
}

export const iOS = typeof navigator !== 'undefined' && /(iPad|iPhone|iPod)/.test(navigator.userAgent)

/**
 * Error reporting hook. The domain layer calls report(); the app registers a
 * handler at bootstrap (toast). Keeps domain code free of UI imports.
 */
type ReportHandler = (title: string, err: Error) => void
let reportHandler: ReportHandler = (title, err) => console.error(title, err)

export function setReportHandler(handler: ReportHandler): void {
    reportHandler = handler
}

export function report(title: string, err: Error): void {
    reportHandler(title, err)
}
