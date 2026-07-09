/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import './onboarding.css'
import i18next from 'i18next'

const T = i18next.t.bind(i18next)

const ONBOARDING_STORAGE_KEY = 'fri3d.onboarding.v1.done'
const Z_INDEX_ELEVATED = 9001

const FRI3D_LOGO_SVG = `<svg viewBox="0 0 230 230" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="m 23.66,108.47 84.41,84.4 -45.92,-91.87 4.54,-1.87 48.31,96.62 48.29,-96.6 4.54,1.88 -45.9,91.81 84.4,-84.4 L 115,70.86 Z M 115,65.56 203.89,29 l -26.9,53.78 -4.54,-1.87 21.2,-42.4 -72.22,29.7 93.57,38.52 -100,100 v 0 L 15,106.73 108.53,68.21 36.34,38.47 57.53,80.81 52.98,82.68 26.11,29 Z" fill="currentColor"/>
</svg>`

interface OnboardingStep {
    target: string | null
    containers?: string[]
    title: () => string
    text: () => string
    renderExtra?: () => string
}

const STEPS: OnboardingStep[] = [
    {
        target: null,
        title: () => T('onboarding.steps.welcome.title', 'Welcome to Fri3d-IDE! 👋'),
        text: () => T('onboarding.steps.welcome.text', "Hi there! I'm your Fri3d guide. Let me give you a quick tour so you can start coding right away!"),
        renderExtra() {
            const appLang = document.getElementById('lang') as HTMLSelectElement | null
            if (!appLang) return ''
            const opts = [...appLang.options]
                .map(o => `<option value="${o.value}"${o.value === appLang.value ? ' selected' : ''}>${o.text}</option>`)
                .join('')
            return `<select class="ob-lang-select">${opts}</select>`
        }
    },
    {
        target: '#tool-panel',
        title: () => T('onboarding.steps.toolbar.title', 'Main Toolbar'),
        text: () => T('onboarding.steps.toolbar.text', 'This is your main toolbar. Save files, run your code on the badge, and connect to your Fri3d device from here.'),
    },
    {
        // The button lives inside #tool-panel, so we elevate the toolbar too
        // to ensure the button's stacking context is above the overlay.
        target: '#btn-conn-usb',
        containers: ['#tool-panel'],
        title: () => T('onboarding.steps.connect.title', 'Connect via USB'),
        text: () => T('onboarding.steps.connect.text', 'Click this button to connect your Fri3d badge via USB/Serial. You can also use Bluetooth 🦷 or WebREPL 🌐!'),
    },
    {
        target: '#side-menu',
        title: () => T('onboarding.steps.side-menu.title', 'Side Menu'),
        text: () => T('onboarding.steps.side-menu.text', 'This panel has tabs for the File Manager, Package Manager, Tools, Settings, and About. Everything you need!'),
    },
    {
        target: '#menu-file-tree',
        title: () => T('onboarding.steps.files.title', 'File Manager'),
        text: () => T('onboarding.steps.files.text', 'Browse and manage files on your connected badge here. Connect a device first to see and edit its files!'),
    },
    {
        target: '#main-editor',
        title: () => T('onboarding.steps.editor.title', 'Code Editor'),
        text: () => T('onboarding.steps.editor.text', 'Write your MicroPython code here! Syntax highlighting, auto-complete, and linting are all built in. 🐍'),
    },
    {
        target: '#terminal-container',
        title: () => T('onboarding.steps.terminal.title', 'Terminal'),
        text: () => T('onboarding.steps.terminal.text', 'The terminal shows output from your badge. You can also type commands directly into the REPL when connected.'),
    },
    {
        target: null,
        title: () => T('onboarding.steps.done.title', "You're all set! 🚀"),
        text: () => T('onboarding.steps.done.text', "That's the tour! Connect your Fri3d badge and start building amazing things. Happy coding!"),
    }
]

let currentStep = 0
let overlayEl: HTMLDivElement | null = null
let cardEl: HTMLDivElement | null = null
let elevatedEl: HTMLElement | null = null
let savedZIndex = ''
let savedPosition = ''
let containerEls: { el: HTMLElement, zIndex: string, position: string }[] = []

function elevateContainer(selector: string) {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) return
    containerEls.push({
        el,
        zIndex: el.style.zIndex,
        position: el.style.position,
    })
    el.style.zIndex = String(Z_INDEX_ELEVATED)
    el.style.position = 'relative'
}

function elevate(selector: string | null, containers: string[] = []): DOMRect | null {
    restore()
    for (const s of containers) {
        elevateContainer(s)
    }
    if (!selector) return null

    const el = document.querySelector<HTMLElement>(selector)
    if (!el) return null

    savedZIndex = el.style.zIndex
    savedPosition = el.style.position
    el.style.zIndex = String(Z_INDEX_ELEVATED)
    el.style.position = 'relative'
    el.classList.add('ob-elevated')
    elevatedEl = el
    return el.getBoundingClientRect()
}

function restore() {
    if (elevatedEl) {
        elevatedEl.style.zIndex = savedZIndex
        elevatedEl.style.position = savedPosition
        elevatedEl.classList.remove('ob-elevated')
        elevatedEl = null
    }
    for (const { el, zIndex, position } of containerEls) {
        el.style.zIndex = zIndex
        el.style.position = position
    }
    containerEls = []
}

function positionCard(rect: DOMRect | null) {
    const cardPad = 20
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Measure card after content update (approximate max dimensions)
    const cardW = Math.min(380, vw - 2 * cardPad)
    const cardH = 190

    let left, top

    if (!rect) {
        // Centered
        left = (vw - cardW) / 2
        top = (vh - cardH) / 2
    } else {
        const spaceBelow = vh - rect.bottom - cardPad
        const spaceAbove = rect.top - cardPad
        const centerX = rect.left + rect.width / 2

        if (spaceBelow >= cardH) {
            top = rect.bottom + cardPad
        } else if (spaceAbove >= cardH) {
            top = rect.top - cardH - cardPad
        } else {
            // Fall back: overlap at screen center vertically
            top = Math.max(cardPad, Math.min(rect.top + rect.height / 2 - cardH / 2, vh - cardH - cardPad))
        }

        left = Math.max(cardPad, Math.min(centerX - cardW / 2, vw - cardW - cardPad))
    }

    cardEl!.style.left = left + 'px'
    cardEl!.style.top = top + 'px'
    cardEl!.style.width = cardW + 'px'
}

function showStep(index: number) {
    const step = STEPS[index]
    const isLast = index === STEPS.length - 1

    // Update card text
    cardEl!.querySelector('.ob-title')!.textContent = step.title()
    cardEl!.querySelector('.ob-text')!.textContent = step.text()
    cardEl!.querySelector('.ob-step')!.textContent = T('onboarding.step', 'Step {{current}} of {{total}}', { current: index + 1, total: STEPS.length })
    cardEl!.querySelector('.ob-skip')!.textContent = T('onboarding.skip', 'Skip tour')
    const nextBtn = cardEl!.querySelector('.ob-next')!
    nextBtn.textContent = isLast ? T('onboarding.get-started', 'Get started! 🚀') : T('onboarding.next', 'Next →')

    // Render optional extra content (e.g. language picker)
    const extraEl = cardEl!.querySelector('.ob-extra')!
    if (step.renderExtra) {
        extraEl.innerHTML = step.renderExtra()
        const langSel = extraEl.querySelector<HTMLSelectElement>('.ob-lang-select')
        if (langSel) {
            langSel.addEventListener('change', () => {
                const appLang = document.getElementById('lang') as HTMLSelectElement | null
                if (appLang) {
                    appLang.value = langSel.value
                    appLang.dispatchEvent(new Event('change'))
                }
            })
        }
    } else {
        extraEl.innerHTML = ''
    }

    // Elevate target (and optional containers) then position card
    const rect = elevate(step.target, step.containers || [])
    positionCard(rect)
}

function nextStep() {
    if (currentStep >= STEPS.length - 1) {
        finish()
        return
    }
    currentStep++
    showStep(currentStep)
}

function finish() {
    try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    } catch (_e) {
        console.debug('onboarding: localStorage write failed', _e)
    }
    restore()
    overlayEl!.remove()
    cardEl!.remove()
    overlayEl = null
    cardEl = null
}

function buildUI() {
    // Full-screen overlay that blocks background clicks
    overlayEl = document.createElement('div')
    overlayEl.id = 'ob-overlay'
    document.body.appendChild(overlayEl)

    // Card with mascot + speech bubble
    cardEl = document.createElement('div')
    cardEl.id = 'ob-card'
    cardEl.innerHTML = `
        <div class="ob-mascot">
            <div class="ob-logo">${FRI3D_LOGO_SVG}</div>
            <div class="ob-bubble">
                <div class="ob-title"></div>
                <div class="ob-text"></div>
            </div>
        </div>
        <div class="ob-extra"></div>
        <div class="ob-footer">
            <span class="ob-step"></span>
            <div class="ob-actions">
                <button class="ob-skip" type="button">Skip tour</button>
                <button class="ob-next" type="button">Next →</button>
            </div>
        </div>
    `
    document.body.appendChild(cardEl)

    cardEl.querySelector('.ob-skip')!.addEventListener('click', finish)
    cardEl.querySelector('.ob-next')!.addEventListener('click', nextStep)
}

export function initOnboarding() {
    try {
        if (localStorage.getItem(ONBOARDING_STORAGE_KEY)) return
    } catch (_e) {
        console.debug('onboarding: localStorage read failed', _e)
        return
    }

    buildUI()
    currentStep = 0
    showStep(currentStep)

    i18next.on('languageChanged', () => {
        if (cardEl) showStep(currentStep)
    })
}
