// Bridge to the legacy imperative controllers. They attach their public API
// to window after the React shell has been committed to the DOM (see the
// dynamic import in each page's main.tsx), so the lookups must stay lazy.

export interface AppApi {
    connectDevice(type: 'ws' | 'ble' | 'usb'): void
    refreshFileTree(): void
    createNewApp(): void
    saveCurrentFile(): void
    clearTerminal(): void
    reboot(mode: 'soft' | 'hard'): void
    runCurrentFile(): void
    loadAllPkgIndexes(): void
    installPkgFromUrl(): void
    pyMinify(): void
    pyPrettify(): void
    expandAllFolders(): void
    collapseAllFolders(): void
    toggleSideMenu(): void
    autoHideSideMenu(): void
    toggleFullScreen(elementId: string): void
    toggleAssistantSidebar(): void
    initDrag(e: Event): void
}

export function app(): AppApi {
    return (window as any).app
}

// bridge.js / benchmark.js expose a bare connectDevice instead of window.app
export function pageConnectDevice(type: 'ws' | 'ble' | 'usb'): void {
    ;(window as any).connectDevice(type)
}
