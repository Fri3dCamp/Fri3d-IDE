# Contributing to Fri3d-IDE

Thanks for your interest in contributing to **Fri3d-IDE**!

Fri3d-IDE is a browser-based IDE for developing software for Fri3d Camp boards and other MicroPython devices. It is based on the ViperIDE project and is built with React, TypeScript, Vite, CodeMirror, xterm.js, Tailwind CSS, Zustand, and browser device APIs.

Contributions of all sizes are welcome, including:

* Bug fixes
* Device compatibility improvements
* Editor and terminal improvements
* Documentation
* Translations
* Accessibility improvements
* Automated tests
* PWA and offline improvements
* UI refinements

## Before you start

For small and clearly scoped fixes, feel free to open a pull request directly.

For larger changes—especially changes to device transports, the MicroPython REPL protocol, file operations, package management, application architecture, or the user interface—please open an issue first. This allows maintainers and contributors to agree on an approach before significant work is done.

When working on an existing issue, leave a comment so others know that someone is investigating it.

Because Fri3d-IDE is derived from ViperIDE, please mention in your issue or pull request whether a change is:

* Specific to Fri3d Camp hardware or documentation
* A general MicroPython IDE improvement
* Adapted from an upstream ViperIDE change

Preserve existing copyright notices and attribution when moving or adapting upstream code.

## Development setup

### Prerequisites

You will need:

* Node.js 22, recommended to match the deployment environment
* npm
* A modern Chromium-based browser
* Optionally, a compatible MicroPython device

A physical device is not required for many UI, editor, translation, and unit-test contributions. The onboarding demo can exercise some device-facing behaviour without a real connection.

Web Serial and Web Bluetooth generally require a secure browser context. Use `localhost` during development or HTTPS when testing a deployed build.

### Install and run

Fork the repository and clone your fork:

```bash
git clone https://github.com/YOUR-USERNAME/Fri3d-IDE.git
cd Fri3d-IDE
```

Install the locked dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Open the URL shown by Vite, normally:

```text
http://localhost:5173
```

## Available commands

### Development server

```bash
npm run dev
```

Starts the Vite development server.

### Production build

```bash
npm run build
```

Runs the TypeScript compiler, Oxlint, and the Vite production build. The generated application is written to `dist/`.

### Linting

```bash
npm run lint
```

Runs Oxlint.

### Type checking

```bash
npm run typecheck
```

Runs the TypeScript project build without creating the web application bundle.

### Tests

```bash
npm test
```

Runs the Vitest test suite once.

```bash
npm run test:watch
```

Runs Vitest in watch mode.

### Preview

```bash
npm run preview
```

Serves the production build locally. Use this when testing production-specific or PWA behaviour.

## Project structure

The most relevant areas of the repository are:

```text
src/
├── components/
│   ├── chrome.tsx          Shared application chrome and status UI
│   └── dialogs.tsx         Dialog and confirmation infrastructure
│
├── domain/
│   ├── connection_uid.ts   Connection identity handling
│   ├── package_mgr.ts      MicroPython package-management logic
│   ├── python_utils.ts     Python source utilities
│   ├── rawmode.ts          MicroPython raw REPL handling
│   ├── transports.ts       Serial, Bluetooth, WebSocket and P2P transports
│   └── utils.ts            Shared domain utilities
│
├── features/
│   ├── editor/             Code editor and tabs
│   ├── onboarding/         Guided onboarding and demo behaviour
│   ├── side-menu/          Files, packages and related panels
│   ├── terminal/           Serial terminal and REPL interface
│   └── toolbar/            Connection and application controls
│
├── i18n/
│   ├── locales/            Translation JSON files
│   └── index.ts            Internationalisation configuration
│
├── services/
│   ├── apps.service.ts
│   ├── device.service.ts
│   ├── files.service.ts
│   ├── format.service.ts
│   ├── packages.service.ts
│   ├── ruff.ts
│   └── theme.ts
│
├── stores/                 Zustand state stores
├── App.tsx                 Main application shell
├── index.css               Global styles
└── main.tsx                Application entry point

tests/                      Vitest tests
public/                     Static assets
vite.config.ts              Vite, Tailwind and PWA configuration
vitest.config.ts            Vitest configuration
.oxlintrc.json              Oxlint configuration
.github/workflows/          GitHub Pages deployment
```

## Development guidelines

### Keep changes focused

Prefer small pull requests that solve one problem.

Avoid combining a feature or bug fix with unrelated:

* Refactoring
* Dependency upgrades
* File renaming
* Formatting changes
* Translation rewrites

Do not commit:

* `node_modules/`
* The generated `dist/` directory
* Editor-specific settings not already tracked by the project
* Personal device files or backups
* Serial logs containing private data
* Credentials, access tokens, Wi-Fi passwords, or device secrets

### TypeScript and React

* Use TypeScript for new application code.
* Avoid introducing `any` where an appropriate type can reasonably be defined.
* Keep domain and protocol logic separate from React components.
* Put reusable device operations in the appropriate service or domain module.
* Use the existing Zustand stores for shared application state.
* Prefer local component state for state that does not need to be shared.
* Clean up browser event listeners, timers, streams, readers, writers, and subscriptions.
* Handle rejected promises from device and browser APIs.
* Avoid changing unrelated formatting. The repository currently uses a linter but no automatic formatting script.

When adding a new feature, follow the existing feature-oriented structure rather than placing unrelated components in the root `components` directory.

### Device transport changes

Transport code is particularly sensitive because behaviour varies by browser, operating system, firmware, and physical device.

The project supports several connection methods, including:

* Web Serial
* Web Bluetooth
* WebSocket REPL
* WebRTC/P2P bridging

When changing a transport:

* Test connection and disconnection.
* Test user-cancelled permission prompts.
* Test unexpected device removal.
* Test reconnecting after a failure.
* Test partial, delayed, and fragmented reads.
* Ensure readers, writers, streams, Bluetooth notifications, and peer connections are released.
* Preserve useful error information for the user.
* Avoid silently retrying operations that may write to or alter a device.
* Confirm that unsupported browser APIs fail gracefully.
* Do not assume that all devices use identical packet sizes or timing.

If you cannot test a particular connection method, state that clearly in your pull request.

### MicroPython REPL and raw mode

Changes to raw REPL handling can affect file transfers, code execution, package installation, and recovery after errors.

When modifying REPL or raw-mode code:

* Handle timeouts explicitly.
* Restore the device to a usable state after an error.
* Account for fragmented responses.
* Avoid leaving the device in raw REPL unintentionally.
* Test interruptions and syntax errors.
* Test an unexpected disconnect during an operation.
* Avoid destructive commands unless the user has explicitly requested the operation.
* Include relevant firmware and device details in your test notes.

### Files and packages

When changing file or package operations:

* Test both files and directories.
* Test empty files and empty directories.
* Test Unicode names where supported.
* Test replacing an existing file.
* Test failure partway through an upload or download.
* Keep the local editor state and device file state consistent.
* Avoid overwriting unsaved editor content without confirmation.
* Make progress and failure states understandable.
* Ensure temporary state is cleared when an operation fails.

Do not include third-party package archives or firmware binaries in a pull request unless their licence clearly permits redistribution and they are necessary for the project.

### Editor changes

The editor is based on CodeMirror and supports multiple tabs and several file formats.

When changing editor behaviour:

* Test new, opened, modified, saved, and closed tabs.
* Test unsaved-change prompts.
* Test keyboard navigation and selection.
* Test undo and redo.
* Test syntax highlighting for affected languages.
* Test large files where relevant.
* Preserve existing keyboard shortcuts.
* Avoid intercepting browser or operating-system shortcuts unnecessarily.
* Check both light and dark themes.
* Check that editor state remains correct after reconnecting a device.

The main application currently defines shortcuts including:

* `Ctrl/Cmd+S` to save
* `F5` to run
* `Ctrl/Cmd+D` to perform a soft reboot

Changes to global shortcuts should be discussed in an issue first.

### Terminal changes

The terminal uses xterm.js and communicates with connected devices in real time.

When changing terminal behaviour:

* Test normal REPL input and output.
* Test pasted multiline content.
* Test control characters.
* Test resizing the terminal.
* Test reconnecting a device.
* Test high-volume output.
* Check for duplicated or dropped data.
* Ensure terminal listeners and resources are disposed of correctly.

Avoid logging complete terminal sessions by default. Device output may contain private source code, credentials, or network configuration.

### Python formatting and linting

Fri3d-IDE uses Ruff compiled to WebAssembly for Python-related tooling.

When changing formatting or Python diagnostics:

* Test valid and invalid Python.
* Test incomplete code while the user is typing.
* Test Unicode source files.
* Keep editor diagnostics responsive.
* Avoid blocking the main browser thread for long operations.
* Handle failure to load or initialise the WebAssembly module.
* Make changes to generated source only when the user explicitly requests them.

### User interface and accessibility

When changing the interface:

* Test keyboard-only navigation.
* Preserve visible focus indicators.
* Use meaningful accessible labels for icon-only controls.
* Keep dialogs reachable and dismissible by keyboard.
* Check narrow and wide viewports.
* Test both light and dark themes.
* Avoid relying on colour alone to communicate status.
* Make errors actionable rather than only reporting that something failed.
* Include screenshots or a short recording for visible changes.

The application supports a responsive layout, so check both desktop and smaller-screen behaviour.

### Translations

User-facing text should use the existing i18next translation system.

When adding or changing text:

* Add or update the English source string.
* Reuse an existing translation key when it represents the same meaning.
* Keep placeholders and interpolation variables unchanged across locales.
* Do not rename translation keys without updating every reference.
* Keep JSON valid and consistently structured.
* Update translations you can review confidently.
* Do not add unreviewed machine translations merely to fill every locale.
* Check that longer translations do not break the layout.
* Check right-to-left layout when changing shared UI structure.

A translation-only pull request is welcome. Include the language and the parts of the interface reviewed in the pull-request description.

### PWA and offline behaviour

Fri3d-IDE is configured as a progressive web application with an automatically updating service worker.

Test PWA changes using a production build:

```bash
npm run build
npm run preview
```

Check:

* A clean first load
* Reload after the service worker is installed
* Updates from an older cached version
* Offline startup
* Missing or unavailable network resources
* Assets served from a repository subpath
* Installed standalone mode
* Removal or renaming of previously cached files

When debugging service-worker behaviour, unregister old service workers or use a clean browser profile so stale caches do not hide problems.

### Dependencies

Avoid adding a dependency when the required behaviour can be implemented clearly with existing browser APIs or the current dependency set.

When adding or upgrading a dependency:

* Explain the reason in the pull request.
* Prefer actively maintained and narrowly scoped packages.
* Review browser compatibility.
* Review the licence.
* Consider bundle-size and offline-cache impact.
* Run `npm install` to update both `package.json` and `package-lock.json`.
* Do not manually edit `package-lock.json`.

## Testing your contribution

Every pull request should pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The build command already includes type checking and linting, but running the individual commands can make failures easier to diagnose.

### Automated tests

Tests use Vitest with the `happy-dom` environment and live in `tests/`.

Add or update tests when changing:

* Domain utilities
* Connection identity behaviour
* Package-management logic
* Python utilities
* Data transformations
* Error handling that can be tested without hardware
* Previously reported regressions

Use descriptive test names that explain the expected behaviour.

Keep hardware-independent logic outside browser and device adapters where practical so it can be tested without a physical board.

### Manual smoke test

For a general browser smoke test:

1. Start the development server.
2. Complete or dismiss the onboarding flow.
3. Create and edit an untitled Python file.
4. Open and close multiple editor tabs.
5. Test save and run keyboard shortcuts.
6. Resize the side menu and terminal.
7. Switch between light and dark themes.
8. Change the interface language.
9. Open the connection controls.
10. Cancel a browser device-selection prompt.
11. Check the browser console for unexpected errors.

When a real MicroPython device is available:

1. Connect to the device.
2. Open the terminal and confirm REPL input and output.
3. List the device filesystem.
4. Open an existing file.
5. Edit and save a file.
6. Run the current file.
7. Perform a soft reboot.
8. Disconnect and reconnect.
9. Confirm that the UI returns to a consistent state after an error.

Do not perform destructive tests on a device containing important files. Back up the device first or use a test board.

Include a testing summary in the pull request, for example:

```text
Tested:
- npm run typecheck
- npm run lint
- npm test
- npm run build
- Chromium on Linux
- Onboarding demo
- Web Serial with a Fri3d Camp badge
- Open, edit, save, run and reconnect flows

Not tested:
- Web Bluetooth
- WebRTC/P2P
- Safari
```

## Reporting bugs

Before opening an issue, check whether a similar issue already exists.

A useful bug report includes:

* A clear description of the problem
* Steps to reproduce it
* Expected behaviour
* Actual behaviour
* Browser name and version
* Operating system
* Device or board model
* MicroPython or CircuitPython version
* Connection method
* Whether the problem occurs in the onboarding demo
* Relevant console errors
* Screenshots or a short recording where useful

For connection problems, also include:

* USB vendor and product IDs, when available
* Bluetooth device name and service type, when relevant
* Whether reconnecting fixes the issue
* Whether another browser or cable was tested
* The stage at which the connection fails

Remove passwords, private source code, device identifiers, Wi-Fi credentials, tokens, and other sensitive information from logs before posting them.

## Making a pull request

1. Update your local `main` branch:

   ```bash
   git switch main
   git pull --ff-only
   ```

2. Create a focused branch:

   ```bash
   git switch -c fix/short-description
   ```

3. Make your changes.

4. Add or update tests.

5. Run the required checks:

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

6. Push the branch to your fork.

7. Open a pull request against `Fri3dCamp/Fri3d-IDE:main`.

Your pull request should explain:

* What changed
* Why the change is needed
* How it was tested
* Which browsers were tested
* Which devices and firmware versions were tested
* Which connection methods were tested
* What was not tested
* Whether the change is Fri3d-specific or generally applicable
* Any user-visible, compatibility, security, or offline impact
* Related issues

Include screenshots or a short recording for visible interface changes.

## Commit messages

There is no required commit-message convention. Use a concise, imperative description of the change:

```text
Fix serial cleanup after disconnect
Add tests for package requirement parsing
Improve keyboard navigation in the file browser
Update Dutch onboarding translations
Handle Bluetooth permission cancellation
```

Avoid vague messages such as:

```text
fix
changes
updates
work in progress
```

## Community expectations

Be respectful, patient, and constructive.

Fri3d Camp welcomes contributors with different levels of experience. Explain decisions clearly, help others learn, and assume good intentions during reviews and technical discussions.

Thank you for helping improve Fri3d-IDE!
