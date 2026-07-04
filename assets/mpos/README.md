# MicroPythonOS web artifacts

ViperIDE serves these files as the `vm://` virtual device (MicroPythonOSWASM
in `src/emulator.js`):

- `micropython.js`
- `micropython.wasm`
- `micropython.data`

They are fetched automatically by `npm run build` from the latest
[MicroPythonOS release](https://github.com/MicroPythonOS/MicroPythonOS/releases)
(`MicroPythonOS_web_<version>.zip`). The `.version` stamp file records the
fetched release tag; the download is skipped while it matches the latest tag,
and previously fetched files are reused when GitHub is unreachable.

The build copies `assets/` verbatim into `build/assets/`, so the files are
served from `/assets/mpos/` in both the dev server and production. Everything
here except this README is gitignored (large generated binaries).

To use a locally built copy instead (e.g. while hacking on MicroPythonOS),
overwrite the files after a build, or place them here and set `.version` to a
fake tag to keep the fetcher from replacing them:

```
scripts/build_mpos_web.sh
cp web/micropython.{js,wasm,data} <ViperIDE>/assets/mpos/
```
