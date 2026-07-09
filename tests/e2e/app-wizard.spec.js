import { test, expect } from '@playwright/test'

async function installMicroPythonStub(page) {
    await page.route('**/micropython.mjs', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'text/javascript',
            body: `
                globalThis.loadMicroPython = async function loadMicroPython() {
                    return {
                        FS: {
                            writeFile() {},
                            mkdir() {},
                            readFile() { return '' },
                        },
                        replInit() {},
                        replProcessCharWithAsyncify: async () => 0,
                        runPython() {},
                    }
                }
            `,
        })
    })
}

test('app wizard collects manifest fields and icon', async ({ page }) => {
    await installMicroPythonStub(page)
    await page.goto('/')
    // The legacy controller is loaded dynamically after the React shell mounts
    await page.waitForFunction(() => typeof window.app?.showAppWizardDialog === 'function')

    await page.evaluate(() => {
        window.__wizardResult = window.app.showAppWizardDialog()
    })

    const dialog = page.locator('.fri3d-dialog')
    await expect(dialog).toBeVisible()

    await page.fill('#fri3d-app-fullname', 'com.example.testapp')
    await page.fill('#fri3d-app-name', 'Test App')
    await page.fill('#fri3d-app-publisher', 'Example Corp')
    await page.fill('#fri3d-app-desc', 'A short one')
    await page.fill('#fri3d-app-long-desc', 'A much longer description')
    await page.selectOption('#fri3d-app-category', 'games')

    // Auto-generated icon should not be blank.
    const autoPixels = await page.evaluate(() => {
        const c = document.querySelector('#fri3d-app-icon')
        const d = c.getContext('2d').getImageData(0, 0, 64, 64).data
        let painted = 0
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++
        return painted
    })
    expect(autoPixels).toBeGreaterThan(1000)

    // Draw a stroke and check the brush color landed on the canvas.
    await page.fill('#fri3d-icon-color', '#ff0000')
    const box = await page.locator('#fri3d-app-icon').boundingBox()
    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 10 })
    await page.mouse.up()
    const hasRed = await page.evaluate(() => {
        const c = document.querySelector('#fri3d-app-icon')
        const d = c.getContext('2d').getImageData(0, 0, 64, 64).data
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60 && d[i + 3] > 200) return true
        }
        return false
    })
    expect(hasRed).toBe(true)

    await page.click('#fri3d-wizard-create')
    const result = await page.evaluate(() => window.__wizardResult)
    expect(result).toMatchObject({
        fullname: 'com.example.testapp',
        appName: 'Test App',
        publisher: 'Example Corp',
        description: 'A short one',
        longDescription: 'A much longer description',
        category: 'games',
    })
    expect(result.iconDataUrl).toMatch(/^data:image\/png;base64,/)
})

test('app wizard rejects invalid app id', async ({ page }) => {
    await installMicroPythonStub(page)
    await page.goto('/')
    // The legacy controller is loaded dynamically after the React shell mounts
    await page.waitForFunction(() => typeof window.app?.showAppWizardDialog === 'function')

    await page.evaluate(() => {
        window.__wizardResult = window.app.showAppWizardDialog()
    })
    await page.fill('#fri3d-app-fullname', 'nodots')
    await page.click('#fri3d-wizard-create')
    await expect(page.locator('#fri3d-app-error')).toBeVisible()
    await page.keyboard.press('Escape')
    const result = await page.evaluate(() => window.__wizardResult)
    expect(result).toBe(null)
})
