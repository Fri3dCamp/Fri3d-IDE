/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import toastr from 'toastr'

import { QID } from '../../utils.js'
import { collectAssistantContext } from '../context/collector.js'
import { fetchGroundingContext } from '../context/docs_mcp.js'
import { runOpenAICompatibleChat } from '../providers/openai_compatible.js'
import { getChromePromptApiStatus, runChromePromptApiChat } from '../providers/chrome_prompt_api.js'
import { getWebLLMStatus, runWebLLMChat, clearWebLLMCache } from '../providers/webllm.js'
import { getMicroPythonSystemPrompt, getTaskInstruction } from '../prompts/micropython_system_prompt.js'

const STORAGE_KEY = 'assistant.settings.v1'
const LAYOUT_STORAGE_KEY = 'assistant.layout.v1'
const TASK_HELP = {
    'traceback-fix': 'Analyze the latest traceback and suggest the smallest safe fix.',
    'memory-opt': 'Optimize this code for MicroPython memory constraints.',
    'cpython-port': 'Port this CPython code to MicroPython-compatible code.',
    'board-bringup': 'Create a board bring-up checklist for the current connection problem.',
    'app-bootstrap': 'Generate a minimal MicroPythonOS app scaffold or improve the app main.py from requirements.',
}

const DEFAULT_LAYOUT = {
    width: 360,
    collapsed: false,
}

let _toggleAssistantSidebar = () => {}

export function toggleAssistantSidebar() {
    _toggleAssistantSidebar()
}

const DEFAULTS = {
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1-mini',
    temperature: 0.2,
    maxTokens: 1200,
    timeoutMs: 45000,
    fallback: true,
    includeEditor: true,
    includeTerminal: true,
    includeBoard: true,
    includeGrounding: true,
    webllmModel: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { ...DEFAULTS }
        return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch (_err) {
        return { ...DEFAULTS }
    }
}

function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function loadLayout() {
    try {
        const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
        if (!raw) {
            return { ...DEFAULT_LAYOUT }
        }
        return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) }
    } catch (_err) {
        return { ...DEFAULT_LAYOUT }
    }
}

function saveLayout(layout) {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

function setStatus(text) {
    QID('assistant-status').textContent = String(text)
}

function setProviderStatus(text) {
    QID('assistant-provider-status').textContent = `Provider: ${text}`
}

function renderOutput(text) {
    QID('assistant-output').textContent = text
}

function appendOutput(text) {
    QID('assistant-output').textContent += text
}

function contextToText(context) {
    return JSON.stringify(context, null, 2)
}

function buildMessages(prompt, taskId, context, grounding) {
    const parts = [
        `User request:\n${prompt}`,
        `Task mode:\n${taskId}`,
        `Task guidance:\n${getTaskInstruction(taskId) || 'General chat mode'}`,
        `Runtime context (respect privacy toggles):\n${contextToText(context)}`,
    ]

    if (grounding?.grounded && grounding.snippets?.length) {
        parts.push(`Grounded docs context:\n${grounding.snippets.join('\n\n---\n\n')}`)
    } else if (grounding?.warning) {
        parts.push(`Grounding note:\n${grounding.warning}`)
    }

    parts.push('Always include a short verification checklist in your answer.')

    return [
        { role: 'system', content: getMicroPythonSystemPrompt(taskId) },
        { role: 'user', content: parts.join('\n\n') },
    ]
}

async function callProvider(provider, payload, settings, onProviderStatus) {
    if (provider === 'openai-compatible') {
        await runOpenAICompatibleChat(payload)
        return 'cloud'
    }

    if (provider === 'chrome-prompt-api') {
        const chromeStatus = await getChromePromptApiStatus()
        if (!chromeStatus.available) {
            throw new Error(chromeStatus.reason)
        }
        await runChromePromptApiChat({ ...payload, onStatus: onProviderStatus })
        return 'local-chrome'
    }

    if (provider === 'webllm') {
        const webllmStatus = getWebLLMStatus()
        if (!webllmStatus.available) {
            throw new Error(webllmStatus.reason)
        }
        await runWebLLMChat({
            ...payload,
            model: settings.webllmModel,
            temperature: Number(settings.temperature),
            maxTokens: Number(settings.maxTokens),
            onStatus: onProviderStatus,
        })
        return 'local-webllm'
    }

    throw new Error(`Unknown provider: ${provider}`)
}

export function initAssistantPanel(runtime) {
    const settings = loadSettings()
    const layout = loadLayout()
    let activeController = null

    const container = QID('container')
    const sidebar = QID('assistant-sidebar')
    const resizer = QID('assistant-resizer')
    const collapseBtn = QID('assistant-collapse')
    const topToggleBtn = QID('assistant-toggle')
    const advancedModeEl = QID('advanced-mode')
    const providerSelectEl = QID('assistant-provider')
    const assistantSettingsSection = QID('assistant-settings-section')

    const applyLayout = () => {
        const advancedEnabled = isAdvancedMode()

        if (sidebar) {
            const width = Math.min(700, Math.max(260, Number(layout.width || DEFAULT_LAYOUT.width)))
            sidebar.style.flexBasis = `${width}px`
        }

        if (container) {
            container.classList.toggle('assistant-unavailable', !advancedEnabled)
            container.classList.toggle('assistant-collapsed', Boolean(layout.collapsed))
        }

        if (collapseBtn) {
            collapseBtn.innerText = layout.collapsed ? 'Expand' : 'Collapse'
            collapseBtn.title = layout.collapsed ? 'Expand assistant' : 'Collapse assistant'
        }

        if (topToggleBtn) {
            topToggleBtn.style.display = advancedEnabled ? '' : 'none'
            topToggleBtn.title = layout.collapsed ? 'Show Assistant' : 'Hide Assistant'
        }

        if (assistantSettingsSection) {
            assistantSettingsSection.style.display = advancedEnabled ? '' : 'none'
        }
    }

    const isAdvancedMode = () => Boolean(advancedModeEl && advancedModeEl.checked)

    const updateProviderOptionsByAdvancedMode = () => {
        if (!providerSelectEl) return

        for (const option of providerSelectEl.options) {
            if (option.value === 'chrome-prompt-api' || option.value === 'webllm') {
                option.disabled = !isAdvancedMode()
            }
        }

        if (!isAdvancedMode() && (settings.provider === 'chrome-prompt-api' || settings.provider === 'webllm')) {
            settings.provider = 'openai-compatible'
            providerSelectEl.value = settings.provider
            saveSettings(settings)
            toastr.info('Local LLM providers are available only in Advanced mode')
        }
    }

    const toggleCollapsed = () => {
        layout.collapsed = !layout.collapsed
        saveLayout(layout)
        applyLayout()
    }

    _toggleAssistantSidebar = toggleCollapsed

    if (collapseBtn) {
        collapseBtn.addEventListener('click', toggleCollapsed)
    }

    if (resizer) {
        resizer.addEventListener('mousedown', (event) => {
            if (window.innerWidth <= 768) {
                return
            }

            event.preventDefault()
            layout.collapsed = false

            const startX = event.clientX
            const startWidth = sidebar ? sidebar.getBoundingClientRect().width : DEFAULT_LAYOUT.width

            const onMouseMove = (moveEvent) => {
                const deltaX = startX - moveEvent.clientX
                const nextWidth = Math.min(700, Math.max(260, Math.round(startWidth + deltaX)))
                layout.width = nextWidth
                applyLayout()
            }

            const onMouseUp = () => {
                saveLayout(layout)
                document.removeEventListener('mousemove', onMouseMove)
                document.removeEventListener('mouseup', onMouseUp)
            }

            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onMouseUp)
        })
    }

    applyLayout()

    const mapping = [
        ['assistant-provider', 'provider', 'value'],
        ['assistant-base-url', 'baseUrl', 'value'],
        ['assistant-api-key', 'apiKey', 'value'],
        ['assistant-model', 'model', 'value'],
        ['assistant-temperature', 'temperature', 'value'],
        ['assistant-max-tokens', 'maxTokens', 'value'],
        ['assistant-timeout-ms', 'timeoutMs', 'value'],
        ['assistant-fallback', 'fallback', 'checked'],
        ['assistant-include-editor', 'includeEditor', 'checked'],
        ['assistant-include-terminal', 'includeTerminal', 'checked'],
        ['assistant-include-board', 'includeBoard', 'checked'],
        ['assistant-include-grounding', 'includeGrounding', 'checked'],
        ['assistant-webllm-model', 'webllmModel', 'value'],
    ]

    for (const [id, key, prop] of mapping) {
        const el = QID(id)
        if (!el) continue
        if (prop === 'checked') {
            el.checked = Boolean(settings[key])
        } else {
            el.value = settings[key]
        }
        el.addEventListener('change', () => {
            settings[key] = (prop === 'checked') ? el.checked : el.value
            saveSettings(settings)
            refreshProviderStatus()
        })
    }

    function requireCloudCredentials() {
        if (!settings.model || !String(settings.model).trim()) {
            throw new Error('Set Assistant model in Settings')
        }
        if (!settings.apiKey || !String(settings.apiKey).trim()) {
            throw new Error('Set Assistant API key in Settings')
        }
    }

    async function refreshProviderStatus() {
        const provider = settings.provider

        if (!isAdvancedMode() && (provider === 'chrome-prompt-api' || provider === 'webllm')) {
            setProviderStatus('local providers require Advanced mode')
            return
        }

        if (provider === 'openai-compatible') {
            setProviderStatus('cloud (openai-compatible)')
            return
        }
        if (provider === 'chrome-prompt-api') {
            const st = await getChromePromptApiStatus()
            setProviderStatus(st.available ? (st.downloading ? 'local chrome (downloading)' : 'local chrome (ready)') : `local chrome (unavailable: ${st.reason})`)
            return
        }
        if (provider === 'webllm') {
            const st = getWebLLMStatus()
            setProviderStatus(st.available ? `local webllm (${st.reason})` : `local webllm (unavailable: ${st.reason})`)
            return
        }
        setProviderStatus('unknown')
    }

    async function runPrompt(prompt, taskId = 'none') {
        if (!prompt || !prompt.trim()) {
            toastr.info('Assistant prompt is empty')
            return
        }

        const privacy = {
            includeEditor: Boolean(settings.includeEditor),
            includeTerminal: Boolean(settings.includeTerminal),
            includeBoard: Boolean(settings.includeBoard),
        }

        const context = collectAssistantContext(runtime, privacy)
        QID('assistant-context-preview').textContent = contextToText(context)

        renderOutput('')
        setStatus('connecting')

        activeController = new AbortController()

        const grounding = await fetchGroundingContext(prompt, {
            enabled: Boolean(settings.includeGrounding),
            signal: activeController.signal,
        })

        const messages = buildMessages(prompt, taskId, context, grounding)

        const payload = {
            settings,
            messages,
            signal: activeController.signal,
            onChunk(chunk) {
                setStatus('streaming')
                appendOutput(chunk)
            },
        }

        let usedProvider
        let ungroundedWarning = ''

        try {
            if (!isAdvancedMode() && (settings.provider === 'chrome-prompt-api' || settings.provider === 'webllm')) {
                throw new Error('Local LLM providers are available only in Advanced mode')
            }

            if (settings.provider === 'openai-compatible') {
                requireCloudCredentials()
            }

            usedProvider = await callProvider(settings.provider, payload, settings, setProviderStatus)
        } catch (err) {
            if (settings.provider !== 'openai-compatible' && settings.fallback) {
                try {
                    requireCloudCredentials()
                    usedProvider = await callProvider('openai-compatible', payload, settings, setProviderStatus)
                    appendOutput('\n\n[Provider fallback] Used cloud provider because selected local provider was unavailable.')
                } catch (fallbackErr) {
                    throw new Error(`${err.message}\nFallback failed: ${fallbackErr.message}`)
                }
            } else {
                throw err
            }
        } finally {
            activeController = null
        }

        if (!grounding.grounded && grounding.warning) {
            ungroundedWarning = `\n\n[Ungrounded] ${grounding.warning}`
        }

        if (grounding.sources?.length) {
            appendOutput(`\n\nSources:\n- ${grounding.sources.join('\n- ')}`)
        }

        if (ungroundedWarning) {
            appendOutput(ungroundedWarning)
        }

        appendOutput(`\n\n[Provider: ${usedProvider}]`)
        setStatus('idle')
    }

    QID('assistant-ask').addEventListener('click', async () => {
        try {
            await runPrompt(QID('assistant-prompt').value, QID('assistant-task-preset').value)
        } catch (err) {
            setStatus('error')
            toastr.error(err.message || String(err), 'Assistant error')
        }
    })

    QID('assistant-run-task').addEventListener('click', async () => {
        const taskId = QID('assistant-task-preset').value
        const extra = TASK_HELP[taskId] || ''
        const joined = [QID('assistant-prompt').value.trim(), extra].filter(Boolean).join('\n\n')
        QID('assistant-prompt').value = joined
        try {
            await runPrompt(joined, taskId)
        } catch (err) {
            setStatus('error')
            toastr.error(err.message || String(err), 'Assistant error')
        }
    })

    QID('assistant-explain-selection').addEventListener('click', async () => {
        const editorState = runtime.getEditorState()
        if (!editorState || !editorState.selection) {
            toastr.info('Select code in editor first')
            return
        }
        const text = `Explain this MicroPython code selection and mention possible risks:\n\n${editorState.selection}`
        QID('assistant-prompt').value = text
        try {
            await runPrompt(text, QID('assistant-task-preset').value)
        } catch (err) {
            setStatus('error')
            toastr.error(err.message || String(err), 'Assistant error')
        }
    })

    QID('assistant-fix-traceback').addEventListener('click', async () => {
        const traceback = runtime.getTraceback()
        if (!traceback) {
            toastr.info('No traceback context found yet')
            return
        }
        const text = `Fix this MicroPython traceback with the smallest safe patch:\n\n${traceback}`
        QID('assistant-prompt').value = text
        QID('assistant-task-preset').value = 'traceback-fix'
        try {
            await runPrompt(text, 'traceback-fix')
        } catch (err) {
            setStatus('error')
            toastr.error(err.message || String(err), 'Assistant error')
        }
    })

    QID('assistant-stop').addEventListener('click', () => {
        if (activeController) {
            activeController.abort()
            activeController = null
            setStatus('idle')
        }
    })

    QID('assistant-clear-data').addEventListener('click', async () => {
        localStorage.removeItem(STORAGE_KEY)
        await clearWebLLMCache()
        Object.assign(settings, DEFAULTS)
        saveSettings(settings)

        for (const [id, key, prop] of mapping) {
            const el = QID(id)
            if (!el) continue
            if (prop === 'checked') {
                el.checked = Boolean(settings[key])
            } else {
                el.value = settings[key]
            }
        }

        toastr.success('Assistant data cleared')
        updateProviderOptionsByAdvancedMode()
        refreshProviderStatus()
    })

    if (advancedModeEl) {
        advancedModeEl.addEventListener('change', () => {
            if (advancedModeEl.checked && layout.collapsed) {
                layout.collapsed = false
                saveLayout(layout)
            }

            applyLayout()
            updateProviderOptionsByAdvancedMode()
            refreshProviderStatus()
        })
    }

    updateProviderOptionsByAdvancedMode()
    refreshProviderStatus()
}
