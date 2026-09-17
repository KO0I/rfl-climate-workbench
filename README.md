# Planetary Climate Workbench

A static browser workbench for procedural terrain, rocky-world climate, upper
atmospheres, MagIC gas-shell experiments, and animated Saturn/Jupiter cutaways.
Includes the Chipchirp theme, detailed Jupiter cloud tops, and glass/glowing interiors.

**Start here: [GITHUB_SETUP.md](GITHUB_SETUP.md)** explains how to publish this
repository and include it in `KO0I/KO0I.github.io` as a Git submodule.

## Run locally

From this directory:

```sh
python3 -m http.server 8000 --directory dist
```

Open <http://localhost:8000/>. On Windows, `py -m http.server 8000 --directory dist`
also works. Opening `index.html` directly with `file://` will not load its modules
and simulation assets correctly.

## Deploy

Publish the **contents of `dist/`**, preserving every relative path. This folder
includes the precompiled `.wasm` engines, boundary data, JavaScript, styles,
local Inter fonts, source downloads, and licenses. Hosting does not require Node,
Ruby, Python, a Fortran compiler, an API key, or a server-side simulation service.
Python above is only a convenient local HTTP server.

The browser runs the single-threaded numerical engines inside Web Workers.
The current engines do not require SharedArrayBuffer, COOP, or COEP headers.
The worker loader's `credentials: 'same-origin'` also works on public static
hosting; it does not require a ChatGPT session there.

## Contents

| Path | Purpose |
| --- | --- |
| `dist/` | Complete, ready-to-host app |
| `model/` | Fortran/C sources, boundary data, and provenance |
| `scripts/` | Build tools and existing verification scripts |
| `DEVELOPMENT.md` | Original technical documentation and compiler setup |
| `VALIDATION.md` | Recorded numerical and implementation checks |
| `GITHUB_SETUP.md` | Public GitHub repository and website-submodule instructions |
| `integration/chipchirp/pages.yml` | Deployment workflow to copy into the website repository |
| `LICENSES.md` | Component-specific licensing references |

Edit HTML, CSS, and application JavaScript directly in `dist/`. No frontend build
is needed for these changes. If changing Fortran/C model code, rebuild the affected
engine using the instructions in `DEVELOPMENT.md` and `model/magic/BROWSER.md`,
then commit the updated generated files in `dist/` alongside their source.

Existing tests use Node.js 24 or later; some compare against native C and need a C
compiler. They are optional for publishing an unchanged release. See
`DEVELOPMENT.md` for commands and computational limits.

## Release provenance

Exported September 17, 2026 from the deployed Chipchirp-theme release, source
revision `9fa00d648ca090182add4cec66af6f7b27d9179a`.
The export adds GitHub documentation and a website workflow, fixes the verification
page's back link for subdirectory hosting, and refreshes its bundled source ZIP.
The simulation and rendering code is unchanged. No existing Git history or
Sites-specific hosting configuration is included.

No GitHub repository has been created by this export. Its setup instructions
propose `KO0I/planetary-climate-workbench` as the new public repository.

## Licenses

This distribution includes components under different licenses. Retain their
source and license files. See [LICENSES.md](LICENSES.md); a single blanket MIT
license would not describe the included numerical engines.
