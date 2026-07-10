# Fri3d-IDE

[![StandWithUkraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://github.com/vshymanskyy/StandWithUkraine/blob/main/docs/README.md)

A web-based IDE for MicroPython(OS) development for [Fri3d Camp boards](https://fri3d.be/) and other MicroPython devices.

Forked from the excellent [ViperIDE](https://github.com/vshymanskyy/ViperIDE) project by [vshymanskyy](https://github.com/vshymanskyy).

Available online at [https://fri3dcamp.github.io/Fri3d-IDE/](https://fri3dcamp.github.io/Fri3d-IDE/).

## Development

The project is a Vite + React + TypeScript app that bundles into a single-page application, making it hostable on any static web server.

You need Node.js 18+ and npm 9+ to build and run the project.

Install dependencies and run the development server with:

```sh
npm install
npm run dev      # dev server
npm run build    # production build into build/
npm run preview  # serve the production build
```

## Deployment

The project can be deployed to any static web server. The `build/` directory contains the production build of the app.

