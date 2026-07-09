// Bundles all UI translations. Each src/lang/<code>.json becomes the i18next
// resource for that language code.
const modules = import.meta.glob('./*.json', { eager: true, import: 'default' })

export const translations: Record<string, object> = Object.fromEntries(
    Object.entries(modules).map(([file, data]) => [
        file.replace('./', '').replace('.json', ''),
        data as object,
    ])
)
