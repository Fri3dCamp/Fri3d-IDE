# Changelog

All notable user-facing changes to Fri3d-IDE.

## v1.2.0 — 2026-08-08

### New

- **Changelog in the IDE** — release notes open in a tab once after each
  update, and any time via the About panel or the Welcome tab.

## v1.1.0 — 2026-08-08

### New

- **Welcome tab** — fresh sessions open a VS Code-style Welcome page with
  guided tour launchers (build your first app, install from BadgeHub,
  connect a badge, try the virtual badge) and direct connect buttons.
- **Download files** — a download button next to rename/remove in the file
  manager saves any device file through the browser.
### Improved

- The floating virtual badge panel is now transparent around the badge
  outline instead of a dark box.
- The popped-out virtual badge window follows the IDE theme: white backdrop
  in light mode, black in dark mode.
- First-app guide: clearer joystick game instructions, step solutions, and
  a logging step.
- Screenshots capture at the device's real resolution.

## v1.0.0

Initial Fri3d-IDE release, adapted from [ViperIDE](https://github.com/vshymanskyy/ViperIDE):

- Connect a Fri3d badge over USB, Bluetooth, or WebREPL — or run the
  MicroPythonOS **virtual badge** in the browser, no hardware needed.
- File manager with upload (including recursive folder upload), create,
  rename, and remove.
- Code editor with Python linting, markdown/SVG/image/hex viewers, and
  session recovery for unsaved work.
- App development: templates, `.mpk` export, and BadgeHub publish/install.
- Guided onboarding tours and a step-by-step first-app guide.
- Terminal with collapse/expand, package manager, themes, Dutch
  translation, and PWA install.
