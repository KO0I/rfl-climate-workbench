# Included licenses and provenance

The export preserves existing source notices and license texts. It does not
relicense the upstream components or select a new blanket license for the bundle.

| Component | Existing notice / license | Included reference |
| --- | --- | --- |
| ExoPlaSim and its browser port | GPL-2.0, as stated in the original port documentation | `dist/LICENSE-ExoPlaSim.txt`, `DEVELOPMENT.md` |
| MagIC | GPL-3.0 | `dist/LICENSE-MagIC.txt`, `model/magic/LICENSE`, `model/magic/BROWSER.md` |
| LLVM runtime | Apache-2.0 with LLVM exception | `dist/LICENSE-LLVM.txt` |
| Emscripten | MIT / University of Illinois notices | `dist/LICENSE-Emscripten.txt` |
| flang-wasm build tools | MIT | `dist/LICENSE-flang-wasm.txt` |
| Inter fonts | SIL Open Font License 1.1 | `dist/fonts/OFL-Inter.txt` |
| Reused RFL terrain and XPM optics | Existing source/provenance retained; no new license assigned by this export | `model/rfl-planet-tool/`, `model/terrain-solver/`, `dist/xpm-glass-optics.js`, `DEVELOPMENT.md` |

Keep the numerical source, build scripts, and these notices in the public
repository. The app's source-download links remain included in `dist/`.
The `dist/source.zip` archive is refreshed for this export, including the model
sources and scripts. Runtime/compiler acquisition is documented at pinned
upstream revisions; the multi-gigabyte compiler installation is not bundled.
