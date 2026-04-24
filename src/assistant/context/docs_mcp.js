/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

const MCP_ENDPOINT = 'https://fri3d-badge-mcp.vercel.app/mcp'

const DOCS_HEAVY_PATTERN = /\b(docs?|api|module|micropythonos|fri3d|badge|pin|irq|machine\.|network\.|u?asyncio|i2c|spi|uart|board|firmware|boot|why|fails?|error|traceback)\b/i

function isDocsHeavy(prompt) {
    return DOCS_HEAVY_PATTERN.test(prompt || '')
}

function parseSseResult(text) {
    const rows = text.split('\n')
    const jsonObjects = []

    for (const row of rows) {
        if (!row.startsWith('data:')) continue
        const payload = row.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
            jsonObjects.push(JSON.parse(payload))
        } catch (_err) {
            // ignore malformed chunk
        }
    }

    for (const obj of jsonObjects) {
        if (obj && obj.result) {
            return obj.result
        }
    }

    throw new Error('Unable to parse MCP SSE response')
}

async function mcpRequest(method, params, signal) {
    const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params,
        }),
        signal,
    })

    const bodyText = await response.text()
    if (!response.ok) {
        throw new Error(`MCP request failed (${response.status})`)
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('text/event-stream')) {
        return parseSseResult(bodyText)
    }

    const json = JSON.parse(bodyText)
    if (json.error) {
        throw new Error(json.error.message || 'MCP JSON-RPC error')
    }
    return json.result
}

async function callTool(name, args, signal) {
    const result = await mcpRequest('tools/call', { name, arguments: args }, signal)
    const text = result?.content?.map(x => x.text || '').join('\n').trim() || ''
    return text
}

function detectSearchTool(prompt) {
    const p = (prompt || '').toLowerCase()
    if (p.includes('micropythonos')) return 'search_micropythonos_docs'
    if (p.includes('fri3d') || p.includes('badge')) return 'search_fri3d_badge_docs'
    return 'search_micropython_docs'
}

function detectGetTool(searchTool) {
    if (searchTool === 'search_micropythonos_docs') return 'get_micropythonos_page'
    if (searchTool === 'search_fri3d_badge_docs') return 'get_fri3d_badge_page'
    return 'get_micropython_page'
}

function extractUrls(text) {
    const matches = text.match(/https?:\/\/\S+/g) || []
    const urls = []
    for (const m of matches) {
        const cleaned = m.replace(/[),.;]+$/, '')
        if (!urls.includes(cleaned)) {
            urls.push(cleaned)
        }
    }
    return urls
}

function trimSnippet(text, maxChars = 1800) {
    if (!text) return ''
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars) + '\n...[truncated]'
}

export async function fetchGroundingContext(prompt, { enabled = true, signal } = {}) {
    if (!enabled) {
        return { grounded: false, snippets: [], sources: [], warning: '' }
    }

    if (!isDocsHeavy(prompt)) {
        return { grounded: false, snippets: [], sources: [], warning: '' }
    }

    try {
        const searchTool = detectSearchTool(prompt)
        const getTool = detectGetTool(searchTool)
        const searchText = await callTool(searchTool, { query: prompt, limit: 3 }, signal)
        const urls = extractUrls(searchText).slice(0, 3)

        if (!urls.length) {
            return {
                grounded: false,
                snippets: [],
                sources: [],
                warning: 'MCP search returned no sources',
            }
        }

        const snippets = []
        for (const url of urls) {
            const pageText = await callTool(getTool, { path: url, maxChars: 6000 }, signal)
            snippets.push(trimSnippet(pageText))
        }

        return {
            grounded: true,
            snippets,
            sources: urls,
            warning: '',
        }
    } catch (err) {
        return {
            grounded: false,
            snippets: [],
            sources: [],
            warning: `MCP grounding unavailable: ${err.message}`,
        }
    }
}
