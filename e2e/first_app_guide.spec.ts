import { expect, test, type Page } from '@playwright/test'

// Fail fast on any stuck click/assertion instead of burning the whole
// test timeout; slow operations (badge boot, app launch) override locally.
test.use({ actionTimeout: 15_000 })

const APP_ID = 'com.example.sparkgame'
const BADGE_IFRAME = '#virtual-badge-panel iframe[title="MicroPythonOS virtual badge"]'

/** Snapshot the badge screen pixels via the same-origin iframe canvas. */
async function badgeScreenSnapshot(page: Page): Promise<string> {
    return page.evaluate((selector) => {
        const iframe = document.querySelector<HTMLIFrameElement>(selector)
        const canvas = iframe?.contentDocument?.getElementById('canvas') as HTMLCanvasElement | null
        if (!canvas) throw new Error('badge canvas not found')
        return canvas.toDataURL()
    }, BADGE_IFRAME)
}

async function pressBadgeKeys(page: Page, keys: string[]): Promise<void> {
    const canvas = page.frameLocator(BADGE_IFRAME).locator('#canvas')
    await canvas.click()
    for (const key of keys) {
        await canvas.press(key)
        await page.waitForTimeout(150)
    }
}

/** Expect badge pixels to change in response to the given keys. */
async function expectBadgeReactsToKeys(page: Page, keys: string[]): Promise<void> {
    await expect
        .poll(
            async () => {
                const before = await badgeScreenSnapshot(page)
                await pressBadgeKeys(page, keys)
                const after = await badgeScreenSnapshot(page)
                return after !== before
            },
            { timeout: 30_000, message: `badge screen should react to ${keys.join(', ')}` },
        )
        .toBe(true)
}

async function completeGuideStep(page: Page, stepNumber: number, totalSteps: number): Promise<void> {
    const guide = page.locator('aside', { hasText: 'Build your first app' })
    await expect(guide.getByText(`Step ${stepNumber} of ${totalSteps}`)).toBeVisible()

    // Every step advertises an escape hatch that inserts the working code.
    await guide.getByRole('button', { name: /Stuck\?/ }).click()
    await page.getByRole('button', { name: 'Confirm' }).click()

    await guide.getByRole('button', { name: 'Check, save & launch' }).click()
    await expect(guide.getByRole('status')).toContainText('Code looks good', { timeout: 60_000 })
}

test('first-app guide builds a joystick game on the virtual badge', async ({ page }) => {
    test.setTimeout(420_000)
    await page.goto('./')

    // Onboarding: build my first app on the virtual badge.
    const welcome = page.getByRole('dialog', { name: 'What do you want to do?' })
    await welcome.getByRole('button', { name: /Build my first app/ }).click()
    const targetChoice = page.getByRole('dialog', { name: 'Where should the app run?' })
    await targetChoice.getByRole('button', { name: /Virtual badge/ }).click()
    // Virtual badge preview disclaimer.
    await page.getByRole('button', { name: 'Confirm' }).click()

    await expect(page.locator(BADGE_IFRAME)).toBeVisible({ timeout: 30_000 })
    // Park the floating badge top-center (over the editor, which this test
    // never clicks) so it covers neither the side menu nor the guide panel,
    // and keep ephemeral toasts from swallowing clicks on the guide buttons.
    await page.evaluate(() => {
        const panel = document.getElementById('virtual-badge-panel')
        if (panel) {
            panel.style.right = 'auto'
            panel.style.bottom = 'auto'
            panel.style.left = '35%'
            panel.style.top = '48px'
        }
    })
    await page.addStyleTag({ content: '[data-sonner-toast] { pointer-events: none !important; }' })
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: 'Create New App' }).click()

    await page.locator('#app-id').fill(APP_ID)
    await page.locator('#app-name').fill('Spark Game')
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    const guide = page.locator('aside', { hasText: 'Build your first app' })
    await expect(guide.getByText(APP_ID)).toBeVisible({ timeout: 30_000 })

    const totalSteps = await guide
        .getByText(/Step 1 of \d+/)
        .textContent()
        .then((text) => Number(text?.match(/of (\d+)/)?.[1]))
    expect(totalSteps).toBeGreaterThanOrEqual(8)

    for (let stepNumber = 1; stepNumber <= totalSteps; stepNumber++) {
        await completeGuideStep(page, stepNumber, totalSteps)

        if (stepNumber === totalSteps - 1) {
            // Joystick step: the on-screen tap button is still visible, so this
            // proves the screen keeps keypad focus and arrow keys move the ship.
            await expectBadgeReactsToKeys(page, ['ArrowRight', 'ArrowRight', 'ArrowDown'])
        }

        if (stepNumber < totalSteps) {
            await guide.getByRole('button', { name: 'Next feature' }).click()
        }
    }

    // Final game: arrows steer, Enter (badge A button) tries a catch.
    await expectBadgeReactsToKeys(page, ['ArrowLeft', 'ArrowUp', 'Enter', 'ArrowRight'])

    await guide.getByRole('button', { name: 'Finish' }).click()
    await expect(guide).toBeHidden()
})
