import { expect, test, type Page, type Request } from '@playwright/test'

const ONBOARDING_STORAGE_KEY = 'fri3d.onboarding.tour.v4'
const BADGEHUB_AUTH_CONSOLE_ERRORS = [
    'Failed to load resource: the server responded with a status of 403',
    'Keycloak init failed',
]

interface BrowserProblems {
    consoleErrors: string[]
    pageErrors: string[]
    failedAssets: string[]
}

function watchForBrowserProblems(page: Page): BrowserProblems {
    const problems: BrowserProblems = {
        consoleErrors: [],
        pageErrors: [],
        failedAssets: [],
    }

    page.on('console', (message) => {
        if (message.type() === 'error') problems.consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => problems.pageErrors.push(error.stack ?? error.message))
    page.on('requestfailed', (request) => {
        if (isApplicationAsset(request, page)) {
            problems.failedAssets.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`)
        }
    })

    return problems
}

function isApplicationAsset(request: Request, page: Page): boolean {
    return new URL(request.url()).origin === new URL(page.url()).origin &&
        ['document', 'script', 'stylesheet'].includes(request.resourceType())
}

async function skipOnboarding(page: Page): Promise<void> {
    await page.addInitScript((key) => localStorage.setItem(key, 'done'), ONBOARDING_STORAGE_KEY)
}

function expectNoBrowserProblems(
    problems: BrowserProblems,
    allowedConsoleErrors: string[] = [],
    allowedPageErrors: string[] = [],
): void {
    expect(
        problems.pageErrors.filter((error) => !allowedPageErrors.some((allowed) => error.includes(allowed))),
        'uncaught browser exceptions',
    ).toEqual([])
    expect(
        problems.consoleErrors.filter((error) => !allowedConsoleErrors.some((allowed) => error.includes(allowed))),
        'browser console errors',
    ).toEqual([])
    expect(problems.failedAssets, 'failed document, JavaScript, or stylesheet requests').toEqual([])
}

test('production bundle boots without runtime or asset errors', async ({ page }) => {
    const problems = watchForBrowserProblems(page)
    await skipOnboarding(page)

    const response = await page.goto('./')

    expect(response?.ok()).toBe(true)
    await expect(page.getByText('Fri3d-IDE', { exact: true }).first()).toBeVisible()
    await expect(page.locator('.cm-editor')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Terminal' })).toBeVisible()
    expectNoBrowserProblems(problems)
})

test('production metadata supports rich social previews', async ({ page }) => {
    await page.goto('./')

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://fri3dcamp.github.io/Fri3d-IDE/',
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        'Fri3d IDE — MicroPython in your browser',
    )
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        'https://fri3dcamp.github.io/Fri3d-IDE/social-preview.png',
    )
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
})

test('first-run onboarding reaches the IDE shell', async ({ page }) => {
    const problems = watchForBrowserProblems(page)
    await page.goto('./')

    const welcome = page.getByRole('dialog', { name: 'What do you want to do?' })
    await expect(welcome).toBeVisible()
    await welcome.getByRole('button', { name: /Build my first app/ }).click()
    const targetChoice = page.getByRole('dialog', { name: 'Where should the app run?' })
    await expect(targetChoice).toBeVisible()
    await targetChoice.getByRole('button', { name: 'Back' }).click()
    await expect(welcome).toBeVisible()
    await welcome.getByRole('button', { name: 'Skip to editor' }).click()

    await expect(page.getByText('What do you want to do?', { exact: true })).toBeHidden()
    await expect(page.locator('.cm-editor')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Save & Run$/ })).toBeDisabled()
    expectNoBrowserProblems(problems)
})

test('core shell navigation, editor tabs, and persisted settings work', async ({ page }) => {
    const problems = watchForBrowserProblems(page)
    await skipOnboarding(page)
    await page.goto('./')

    const editorTabs = page.getByRole('tablist').filter({ has: page.getByRole('button', { name: 'New file' }) })
    await expect(editorTabs.getByRole('tab')).toHaveCount(1)
    await page.getByRole('button', { name: 'New file' }).click()
    await expect(editorTabs.getByRole('tab')).toHaveCount(2)

    await page.getByRole('tab', { name: 'File Manager' }).click()
    await expect(page.getByText('File Manager', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Tools' }).click()
    await expect(page.getByText('MicroPython docs', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Settings' }).click()
    const wordWrap = page.getByRole('checkbox', { name: 'Word wrap' })
    await wordWrap.check()
    await expect(wordWrap).toBeChecked()

    await page.reload()
    await page.getByRole('tab', { name: 'Settings' }).click()
    await expect(page.getByRole('checkbox', { name: 'Word wrap' })).toBeChecked()

    await page.getByRole('tab', { name: 'About' }).click()
    await expect(page.getByRole('button', { name: 'Copy diagnostics' })).toBeVisible()
    expectNoBrowserProblems(problems, BADGEHUB_AUTH_CONSOLE_ERRORS)
})

test('Web Serial and Bluetooth permission cancellation is handled safely', async ({ page }) => {
    const problems = watchForBrowserProblems(page)
    await skipOnboarding(page)
    await page.addInitScript(() => {
        const cancelled = (key: string) => async () => {
            localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? '0') + 1))
            throw new DOMException('Permission picker cancelled', 'NotFoundError')
        }
        Object.defineProperty(navigator, 'serial', {
            configurable: true,
            value: { requestPort: cancelled('e2e.serialRequestCount') },
        })
        Object.defineProperty(navigator, 'bluetooth', {
            configurable: true,
            value: { requestDevice: cancelled('e2e.bluetoothRequestCount') },
        })
    })
    await page.goto('./')

    await page.getByRole('tab', { name: 'File Manager' }).click()
    await page.getByRole('button', { name: 'Connect device' }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('e2e.serialRequestCount'))).toBe('1')
    await expect(page.getByRole('button', { name: 'Connect device' })).toBeEnabled()

    await page.getByRole('tab', { name: 'Settings' }).click()
    await page.getByRole('checkbox', { name: /Advanced mode/ }).check()
    await page.getByRole('tab', { name: 'File Manager' }).click()
    await page.getByRole('button', { name: 'Connect Bluetooth' }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('e2e.bluetoothRequestCount'))).toBe('1')
    await expect(page.getByRole('button', { name: 'Connect Bluetooth' })).toBeEnabled()
    expectNoBrowserProblems(problems, BADGEHUB_AUTH_CONSOLE_ERRORS)
})

test('virtual badge starts in the production shell', async ({ page }) => {
    const problems = watchForBrowserProblems(page)
    await skipOnboarding(page)
    await page.goto('./')

    await page.getByRole('tab', { name: 'File Manager' }).click()
    await page.getByRole('button', { name: 'Connect to virtual badge' }).click()
    await page.getByRole('button', { name: 'Confirm' }).click()

    const badge = page.locator('#virtual-badge-panel iframe[title="MicroPythonOS virtual badge"]')
    await expect(badge).toBeVisible({ timeout: 15_000 })
    await expect(badge).toHaveAttribute('src', /vbadge\/index\.html/)
    expectNoBrowserProblems(problems, [
        '__debug__ is set so code compiled with opt_level 0',
        'could not import/run freezefs_mount_builtin',
        'Detected linux system, importing mpos.board.linux',
        'mpos.imu.drivers.iio:Error listing dir',
        'Starting very limited asyncio REPL task',
        'could not mark this update as valid: no module named',
    ])
})

test('BadgeHub authentication outage falls back to a login action', async ({ page }) => {
    const problems = watchForBrowserProblems(page)
    await skipOnboarding(page)
    await page.route('https://keycloak.badgehub.eu/**', (route) => route.abort('failed'))
    await page.goto('./')

    await page.getByRole('tab', { name: 'Settings' }).click()
    await expect(page.getByRole('button', { name: 'Login to BadgeHub' })).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => problems.consoleErrors.some((error) => error.includes('Keycloak init failed'))).toBe(true)
    expectNoBrowserProblems(problems, ['Keycloak init failed'], ["Failed to read the 'localStorage' property"])
})
