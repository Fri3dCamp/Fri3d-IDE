import { describe, expect, it } from 'vitest'
import type { AppInfo } from '../src/stores/apps'
import { fuzzyScore, searchApps } from '../src/features/side-menu/appSearch'

const apps: AppInfo[] = [
    {
        fullname: 'be.fri3d.weather',
        name: 'Weather',
        version: '1.0.0',
        short_description: 'Camp forecast',
        path: '/apps/be.fri3d.weather',
        activities: [],
    },
    {
        fullname: 'be.fri3d.hello',
        name: 'Hello World',
        version: '1.0.0',
        short_description: 'Starter application',
        path: '/apps/be.fri3d.hello',
        activities: [],
    },
]

describe('app search', () => {
    it('matches substrings and ordered fuzzy characters', () => {
        expect(fuzzyScore('Hello World', 'hello')).toBeGreaterThan(100)
        expect(fuzzyScore('Hello World', 'hwd')).not.toBeNull()
        expect(fuzzyScore('Hello World', 'xyz')).toBeNull()
    })

    it('searches names, identifiers, and descriptions', () => {
        expect(searchApps(apps, 'weather')[0].fullname).toBe('be.fri3d.weather')
        expect(searchApps(apps, 'hello')[0].fullname).toBe('be.fri3d.hello')
        expect(searchApps(apps, 'forecast')[0].fullname).toBe('be.fri3d.weather')
    })
})
