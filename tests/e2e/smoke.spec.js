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

function attachErrorCollectors(page) {
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text())
        }
    })
    return errors
}

test('main app shell loads and renders key actions', async ({ page }) => {
    await installMicroPythonStub(page)
    const errors = attachErrorCollectors(page)

    await page.goto('/')
    await expect(page).toHaveTitle(/Fri3d-IDE/)
    await expect(page.locator('#btn-save')).toBeVisible()
    await expect(page.locator('#btn-run')).toBeVisible()
    await expect(page.locator('#menu-file-tree')).toBeVisible()

    expect(errors, errors.join('\n')).toEqual([])
})

test('bridge page loads with bridge controls', async ({ page }) => {
    await installMicroPythonStub(page)
    const errors = attachErrorCollectors(page)

    await page.goto('/bridge.html')
    await expect(page).toHaveTitle(/Fri3d-IDE P2P Bridge/)
    await expect(page.locator('#btn-conn-ws')).toBeVisible()
    await expect(page.locator('#bridge-id')).toBeVisible()

    expect(errors, errors.join('\n')).toEqual([])
})

test('benchmark page loads with benchmark options', async ({ page }) => {
    await installMicroPythonStub(page)
    const errors = attachErrorCollectors(page)

    await page.goto('/benchmark.html')
    await expect(page).toHaveTitle(/Fri3d-IDE Benchmark/)
    await expect(page.locator('#test-fs')).toBeChecked()
    await expect(page.locator('#test-cpu')).toBeChecked()
    await expect(page.locator('#btn-conn-usb')).toBeVisible()

    expect(errors, errors.join('\n')).toEqual([])
})
