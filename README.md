# Fri3d-IDE

<!--[![StandWithUkraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://github.com/vshymanskyy/StandWithUkraine/blob/main/docs/README.md) -->
[![GitHub Repo stars](https://img.shields.io/github/stars/DrSkunk/Fri3d-IDE?style=flat-square&color=green)](https://github.com/DrSkunk/Fri3d-IDE/stargazers) 
[![GitHub issues](https://img.shields.io/github/issues-raw/DrSkunk/Fri3d-IDE?style=flat-square&label=issues&color=green)](https://github.com/DrSkunk/Fri3d-IDE/issues) 
[![Build status](https://img.shields.io/github/actions/workflow/status/DrSkunk/Fri3d-IDE/static.yml?branch=main&style=flat-square&logo=github&label=build)](https://github.com/DrSkunk/Fri3d-IDE/actions) 
[![GitHub license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](https://github.com/DrSkunk/Fri3d-IDE) 
[![Support vshymanskyy](https://img.shields.io/static/v1?label=support&message=%E2%9D%A4&color=%23fe8e86)](https://quicknote.io/da0a7d50-bb49-11ec-936a-6d7fd5a2de08) 

**An innovative [MicroPython](https://micropython.org) / [CircuitPython](https://circuitpython.org) IDE for Web and Mobile**

Based on the original [ViperIDE](https://github.com/DrSkunk/Fri3d-IDE) project by vshymanskyy.

[![image](docs/images/visual-main.png)](https://viper-ide.org)

## Features

- **Lightweight and Accessible**
  - Runs entirely in your browser - no installation required
  - Works **offline** on both PC and smartphone
- **Flexible Connectivity**
  - Direct USB connection
  - Wireless/remote options available
- **Powerful Python Development**
  - Real-time code analysis: Spot errors and warnings instantly
  - Integrated Terminal/REPL for interactive coding
  - Basic code completion
  - MicroPython Virtual Machine for experimentation
- **Built-in Management Tools**
  - File explorer and editor
  - Package management system
- ... read more about [features and device support](./docs/Features.md)

## Links

[Fri3d-IDE Online ](https://viper-ide.org)  
[Feedback](./docs/Feedback.md)  
[Documentation](./docs/)  
[Discussion](https://github.com/orgs/micropython/discussions/15219)  

## Testing

This repository includes two layers of regression testing:

- Unit tests with Vitest (fast logic-level checks).
- End-to-end smoke tests with Playwright (main pages load and core controls are present).

Run tests locally:

```sh
npm test
npm run test:watch
npm run test:e2e
```

Playwright notes:

- First-time setup may require browser installation:

```sh
npx playwright install chromium
```

- E2E tests stub the external `https://viper-ide.org/micropython.mjs` dependency to keep runs deterministic and avoid network-related flakes.

## Used software

- [CodeMirror](https://codemirror.net) - Main code editor, MIT
- [Ruff](https://docs.astral.sh/ruff) - Python linter and formatter, MIT
- [Xterm.js](https://xtermjs.org) - REPL Terminal, MIT
- [PeerJS](https://peerjs.com) - P2P/WebRTC connections, MIT
- [MicroPython](https://github.com/micropython/micropython) - Virtual Machine, MIT
- [mpy-cross](https://github.com/micropython/micropython/tree/master/mpy-cross) - Code validation, MIT
- [mpy-tool](https://github.com/micropython/micropython/blob/master/tools/mpy-tool.py) - MPY bytecode disassembler - MIT
- [python-minifier](https://github.com/dflook/python-minifier) - Code minifier, MIT
