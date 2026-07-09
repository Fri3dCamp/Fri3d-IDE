# Fri3d-IDE — Copilot Cloud Agent Instructions

## Project Overview

Fri3d-IDE is a **browser-based IDE for MicroPython and CircuitPython** that runs entirely in the browser (no server side). It connects to physical microcontroller boards via WebUSB/Serial, WebBluetooth, WebREPL (WebSocket), or P2P/WebRTC, and also provides an in-browser MicroPython Virtual Machine powered by WebAssembly.

The stack is **Vite + React + TypeScript**. React renders the static page shells; the interactive IDE logic lives in imperative TypeScript controller modules that manipulate that DOM directly (a strangler-fig migration — new UI work should move state into React over time).

---

## Repository Layout

```
/
├── index.html              # IDE page (loads /src/ui/ide/main.tsx)
├── bridge.html             # P2P bridge page (loads /src/ui/bridge/main.tsx)
├── benchmark.html          # Device benchmark page (loads /src/ui/benchmark/main.tsx)
├── src/
│   ├── ui/                 # React components (TSX)
│   │   ├── legacy.ts       # Typed accessors for the legacy window.app API
│   │   ├── ide/            # main.tsx, App.tsx, ToolPanel, SideMenu, SettingsMenu, ...
│   │   ├── bridge/         # main.tsx, BridgePage.tsx
│   │   └── benchmark/      # main.tsx, BenchmarkPage.tsx
│   ├── app.ts              # Main IDE controller (imperative; loaded after React mounts)
│   ├── bridge.ts           # Bridge page controller
│   ├── benchmark.ts        # Benchmark page controller
│   ├── app_worker.ts       # Service worker (bundled unhashed to /app_worker.js)
│   ├── viper_lib.ts        # Re-export library shared by bridge/benchmark
│   ├── editor.ts           # CodeMirror 6 editor setup and linting integration
│   ├── editor_tabs.ts      # Tab management for the file editor
│   ├── transports.ts       # WebSerial, WebBluetooth, WebSocketREPL, WebRTCTransport
│   ├── rawmode.ts          # MicroPython raw REPL protocol (MpRawMode class)
│   ├── emulator.ts         # In-browser MicroPython WASM VM
│   ├── python_utils.ts     # Ruff WASM validation, mpy-cross compilation, minification
│   ├── package_mgr.ts      # MIP-compatible package manager
│   ├── connection_uid.ts   # P2P connection UID encoding/decoding
│   ├── utils.ts            # General utilities (sleep, Mutex, DOM helpers, etc.)
│   ├── assistant/          # AI assistant (providers, context collection, panel UI)
│   ├── onboarding.ts       # First-run tour
│   ├── types/globals.d.ts  # Global declarations (VIPER_IDE_*, loadMicroPython, window.*)
│   ├── lang/               # i18n JSONs + index.ts that bundles them (import.meta.glob)
│   ├── manifest.json       # Version manifest template (written to public/manifest.json)
│   ├── tools_vfs/          # Packed to public/assets/tools_vfs.tar.gz by prepare script
│   └── vm_vfs/             # Packed to public/assets/vm_vfs.tar.gz by prepare script
├── public/                 # Served verbatim (favicons, site.webmanifest, assets/)
│   └── assets/             # Committed images + GENERATED wasm/tars/mpos (gitignored)
├── scripts/prepare.mjs     # Fetches/generates public/ assets (runs via pre* npm hooks)
├── tests/unit/             # Vitest (happy-dom)
├── tests/e2e/              # Playwright (chromium, stubs /micropython.mjs)
├── vite.config.ts          # MPA build: index/bridge/benchmark + app_worker entry
├── tsconfig.json           # strict; allowJs during migration
└── build/                  # ⚠️ GENERATED build output — do not edit, git-ignored
```

---

## Build System

```sh
npm install
npm run dev      # prepare assets + Vite dev server
npm run build    # prepare assets + tsc + eslint + vite build → build/
npm run preview  # serve the production build
```

`scripts/prepare.mjs` (runs automatically via `predev`/`prebuild`):
1. Downloads the MicroPythonOS web build into `public/assets/mpos/` (version-stamped, cached).
2. Downloads `python-minifier` into `src/tools_vfs/lib/python_minifier/` (git-ignored).
3. Packs `src/tools_vfs/` and `src/vm_vfs/` to `public/assets/*.tar.gz`.
4. Copies wasm runtimes (`micropython.wasm`, `mpy-cross-v6.wasm`, `ruff_wasm_bg.wasm`) and `micropython.mjs` from `node_modules/` into `public/`.
5. Writes `public/manifest.json` with the version from `package.json`.

Vite `define` injects `VIPER_IDE_VERSION` (string) and `VIPER_IDE_BUILD` (timestamp). Do not declare or assign these — they are replaced textually and declared in `src/types/globals.d.ts`.

The service worker (`src/app_worker.ts`) is a separate Vite entry emitted unhashed at `/app_worker.js`; it precaches the wasm/tar assets (which therefore must keep stable unhashed paths under `public/assets/`) and runtime-caches the hashed build output.

---

## Architecture Notes

### React shell + legacy controllers
Each page's `main.tsx` renders the full static DOM with React (`flushSync`), **then** dynamically imports the legacy controller (`src/app.ts` etc.), which queries and mutates that DOM at import time. Consequences:
- The React component trees must stay **stateless and render-once**; re-renders would fight FontAwesome `dom.watch()`, `applyTranslation()`, xterm, and the file tree, which all mutate the same DOM.
- React event handlers call the controller through `window.app` (see `src/ui/legacy.ts`); dynamically generated HTML (file tree, dialogs) still uses inline `onclick="app.*"` strings, so `window.app` must keep its API.

### Transport Abstraction (`transports.ts`)
All device connections implement the abstract `Transport` class: `requestAccess()`, `connect()`/`disconnect()`, `write(data)`, `writeBytes(bytes)`, callbacks `onActivity`/`onReceive`/`onDisconnect`. Concrete: `WebSerial`, `WebBluetooth`, `WebSocketREPL`, `WebRTCTransport`.

### MicroPython Raw REPL (`rawmode.ts`)
`MpRawMode.begin(port)` enters raw REPL; all file system operations go through `exec()`.

### In-Browser VM (`emulator.ts`)
`MicroPythonWASM` extends `Transport` and runs MicroPython WASM in-process; `MicroPythonOSWASM` boots the MicroPythonOS build from `/assets/mpos/`.

### Python Tooling (`python_utils.ts`)
Ruff WASM (validate/format), mpy-cross v6 (compile), python-minifier + mpy-tool (via `tools_vfs` VFS). All WASM/tar assets load from local `/assets/` in both dev and prod.

---

## Code Style and Conventions

- TypeScript strict mode; legacy modules may keep pragmatic `any` casts, new code should be properly typed.
- **No semicolons** in most legacy modules — match the style of the file you edit.
- Use `const`/`let`, arrow functions, `async`/`await`.
- DOM utilities (`QS`, `QSA`, `QID`) from `utils.ts` — prefer these over `document.querySelector`.
- `report(title, err)` from `utils.ts` for user-visible error toasts.
- i18n: `T('key', 'fallback')` where `T = i18next.t.bind(i18next)`; keys live in `src/lang/en.json` (canonical locale).
- Every source file starts with the SPDX MIT header used across `src/`.

---

## How to Validate

```sh
npm run typecheck   # tsc
npm run lint        # eslint .
npm test            # vitest unit tests
npm run test:e2e    # Playwright (chromium; may need: npx playwright install chromium)
npm run build       # full production build (runs tsc + eslint too)
```

CI (`.github/workflows/test.yml`) runs typecheck, lint, unit and e2e tests; `static.yml` builds and deploys `build/` to GitHub Pages.

---

## Common Pitfalls

1. **Do not edit `build/`** — regenerated on every build.
2. **Generated `public/` content** (mpos, tars, wasm, `micropython.mjs`, `manifest.json`) is git-ignored — never commit it; `scripts/prepare.mjs` recreates it.
3. **The prepare script downloads from the internet** (GitHub releases). Offline: it reuses previously fetched copies if present.
4. **Keep the React shells render-once** — no `useState` in `src/ui/ide/**`; dynamic behavior belongs in the controllers until state is deliberately migrated into React.
5. **`window.app` naming**: `<body id="app">` means `window.app` is the body element until the controller overwrites it — feature-detect with `typeof window.app.someMethod === 'function'` (the e2e tests do this).
6. **Stable asset paths**: the service worker precache list and `BASE_URL` consumers rely on unhashed `/assets/...` paths served from `public/`.
