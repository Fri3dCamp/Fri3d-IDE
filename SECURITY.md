# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/Fri3dCamp/Fri3d-IDE/security/advisories/new). Do not include badge credentials, Wi-Fi passwords, BadgeHub tokens, private source files, or terminal logs in a public issue.

For ordinary bugs without sensitive information, use the [public issue tracker](https://github.com/Fri3dCamp/Fri3d-IDE/issues).

## Trust boundaries

Fri3d-IDE runs in the browser and can communicate with a physical or virtual badge. Users should treat these inputs as untrusted:

- MPK archives and files selected for upload
- BadgeHub descriptions, metadata, icons, and downloads
- Package indexes and remotely downloaded packages
- Device filenames, file contents, terminal output, and firmware responses
- WebREPL, WebSocket, WebRTC, USB, and Bluetooth peers

The IDE must validate archive paths and layouts, reject traversal outside the intended app directory, limit archive expansion, sanitize rendered HTML, and avoid placing credentials in logs or diagnostics. An installed third-party app executes on the badge with the permissions provided by its firmware; the IDE does not sandbox badge applications.

## Diagnostics privacy

The **Copy diagnostics** action reports the IDE build, browser capabilities, connection type, detected badge/firmware, PWA state, and selected app identifier. It deliberately excludes source files, terminal output, connection URLs, authentication tokens, passwords, and account details. Review the report before attaching it to an issue.

## Deployment guidance

Deploy Fri3d-IDE over HTTPS. Configure security headers at the hosting layer, including a Content Security Policy compatible with the explicitly configured BadgeHub, authentication, WebREPL, relay, WebAssembly, worker, and image endpoints. Test device transports and PWA updates after changing those headers; an overly narrow policy can silently disable required browser APIs.
