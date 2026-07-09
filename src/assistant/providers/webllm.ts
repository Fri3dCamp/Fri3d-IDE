/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

interface ChatMessage {
    role: string
    content: string
}

export interface WebLLMStatus {
    available: boolean
    reason: string
}

let _engine: any = null
let _engineModel: string | null = null

async function importWebLLM(): Promise<any> {
    // @ts-expect-error -- remote esm.sh module has no local type declarations
    return await import(/* @vite-ignore */ 'https://esm.sh/@mlc-ai/web-llm@0.2.82?bundle')
}

export function getWebLLMStatus(): WebLLMStatus {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        return { available: false, reason: 'WebGPU is unavailable in this browser' }
    }
    return { available: true, reason: _engine ? 'ready' : 'not initialized' }
}

async function ensureEngine(model: string, onStatus?: (status: string) => void): Promise<any> {
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
        initProgressCallback(report: any) {
            if (onStatus && report?.text) {
                onStatus(report.text)
            }
        },
    })
    _engineModel = model

    return _engine
}

export async function clearWebLLMCache(): Promise<void> {
    _engine = null
    _engineModel = null
}

export async function runWebLLMChat({ model, messages, onChunk, signal, onStatus, temperature, maxTokens }: {
    model: string
    messages: ChatMessage[]
    onChunk: (chunk: string) => void
    signal?: AbortSignal
    onStatus?: (status: string) => void
    temperature?: number
    maxTokens?: number
}): Promise<void> {
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
