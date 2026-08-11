import type { ProjectFile } from './api'

/** Select an installable MPK from a BadgeHub revision.
 *
 * BadgeHub's application executable is only a preference: publishers may set
 * it to the Python entrypoint inside the package. Never return that source
 * file to the MPK installer.
 */
export function selectMpkFile(
    files: ProjectFile[],
    executable?: string,
    version?: string,
): ProjectFile | undefined {
    const candidates = files.filter((file) => file.ext.toLowerCase() === '.mpk')

    if (executable) {
        const preferred = candidates.find(
            (file) => file.full_path.toLowerCase() === executable.toLowerCase(),
        )
        if (preferred) return preferred
    }

    if (version) {
        const suffix = `_${version}.mpk`.toLowerCase()
        const versionMatch = candidates.find((file) => file.full_path.toLowerCase().endsWith(suffix))
        if (versionMatch) return versionMatch
    }

    return candidates[0]
}
