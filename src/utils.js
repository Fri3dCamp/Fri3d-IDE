/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import toastr from 'toastr'

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export class Mutex {
    constructor() {
        this._lock = Promise.resolve()
    }

    acquire() {
        let release
        const lock = new Promise(resolve => release = resolve)
        const acquire = this._lock.then(() => release)
        this._lock = this._lock.then(() => lock)
        return acquire
    }
}

export async function fetchJSON(url) {
    const response = await fetch(url, {cache: 'no-store'})
    if (!response.ok) { throw new Error(response.status) }
    return await response.json()
}

export async function fetchArrayBuffer(url) {
    const response = await fetch(url, {cache: 'no-store'})
    if (!response.ok) { throw new Error(response.status) }
    return await response.arrayBuffer()
}

export function splitPath(path) {
    const parts = path.split('/').filter(part => part !== '')
    const filename = parts.pop()
    const directoryPath = parts.join('/')
    return [ directoryPath, filename ]
}

/*
 * UI Helpers
 */

const addCss = (css) => { document.head.appendChild(document.createElement("style")).innerHTML = css }
const getCssPropertyValue = (name) => getComputedStyle(document.documentElement).getPropertyValue(name)

const QSA = (x) => [...document.querySelectorAll(x)]
const QS  = document.querySelector.bind(document)
const QID = document.getElementById.bind(document)

const iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent)

export { addCss, getCssPropertyValue, QSA, QS, QID, iOS }

export function sanitizeHTML(s) {
    //return '<pre>' + (new Option(s)).innerHTML + '</pre>'
    return (new Option(s)).innerHTML.replace(/(?:\r\n|\r|\n)/g, '<br>').replace(/ /g, '&nbsp;')
}

// Escape a string for safe insertion into HTML text or a double-quoted
// attribute. Unlike sanitizeHTML it does not mangle spaces/newlines, so it is
// suitable for file names, package names and values stored in data-* attributes.
export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[c]))
}

export function sizeFmt(size, places=1) {
    if (size == null) { return "unknown" }
    const suffixes = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let i = 0
    while (size > 1024 && i < suffixes.length - 1) {
        i++
        size /= 1024
    }
    // Check if the size is in bytes and omit decimals in that case
    if (i === 0) {
        return `${size}${suffixes[i]}`
    } else {
        return `${(size).toFixed(places)}${suffixes[i]}`
    }
}

let activityTimeout = -1;

// Function to indicate activity
export function indicateActivity() {
    // Clear any existing timeout to reset the inactivity timer
    if (activityTimeout !== -1) {
        clearTimeout(activityTimeout);
    }

    // Set the connected color to active if not already set
    if (activityTimeout === -1) {
        document.documentElement.style.setProperty('--connected-color', 'var(--connected-active)');
    }

    // Change the color to passive after some inactivity
    activityTimeout = setTimeout(() => {
        // Set the connected color to passive
        document.documentElement.style.setProperty('--connected-color', 'var(--connected-passive)');
        activityTimeout = -1;
    }, 100);
}

export function setupTabs(containerNode) {
    const tabs = containerNode.querySelectorAll('.tab')
    const tabContents = containerNode.querySelectorAll('.tab-content')

    tabs.forEach(tab => {
        tab.setAttribute('href', '#')
        tab.addEventListener('click', (ev) => {
            ev.preventDefault()
            const targetId = tab.getAttribute('data-target')

            tabs.forEach(t => t.classList.remove('active'))
            tab.classList.add('active')

            tabContents.forEach(content => {
                if (content.id === targetId) {
                    content.classList.add('active')
                } else {
                    content.classList.remove('active')
                }
            })
            return false
        })
    })
}

if (navigator.appVersion.indexOf("Win") >= 0) {
    document.body.classList.add('windows')
} else if (navigator.appVersion.indexOf("Mac") >= 0) {
    document.body.classList.add('macos')
} else {
    document.body.classList.add('linux')
}

/*
 * Error handling
 */

export function report(title, err) {
    console.error(err, err.stack)
    toastr.error(sanitizeHTML(err.message), title)
}

window.addEventListener('error', (e) => {
    if (e instanceof ErrorEvent && e.message.includes('ResizeObserver')) {
        // skip
    } else {
        report("Error", e)
    }
});

window.addEventListener('unhandledrejection', (ev) => {
    report("Error", new Error(ev.reason))
    ev.preventDefault()
});

/*
 * Loading indicators
 *
 * A stacked, non-blocking indicator shown while data is being
 * loaded, processed or saved. Each concurrent operation gets its
 * own row with a spinner, so several loaders can be visible at once.
 */

let _loaderContainer = null
let _loaderSeq = 0

// Keep a CSS variable in sync with the loader stack height so that the
// toastr notification container can be pushed down and the two share the
// same top-right corner without overlapping.
function _syncLoaderOffset() {
    requestAnimationFrame(() => {
        const h = (_loaderContainer && _loaderContainer.isConnected)
            ? _loaderContainer.getBoundingClientRect().height
            : 0
        const offset = h ? `${Math.ceil(h) + 12}px` : '12px'
        document.documentElement.style.setProperty('--loader-stack-offset', offset)
    })
}

function _ensureLoaderContainer() {
    if (!_loaderContainer || !_loaderContainer.isConnected) {
        _loaderContainer = document.createElement('div')
        _loaderContainer.id = 'loader-stack'
        _loaderContainer.setAttribute('aria-live', 'polite')
        document.body.appendChild(_loaderContainer)
    }
    return _loaderContainer
}

function _hideLoaderItem(item) {
    if (!item || item.dataset.hiding) return
    item.dataset.hiding = '1'
    item.classList.remove('visible')
    _syncLoaderOffset()
    const remove = () => {
        item.remove()
        if (_loaderContainer && !_loaderContainer.children.length) {
            _loaderContainer.remove()
            _loaderContainer = null
        }
        _syncLoaderOffset()
    }
    item.addEventListener('transitionend', remove, { once: true })
    // Fallback in case the transition does not fire (e.g. reduced motion)
    setTimeout(remove, 400)
}

// Show a loading indicator with a message.
// Returns a handle with update(message) and hide() methods.
export function showLoader(message) {
    const container = _ensureLoaderContainer()
    const id = 'loader-' + (++_loaderSeq)

    const item = document.createElement('div')
    item.className = 'loader-item'
    item.id = id

    const spinner = document.createElement('span')
    spinner.className = 'loader-spinner'

    const label = document.createElement('span')
    label.className = 'loader-label'
    label.textContent = message

    item.appendChild(spinner)
    item.appendChild(label)
    container.appendChild(item)
    _syncLoaderOffset()

    // Trigger the entrance animation on the next frame
    requestAnimationFrame(() => item.classList.add('visible'))

    return {
        id,
        update(newMessage) { label.textContent = newMessage },
        hide() { _hideLoaderItem(item) },
    }
}

// Wrap an async operation with a loading indicator that is shown
// while it runs and removed when it settles (resolve or reject).
// The task receives the loader handle so it can update the message.
export async function withLoader(message, task) {
    const loader = showLoader(message)
    try {
        return await task(loader)
    } finally {
        loader.hide()
    }
}

