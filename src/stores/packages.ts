import { create } from 'zustand'
import { getPkgIndexes } from '../domain/package_mgr'

export interface PkgEntry {
    name: string
    version: string
    keywords?: string
    indented: boolean
    native: boolean
}

export interface PkgIndexView {
    name: string
    packages: PkgEntry[]
}

interface PackagesStore {
    indexes: PkgIndexView[] | null
    loading: boolean
    error: string | null
    load(): Promise<void>
}

export const usePackagesStore = create<PackagesStore>((set, get) => ({
    indexes: null,
    loading: false,
    error: null,

    load: async () => {
        if (get().loading || get().indexes) return
        set({ loading: true, error: null })
        try {
            const raw = await getPkgIndexes()
            const indexes: PkgIndexView[] = raw.map((i: any) => ({
                name: i.name,
                packages: i.index.packages
                    .filter((pkg: any) => {
                        const kw: string[] = pkg.keywords
                            ? pkg.keywords.split(',').map((x: string) => x.trim())
                            : []
                        return !kw.includes('__hidden__')
                    })
                    .map((pkg: any) => {
                        const kw: string[] = pkg.keywords
                            ? pkg.keywords.split(',').map((x: string) => x.trim())
                            : []
                        const parent = pkg.name.includes('-')
                            ? pkg.name.split('-').slice(0, -1).join('-')
                            : null
                        return {
                            name: pkg.name,
                            version: pkg.version ?? '',
                            keywords: pkg.keywords,
                            indented: parent
                                ? i.index.packages.some((p: any) => p.name === parent)
                                : false,
                            native: kw.includes('native'),
                        }
                    }),
            }))
            set({ indexes, loading: false })
        } catch (err) {
            set({ error: String(err), loading: false })
        }
    },
}))
