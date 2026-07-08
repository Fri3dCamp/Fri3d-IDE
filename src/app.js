/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import '@xterm/xterm/css/xterm.css'
import 'toastr/build/toastr.css'
import 'github-fork-ribbon-css/gh-fork-ribbon.css'
import './app_common.css'
import './app.css'

import toastr from 'toastr'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import { Terminal } from '@xterm/xterm'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { FitAddon } from '@xterm/addon-fit'

import { addUpdateHandler, createNewEditor, getEditorFromElement, unregisterEditor, setEditorTheme } from './editor.js'
import { displayOpenFile, createTab } from './editor_tabs.js'
import { serial as webSerialPolyfill } from 'web-serial-polyfill'
import { WebSerial, WebBluetooth, WebSocketREPL, WebRTCTransport } from './transports.js'
import { MpRawMode } from './rawmode.js'
import { getPkgIndexes, rawInstallPkg } from './package_mgr.js'
import { ConnectionUID } from './connection_uid.js'
import translations from '../build/translations.json'
import { parseStackTrace, validatePython, disassembleMPY, minifyPython, prettifyPython } from './python_utils.js'
import { MicroPythonOSWASM } from './emulator.js'

import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { initAssistantPanel, toggleAssistantSidebar } from './assistant/ui/panel.js'
import { initOnboarding } from './onboarding.js'

import { splitPath, sleep, fetchJSON, getCssPropertyValue,
         QSA, QS, QID, iOS, sanitizeHTML, escapeHtml,
         sizeFmt, indicateActivity, setupTabs, report,
         withLoader, showLoader } from './utils.js'

import { library, dom } from '@fortawesome/fontawesome-svg-core'
import { faUsb, faBluetoothB } from '@fortawesome/free-brands-svg-icons'
import { faLink, faBars, faDownload, faCirclePlay, faCircleStop, faFolder, faFolderOpen, faFile, faFileCircleExclamation, faFileCirclePlus, faCubes, faGear,
         faCube, faTools, faSliders, faCircleInfo, faStar, faExpand, faCertificate,
         faPlug, faArrowUpRightFromSquare, faTerminal, faBug, faGaugeHigh,
         faTrashCan, faArrowsRotate, faPowerOff, faPlus, faXmark, faChevronRight,
         faPen, faEye
       } from '@fortawesome/free-solid-svg-icons'
import { faMessage, faCircleDown } from '@fortawesome/free-regular-svg-icons'

library.add(faUsb, faBluetoothB)
library.add(faLink, faBars, faDownload, faCirclePlay, faCircleStop, faFolder, faFolderOpen, faFile, faFileCircleExclamation, faFileCirclePlus, faCubes, faGear,
         faCube, faTools, faSliders, faCircleInfo, faStar, faExpand, faCertificate,
         faPlug, faArrowUpRightFromSquare, faTerminal, faBug, faGaugeHigh,
         faTrashCan, faArrowsRotate, faPowerOff, faPlus, faXmark, faChevronRight,
         faPen, faEye)
library.add(faMessage, faCircleDown)
dom.watch()

function getBuildDate() {
    return (new Date(VIPER_IDE_BUILD)).toISOString().substring(0, 19).replace('T',' ')
}

export const T = i18next.t.bind(i18next)
const ADVANCED_MODE_STORAGE_KEY = 'viper.settings.advanced-mode'
const UI_SETTINGS_STORAGE_KEY = 'viper.settings.ui.v1'

function loadUiSettings() {
    try {
        const raw = localStorage.getItem(UI_SETTINGS_STORAGE_KEY)
        if (!raw) {
            return {}
        }
        return JSON.parse(raw)
    } catch (_err) {
        return {}
    }
}

function saveUiSettings(settings) {
    localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

function restoreAndBindUiSettings() {
    const stored = loadUiSettings()
    const controls = QSA('#menu-settings-list input[id], #menu-settings-list select[id]')

    // Backward compatibility for older advanced-mode-only persistence.
    if (!Object.prototype.hasOwnProperty.call(stored, 'advanced-mode')) {
        const legacy = localStorage.getItem(ADVANCED_MODE_STORAGE_KEY)
        if (legacy != null) {
            stored['advanced-mode'] = (legacy === '1')
        }
    }

    for (const control of controls) {
        const id = control.id
        if (!id || id.startsWith('assistant-') || id === 'lang') {
            continue
        }

        if (Object.prototype.hasOwnProperty.call(stored, id)) {
            if (control.type === 'checkbox') {
                control.checked = Boolean(stored[id])
            } else {
                control.value = String(stored[id])
            }
        }

        control.addEventListener('change', () => {
            const current = loadUiSettings()
            current[id] = (control.type === 'checkbox') ? control.checked : control.value
            saveUiSettings(current)

            // Keep legacy key updated so existing users retain expected behavior.
            if (id === 'advanced-mode') {
                localStorage.setItem(ADVANCED_MODE_STORAGE_KEY, control.checked ? '1' : '0')
            }
        })
    }

    if (!Object.prototype.hasOwnProperty.call(stored, 'zoom')) {
        const zoomControl = QID('zoom')
        if (zoomControl) {
            zoomControl.value = '1.00'
        }
    }
}

/*
 * Device Management
 */

let editor, term, port
let editorFn = ''
let isInRunMode = false
let devInfo = null
let lastTracebackText = ''
const terminalLogLines = []
const openFolders = new Set()
const _mdRawContent = new WeakMap()

function appendTerminalLog(data) {
    const clean = String(data || '')
        .replace(/\r/g, '')

    for (const line of clean.split('\n')) {
        if (line === '' && terminalLogLines.length === 0) {
            continue
        }
        terminalLogLines.push(line)
    }

    while (terminalLogLines.length > 500) {
        terminalLogLines.shift()
    }
}

function writeTerminal(data) {
    term.write(data)
    appendTerminalLog(data)
}

async function disconnectDevice() {
    if (port) {
        try {
            await port.disconnect()
        } catch (err) {
            console.log(err)
        }
        port = null
    }

    for (const t of ['ws', 'ble', 'usb']) {
        QID(`btn-conn-${t}`).classList.remove('connected')
    }
}

let defaultWsURL = 'ws://192.168.1.123:8266'
let defaultWsPass = ''

async function prepareNewPort(type) {
    let new_port;
    if (type === 'ws') {
        let url
        if (typeof window.webrepl_url === 'undefined' || window.webrepl_url == '') {
            url = await showPromptDialog(T('app.prompt-webrepl-url', 'Enter WebREPL device address.\nSupported protocols: ws wss rtc'), { value: defaultWsURL })
            if (!url) { return }
            defaultWsURL = url

            if (url.startsWith('http://')) { url = url.slice(7) }
            if (url.startsWith('https://')) { url = url.slice(8) }
            if (!url.includes('://')) { url = 'ws://' + url }

            if (window.location.protocol === 'https:' && url.startsWith('ws://')) {
                /* Navigate to device, which should automatically reload and ask for WebREPL password */
                window.location.assign(url.replace('ws://', 'http://'))
                return
            }
        } else {
            url = window.webrepl_url
            defaultWsURL = url
            window.webrepl_url = ''
        }

        if (url.startsWith('ws://') || url.startsWith('wss://')) {
            try {
                // Special handling of URLs like
                // wss://blynk.cloud/stream/qe7FBr7Sj.../Terminal
                const info = URL.parse(url)
                if (info.host.includes('blynk') && info.pathname.startsWith('/stream/')) {
                    const [_, _path, token, ds] = info.pathname.split('/')
                    const blynkAuthPattern = /^[A-Za-z0-9\-_]{32}$/;
                    if (blynkAuthPattern.test(token)) {
                        url = `wss://${info.host}:443/msgforwarder?deviceToken=${token}&dataStreamName=${ds}`
                    }
                }
            } catch (_err) {
                // all ok
            }

            new_port = new WebSocketREPL(url)
            new_port.onPasswordRequest(async () => {
                const pass = await showPromptDialog(T('app.prompt-webrepl-pass', 'WebREPL password:'), { value: defaultWsPass, password: true })
                if (pass == null) { return }
                if (pass.length < 4) {
                    toastr.error(T('app.err-pwd-short', 'Password is too short'))
                    return
                }
                defaultWsPass = pass
                return pass
            })
        } else if (url.startsWith('rtc://')) {
            const id = ConnectionUID.parse(url.replace('rtc://', ''))
            new_port = new WebRTCTransport(id.value())
        } else if (url.startsWith('vm://')) {
            new_port = new MicroPythonOSWASM()
        } else {
            toastr.error(T('app.err-link-type', 'Unknown link type'))
        }
    } else if (type === 'ble') {
        if (iOS) {
            toastr.error(T('app.err-ble-ios', 'WebBluetooth is not available on iOS'))
            return
        }
        if (!window.isSecureContext) {
            toastr.error(T('app.err-ble-insecure', 'WebBluetooth cannot be accessed with unsecure connection'))
            return
        }
        if (typeof navigator.bluetooth === 'undefined') {
            toastr.error(T('app.err-try-browsers', 'Try Chrome, Edge, Opera, Brave'), T('app.err-ble-unsupported', 'WebBluetooth is not supported'))
            return
        }
        new_port = new WebBluetooth()
    } else if (type === 'usb') {
        if (iOS) {
            toastr.error(T('app.err-serial-ios', 'WebSerial is not available on iOS'))
            return
        }
        if (!window.isSecureContext) {
            toastr.error(T('app.err-serial-insecure', 'WebSerial cannot be accessed with unsecure connection'))
            return
        }
        if (typeof navigator.serial === 'undefined' && typeof navigator.usb === 'undefined') {
            toastr.error(T('app.err-try-browsers', 'Try Chrome, Edge, Opera, Brave'), T('app.err-serial-unsupported', 'WebSerial and WebUSB are not supported'))
            return
        }
        if (typeof navigator.serial === 'undefined' || QID('force-serial-poly').checked) {
            console.log('Using WebSerial polyfill')
            new_port = new WebSerial(webSerialPolyfill)
        } else {
            new_port = new WebSerial()
        }
    } else {
        toastr.error(T('app.err-conn-type', 'Unknown connection type'))
        return
    }

    try {
        await new_port.requestAccess()
    } catch (_err) {
        return
    }
    return new_port
}

export async function connectDevice(type) {
    if (port) {
        if (!await showConfirmDialog(T('app.confirm-disconnect', 'Disconnect current device?'))) { return }
        await disconnectDevice()
        return
    }

    const new_port = await prepareNewPort(type)
    if (!new_port) { return }
    // Connect new port
    const connectLoader = showLoader('Connecting…')
    try {
        await new_port.connect()
    } catch (err) {
        report('Cannot connect', err)
        return
    } finally {
        connectLoader.hide()
    }

    port = new_port

    port.onActivity(indicateActivity)

    port.onReceive((data) => {
        writeTerminal(data)
    })

    port.onDisconnect(() => {
        QID(`btn-conn-${type}`).classList.remove('connected')
        toastr.warning(T('app.device-disconnected', 'Device disconnected'))
        port = null
        //connectDevice(type)
    })

    QID(`btn-conn-${type}`).classList.add('connected')

    if (port.isGraphical) {
        QS('a[data-target="mpos-screen"]')?.click()
    }
    if (QID('interrupt-device').checked) {
        // TODO: detect WDT and disable it temporarily

        const loader = showLoader('Reading device\u2026')
        let fileLoader = null
        const raw = await MpRawMode.begin(port)
        try {
            devInfo = await raw.getDeviceInfo()
            Object.assign(devInfo, { connection: type })

            toastr.success(sanitizeHTML(devInfo.machine + '\n' + devInfo.version), T('app.device-connected', 'Device connected'))
            console.log('Device info', devInfo)

            if (window.pkg_install_url) {
                loader.update('Installing package\u2026')
                await _raw_installPkg(raw, window.pkg_install_url)
                window.pkg_install_url = null
            }

            fileLoader = showFileTreeLoader()
            let fs_stats = [null, null, null];
            try {
                fs_stats = await raw.getFsStats()
            } catch (err) {
                console.log(err)
            }

            const fs_tree = await raw.walkFs()

            _updateFileTree(fs_tree, fs_stats);

            if        (fs_tree.filter(x => x.path === '/main.py').length) {
                await _raw_loadFile(raw, '/main.py')
            } else if (fs_tree.filter(x => x.path === '/code.py').length) {
                await _raw_loadFile(raw, '/code.py')
            }
            document.dispatchEvent(new CustomEvent("deviceConnected", {detail: {port: port}}))

        } catch (err) {
            if (err.message.includes('Timeout')) {
                report('Device is not responding', new Error(`Ensure that:\n- You're using a recent version of MicroPython\n- The correct device is selected`))
            } else {
                report('Error reading board info', err)
            }
        } finally {
            await raw.end()
            loader.hide()
            if (fileLoader) fileLoader.hide()
        }
        // Print banner. TODO: optimize
        await port.write('\x02')
    } else {
        toastr.success(T('app.device-connected', 'Device connected'))
    }
}

/*
 * File Management
 */

export async function refreshFileTree() {
    if (!port) return;
    const loader = showFileTreeLoader()
    try {
        const raw = await MpRawMode.begin(port)
        try {
            await _raw_updateFileTree(raw)
        } finally {
            await raw.end()
        }
    } finally {
        loader.hide()
    }
}

export async function createNewFile(path) {
    if (!port) return;

    const result = await showCreateItemDialog(path)
    if (!result) return

    let { name, isFolder } = result
    name = name.trim().replace(/^\/+/, '')
    if (isFolder) name = name.replace(/\/+$/, '')
    if (!name) return

    // Keep the parent folder expanded so the freshly-created item is visible.
    if (path !== '/') openFolders.add(path.slice(0, -1))

    await withLoader(T('files.creating', 'Creating {{name}}…', { name, interpolation: { escapeValue: false } }), async () => {
        const raw = await MpRawMode.begin(port)
        try {
            if (isFolder) {
                await raw.makePath(path + name)
            } else {
                const full = path + name
                if (name.includes('/')) {
                    // Ensure parent directories exist for nested file names.
                    const [dirname] = splitPath(full)
                    await raw.makePath(dirname)
                }
                await raw.touchFile(full)
                await _raw_loadFile(raw, full)
            }
            await _raw_updateFileTree(raw)
        } finally {
            await raw.end()
        }
    })
}

// Make a modal dialog accessible: tag it with ARIA roles, trap Tab focus
// inside it, and restore focus to the previously-focused element on close.
// Returns a restoreFocus() function to call when the dialog is dismissed.
function setupModalA11y(dialog, label) {
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    if (label) dialog.setAttribute('aria-label', label)
    const prevFocus = document.activeElement
    dialog.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return
        const items = [...dialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
            .filter(el => !el.disabled && el.offsetParent !== null)
        if (!items.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
        }
    })
    return function restoreFocus() {
        if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus()
    }
}

// Toggle a small badge whenever the browser goes offline, so users understand
// why network features (package install, docs fetch, updates) are unavailable.
function initOfflineIndicator() {
    const el = QID('offline-indicator')
    if (!el) return
    const label = QID('offline-indicator-text')
    if (label) label.textContent = T('app.offline', 'Offline')
    const sync = () => { el.hidden = navigator.onLine }
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    sync()
}

export function showConfirmDialog(message) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div')
        backdrop.className = 'fri3d-dialog-backdrop'

        const dialog = document.createElement('div')
        dialog.className = 'fri3d-dialog'

        const msgEl = document.createElement('div')
        msgEl.className = 'fri3d-dialog-message'
        msgEl.textContent = message

        const actions = document.createElement('div')
        actions.className = 'fri3d-dialog-actions'

        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'fri3d-btn-secondary'
        cancelBtn.textContent = T('app.dialog.btn-cancel', 'Cancel')

        const confirmBtn = document.createElement('button')
        confirmBtn.className = 'fri3d-btn-cta'
        confirmBtn.textContent = T('app.dialog.btn-confirm', 'Confirm')

        actions.appendChild(cancelBtn)
        actions.appendChild(confirmBtn)
        dialog.appendChild(msgEl)
        dialog.appendChild(actions)
        backdrop.appendChild(dialog)
        document.body.appendChild(backdrop)

        const restoreFocus = setupModalA11y(dialog, message)

        function close(value) {
            backdrop.remove()
            restoreFocus()
            resolve(value)
        }

        confirmBtn.addEventListener('click', () => close(true))
        cancelBtn.addEventListener('click', () => close(false))
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false) })
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); close(true) }
            else if (e.key === 'Escape') close(false)
        })
        confirmBtn.focus()
    })
}

// Styled, translatable replacement for the native prompt(). Resolves to the
// entered string, or null if the dialog is cancelled.
function showPromptDialog(message, { value = '', placeholder = '', password = false } = {}) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div')
        backdrop.className = 'fri3d-dialog-backdrop'

        const dialog = document.createElement('div')
        dialog.className = 'fri3d-dialog'

        const msgEl = document.createElement('div')
        msgEl.className = 'fri3d-dialog-message'
        msgEl.style.whiteSpace = 'pre-line'
        msgEl.textContent = message

        const input = document.createElement('input')
        input.type = password ? 'password' : 'text'
        input.className = 'fri3d-dialog-input'
        input.value = value
        input.placeholder = placeholder
        input.autocomplete = 'off'
        input.spellcheck = false

        const actions = document.createElement('div')
        actions.className = 'fri3d-dialog-actions'

        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'fri3d-btn-secondary'
        cancelBtn.type = 'button'
        cancelBtn.textContent = T('app.dialog.btn-cancel', 'Cancel')

        const okBtn = document.createElement('button')
        okBtn.className = 'fri3d-btn-cta'
        okBtn.type = 'button'
        okBtn.textContent = T('app.dialog.btn-ok', 'OK')

        actions.appendChild(cancelBtn)
        actions.appendChild(okBtn)
        dialog.appendChild(msgEl)
        dialog.appendChild(input)
        dialog.appendChild(actions)
        backdrop.appendChild(dialog)
        document.body.appendChild(backdrop)

        const restoreFocus = setupModalA11y(dialog, message)

        function close(result) {
            backdrop.remove()
            restoreFocus()
            resolve(result)
        }

        okBtn.addEventListener('click', () => close(input.value))
        cancelBtn.addEventListener('click', () => close(null))
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null) })
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); close(input.value) }
            else if (e.key === 'Escape') close(null)
        })
        input.focus()
        input.select()
    })
}

// Unified, styled dialog for creating a file or folder. Resolves to
// { name, isFolder } or null if cancelled. A File/Folder toggle makes folder
// creation discoverable instead of relying on a trailing-slash convention.
function showCreateItemDialog(parentPath) {
    return new Promise((resolve) => {
        const where = parentPath === '/' ? '/' : parentPath
        const titleText = T('files.create-title', 'New in {{path}}', { path: where, interpolation: { escapeValue: false } })

        const backdrop = document.createElement('div')
        backdrop.className = 'fri3d-dialog-backdrop'

        const dialog = document.createElement('div')
        dialog.className = 'fri3d-dialog'

        const title = document.createElement('div')
        title.className = 'fri3d-dialog-title'
        title.innerHTML = `<i class="fa-solid fa-plus fa-fw"></i> ${escapeHtml(titleText)}`

        const toggle = document.createElement('div')
        toggle.className = 'fri3d-dialog-toggle'

        const fileBtn = document.createElement('button')
        fileBtn.type = 'button'
        fileBtn.className = 'active'
        fileBtn.innerHTML = `<i class="fa-solid fa-file fa-fw"></i> ${T('files.type-file', 'File')}`

        const folderBtn = document.createElement('button')
        folderBtn.type = 'button'
        folderBtn.innerHTML = `<i class="fa-solid fa-folder fa-fw"></i> ${T('files.type-folder', 'Folder')}`

        toggle.appendChild(fileBtn)
        toggle.appendChild(folderBtn)

        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'fri3d-dialog-input'
        input.placeholder = T('files.name-file', 'file name')
        input.autocomplete = 'off'
        input.spellcheck = false

        const actions = document.createElement('div')
        actions.className = 'fri3d-dialog-actions'

        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'fri3d-btn-secondary'
        cancelBtn.type = 'button'
        cancelBtn.textContent = T('app.dialog.btn-cancel', 'Cancel')

        const createBtn = document.createElement('button')
        createBtn.className = 'fri3d-btn-cta'
        createBtn.type = 'button'
        createBtn.textContent = T('app.dialog.btn-create', 'Create')

        actions.appendChild(cancelBtn)
        actions.appendChild(createBtn)

        dialog.appendChild(title)
        dialog.appendChild(toggle)
        dialog.appendChild(input)
        dialog.appendChild(actions)
        backdrop.appendChild(dialog)
        document.body.appendChild(backdrop)

        let isFolder = false
        function setType(folder) {
            isFolder = folder
            fileBtn.classList.toggle('active', !folder)
            folderBtn.classList.toggle('active', folder)
            input.placeholder = folder ? T('files.name-folder', 'folder name') : T('files.name-file', 'file name')
            input.focus()
        }
        fileBtn.addEventListener('click', () => setType(false))
        folderBtn.addEventListener('click', () => setType(true))

        const restoreFocus = setupModalA11y(dialog, titleText)

        function close(result) {
            backdrop.remove()
            restoreFocus()
            resolve(result)
        }
        function submit() {
            const name = input.value.trim()
            if (!name) { input.focus(); return }
            close({ name, isFolder })
        }

        createBtn.addEventListener('click', submit)
        cancelBtn.addEventListener('click', () => close(null))
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null) })
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit() }
            else if (e.key === 'Escape') close(null)
        })
        input.focus()
    })
}

function showAppWizardDialog() {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div')
        backdrop.className = 'fri3d-dialog-backdrop'

        const dialog = document.createElement('div')
        dialog.className = 'fri3d-dialog'
        dialog.innerHTML = `
            <div class="fri3d-dialog-title"><i class="fa-solid fa-cubes fa-fw"></i> ${T('app.dialog.title', 'Create New App')}</div>
            <div class="fri3d-dialog-form">
                <label for="fri3d-app-fullname">${T('app.dialog.field-id', 'App ID')}</label>
                <input type="text" id="fri3d-app-fullname" placeholder="com.example.myapp" autocomplete="off" spellcheck="false"/>
                <label for="fri3d-app-name">${T('app.dialog.field-name', 'Display name')}</label>
                <input type="text" id="fri3d-app-name" value="My App" autocomplete="off"/>
                <label for="fri3d-app-publisher">${T('app.dialog.field-publisher', 'Publisher')}</label>
                <input type="text" id="fri3d-app-publisher" placeholder="${T('app.dialog.field-desc-placeholder', 'optional')}" autocomplete="off"/>
                <label for="fri3d-app-version">${T('app.dialog.field-version', 'Version')}</label>
                <input type="text" id="fri3d-app-version" value="0.1.0" autocomplete="off"/>
                <label for="fri3d-app-desc">${T('app.dialog.field-short-desc', 'Short description')}</label>
                <input type="text" id="fri3d-app-desc" placeholder="${T('app.dialog.field-desc-placeholder', 'optional')}" autocomplete="off"/>
                <label for="fri3d-app-long-desc">${T('app.dialog.field-long-desc', 'Long description')}</label>
                <input type="text" id="fri3d-app-long-desc" placeholder="${T('app.dialog.field-desc-placeholder', 'optional')}" autocomplete="off"/>
                <label for="fri3d-app-category">${T('app.dialog.field-category', 'Category')}</label>
                <select id="fri3d-app-category">
                    <option value="development">${T('app.dialog.category-development', 'Development')}</option>
                    <option value="games">${T('app.dialog.category-games', 'Games')}</option>
                    <option value="media">${T('app.dialog.category-media', 'Media')}</option>
                    <option value="productivity">${T('app.dialog.category-productivity', 'Productivity')}</option>
                    <option value="utilities">${T('app.dialog.category-utilities', 'Utilities')}</option>
                    <option value="system">${T('app.dialog.category-system', 'System')}</option>
                    <option value="other">${T('app.dialog.category-other', 'Other')}</option>
                </select>
                <label for="fri3d-app-template">${T('app.dialog.field-template', 'Template')}</label>
                <select id="fri3d-app-template">
                    <option value="hello">${T('app.dialog.template-hello', 'Hello World')}</option>
                    <option value="settings">${T('app.dialog.template-settings', 'Settings demo')}</option>
                    <option value="blank">${T('app.dialog.template-blank', 'Blank')}</option>
                </select>
                <label>${T('app.dialog.field-icon', 'Icon')}</label>
                <div class="fri3d-icon-editor">
                    <canvas id="fri3d-app-icon" width="64" height="64"></canvas>
                    <div class="fri3d-icon-tools">
                        <button type="button" id="fri3d-icon-auto" title="${T('app.dialog.icon-auto-title', 'Auto-generate from app name')}"><i class="fa-solid fa-wand-magic-sparkles fa-fw"></i> ${T('app.dialog.icon-auto', 'Auto')}</button>
                        <input type="color" id="fri3d-icon-color" value="#ffffff" title="${T('app.dialog.icon-brush-color', 'Brush color')}"/>
                        <select id="fri3d-icon-size" title="${T('app.dialog.icon-brush-size', 'Brush size')}">
                            <option value="2">2 px</option>
                            <option value="4" selected>4 px</option>
                            <option value="8">8 px</option>
                        </select>
                        <button type="button" id="fri3d-icon-eraser" title="${T('app.dialog.icon-eraser', 'Eraser')}"><i class="fa-solid fa-eraser fa-fw"></i></button>
                        <span class="fri3d-icon-hint">${T('app.dialog.icon-hint', 'Draw directly on the icon, or let it auto-generate (icon_64x64.png)')}</span>
                    </div>
                </div>
                <span class="fri3d-dialog-error" id="fri3d-app-error"></span>
            </div>
            <div class="fri3d-dialog-actions">
                <button class="fri3d-btn-secondary" id="fri3d-wizard-cancel" type="button">${T('app.dialog.btn-cancel', 'Cancel')}</button>
                <button class="fri3d-btn-cta" id="fri3d-wizard-create" type="button">${T('app.dialog.btn-create', 'Create')}</button>
            </div>
        `
        backdrop.appendChild(dialog)
        document.body.appendChild(backdrop)

        const fullnameInput = dialog.querySelector('#fri3d-app-fullname')
        const nameInput = dialog.querySelector('#fri3d-app-name')
        const errorEl = dialog.querySelector('#fri3d-app-error')

        const restoreFocus = setupModalA11y(dialog, T('app.dialog.title', 'Create New App'))

        const iconCanvas = dialog.querySelector('#fri3d-app-icon')
        const iconCtx = iconCanvas.getContext('2d')
        const eraserBtn = dialog.querySelector('#fri3d-icon-eraser')
        const colorInput = dialog.querySelector('#fri3d-icon-color')
        const sizeSelect = dialog.querySelector('#fri3d-icon-size')
        let iconDrawnByUser = false

        function regenerateIcon() {
            renderAutoIcon(iconCtx, nameInput.value.trim() || 'My App', fullnameInput.value.trim())
            iconDrawnByUser = false
        }
        regenerateIcon()
        // Keep the auto icon in sync with the name until the user draws on it.
        nameInput.addEventListener('input', () => { if (!iconDrawnByUser) regenerateIcon() })
        fullnameInput.addEventListener('input', () => { if (!iconDrawnByUser) regenerateIcon() })
        dialog.querySelector('#fri3d-icon-auto').addEventListener('click', () => {
            eraserBtn.classList.remove('active')
            regenerateIcon()
        })
        eraserBtn.addEventListener('click', () => eraserBtn.classList.toggle('active'))

        let strokeLast = null
        function iconPos(e) {
            const r = iconCanvas.getBoundingClientRect()
            return {
                x: (e.clientX - r.left) * iconCanvas.width / r.width,
                y: (e.clientY - r.top) * iconCanvas.height / r.height,
            }
        }
        function strokeTo(p) {
            iconCtx.globalCompositeOperation = eraserBtn.classList.contains('active') ? 'destination-out' : 'source-over'
            iconCtx.strokeStyle = colorInput.value
            iconCtx.lineWidth = Number(sizeSelect.value)
            iconCtx.lineCap = 'round'
            iconCtx.lineJoin = 'round'
            iconCtx.beginPath()
            iconCtx.moveTo(strokeLast.x, strokeLast.y)
            // Nudge zero-length strokes so a single click still paints a dot.
            iconCtx.lineTo(p.x + (p.x === strokeLast.x ? 0.01 : 0), p.y)
            iconCtx.stroke()
            iconCtx.globalCompositeOperation = 'source-over'
            strokeLast = p
        }
        iconCanvas.addEventListener('pointerdown', (e) => {
            e.preventDefault()
            iconCanvas.setPointerCapture(e.pointerId)
            iconDrawnByUser = true
            strokeLast = iconPos(e)
            strokeTo(iconPos(e))
        })
        iconCanvas.addEventListener('pointermove', (e) => {
            if (strokeLast) strokeTo(iconPos(e))
        })
        iconCanvas.addEventListener('pointerup', () => { strokeLast = null })
        iconCanvas.addEventListener('pointercancel', () => { strokeLast = null })

        fullnameInput.focus()

        function tryCreate() {
            const fullnameVal = fullnameInput.value.trim()
            try {
                validateAppFullname(fullnameVal)
            } catch (err) {
                errorEl.textContent = err.message
                errorEl.classList.add('visible')
                fullnameInput.focus()
                return
            }
            errorEl.classList.remove('visible')
            const iconDataUrl = iconCanvas.toDataURL('image/png')
            backdrop.remove()
            restoreFocus()
            resolve({
                fullname: fullnameVal,
                appName: nameInput.value,
                publisher: dialog.querySelector('#fri3d-app-publisher').value,
                version: dialog.querySelector('#fri3d-app-version').value,
                description: dialog.querySelector('#fri3d-app-desc').value,
                longDescription: dialog.querySelector('#fri3d-app-long-desc').value,
                category: dialog.querySelector('#fri3d-app-category').value,
                template: dialog.querySelector('#fri3d-app-template').value,
                iconDataUrl,
            })
        }

        function cancel() {
            backdrop.remove()
            restoreFocus()
            resolve(null)
        }

        dialog.querySelector('#fri3d-wizard-create').addEventListener('click', tryCreate)
        dialog.querySelector('#fri3d-wizard-cancel').addEventListener('click', cancel)
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cancel() })
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); tryCreate() }
            else if (e.key === 'Escape') cancel()
        })
    })
}

function renderAutoIcon(ctx, appName, fullname) {
    let hash = 0
    for (const ch of (fullname || appName)) {
        hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
    }
    const hue = hash % 360
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, 64, 64)
    const grad = ctx.createLinearGradient(0, 0, 64, 64)
    grad.addColorStop(0, `hsl(${hue}, 65%, 55%)`)
    grad.addColorStop(1, `hsl(${(hue + 45) % 360}, 65%, 38%)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(0, 0, 64, 64, 12)
    ctx.fill()
    const initials = (appName.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || 'A').toUpperCase()
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${initials.length > 1 ? 26 : 32}px 'Montserrat', system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, 32, 34)
}

function dataUrlToBytes(dataUrl) {
    const bin = atob(dataUrl.split(',')[1])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i)
    }
    return bytes
}

function validateAppFullname(fullname) {
    if (!fullname || !fullname.trim()) {
        throw new Error(T('app.dialog.validate-required', 'App fullname is required'))
    }
    const value = fullname.trim()
    if (!value.includes('.')) {
        throw new Error(T('app.dialog.validate-dot', 'App fullname should include at least one dot, e.g. com.example.myapp'))
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
        throw new Error(T('app.dialog.validate-chars', 'App fullname may only contain letters, numbers, dots, dashes and underscores'))
    }
    return value
}

function makeMainPyBoilerplate(appName, template) {
    if (template === 'settings') {
        return `from mpos import Activity, Intent, SettingActivity, SharedPreferences
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        self.prefs = SharedPreferences("${appName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}")
        screen = lv.obj()

        title = lv.label(screen)
        title.set_text("${appName}")
        title.align(lv.ALIGN.TOP_MID, 0, 12)

        btn = lv.button(screen)
        btn.align(lv.ALIGN.CENTER, 0, 0)
        lbl = lv.label(btn)
        lbl.set_text("Open settings")
        lbl.center()

        def open_settings(_e):
            intent = Intent(activity_class=SettingActivity)
            intent.putExtra("title", "${appName} settings")
            intent.putExtra("item", {
                "type": "switch",
                "title": "Enable feature",
                "key": "enabled",
                "default": True,
            })
            self.startActivity(intent)

        btn.add_event_cb(open_settings, lv.EVENT.CLICKED, None)
        self.setContentView(screen)
`
    }

    if (template === 'blank') {
        return `from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        self.setContentView(screen)
`
    }

    return `from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        label = lv.label(screen)
        label.set_text("Hello from ${appName}!")
        label.center()
        self.setContentView(screen)
`
}

function makeAssistantBootstrapPrompt({ fullname, appName, description, template, version }) {
    return [
        `Create starter MicroPythonOS app code for ${fullname}.`,
        'Output only Python code for main.py (at the app root) in one code block.',
        'Constraints:',
        '- Must define class Main(Activity) with onCreate().',
        '- Must call self.setContentView(screen).',
        '- Keep dependencies to mpos and lvgl only.',
        '- Keep it small and production-safe.',
        `App name: ${appName}`,
        `Version: ${version}`,
        `Template preference: ${template}`,
        `Description: ${description || 'No description provided'}`,
    ].join('\n')
}

export async function createNewApp() {
    if (!port) {
        toastr.info(T('app.connect-first', 'Connect your board first'))
        return
    }

    const input = await showAppWizardDialog()
    if (input == null) return

    const fullname = input.fullname
    const appName = input.appName.trim() || 'My App'
    const publisher = input.publisher.trim()
    const version = input.version.trim() || '0.1.0'
    const description = input.description.trim()
    const longDescription = input.longDescription.trim()
    const category = input.category
    const template = input.template

    // Flat layout per https://docs.micropythonos.com/apps/creating-apps/ —
    // MANIFEST.JSON, icon_64x64.png and code at the app root (each extra
    // directory costs ~8 KiB in LittleFS).
    const appRoot = `/apps/${fullname}`
    const manifestPath = `${appRoot}/MANIFEST.JSON`
    const mainPath = `${appRoot}/main.py`
    const iconPath = `${appRoot}/icon_64x64.png`

    const raw = await MpRawMode.begin(port)
    let loader = null
    try {
        const exists = (await raw.exec(`
import os
try:
 os.stat('${appRoot}')
 print('1')
except:
 print('0')
`)).trim().endsWith('1')
        if (exists) {
            const confirmed = await showConfirmDialog(T('app.dialog.confirm-overwrite', 'App folder {{path}} already exists. Overwrite scaffold files?', { path: appRoot }))
            if (!confirmed) return
        }

        loader = showLoader(T('app.dialog.loading-create', 'Creating app {{fullname}}\u2026', { fullname }))

        await raw.makePath(appRoot)

        const manifest = {
            name: appName,
            publisher: publisher || 'Unknown',
            short_description: description || appName,
            long_description: longDescription || description || appName,
            fullname,
            version,
            category,
            activities: [
                {
                    entrypoint: 'main.py',
                    classname: 'Main',
                    intent_filters: [
                        { action: 'main', category: 'launcher' },
                    ],
                },
            ],
        }

        await raw.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
        await raw.writeFile(mainPath, makeMainPyBoilerplate(appName, template))
        await raw.writeFile(iconPath, dataUrlToBytes(input.iconDataUrl))

        try {
            await raw.exec(`
from mpos import AppManager
AppManager.refresh_apps()
AppManager.restart_launcher()
`)
        } catch (err) {
            console.warn(err)
            toastr.warning(T('app.dialog.warning-launcher', 'Scaffold created, but launcher refresh failed'))
        }

        await _raw_updateFileTree(raw)
        await _raw_loadFile(raw, manifestPath)
        await _raw_loadFile(raw, mainPath)
    } catch (err) {
        report('Create app scaffold failed', err)
        return
    } finally {
        if (loader) loader.hide()
        await raw.end()
    }

    toastr.success(T('app.dialog.success-created', 'Created app scaffold for {{fullname}}', { fullname }))

    const assistantEnabled = QID('advanced-mode') && QID('advanced-mode').checked
    if (assistantEnabled) {
        const useAssistant = await showConfirmDialog(T('app.dialog.confirm-bootstrap', 'Prepare an Assistant prompt to bootstrap main.py with LLM?'))
        if (useAssistant) {
            const taskPreset = QID('assistant-task-preset')
            if (taskPreset) {
                taskPreset.value = 'app-bootstrap'
            }
            const promptBox = QID('assistant-prompt')
            if (promptBox) {
                promptBox.value = makeAssistantBootstrapPrompt({
                    fullname,
                    appName,
                    description,
                    template,
                    version,
                })
            }
            toggleAssistantSidebar()
            toastr.info(T('app.dialog.info-assistant-ready', 'Assistant prompt prepared. Click "Run task" to generate code.'))
        }
    }
}

export async function removeFile(path) {
    if (!port) return;
    if (!await showConfirmDialog(T('files.confirm-remove', 'Remove {{path}}?', { path, interpolation: { escapeValue: false } }))) return
    await withLoader(`Removing ${path}…`, async () => {
        const raw = await MpRawMode.begin(port)
        try {
            await raw.removeFile(path)
            await _raw_updateFileTree(raw)
            document.dispatchEvent(new CustomEvent("fileRemoved", {detail: {path: path}}))
        } finally {
            await raw.end()
        }
    })
}

export async function removeDir(path) {
    if (!port) return;
    if (!await showConfirmDialog(T('files.confirm-remove', 'Remove {{path}}?', { path, interpolation: { escapeValue: false } }))) return
    await withLoader(`Removing ${path}…`, async () => {
        const raw = await MpRawMode.begin(port)
        try {
            await raw.removeDir(path)
            await _raw_updateFileTree(raw)
            document.dispatchEvent(new CustomEvent("dirRemoved", {detail: {path: path}}))
        } finally {
            await raw.end()
        }
    })
}

async function execReplNoFollow(cmd) {
    await port.write('\r\x03\x03')
    //await port.flushInput()
    //await port.write('\x05')            // Ctrl-E: enter paste mode
    await port.write(cmd + '\r\n')
    //await port.write('\x04')            // Ctrl-D: execute
}

function _updateFileTree(fs_tree, fs_stats)
{
    let [fs_used, _fs_free, fs_size] = fs_stats;

    function sorted(content) {
        // Natural sort by name
        if (QID('use-natural-sort').checked) {
            const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
            content.sort((a,b) => collator.compare(a.name, b.name))
        }

        // Stable-sort folders first
        content.sort((a,b) => (('content' in a)?0:1) - (('content' in b)?0:1))

        return content
    }

    const changed_files = []
    QSA("#menu-file-tree .changed").forEach((file) => {
        changed_files.push(file.dataset.fn)
    })
    const open_files = []
    QSA("#menu-file-tree .open").forEach((file) => {
        open_files.push(file.dataset.fn)
    })

    // Traverse file tree
    const fileTree = QID('menu-file-tree')
    // Preserve the scroll position across a full rebuild so saving/refreshing
    // doesn't jump the file list back to the top.
    const prevScrollTop = fileTree.scrollTop
    // Bind a single delegated click handler for dynamically-built rows so we
    // never interpolate untrusted file/folder names into inline onclick JS.
    if (!fileTree.dataset.delegationBound) {
        fileTree.dataset.delegationBound = '1'
        fileTree.addEventListener('click', (e) => {
            const el = e.target.closest('[data-act]')
            if (!el || !fileTree.contains(el)) return
            e.preventDefault()
            const path = el.dataset.path
            switch (el.dataset.act) {
                case 'toggle-folder': toggleFolder(path); break
                case 'remove-dir':    removeDir(path);    break
                case 'new-file':      createNewFile(path); break
                case 'remove-file':   removeFile(path);   break
                case 'open-file':     fileClick(path);    break
            }
        })
    }
    // Root row mirrors the other folder rows (a create "+" action) but has no
    // remove button, since the filesystem root can't be deleted.
    fileTree.innerHTML = `<div>
        <span class="folder name"><i class="fa-solid fa-folder fa-fw"></i> /</span>
        <a href="#" class="menu-action" title="Create" data-act="new-file" data-path="/"><i class="fa-solid fa-plus fa-fw"></i></a>
    </div>`
    function buildTree(node, depth) {
        const offset = '&emsp;'.repeat(depth)
        let html = ''
        for (const n of sorted(node)) {
            const ep = escapeHtml(n.path)
            const en = escapeHtml(n.name)
            if ('content' in n) {
                const isOpen = openFolders.has(n.path)
                html += `<div>
                    ${offset}<span class="folder name folder-toggleable" data-act="toggle-folder" data-path="${ep}"><i class="fa-solid fa-chevron-right fa-fw folder-chevron${isOpen ? ' open' : ''}"></i><i class="fa-solid fa-folder fa-fw"></i> ${en}</span>
                    <a href="#" class="menu-action" title="Remove" data-act="remove-dir" data-path="${ep}"><i class="fa-solid fa-xmark fa-fw"></i></a>
                    <a href="#" class="menu-action" title="Create" data-act="new-file" data-path="${ep}/"><i class="fa-solid fa-plus fa-fw"></i></a>
                </div>
                <div class="folder-content${isOpen ? '' : ' collapsed'}" data-folder-path="${ep}">
                    ${buildTree(n.content, depth+1)}
                </div>`
            } else {
                /* TODO ••• */
                let icon;
                const fnuc = n.name.toUpperCase();
                if (fnuc.endsWith('.MPY')) {
                    icon = '<i class="fa-solid fa-cube fa-fw"></i>'
                } else if (['.CRT', '.PEM', '.DER', '.CER', '.PFX', '.P12'].some(x => fnuc.endsWith(x))) {
                    icon = '<i class="fa-solid fa-certificate fa-fw"></i>'
                } else if (fnuc === '???') {
                    icon = '<i class="fa-solid fa-file-circle-exclamation fa-fw"></i>'
                } else {
                    icon = '<i class="fa-solid fa-file fa-fw"></i>'
                }
                let sel = ([editorFn, `/${editorFn}`, `/flash/${editorFn}`].includes(n.path)) ? 'selected' : ''
                if (n.path.startsWith("/proc/") || n.path.startsWith("/dev/")) {
                    icon = '<i class="fa-solid fa-gear fa-fw"></i>'
                    html += `<div>
                        ${offset}<span>${icon} ${en}&nbsp;</span>
                    </div>`
                } else {
                    html += `<div>
                        ${offset}<a href="#" class="name ${sel}" data-fn="${ep}" data-act="open-file" data-path="${ep}">${icon} ${en}&nbsp;</a>
                        <a href="#" class="menu-action" title="Remove" data-act="remove-file" data-path="${ep}"><i class="fa-solid fa-xmark fa-fw"></i></a>
                        <span class="menu-action">${sizeFmt(n.size)}</span>
                    </div>`
                }
            }
        }
        return html
    }
    fileTree.insertAdjacentHTML('beforeend', buildTree(fs_tree, 1))

    for (let fn of changed_files) {
        QS(`#menu-file-tree [data-fn="${CSS.escape(fn)}"]`)?.classList.add("changed")
    }
    for (let fn of open_files) {
        QS(`#menu-file-tree [data-fn="${CSS.escape(fn)}"]`)?.classList.add("open")
    }

    if (QID('advanced-mode').checked) {
        fileTree.insertAdjacentHTML('beforeend', `<div>
            <a href="#" class="name" onclick="app.fileClick('~sysinfo.md');return false;"><i class="fa-regular fa-message fa-fw"></i> sysinfo.md&nbsp;</a>
            <span class="menu-action">virtual</span>
        </div>`)
    }

    const usageEl = QID('file-tree-usage')
    if (usageEl) {
        usageEl.textContent = `${T('files.used')} ${sizeFmt(fs_used,0)} / ${sizeFmt(fs_size,0)}`
        usageEl.hidden = false
    }

    fileTree.scrollTop = prevScrollTop

}

// Show an inline loading indicator inside the file picker (file tree panel).
// Returns a handle with a hide() method. The indicator is also removed
// automatically when the tree is rebuilt by _updateFileTree().
function showFileTreeLoader(message = T('files.loading', 'Loading files…')) {
    const fileTree = QID('menu-file-tree')
    if (!fileTree) return { update() {}, hide() {} }
    let el = QID('file-tree-loader')
    if (!el) {
        el = document.createElement('div')
        el.id = 'file-tree-loader'
        el.className = 'file-tree-loader'
        el.innerHTML = `<span class="loader-spinner"></span><span class="loader-label"></span>`
        fileTree.insertBefore(el, fileTree.firstChild)
    }
    el.querySelector('.loader-label').textContent = message
    return {
        update(newMessage) { el.querySelector('.loader-label').textContent = newMessage },
        hide() { el.remove() },
    }
}

async function _raw_updateFileTree(raw) {
    let fs_stats = [null, null, null];
    try {
        fs_stats = await raw.getFsStats()
    } catch (err) {
        console.log(err)
    }

    const fs_tree = await raw.walkFs()

    _updateFileTree(fs_tree, fs_stats);
}

export function fileTreeSelect(fn) {
    for (const el of document.getElementsByClassName('name')) {
        el.classList.remove('selected')
    }
    const fileElement = QS(`#menu-file-tree [data-fn="${CSS.escape(fn)}"]`)
    if (!fileElement) {
        // might be a meta/unsaved file
        return
    }
    // Auto-expand any collapsed parent folders so the file is visible
    let el = fileElement.closest('.folder-content.collapsed')
    while (el) {
        const path = el.dataset.folderPath
        openFolders.add(path)
        el.classList.remove('collapsed')
        const headerDiv = el.previousElementSibling
        if (headerDiv) {
            const chevron = headerDiv.querySelector('.folder-chevron')
            if (chevron) chevron.classList.add('open')
        }
        el = el.parentElement.closest('.folder-content.collapsed')
    }
    fileElement.classList.add('selected')
    fileElement.scrollIntoView({ block: 'nearest' })
}

export function toggleFolder(path) {
    const contentEl = QS(`#menu-file-tree .folder-content[data-folder-path="${path}"]`)
    if (!contentEl) return

    if (openFolders.has(path)) {
        openFolders.delete(path)
        contentEl.classList.add('collapsed')
    } else {
        openFolders.add(path)
        contentEl.classList.remove('collapsed')
    }
    const headerDiv = contentEl.previousElementSibling
    if (headerDiv) {
        const chevron = headerDiv.querySelector('.folder-chevron')
        if (chevron) chevron.classList.toggle('open', openFolders.has(path))
    }
}

export function collapseAllFolders() {
    QSA('#menu-file-tree .folder-content').forEach((el) => {
        const path = el.dataset.folderPath
        openFolders.delete(path)
        el.classList.add('collapsed')
        const headerDiv = el.previousElementSibling
        if (headerDiv) {
            const chevron = headerDiv.querySelector('.folder-chevron')
            if (chevron) chevron.classList.remove('open')
        }
    })
}

export function expandAllFolders() {
    QSA('#menu-file-tree .folder-content').forEach((el) => {
        const path = el.dataset.folderPath
        openFolders.add(path)
        el.classList.remove('collapsed')
        const headerDiv = el.previousElementSibling
        if (headerDiv) {
            const chevron = headerDiv.querySelector('.folder-chevron')
            if (chevron) chevron.classList.add('open')
        }
    })
}


export async function fileClick(fn) {
    if (!port) return;

    await withLoader(`Opening ${fn}…`, async () => {
        const raw = await MpRawMode.begin(port)
        try {
            await _raw_loadFile(raw, fn)
        } finally {
            await raw.end()
        }
    })

    fileTreeSelect(fn)
}

export async function pyMinify() {
    if (!editorFn.endsWith('.py')) {
        toastr.info(T('files.open-python-first', 'Please open a Python file'))
        return
    }

    const input = editor.state.doc.toString()
    const res = await withLoader('Minifying…', () => minifyPython(input))

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: res }
    })

    toastr.info(T('files.minified', 'Minified {{from}} to {{to}}', { from: input.length, to: res.length }))
}

export async function pyPrettify() {
    if (!editorFn.endsWith('.py')) {
        toastr.info(T('files.open-python-first', 'Please open a Python file'))
        return
    }

    const res = await withLoader('Formatting…', () => prettifyPython(editor.state.doc.toString()))

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: res }
    })
}

async function _raw_loadFile(raw, fn) {
    let content
    if (fn == '~sysinfo.md') {
        content = await raw.readSysInfoMD()
    } else if (displayOpenFile(fn)) {
        console.debug(`File ${fn} already opened. Switched to tab`)
        autoHideSideMenu()
        return
    } else {
        content = await raw.readFile(fn)
        try {
            content = (new TextDecoder('utf-8', { fatal: true })).decode(content)
        } catch (err) {
            toastr.error(T('files.load-failed', 'Unable to load file: {{err}}', { err }))
        }
    }
    await _loadContent(fn, content, createTab(fn))
}

async function _loadContent(fn, content, editorElement) {
    const willDisasm = fn.endsWith('.mpy') && QID('advanced-mode').checked
    const paneEl = editorElement.closest('.editor-tab-pane')

    if (content instanceof Uint8Array && !willDisasm) {
        hexViewer(content.buffer, editorElement)
        editor = null
    } else if (fn.endsWith('.md') && QID('render-markdown').checked) {
        _mdRawContent.set(paneEl, content)
        editorElement.innerHTML = `<div class="marked-viewer">` + DOMPurify.sanitize(marked(content)) + `</div>`
        paneEl.dataset.mdMode = 'view'
        editor = null
        _setMdToggleButton(fn, 'view')
    } else {
        let readOnly = false
        if (fn.endsWith('.json') && QID('expand-minify-json').checked) {
            try {
                // Prettify JSON
                content = JSON.stringify(JSON.parse(content), null, 2)
            } catch (_err) {
                toastr.warning(T('files.json-malformed', 'JSON is malformed'))
            }
        } else if (willDisasm) {
            content = await disassembleMPY(content)
            fn = fn + '.dis'
            readOnly = true
        }

        editorElement.innerHTML = '' // Clear existing content
        editor = await createNewEditor(editorElement, fn, content, {
            wordWrap: QID('use-word-wrap').checked,
            devInfo,
            readOnly,
        })
        document.dispatchEvent(new CustomEvent("editorLoaded", {detail: {editor: editor, fn: fn}}))
        addUpdateHandler(editor, (update) => {
            if (update.docChanged) {
                QS(`#menu-file-tree [data-fn="${CSS.escape(fn)}"]`)?.classList.add("changed")
            }
        })

        if (fn.endsWith('.md')) {
            _mdRawContent.set(paneEl, content)
            paneEl.dataset.mdMode = 'edit'
            _setMdToggleButton(fn, 'edit')
        }

        editorFn = fn
    }
    autoHideSideMenu()
}

function _setMdToggleButton(fn, mode) {
    const tabEl = QS(`#editor-tabs [data-fn="${CSS.escape(fn)}"]`)
    if (!tabEl) return
    let btn = tabEl.querySelector('.md-toggle-btn')
    if (!btn) {
        btn = document.createElement('a')
        btn.className = 'menu-action md-toggle-btn'
        btn.href = '#'
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            e.preventDefault()
            toggleMarkdownView(fn)
        })
        const closeBtn = tabEl.querySelector('.menu-action')
        tabEl.insertBefore(btn, closeBtn)
    }
    if (mode === 'view') {
        btn.title = T('editor.md-edit', 'Edit raw')
        btn.innerHTML = '<i class="fa-solid fa-pen"></i>'
    } else {
        btn.title = T('editor.md-preview', 'Preview')
        btn.innerHTML = '<i class="fa-solid fa-eye"></i>'
    }
}

export async function toggleMarkdownView(fn) {
    const tabEl = QS(`#editor-tabs [data-fn="${CSS.escape(fn)}"]`)
    if (!tabEl) return
    const paneEl = QS(`.editor-tab-pane[data-pane="${tabEl.dataset.tab}"]`)
    if (!paneEl) return
    const editorEl = paneEl.querySelector('.editor')
    const isActive = paneEl.classList.contains('active')
    const currentMode = paneEl.dataset.mdMode || 'view'

    if (currentMode === 'view') {
        // Switch to edit mode
        const content = _mdRawContent.get(paneEl) || ''
        editorEl.innerHTML = ''
        const newEditor = await createNewEditor(editorEl, fn, content, {
            wordWrap: QID('use-word-wrap').checked,
            devInfo,
        })
        document.dispatchEvent(new CustomEvent("editorLoaded", {detail: {editor: newEditor, fn: fn}}))
        addUpdateHandler(newEditor, (update) => {
            if (update.docChanged) {
                const fileEl = QS(`#menu-file-tree [data-fn="${CSS.escape(fn)}"]`)
                if (fileEl) fileEl.classList.add("changed")
            }
        })
        paneEl.dataset.mdMode = 'edit'
        if (isActive) {
            editor = newEditor
            editorFn = fn
        }
        _setMdToggleButton(fn, 'edit')
    } else {
        // Switch to view mode
        const currentEditor = getEditorFromElement(editorEl)
        const content = currentEditor
            ? currentEditor.state.doc.toString()
            : (_mdRawContent.get(paneEl) || '')
        _mdRawContent.set(paneEl, content)
        editorEl.innerHTML = `<div class="marked-viewer">` + DOMPurify.sanitize(marked(content)) + `</div>`
        paneEl.dataset.mdMode = 'view'
        if (isActive) {
            editor = null
        }
        _setMdToggleButton(fn, 'view')
    }
}

export async function saveCurrentFile() {
    if (!port) return;
    if (!editor) return;

    if (editor.state.readOnly) {
        toastr.warning(T('files.read-only', 'File is read only'))
        return
    }

    if (editorFn == "Untitled") {
        const fn = await showPromptDialog(T('files.prompt-new-name', 'Please enter the file name:'))
        if (fn == null || fn == '') return
        editorFn = fn
        document.dispatchEvent(new CustomEvent("fileRenamed", {detail: {old: "Untitled", new: fn}}))
    }

    let content = editor.state.doc.toString()
    const loader = showLoader(`Saving ${editorFn}…`)
    try {
        if (editorFn.endsWith('.json') && QID('expand-minify-json').checked) {
            try {
                // Minify JSON
                content = JSON.stringify(JSON.parse(content))
            } catch (_error) {
                toastr.error(T('files.json-malformed', 'JSON is malformed'))
                return
            }
        } else if (editorFn.endsWith('.py')) {
            loader.update(`Validating ${editorFn}…`)
            const content = editor.state.doc.toString()
            const backtrace = await validatePython(editorFn, content)
            if (backtrace) {
                console.log(backtrace)
                toastr.warning(sanitizeHTML(backtrace.summary), backtrace.type)
            }
        }
        loader.update(`Saving ${editorFn}…`)
        const raw = await MpRawMode.begin(port)
        try {
            await raw.writeFile(editorFn, content)
            await _raw_updateFileTree(raw)
        } finally {
            await raw.end()
        }
    } finally {
        loader.hide()
    }
    // Success
    toastr.success(T('files.saved', 'File Saved'))

    document.dispatchEvent(new CustomEvent("fileSaved", {detail: {fn: editorFn}}))
    QS(`#menu-file-tree [data-fn="${CSS.escape(editorFn)}"]`)?.classList.remove("changed")
}

export function clearTerminal() {
    term.clear()
    terminalLogLines.length = 0
}

export async function reboot(mode = 'hard') {
    if (!port) return;

    const release = await port.startTransaction()
    try {
        if (mode === 'soft') {
            await port.write('\r\x03\x03\x04')
        } else if (mode === 'hard') {
            await execReplNoFollow('import machine; machine.reset()')
        } else if (mode === 'bootloader') {
            await execReplNoFollow('import machine; machine.bootloader()')
        }
    } finally {
        release()
    }
}

export async function runCurrentFile() {
    if (!port) return;

    if (isInRunMode) {
        await port.write('\r\x03\x03')   // Ctrl-C twice: interrupt any running program
        return
    }

    if (!editorFn.endsWith('.py')) {
        toastr.error(T('files.not-executable', '{{fn}} file is not executable', { fn: editorFn, interpolation: { escapeValue: false } }))
        return
    }

    writeTerminal('\r\n')

    const soft_reboot = false
    const timeout = -1
    const raw = await MpRawMode.begin(port, soft_reboot)
    try {
        QID('btn-run-icon').classList.replace('fa-circle-play', 'fa-circle-stop')
        isInRunMode = true
        const emit = true
        await sleep(10)
        await raw.exec(editor.state.doc.toString(), timeout, emit)
    } catch (err) {
        if (err.message.includes('KeyboardInterrupt')) {
            // Interrupted manually
        } else {
            const backtrace = parseStackTrace(err.message)
            if (backtrace) {
                console.log(backtrace)
                lastTracebackText = `${backtrace.type || 'Traceback'}\n${backtrace.summary || err.message}`
                toastr.error(sanitizeHTML(backtrace.summary), backtrace.type)
            } else {
                lastTracebackText = String(err.message || err)
                toastr.error(sanitizeHTML(lastTracebackText), 'Error')
            }
            return
        }
    } finally {
        port.emit = false
        await raw.end()
        QID('btn-run-icon').classList.replace('fa-circle-stop', 'fa-circle-play')
        isInRunMode = false
        writeTerminal('\r\n>>> ')
    }
    // Success
}

/*
 * Package Management
 */

export async function loadAllPkgIndexes() {
    const pkgList = QID('menu-pkg-list')
    pkgList.innerHTML = ''
    // Bind a single delegated handler so remote package names are never
    // interpolated into inline onclick JS.
    if (!pkgList.dataset.delegationBound) {
        pkgList.dataset.delegationBound = '1'
        pkgList.addEventListener('click', (e) => {
            const el = e.target.closest('[data-act="install-pkg"]')
            if (!el || !pkgList.contains(el)) return
            e.preventDefault()
            installPkg(el.dataset.pkg)
        })
    }
    await withLoader('Loading package index…', async () => {
        for (const i of await getPkgIndexes()) {
            pkgList.insertAdjacentHTML('beforeend', `<div class="title-lines">${escapeHtml(i.name)}</div>`)
            for (const pkg of i.index.packages) {
                let offset = ''
                let icon = ''
                if (pkg.name.includes('-')) {
                    const parent = pkg.name.split('-').slice(0, -1).join('-')
                    const exists = i.index.packages.some(pkg => (pkg.name === parent))
                    if (exists) {
                        offset = '&emsp;'
                    }
                }
                const keywords = pkg.keywords ? pkg.keywords.split(',').map(x => x.trim()) : [];
                if (keywords.includes('__hidden__')) {
                    continue
                }
                if (keywords.includes('native')) {
                    icon = ' <i class="fa-solid fa-gauge-high" title="Efficient native module"></i>'
                }
                pkgList.insertAdjacentHTML('beforeend', `<div>
                    ${offset}<span><i class="fa-solid fa-cube fa-fw"></i> ${escapeHtml(pkg.name)}${icon}</span>
                    <a href="#" class="menu-action" data-act="install-pkg" data-pkg="${escapeHtml(pkg.name)}">${escapeHtml(pkg.version)} <i class="fa-regular fa-circle-down"></i></a>
                </div>`)
            }
        }
    })
}

async function _raw_installPkg(raw, pkg, { version=null } = {}) {
    toastr.info(T('pkg.installing', 'Installing {{pkg}}…', { pkg }))
    const dev_info = await raw.getDeviceInfo()
    const pkg_info = await rawInstallPkg(raw, pkg, {
        version,
        dev: dev_info,
        prefer_source: QID('install-package-source').checked,
    })
    if (pkg_info.version) {
        toastr.success(T('pkg.installed', 'Installed {{pkg}}', { pkg: `${pkg_info.name}@${pkg_info.version}` }))
    } else {
        toastr.success(T('pkg.installed', 'Installed {{pkg}}', { pkg: pkg_info.name }))
    }
}

export async function installPkg(pkg, { version=null } = {}) {
    if (!port) {
        toastr.info(T('app.connect-first', 'Connect your board first'))
        return
    }
    await withLoader(`Installing ${pkg}…`, async () => {
        const raw = await MpRawMode.begin(port)
        try {
            await _raw_installPkg(raw, pkg, { version })
            await _raw_updateFileTree(raw)
        } catch (err) {
            report('Installing failed', err)
        } finally {
            await raw.end()
        }
    })
}

export async function installPkgFromUrl() {
    if (!port) {
        toastr.info(T('app.connect-first', 'Connect your board first'))
        return
    }
    const url = await showPromptDialog(T('app.prompt-pkg-url', 'Enter package name or URL:'))
    if (url) {
        await installPkg(url)
    }
}

export async function createNewAppFromTools() {
    await createNewApp()
}

/*
 * UI helpers
 */

const fileTree = QID('side-menu')
const overlay = QID('overlay')

/*
 * Left sidebar resizer
 */

const DEFAULT_SIDE_MENU_WIDTH = 300

;(function initSideMenuResizer() {
    const resizer = QID('side-menu-resizer')
    if (!resizer) return

    const uiSettings = loadUiSettings()
    const savedWidth = Number(uiSettings['side-menu-width']) || DEFAULT_SIDE_MENU_WIDTH
    fileTree.style.setProperty('--side-menu-width', savedWidth + 'px')

    resizer.addEventListener('mousedown', (event) => {
        if (window.innerWidth <= 768) return
        event.preventDefault()

        const startX = event.clientX
        const startWidth = fileTree.getBoundingClientRect().width

        const onMouseMove = (moveEvent) => {
            const width = Math.min(600, Math.max(150, Math.round(startWidth + moveEvent.clientX - startX)))
            fileTree.style.setProperty('--side-menu-width', width + 'px')
        }

        const onMouseUp = () => {
            const width = Math.round(fileTree.getBoundingClientRect().width)
            const current = loadUiSettings()
            current['side-menu-width'] = width
            saveUiSettings(current)
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
    })
}())

export function toggleSideMenu() {
    if (window.innerWidth <= 768) {
        fileTree.classList.remove('hidden')
        fileTree.classList.toggle('show')
    } else {
        fileTree.classList.remove('show')
        fileTree.classList.toggle('hidden')
    }

    if (fileTree.classList.contains('show') && !fileTree.classList.contains('hidden')) {
        overlay.classList.add('show')
    } else {
        overlay.classList.remove('show')
    }
}

export function autoHideSideMenu() {
    if (window.innerWidth <= 768) {
        fileTree.classList.remove('show')
        overlay.classList.remove('show')
    }
}

function hexViewer(arrayBuffer, targetElement) {
    const containerDiv = document.createElement('div')
    containerDiv.className = 'hexed-viewer monospace'

    const dataView = new DataView(arrayBuffer)
    const numBytes = dataView.byteLength

    function toHex(n) {
        return ('00' + n.toString(16)).slice(-2)
    }

    function toPrintableAscii(n) {
        return (n >= 32 && n <= 126) ? String.fromCharCode(n) : '.'
    }

    for (let offset = 0; offset < numBytes; offset += 16) {
        const hexLine = document.createElement('div')
        hexLine.className = 'hexed-line'

        const addressSpan = document.createElement('span')
        addressSpan.className = 'hexed-address'
        addressSpan.textContent = offset.toString(16).padStart(8, '0')

        const hexPartSpan = document.createElement('span')
        hexPartSpan.className = 'hexed-hex-part'
        let hexPart = ''
        let asciiPart = ''

        for (let i = 0; i < 16; i++) {
            if (offset + i < numBytes) {
                const byte = dataView.getUint8(offset + i)
                hexPart += toHex(byte) + ' '
                asciiPart += toPrintableAscii(byte)
            } else {
                hexPart += '   '
                asciiPart += ' '
            }
            if (i === 7) hexPart += ' '
        }

        hexPartSpan.textContent = hexPart.slice(0, -1)

        const asciiPartSpan = document.createElement('span')
        asciiPartSpan.className = 'hexed-ascii-part'
        asciiPartSpan.textContent = asciiPart

        hexLine.appendChild(addressSpan)
        hexLine.appendChild(hexPartSpan)
        hexLine.appendChild(asciiPartSpan)
        containerDiv.appendChild(hexLine)
    }

    targetElement.innerHTML = ''  // Clear any existing content
    targetElement.appendChild(containerDiv)
}


/*
 * Initialization
 */

if (!document.fullscreenEnabled) {
    QID('app-expand').style.display = 'none'
    QID('term-expand').style.display = 'none'
}

/* iOS: Disable auto-zoom on contenteditable */
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    document
      .querySelector("[name=viewport]")
      .setAttribute("content","width=device-width, initial-scale=1, maximum-scale=1");
}

export function toggleFullScreen(elementId) {
    const element = QID(elementId)
    if (!document.fullscreenElement) {
        element.requestFullscreen().catch(err => {
            report('Error enabling full-screen mode', err)
        })
    } else {
        document.exitFullscreen()
    }
}

export function applyTranslation() {
    try {
        // sanity check
        if (!i18next.exists('example.hello')) {
            throw new Error('No translation')
        }

        document.body.dir = i18next.dir()

        let metaKey = "Ctrl"
        if (navigator.platform.indexOf("Mac") == 0) {
            metaKey = "Cmd"
        }
        QID('btn-save').setAttribute('title',     T('tool.save') + ` [${metaKey}+S]`)
        QID('btn-run').setAttribute('title',      T('tool.run') + ' [F5]')
        QID('btn-conn-ws').setAttribute('title',  T('tool.conn.ws'))
        QID('btn-conn-ble').setAttribute('title', T('tool.conn.ble'))
        QID('btn-conn-usb').setAttribute('title', T('tool.conn.usb'))
        QID('term-clear').setAttribute('title',   T('tool.clear'))
        QID('tab-term').innerText = T('tool.terminal')

        QSA('#app-expand, #term-expand').forEach(el => {
            el.setAttribute('title', T('tool.fullscreen'))
        })

        QS('#menu-file-title-text').innerText = T('menu.file-mgr')
        QID('btn-file-refresh').setAttribute('title', T('files.refresh', 'Refresh'))
        QID('btn-file-expand').setAttribute('title', T('files.expand-all', 'Expand All'))
        QID('btn-file-collapse').setAttribute('title', T('files.collapse-all', 'Collapse All'))
        QID('create-new-app-label').innerText = T('app.scaffold-btn', 'Create new app scaffold')
        QS('#menu-pkg-title').innerText = T('menu.package-mgr')
        QS('#menu-settings-title').innerText = T('menu.settings')

        try {
            QID('no-files').innerText = T('files.no-files')
        } catch (_err) {
            window.console.warn(`No ${i18next.language} translation for 'files.no-files'`)
        }

        QS('#menu-line-conn').innerText = T('settings.conn')
        QS('#menu-line-editor').innerText = T('settings.editor')
        QS('#menu-line-other').innerText = T('settings.other')

        QS('label[for=interrupt-device]').innerText = T('settings.interrupt-device')
        QS('label[for=force-serial-poly]').innerText = T('settings.force-serial-poly')
        QS('label[for=expand-minify-json]').innerText = T('settings.expand-minify-json')
        QS('label[for=use-word-wrap]').innerText = T('settings.use-word-wrap')
        QS('label[for=render-markdown]').innerText = T('settings.render-markdown')
        QS('label[for=use-natural-sort]').innerText = T('settings.use-natural-sort')

        QS('label[for=lang]').innerText = T('settings.lang')
        QS('label[for=zoom]').innerText = T('settings.zoom')
        QS('label[for=color-theme]').innerText = T('settings.color-theme', 'Theme')

        QS('#about-cta').innerHTML = T('about.cta')
        QS('#report-bug').innerHTML = T('about.report-bug')
    } catch (err) {
        report("Error", err)
    }

    QSA('a[id=gh-star]').forEach(el => {
        el.setAttribute('href', 'https://github.com/DrSkunk/Fri3d-IDE')
        el.setAttribute('target', '_blank')
        el.classList.add('link')
    })

    QSA('a[id=gh-issues]').forEach(el => {
        el.setAttribute('href', 'https://github.com/DrSkunk/Fri3d-IDE/issues')
        el.setAttribute('target', '_blank')
        el.classList.add('link')
    })
}

(async () => {

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
        try {
            await navigator.serviceWorker.register('./app_worker.js');
        } catch (err) {
            report("Unable to register service worker", err)
        }
    }

    await i18next.use(LanguageDetector).init({
        fallbackLng: 'en',
        //debug: true,
        resources: translations,
    })

    const currentLang = i18next.resolvedLanguage || 'en';

    restoreAndBindUiSettings()

    const lang_sel = QID('lang')
    lang_sel.value = currentLang
    lang_sel.addEventListener('change', async function() {
        await i18next.changeLanguage(this.value)
        applyTranslation()
    })

    const zoom_sel = QID('zoom')
    const applyZoom = (zoomValue) => {
        const size = 14 * parseFloat(zoomValue)
        document.documentElement.style.setProperty('--font-size', (size).toFixed(1) + 'px')
        if (term) {
            term.options.fontSize = (size * 0.9).toFixed(1)
        }
    }
    zoom_sel.addEventListener('change', async function() {
        applyZoom(this.value)
    })
    applyZoom(zoom_sel.value)

    applyTranslation()


    setupTabs(QID('side-menu'))
    setupTabs(QID('terminal-container'))

    toastr.options.preventDuplicates = true;

    const fn = 'test.py'
    const content = `
# Fri3d-IDE - MicroPython Web IDE
# Read more: https://github.com/DrSkunk/Fri3d-IDE/

# Connect your device and start creating! 🤖👨‍💻🕹️

# You can also open a virtual device and explore some examples:
# https://fri3d-programmer.vercel.app/?vm=1
`
    await _loadContent(fn, content, createTab(fn))

    const xtermThemeDark = {
        foreground: '#F8F8F8',
        background: getCssPropertyValue('--bg-color-edit'),
        selectionBackground: '#5DA5D5',
        selectionForeground: '#1E1E1D',
        selectionInactiveBackground: '#5DA5D580',
        black: '#1E1E1D',
        brightBlack: '#262625',
        red: '#CE5C5C',
        brightRed: '#FF7272',
        green: '#5BCC5B',
        brightGreen: '#72FF72',
        yellow: '#CCCC5B',
        brightYellow: '#FFFF72',
        blue: '#5D5DD3',
        brightBlue: '#7279FF',
        magenta: '#BC5ED1',
        brightMagenta: '#E572FF',
        cyan: '#5DA5D5',
        brightCyan: '#72F0FF',
        white: '#F8F8F8',
        brightWhite: '#FFFFFF'
    }

    const xtermThemeLight = {
        foreground: '#212121',
        background: getCssPropertyValue('--bg-color-edit'),
        selectionBackground: '#80CBC4',
        selectionForeground: '#212121',
        selectionInactiveBackground: '#80CBC480',
        cursor: '#212121',
        black: '#212121',
        brightBlack: '#546E7A',
        red: '#B71C1C',
        brightRed: '#E53935',
        green: '#1B5E20',
        brightGreen: '#43A047',
        yellow: '#E65100',
        brightYellow: '#FB8C00',
        blue: '#0D47A1',
        brightBlue: '#1E88E5',
        magenta: '#880E4F',
        brightMagenta: '#D81B60',
        cyan: '#006064',
        brightCyan: '#00ACC1',
        white: '#90A4AE',
        brightWhite: '#ECEFF1'
    }

    const darkTermMQ = window.matchMedia('(prefers-color-scheme: dark)')
    const xtermTheme = darkTermMQ.matches ? xtermThemeDark : xtermThemeLight

    term = new Terminal({
        fontFamily: '"Hack", "Droid Sans Mono", "monospace", monospace',
        fontSize: (14 * 0.9).toFixed(1),
        theme: xtermTheme,
        cursorBlink: true,
        convertEol: true,
        allowProposedApi: true,
    })
    term.open(QID('xterm'))

    // ── Color-theme preference ─────────────────────────────────────────────
    // restoreAndBindUiSettings() has already run, so #color-theme is populated.
    let _colorThemePref = QID('color-theme').value

    function applyColorTheme(pref) {
        _colorThemePref = pref
        const dark = pref === 'dark' || (pref === 'system' && darkTermMQ.matches)
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
        // null = revert to system-follow; true/false = forced
        setEditorTheme(pref === 'system' ? null : dark)
        const base = dark ? xtermThemeDark : xtermThemeLight
        term.options.theme = { ...base, background: getCssPropertyValue('--bg-color-edit') }
    }

    QID('color-theme').addEventListener('change', function() {
        applyColorTheme(this.value)
    })
    applyColorTheme(_colorThemePref)
    // ── End color-theme ───────────────────────────────────────────────────

    // When OS theme changes, re-apply only if the user is tracking the system.
    // applyColorTheme() updates data-theme, editors (via setEditorTheme), and terminal.
    darkTermMQ.addEventListener('change', () => {
        if (_colorThemePref !== 'system') return
        applyColorTheme('system')
    })
    term.onData(async (data) => {
        if (!port) return;
        if (isInRunMode) {
            // Allow injecting input in run mode
            await port.write(data)
        } else {
            const release = await port.mutex.acquire()
            try {
                await port.write(data)
            } finally {
                release()
            }
        }
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddon.fit()

    term.loadAddon(new WebLinksAddon())

    addEventListener('resize', (_event) => {
        fitAddon.fit()
    })

    new ResizeObserver(() => {
        fitAddon.fit()
    }).observe(QID('xterm'))

    window.addEventListener('keydown', (ev) => {
        // ctrlKey for Windows/Linux, metaKey for Mac
        if (ev.ctrlKey || ev.metaKey) {
            if (ev.code == 'KeyS') {
                saveCurrentFile()
            } else if (ev.code == 'KeyD') {
                reboot('soft')
            } else {
                return
            }
        } else if (ev.code == 'F5') {
            runCurrentFile()
        } else {
            return
        }
        ev.preventDefault()
    })

    document.addEventListener("tabActivated", (event) => {
        fileTreeSelect(event.detail.fn)
        editor = getEditorFromElement(event.detail.editorElement)
        editorFn = event.detail.fn
        const fileElement = QS(`#menu-file-tree [data-fn="${CSS.escape(event.detail.fn)}"]`)
        if (fileElement) {
            fileElement.classList.add("open")
        }
    })
    document.addEventListener("tabClosed", (event) => {
        const closedView = getEditorFromElement(event.detail.editorElement)
        if (closedView) {
            unregisterEditor(closedView)
        }
        const fileElement = QS(`#menu-file-tree [data-fn="${CSS.escape(event.detail.fn)}"]`)
        if (fileElement) {
            fileElement.classList.remove("open")
            fileElement.classList.remove("changed")
        }
    })

    initAssistantPanel({
        getEditorState() {
            if (!editor) {
                return null
            }

            const sel = editor.state.selection.main
            const selected = editor.state.sliceDoc(sel.from, sel.to)

            return {
                filename: editorFn,
                selection: selected,
                content: editor.state.doc.toString(),
            }
        },
        getTerminalLines() {
            return [...terminalLogLines]
        },
        getTraceback() {
            return lastTracebackText
        },
        getBoardInfo() {
            return devInfo
        },
    })

    setTimeout(() => {
        document.body.classList.add('loaded')
        initOnboarding()
    }, 100)

    initOfflineIndicator()

    const urlParams = new URLSearchParams(window.location.search)
    let urlID = null
    if ((urlID = urlParams.get('wss'))) {
        try {
            const connID = ConnectionUID.parse(urlID).value()
            window.webrepl_url = 'wss://hub.viper-ide.org/relay/' + connID
        } catch (err) {
            report('Cannot connect', err)
        }
    } else if ((urlID = urlParams.get('rtc'))) {
        try {
            const connID = ConnectionUID.parse(urlID).value()
            window.webrepl_url = 'rtc://' + connID
        } catch (err) {
            report('Cannot connect', err)
        }
    } else if ((urlID = urlParams.get('vm'))) {
        window.webrepl_url = 'vm://' + urlID
    }

    if ((urlID = urlParams.get('install'))) {
        window.pkg_install_url = urlID
        toastr.info(T('pkg.install-overwrite', 'Warning: your files may be overwritten!'), T('pkg.install-connect', 'Connect your board to install {{pkg}}', { pkg: urlID }))
    }

    if (typeof webrepl_url !== 'undefined') {
        await sleep(100)
        await connectDevice('ws')
    }

})();

/*
 * App Updater
 */

let lastUpdateCheck = 0;

async function checkForUpdates() {
    const now = new Date()
    if (now - lastUpdateCheck < 60*60*1000) {
        return
    }
    lastUpdateCheck = now

    const current_version = VIPER_IDE_VERSION
    QID('viper-ide-version').innerHTML = current_version
    QID('viper-ide-build').innerText = 'build ' + getBuildDate()

    // Compare against the manifest of our own deployment (generated with the
    // package version at build time). Fails silently on the dev server, which
    // serves no built manifest.
    let manifest;
    try {
        manifest = await fetchJSON('./manifest.json')
    } catch {
        return
    }
    if (current_version.localeCompare(manifest.version, undefined, {numeric: true, sensitivity: "base"}) < 0) {
        toastr.info(T('app.update-available', 'New Fri3d-IDE version {{version}} is available', { version: manifest.version }))
        QID('viper-ide-version').innerHTML = `${current_version} (<a href="javascript:app.updateApp()">update</a>)`

        // Automatically show about page
        QS('a[data-target="menu-about"]').click()

        if (window.innerWidth <= 768) {
            fileTree.classList.add('show')
            overlay.classList.add('show')
        } else {
            fileTree.classList.remove('hidden')
        }
    }
}

export function updateApp() {
    window.location.reload()
}

window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
        //console.log('APP resumed')
        checkForUpdates()
    }
})

checkForUpdates()

/*
 * Splitter
 */

let startY, startHeight

export function initDrag(e) {
    if (typeof e.clientY !== 'undefined') {
        startY = e.clientY
    } else if (typeof e.touches !== 'undefined') {
        startY = e.touches[0].clientY
    } else {
        return
    }
    startHeight = parseInt(document.defaultView.getComputedStyle(QID('terminal-container')).height, 10)
    document.documentElement.addEventListener('mousemove', doDrag, false)
    document.documentElement.addEventListener('touchmove', doDrag, false)
    document.documentElement.addEventListener('mouseup', stopDrag, false)
    document.documentElement.addEventListener('touchend', stopDrag, false)
}

function doDrag(e) {
    let clientY
    if (typeof e.clientY !== 'undefined') {
        clientY = e.clientY
    } else if (typeof e.touches !== 'undefined') {
        clientY = e.touches[0].clientY
    } else {
        return
    }
    const terminalContainer = QID('terminal-container')
    const height = (startHeight - (clientY - startY))
    terminalContainer.style.height = Math.max(height, 50) + 'px'
}

function stopDrag() {
    document.documentElement.removeEventListener('mousemove', doDrag, false)
    document.documentElement.removeEventListener('touchmove', doDrag, false)
    document.documentElement.removeEventListener('mouseup', stopDrag, false)
    document.documentElement.removeEventListener('touchend', stopDrag, false)
}

// Expose exports as window.app for HTML inline event handlers
window.app = {
    connectDevice,
    refreshFileTree,
    createNewFile,
    removeFile,
    removeDir,
    fileTreeSelect,
    toggleFolder,
    collapseAllFolders,
    expandAllFolders,
    fileClick,
    pyMinify,
    pyPrettify,
    saveCurrentFile,
    clearTerminal,
    reboot,
    runCurrentFile,
    loadAllPkgIndexes,
    installPkg,
    installPkgFromUrl,
    createNewApp,
    createNewAppFromTools,
    showAppWizardDialog,
    toggleSideMenu,
    autoHideSideMenu,
    toggleFullScreen,
    applyTranslation,
    updateApp,
    initDrag,
    toggleAssistantSidebar,
    toggleMarkdownView,
}
