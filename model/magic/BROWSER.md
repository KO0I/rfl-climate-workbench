# MagIC in Planet Lab

Upstream: https://github.com/magic-sph/magic

Pinned revision: `0d408831fd38ac72c52d53dd091a3ccaabce5207` (retrieved 2026-09-13).
The `src/` directory and `LICENSE` are unmodified upstream files. MagIC is GPL-3.0.
Documentation: https://magic-sph.github.io/

The browser runs the actual serial double-precision Fortran equations. It uses
the upstream native spherical harmonics, Fourier/Chebyshev transforms, matrix
solvers, and CNAB2 timestepper. There is no MPI, OpenMP, SHTns, magnetic field,
remote compute server, cloud microphysics, or neural/procedural replacement.

`scripts/build-magic.py` selects the serial built-in transforms and applies only
these source changes to a temporary build directory:

- The main program becomes the callable `browser_run` subroutine.
- Input comes from a fixed `input.nml` in the worker's virtual filesystem.
- A C callback between steps yields periodically for pause messages.
- Another callback reads each completed G-file and sends its data to the page.
- Unused `omp_lib` imports are removed for the serial build.

`scripts/magic-flang.py` adapts flang-wasm's host-sized runtime declarations:
clock results, allocation/pointer bounds, integer diagnostics, EXIST inquiries,
and C pointer metadata slots. Static pointer slots keep their original eight-byte
size and alignment, with a relocatable wasm32 pointer and zero high bits.
`build-magic-runtime.py` also aligns runtime special-binding pointers to those
metadata slots. Numerical Fortran data types and expressions are not changed.

Use the existing toolchain fetch/configuration scripts in the site source:

```
python3 scripts/fetch-toolchain.py /absolute/toolchain
python3 scripts/configure-tools.py /absolute/toolchain
python3 scripts/fetch-runtime.py /absolute/llvm-source
export EM_CONFIG=/absolute/toolchain/emscripten.config
python3 scripts/build-magic-runtime.py /absolute/toolchain/opt /absolute/llvm-source /absolute/magic-runtime
export EXO_FORTRAN_RUNTIME=/absolute/magic-runtime/libFortranRuntime.a
python3 scripts/build-magic.py /absolute/toolchain/opt
node --test scripts/test-magic.mjs
```

The runtime scripts pin flang-wasm v21.1.8 and its matching LLVM sources. Engine
and runtime license texts are included with the source download.

The page fetches protected assets through its authenticated session, then transfers
the engine to a Blob worker. Workers make no asset requests. Pause preserves the
solver; Stop terminates the worker. A subsequent run always uses a fresh worker.
The page retains at most 32 sampled frames. Each graph is removed from the virtual
filesystem after transfer, preventing graph files from accumulating in Wasm memory.

Horizontal resolution is 128 × 64 (17 radial levels) or
192 × 96 (25 radial levels): twice the original longitude and latitude counts,
with radial grids unchanged. The same dynamically allocated Wasm engine supports
both grids without recompilation. Display maps are 768 × 384; the globe is
512 × 512. These display dimensions are separate from the computational grid.
Higher resolution costs more computation and replay memory.

The visible controls are bounded exploration ranges, not a scientifically validated
parameter domain. In particular, smaller Ekman numbers and stronger forcing may
need much finer grids and longer integration. The presets are authored shell
experiments; they are not reconstructions of Jupiter, Saturn, or Neptune.

The shell view uses actual G-file velocities and entropy at a selected radius.
It preserves the Gaussian colatitudes and longitude-major array ordering in JSON
exports. Screen maps resample to a 2:1 longitude/latitude rectangle. Entropy anomaly
subtracts the Gaussian-area-weighted horizontal mean. Appearance palettes color
that anomaly; they do not solve condensation, visible cloud coverage, or radiation.
Velocity uses ν/d and time uses d²/ν. Rotations are t/(2πE). No dimensional wind
speed or Kelvin temperature is inferred from these dimensionless experiments.

See the root `VALIDATION.md` for the checks actually completed and their limits.
