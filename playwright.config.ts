import { defineConfig, devices } from '@playwright/test'

const basePath = '/Fri3d-IDE/'
const port = 4173

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'never' }]],
    outputDir: 'test-results',
    use: {
        baseURL: `http://127.0.0.1:${port}${basePath}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: `npm run build -- --base ${basePath} && npm run preview -- --base ${basePath} --host 127.0.0.1 --port ${port}`,
        url: `http://127.0.0.1:${port}${basePath}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
})
