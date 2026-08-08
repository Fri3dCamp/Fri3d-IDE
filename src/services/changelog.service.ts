import changelogText from '../../CHANGELOG.md?raw'
import { useEditorTabsStore } from '../stores/editorTabs'

const CHANGELOG_SEEN_KEY = 'fri3d-ide-changelog-seen'

/** Open (or re-activate) the changelog as a read-only markdown tab. */
export function openChangelogTab(): void {
    useEditorTabsStore.getState().openTab({
        fn: 'Changelog',
        kind: 'markdown',
        viewMode: 'view',
        readOnly: true,
        content: changelogText,
    })
}

/** VS Code-style release notes: open the changelog once per new version.
 *  First-ever visit only records the version (the Welcome tab has the
 *  spotlight); later version bumps open the tab. */
export function showChangelogOnUpdate(): void {
    let seen: string | null = null
    try {
        seen = localStorage.getItem(CHANGELOG_SEEN_KEY)
        localStorage.setItem(CHANGELOG_SEEN_KEY, VIPER_IDE_VERSION)
    } catch {
        return
    }
    if (seen && seen !== VIPER_IDE_VERSION) openChangelogTab()
}
