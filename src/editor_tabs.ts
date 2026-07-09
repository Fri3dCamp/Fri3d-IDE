import { addUpdateHandler } from './editor'
import { QSA, QS, QID } from './utils'
import { showConfirmDialog, T } from './app'
import type { EditorView } from '@codemirror/view'


let currentTab = 0
let connected = false

/** Detail payload of the "tabActivated" / "tabClosed" CustomEvents dispatched by this module */
export interface TabEventDetail {
    fn: string
    editorElement: HTMLElement
}

/** Detail payloads of the CustomEvents this module listens for */
interface PathEventDetail {
    path: string
}

interface FileRenamedDetail {
    old: string
    new: string
}

interface FileEventDetail {
    fn: string
}

interface EditorLoadedDetail {
    fn: string
    editor: EditorView
}


/**
 *
 * @param {string} fn The file name (full path) to activate a tab for. If the tab already exists,
 * it will be selected
 * @returns {boolean} Returns true if a tab matching the given file name is found, else false
 */
export function displayOpenFile(fn: string): boolean {
    const openTab = QS(`#editor-tabs [data-fn="${CSS.escape(fn)}"]`) as HTMLElement | null
    if (!openTab) {
        return false
    }

    // if we found it already open, then show it and hide the rest
    _activateTab(openTab.dataset.tab)
    return true
}

/**
 *
 * @param {string} fn The file name (full path) that the tab will represent
 * @returns {HTMLElement} The element that will contain the file editor
 */
export function createTab(fn: string, _content?: string): HTMLElement {
    const tabContainer = QID("editor-tabs")!
    const terminal = QID("terminal-container")!

    _deactivateTabs()

    currentTab++
    tabContainer.insertAdjacentHTML(
        'beforeend',
        `<div class="tab active" data-tab="${currentTab}" data-fn="${fn}"">
            <span class="tab-title">${fn}</span>
            <a class="menu-action" title="Close">
                <i class="fa-solid fa-xmark"></i>
            </a>
        </div>
        `
    )
    _addNewFileButton()
    terminal.insertAdjacentHTML(
        'beforebegin',
        `<div class="editor-tab-pane active" data-pane="${currentTab}"><div class="editor"></div></div>`
    )

    const editorTabElement = QS(`#editor-tabs [data-tab="${currentTab}"]`) as HTMLElement
    editorTabElement.addEventListener("click", (_event) => {
        _activateTab(editorTabElement.dataset.tab)
    })
    const closeButton = editorTabElement.querySelector(".menu-action")!

    function close_tab(event: Event) {
        event.stopPropagation()
        _closeTab(editorTabElement.dataset.tab)
    }
    closeButton.addEventListener("click", close_tab)
    editorTabElement.addEventListener("auxclick", close_tab)

    const editorTabTitle = editorTabElement.querySelector(".tab-title")!
    editorTabTitle.textContent = fn.split("/").pop()!
    editorTabElement.dataset.fn = fn
    if (fn == "Untitled") {
        editorTabElement.classList.add("changed")
    }

    const editorElement = QS(`.editor-tab-pane[data-pane="${currentTab}"] .editor`) as HTMLElement
    _activateTab(editorTabElement.dataset.tab)
    return editorElement
}


/**Event Listeners **/

document.addEventListener("fileRemoved", ((event: CustomEvent<PathEventDetail>) => {
    const tab = QS(`#editor-tabs [data-fn="${CSS.escape(event.detail.path)}"]`) as HTMLElement | null
    if (tab) {
        _closeTab(tab.dataset.tab)
    }
}) as EventListener)

document.addEventListener("dirRemoved", ((event: CustomEvent<PathEventDetail>) => {
    (QSA(`#editor-tabs [data-fn^="${CSS.escape(event.detail.path)}/"]`) as HTMLElement[]).forEach((tab) => {
        _closeTab(tab.dataset.tab)
    })
}) as EventListener)

document.addEventListener("fileRenamed", ((event: CustomEvent<FileRenamedDetail>) => {
    const editorTab = QS(`#editor-tabs [data-fn="${CSS.escape(event.detail.old)}"]`) as HTMLElement
    editorTab.dataset.fn = event.detail.new
    editorTab.querySelector(".tab-title")!.textContent = event.detail.new.split("/").pop()!
}) as EventListener)

document.addEventListener("fileSaved", ((event: CustomEvent<FileEventDetail>) => {
    const editorTab = QS(`#editor-tabs [data-fn="${CSS.escape(event.detail.fn)}"] .tab-title`)!
    editorTab.classList.remove("changed")
}) as EventListener)

document.addEventListener("editorLoaded", ((event: CustomEvent<EditorLoadedDetail>) => {
    const editorTab = QS(`#editor-tabs [data-fn="${CSS.escape(event.detail.fn)}"] .tab-title`)!
    addUpdateHandler(event.detail.editor, (update) => {
        if (update.docChanged) {
            editorTab.classList.add("changed")
        }
    })
}) as EventListener)

document.addEventListener("deviceConnected", (_event) => {
    connected = true
    _addNewFileButton()
})


/** Helper Functions **/

async function _closeTab(index: string | undefined) {
    const tabElement = QS(`#editor-tabs .tab[data-tab="${index}"]`) as HTMLElement
    const titleElement = tabElement.querySelector(".tab-title")!
    const tabSelected = tabElement.classList.contains("active")
    const editorElement = QS(`.editor-tab-pane[data-pane="${index}"]`) as HTMLElement
    const fn = tabElement.dataset.fn!

    if (titleElement.classList.contains("changed")) {
        const confirmed = await showConfirmDialog(
            T('files.confirm-close-unsaved', '{{fn}} has unsaved changes. Close without saving?', { fn, interpolation: { escapeValue: false } })
        )
        if (!confirmed) {
            return
        }
    }

    let nextSelectedTab = tabElement.nextElementSibling as HTMLElement | null
    if (!nextSelectedTab || nextSelectedTab.dataset.new) {
        nextSelectedTab = tabElement.previousElementSibling as HTMLElement | null
    }
    tabElement.remove()
    editorElement.remove()

    document.dispatchEvent(new CustomEvent<TabEventDetail>("tabClosed", {detail: {fn: fn, editorElement: editorElement}}))

    if (!tabSelected) {
        return
    }

    if (nextSelectedTab && nextSelectedTab.dataset.tab) {
        _activateTab(nextSelectedTab.dataset.tab)
    } else {
        createTab("Untitled", "")
        _activateTab(currentTab)
    }
}


function _activateTab(index: string | number | undefined) {
    _deactivateTabs()
    const tabElement = QS(`#editor-tabs .tab[data-tab="${index}"]`) as HTMLElement
    const editorElement = QS(`.editor-tab-pane[data-pane="${index}"]`) as HTMLElement

    tabElement.classList.add("active")
    editorElement.classList.add("active")
    const fn = tabElement.dataset.fn!

    document.dispatchEvent(new CustomEvent<TabEventDetail>("tabActivated", {detail: {fn: fn, editorElement: editorElement}}))
}


function _deactivateTabs() {
    QSA("#editor-tabs .tab").forEach((tab) => {
        tab.classList.remove("active")
    })
    QSA(".editor-tab-pane").forEach((pane) => {
        pane.classList.remove("active")
    })
}


function _addNewFileButton() {
    if (!connected) return;

    const editorTabs = QID("editor-tabs")!
    const newFileButton = QS("[data-new='new']")
    if (newFileButton) {
        newFileButton.remove()
    }
    editorTabs.insertAdjacentHTML('beforeend', `<a class="tab" data-new="new" href="#" title="New File" onclick="app.createNewFile('/')">+</a>`)
}
