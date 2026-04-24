/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

let _engine = null
let _engineModel = null

async function importWebLLM() {
    return await import(/* @vite-ignore */ 'https://esm.sh/@mlc-ai/web-llm@0.2.82?bundle')
}

export function getWebLLMStatus() {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        return { available: false, reason: 'WebGPU is unavailable in this browser' }
    }
    return { available: true, reason: _engine ? 'ready' : 'not initialized' }
}

async function ensureEngine(model, onStatus) {
    if (_engine && _engineModel === model) {
        return _engine
    }

    const status = getWebLLMStatus()
    if (!status.available) {
        throw new Error(status.reason)
    }

    if (onStatus) onStatus('loading webllm runtime')
    const webllm = await importWebLLM()

    if (!webllm.CreateMLCEngine) {
        throw new Error('WebLLM runtime missing CreateMLCEngine')
    }

    if (onStatus) onStatus(`initializing model ${model}`)
    _engine = await webllm.CreateMLCEngine(model, {
        initProgressCallback(report) {
            if (onStatus && report?.text) {
                onStatus(report.text)
            }
        },
    })
    _engineModel = model

    return _engine
}

export async function clearWebLLMCache() {
    _engine = null
    _engineModel = null
}

export async function runWebLLMChat({ model, messages, onChunk, signal, onStatus, temperature, maxTokens }) {
    if (!model) {
        throw new Error('WebLLM model is not configured')
    }

    const engine = await ensureEngine(model, onStatus)

    const stream = await engine.chat.completions.create({
        messages,
        stream: true,
        temperature,
        max_tokens: maxTokens,
    })

    for await (const chunk of stream) {
        if (signal?.aborted) {
            throw new Error('Request cancelled')
        }
        const delta = chunk?.choices?.[0]?.delta?.content
        if (delta) {
            onChunk(delta)
        }
    }
}
