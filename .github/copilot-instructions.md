# ViperIDE — Copilot Cloud Agent Instructions

## Project Overview

ViperIDE is a **browser-based IDE for MicroPython and CircuitPython** that runs entirely in the browser (no server side). It connects to physical microcontroller boards via WebUSB/Serial, WebBluetooth, WebREPL (WebSocket), or P2P/WebRTC, and also provides an in-browser MicroPython Virtual Machine powered by WebAssembly.

The live deployment is at https://viper-ide.org, deployed from the `build/` directory to GitHub Pages.

---

## Repository Layout

```
/
├── src/                    # All application source code
│   ├── ViperIDE.html       # Main HTML shell (NOT standalone — CSS/JS injected at build time)
│   ├── app.js              # Main entry point bundled into build/app.js (IIFE)
│   ├── viper_lib.js        # Re-export library bundled into build/viper_lib.js (for embedding)
│   ├── app_worker.js       # Web Worker entry point
│   ├── app.css             # Main application styles
│   ├── app_common.css      # Shared styles (used by both app and viper_lib)
│   ├── editor.js           # CodeMirror 6 editor setup and linting integration
│   ├── editor_tabs.js      # Tab management for the file editor
│   ├── transports.js       # Transport abstraction: WebSerial, WebBluetooth, WebSocketREPL, WebRTCTransport
│   ├── rawmode.js          # MicroPython raw REPL protocol (MpRawMode class)
│   ├── emulator.js         # In-browser MicroPython WASM VM (MicroPythonWASM class)
│   ├── python_utils.js     # Python validation (Ruff WASM), mpy-cross compilation, minification
│   ├── package_mgr.js      # MIP-compatible package manager (micropython-lib + featured index)
│   ├── connection_uid.js   # P2P connection UID encoding/decoding
│   ├── utils.js            # General utilities (sleep, Mutex, DOM helpers, etc.)
│   ├── websocket_relay.js  # WebSocket relay server script (excluded from ESLint)
│   ├── manifest.json       # PWA manifest template (version injected at build time)
│   ├── lang/               # i18n translation files (one JSON per locale, e.g. en.json, uk.json)
│   ├── tools_vfs/          # Virtual filesystem bundled as tools_vfs.tar.gz (mpy-tool.py, python_minifier)
│   └── vm_vfs/             # Virtual filesystem bundled as vm_vfs.tar.gz (MicroPython VM helpers)
├── assets/                 # Static assets copied verbatim to build/ (icons, images)
├── packages/               # viper-tools package directory
├── docs/                   # Markdown documentation (Features.md, USB/BLE/WebREPL guides, etc.)
├── build/                  # ⚠️ GENERATED — do not edit, not committed (git-ignored)
├── build.py                # Python build script (used in CI/GitHub Pages deployment)
├── build.cjs               # Node.js build script (alternative, used by `npm run build`)
├── rollup.config.mjs       # Rollup bundler config (three entry points: app, viper_lib, app_worker)
├── eslint.config.mjs       # ESLint flat-config
├── package.json            # npm dependencies and scripts
└── .github/workflows/static.yml  # GitHub Actions: build (via build.py) + deploy to GitHub Pages
```

---

## Build System

### Two equivalent build scripts
Both produce identical output in `build/`. Use either:

| Script | Command | Notes |
|--------|---------|-------|
| `build.py` | `python3 build.py` | Used in CI (requires `pip install requests`) |
| `build.cjs` | `npm run build` | Node.js alternative |

### What the build does (in order)
1. **Clean** `build/` and recreate it.
2. **Copy** static assets (`assets/`, `webrepl_content.js`).
3. **Generate** `build/translations.json` by merging all `src/lang/*.json` files.
4. **Inject** version from `package.json` into `src/manifest.json` → `build/manifest.json`.
5. **Download** `python-minifier` (from GitHub) into `src/tools_vfs/lib/python_minifier/` (git-ignored).
6. **Pack** `src/tools_vfs/` → `build/assets/tools_vfs.tar.gz`.
7. **Pack** `src/vm_vfs/` → `build/assets/vm_vfs.tar.gz`.
8. **Lint** with ESLint (`npx eslint`).
9. **Bundle** with Rollup (`npx rollup --config`) → produces `build/app.js`, `build/viper_lib.js`, `build/app_worker.js`, `build/app.css`, `build/viper_lib.css`.
10. **Inline** CSS/JS into `build/index.html`, `build/bridge.html`, `build/benchmark.html` (self-contained HTML files).
11. **Delete** intermediate `.js`/`.css` files from `build/`.
12. **Copy** WASM assets from `node_modules/` into `build/assets/` (`micropython.wasm`, `mpy-cross-v6.wasm`, `ruff_wasm_bg.wasm`).

### Dev server (watch mode)
```sh
npm install
npm start    # rollup --config --configDebug --watch + live reload on http://localhost:10001
```
The `--configDebug` flag enables sourcemaps and disables minification.

### Important: `build/` is not committed
The GitHub Actions workflow (`static.yml`) runs `python3 build.py` on every push to `main` and deploys `build/` to GitHub Pages.

---

## Code Style and Conventions

### JavaScript
- **ES Modules** throughout (`import`/`export`), bundled to IIFE by Rollup.
- **No TypeScript** — plain JavaScript with JSDoc comments for type hints where present.
- ESLint flat config in `eslint.config.mjs`:
  - `no-unused-vars`: warn (ignore `_`-prefixed names).
  - `no-use-before-define`: error (functions/variables exempt).
  - `no-undef`: error.
  - Global replacements at build time: `VIPER_IDE_VERSION` (string), `VIPER_IDE_BUILD` (timestamp integer).
  - Excluded from lint: `build/`, `build.cjs`, `src/websocket_relay.js`.
- **No semicolons** are used consistently across source files — do not add them.
- Use `const`/`let`, arrow functions, `async`/`await`.
- DOM utilities (`QS`, `QSA`, `QID`) are exported from `utils.js` — prefer these over `document.querySelector` etc.
- Use `report(title, err)` from `utils.js` for user-visible error reporting (shows a toast notification).
- i18n: use `T('key', 'fallback')` where `T = i18next.t.bind(i18next)`.

### License header
Every source file starts with:
```js
/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */
```
Add this header to any new `.js` source file in `src/`.

### CSS
- Plain CSS, no preprocessors.
- `app_common.css` is shared between the main app and `viper_lib`.

### Translations
- Translation keys live in `src/lang/<locale>.json`.
- `en.json` is the canonical/source locale.
- When adding new UI strings, add a key to `en.json` and use `T('key', 'English fallback')` in code.
- The `_update.py` script in `src/lang/` is a helper for AI-assisted translation updates.

---

## Architecture Notes

### Transport Abstraction (`transports.js`)
All device connections implement the abstract `Transport` class:
- `requestAccess()` — browser permission prompt.
- `connect()` / `disconnect()`.
- `write(data)` — chunked writes (128 bytes default).
- `writeBytes(bytes)` — implemented by each subclass.
- Callbacks: `onActivity`, `onReceive`, `onDisconnect`.

Concrete implementations: `WebSerial`, `WebBluetooth`, `WebSocketREPL`, `WebRTCTransport`.

### MicroPython Raw REPL (`rawmode.js`)
`MpRawMode` encapsulates the MicroPython raw REPL protocol (Ctrl-A / Ctrl-D):
- `MpRawMode.begin(port)` — interrupt board, enter raw REPL, import `sys`/`os`.
- `exec(code)` — execute Python code on the board, return stdout/stderr.
- All file system operations (list, read, write, remove) go through `exec()`.

### In-Browser VM (`emulator.js`)
`MicroPythonWASM` extends `Transport` and runs MicroPython WASM in-process. Implements the same `Transport` interface so the rest of the app treats it identically to a real device.

### Python Tooling (`python_utils.js`)
- **Ruff WASM**: lint/format Python in the browser — `validatePython(code, filename)`.
- **mpy-cross v6**: compile `.py` → `.mpy` bytecode in browser — `compilePython(code)`.
- **python-minifier**: minify Python (loaded from `tools_vfs.tar.gz` virtual FS).
- **mpy-tool**: disassemble `.mpy` bytecode.
- All WASM assets are loaded from `https://viper-ide.org/assets/` at runtime.

### Package Manager (`package_mgr.js`)
Implements the MicroPython MIP protocol. Fetches package indexes from:
- `https://micropython.org/pi/v2` (official micropython-lib)
- `https://vsh.pp.ua/mip-featured` (curated featured packages)

---

## Key Build Replacements

At bundle time Rollup replaces these global identifiers:

| Identifier | Value |
|---|---|
| `VIPER_IDE_VERSION` | `"0.5.2"` (from `package.json`) |
| `VIPER_IDE_BUILD` | Unix timestamp (ms) at build time |

Do not assign to or declare these names — they are replaced textually.

---

## How to Lint and Validate

```sh
# Lint only (fast, no bundling)
npx eslint

# Full build (lint + bundle + inline)
npm run build        # via Node.js build script
# OR
python3 build.py     # via Python build script (requires: pip install requests)
```

There are **no automated tests** in this repository. Validation is done via ESLint and manual browser testing.

---

## Common Pitfalls

1. **Do not edit `build/`** — it is fully regenerated on every build.
2. **`src/tools_vfs/lib/python_minifier/`** is git-ignored and downloaded at build time from GitHub. Do not commit it.
3. **`src/ViperIDE.html` is not a standalone page** — CSS/JS links in it are replaced with inline content at build time by the `combine()` step.
4. **The build downloads from the internet** (`python-minifier` release ZIP). If the build environment has restricted network access, this step will fail. Work around: pre-populate `src/tools_vfs/lib/python_minifier/` manually.
5. **`translations.json`** is generated into `build/` and then imported by `app.js` at bundle time — so a clean build is needed to pick up translation changes.
6. **ESLint will throw on any warning** because `onwarn` in `rollup.config.mjs` is set to `throw` — keep the code warning-free.
7. **`VIPER_IDE_VERSION` and `VIPER_IDE_BUILD`** are bare globals — ESLint knows about them via `eslint.config.mjs` globals; do not import or declare them.

---

## Adding a New Feature (Checklist)

- [ ] Add source in `src/` (with SPDX license header).
- [ ] Export from `viper_lib.js` if it should be part of the embeddable library.
- [ ] Add any new UI strings to `src/lang/en.json` and use `T('key', 'fallback')`.
- [ ] Run `npx eslint` — fix all errors before bundling.
- [ ] Run `npm run build` to verify the full build succeeds.
- [ ] If adding new static assets (non-npm), place them in `assets/` or a virtual FS directory (`src/vm_vfs/` or `src/tools_vfs/`).
- [ ] Update `docs/Features.md` if the feature is user-visible.
