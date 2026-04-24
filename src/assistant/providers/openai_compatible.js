/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

function normalizeBaseUrl(baseUrl) {
    const url = (baseUrl || '').trim() || 'https://api.openai.com/v1'
    return url.replace(/\/+$/, '')
}

function makeErrorMessage(response, bodyText) {
    if (response.status === 401) return 'Authentication failed: check API key.'
    if (response.status === 404) return 'Endpoint or model not found.'
    if (response.status === 429) return 'Rate limit reached. Retry later.'
    if (response.status >= 500) return 'Provider server error. Retry later.'
    if (bodyText) return `Provider error (${response.status}): ${bodyText.slice(0, 180)}`
    return `Provider error (${response.status})`
}

export async function runOpenAICompatibleChat({ settings, messages, onChunk, signal }) {
    const baseUrl = normalizeBaseUrl(settings.baseUrl)
    const model = (settings.model || '').trim()
    const apiKey = settings.apiKey || ''

    if (!model) {
        throw new Error('Model is required for cloud provider')
    }
    if (!apiKey) {
        throw new Error('API key is required for cloud provider')
    }

    const timeoutMs = Math.max(2000, Number(settings.timeoutMs || 45000))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)

    const abortForwarder = () => controller.abort(new Error('aborted'))
    if (signal) {
        if (signal.aborted) {
            clearTimeout(timer)
            throw new Error('Request cancelled')
        }
        signal.addEventListener('abort', abortForwarder, { once: true })
    }

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
                temperature: Number(settings.temperature || 0.2),
                max_tokens: Number(settings.maxTokens || 1024),
            }),
            signal: controller.signal,
        })

        if (!response.ok) {
            const bodyText = await response.text()
            throw new Error(makeErrorMessage(response, bodyText))
        }

        if (!response.body) {
            const fallback = await response.json()
            const txt = fallback?.choices?.[0]?.message?.content || ''
            if (txt) onChunk(txt)
            return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data:')) continue
                const payload = trimmed.slice(5).trim()
                if (!payload || payload === '[DONE]') continue

                try {
                    const json = JSON.parse(payload)
                    const delta = json?.choices?.[0]?.delta?.content
                    if (delta) onChunk(delta)
                } catch (_err) {
                    // ignore malformed streaming chunk
                }
            }
        }
    } catch (err) {
        if (controller.signal.aborted) {
            throw new Error('Request timed out or cancelled')
        }
        throw err
    } finally {
        clearTimeout(timer)
        if (signal) {
            signal.removeEventListener('abort', abortForwarder)
        }
    }
}
