export async function buildMpkArchive(appId: string, files: Record<string, Uint8Array>): Promise<Uint8Array> {
    const entries: Record<string, Uint8Array> = {
        [`${appId}/`]: new Uint8Array(),
    }

    for (const [path, bytes] of Object.entries(files)) entries[`${appId}/${path}`] = bytes

    const { zipSync } = await import('fflate')
    return zipSync(entries)
}