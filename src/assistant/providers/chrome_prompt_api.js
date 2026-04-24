/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

function messageListToPrompt(messages) {
    return messages.map(msg => `[${msg.role}]\n${msg.content}`).join('\n\n')
}

export async function getChromePromptApiStatus() {
    if (typeof window === 'undefined' || !window.LanguageModel) {
        return { available: false, reason: 'Prompt API is not available in this browser' }
    }

    try {
        const availability = await window.LanguageModel.availability({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }],
        })

        if (availability === 'unavailable') {
            return { available: false, reason: 'Prompt API unavailable on this device/browser' }
        }

        if (availability === 'downloading') {
            return { available: true, downloading: true, reason: 'Model is downloading in Chrome' }
        }

        return { available: true, downloading: false, reason: 'Prompt API ready' }
    } catch (err) {
        return { available: false, reason: `Prompt API check failed: ${err.message}` }
    }
}

export async function runChromePromptApiChat({ messages, onChunk, signal, onStatus }) {
    const status = await getChromePromptApiStatus()
    if (!status.available) {
        throw new Error(status.reason)
    }

    const session = await window.LanguageModel.create({
        monitor(monitor) {
            monitor.addEventListener('downloadprogress', (event) => {
                if (onStatus) {
                    onStatus(`downloading ${(event.loaded * 100).toFixed(1)}%`)
                }
            })
        },
    })

    try {
        const prompt = messageListToPrompt(messages)

        if (session.promptStreaming) {
            const stream = session.promptStreaming(prompt, { signal })
            for await (const chunk of stream) {
                if (chunk) onChunk(chunk)
            }
        } else {
            const result = await session.prompt(prompt, { signal })
            if (result) onChunk(result)
        }
    } finally {
        try {
            session.destroy()
        } catch (_err) {
            // ignore destroy errors
        }
    }
}
