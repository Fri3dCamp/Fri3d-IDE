import { toast } from 'sonner'
import { i18next } from '../i18n'
import { rawInstallPkg } from '../domain/package_mgr'
import { useConnectionStore } from '../stores/connection'
import { useSettingsStore } from '../stores/settings'
import { withLoader } from '../stores/ui'
import { refreshTreeVia, withRawMode, type ConnectUi } from './device.service'

const t = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    i18next.t(key, fallback, opts) as string

export async function installPkg(pkg: string, version: string | null = null): Promise<void> {
    const { port, devInfo } = useConnectionStore.getState()
    if (!port) {
        toast.info(t('app.connect-first', 'Connect your board first'))
        return
    }

    await withLoader(t('pkg.installing', 'Installing {{pkg}}…', { pkg }), (loader) =>
        withRawMode(async (raw) => {
            try {
                const dev = devInfo ?? (await raw.getDeviceInfo())
                const info = await rawInstallPkg(raw, pkg, {
                    version,
                    dev,
                    prefer_source: useSettingsStore.getState().preferSource,
                    onProgress: ({ message, progress }: { message?: string; progress?: number }) => {
                        loader.update({
                            message: message ?? t('pkg.installing', 'Installing {{pkg}}…', { pkg }),
                            ...(progress !== undefined ? { progress } : {}),
                        })
                    },
                })
                loader.update({ progress: 1 })
                const label = info.version ? `${info.name}@${info.version}` : info.name
                toast.success(t('pkg.installed', 'Installed {{pkg}}', { pkg: label }))
                await refreshTreeVia(raw)
            } catch (err) {
                toast.error(t('pkg.install-failed', 'Installing failed'), {
                    description: err instanceof Error ? err.message : String(err),
                })
            }
        }),
    )
}

export async function installPkgFromUrl(ui: ConnectUi): Promise<void> {
    const { port } = useConnectionStore.getState()
    if (!port) {
        toast.info(t('app.connect-first', 'Connect your board first'))
        return
    }
    const url = await ui.prompt(t('app.prompt-pkg-url', 'Enter package name or URL:'))
    if (url) await installPkg(url)
}
