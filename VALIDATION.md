# Verification · 2026-09-11

## MagIC doubled horizontal resolution · 2026-09-14

Both supported solver grids now double longitude and latitude counts, retaining
their radial levels: 128 × 64 × 17 and 192 × 96 × 25. The default is 128 × 64.
The map doubles to 768 × 384 pixels and the globe to 512 × 512, retaining their
2:1 and 1:1 display aspect ratios. The existing Wasm binary allocates both grids
at runtime; no numerical Fortran source or compiler changes were required.

`node --test scripts/test-magic.mjs` passed all three checks. Both actual Wasm
grids completed 1,000 steps and returned 25 finite, evolving frames, reaching
model time 0.08. The standard run verified pause/resume; the finer run used the
deep-shell preset with five density scale heights. Boundary and circulation
checks passed. Local elapsed times were 37.5 and 162.3 seconds respectively;
retained frame fields occupied 53.1 and 175.8 MiB (not total process memory).

All 13 UI/integration checks passed, including the doubled map and globe draw
dimensions, 128-longitude/64-latitude exported coordinates, 8,192 values per
shell field, replay/stop and rocky-tab regression checks. Syntax, local asset
references and unique HTML IDs were checked. No browser/device performance test
or numerical convergence study was performed; phone runtimes may be longer.

## MagIC gas-shell integration · 2026-09-13

The unmodified vendored MagIC source matches upstream revision
`0d408831fd38ac72c52d53dd091a3ccaabce5207` byte for byte. Browser integration patches
and compiler/runtime ABI adapters are documented in `model/magic/BROWSER.md`.
The 2.7 MiB Wasm engine uses double-precision calculations and single-precision
G-file output. Asyncify instrumentation is restricted to the yielding call path;
the pinned optimizer inlines the timestep driver and C yield hook into browser_run.

`node --test scripts/test-magic.mjs` passed three checks:

- Bounded input validation and native namelist generation.
- The actual MagIC worker completed the default 1,000-step 64 × 32 × 17 shell
  experiment, producing 25 finite, evolving field frames. Model time reached 0.08
  viscous units. Pause held output and resume completed the run. The sampled
  outer-boundary radial velocity was zero to within 1e-5, and interior circulation
  was nonzero. Approximate elapsed test time: 8.3 seconds on this machine.
- A 96 × 48 × 25 deep-shell experiment with five density scale heights completed
  100 steps, yielding 11 finite frames. The workers ran with all fetch and
  importScripts calls forbidden; engine bytes came from the parent context.

`node --test scripts/test-magic-ui.mjs scripts/test-resolution.mjs` passed 13
control/integration checks. These cover gas-tab selection and return to rocky
controls without losing terrain; field-map/globe drawing calls; replay selection;
dimensioned JSON export; pause/stop; cancelled loading and stale messages; and the
existing terrain, display-resolution, palette and climate-control regressions.
The final HTML has unique IDs, paired accessible tabs, and valid local assets.

These checks establish browser-compatible execution and the field/control handoff.
They do not establish native/Wasm numerical equivalence, grid convergence, realistic
gas-giant weather, stable behavior across the full parameter range, or iPhone/browser
UI performance. No browser automation or physical-device test was performed.

This is a compiler/port check, not climate-model validation or convergence testing.
No browser UI or physical iPhone test was performed. Timing below is from this
Linux execution environment and must not be read as a promise of phone performance.

## Original solver with display detail and cloud shell · 2026-09-11

The browser now always loads the original T21 64 × 32 solver with 30-minute
steps. The temporary T42 assets were removed. Both display settings keep the
same physical terrain, namelists, solver memory allocation and 2,048 values per
field. High res doubles only the terrain display, map texture, globe and cubemap
face dimensions. Changing resolution still resets loading, computation and replay.
The retained T21 binary is unchanged from the earlier successful ten-day check.

Twenty-one application, cloud, terrain and world-generation checks passed:

- Both display selections preserve the original physical grid and timestep;
  terrain and climate exports distinguish display dimensions from physical data.
- Reset cancels pending downloads, running/paused workers and replay, clears
  results, and ignores stale callbacks. Extreme estimates remain 64 × 32 too.
- A High-res climate cloud cell controls exactly four display cells. The existing
  RFL 3D noise is thresholded within that group while keeping its mean coverage
  within 1e-7 of the raw model value. Zero coverage stays clear, full coverage
  stays opaque, and the source climate arrays are unchanged.
- Cloud sampling is repeatable, changes with displayed simulation time, wraps
  around longitude, and covers both poles. The raw scientific cloud field never
  receives procedural detail or the decorative shell.
- Direct pixel-array checks at 256 × 256 and 512 × 512 show clouds outside the
  ground silhouette and no cloud pixels beyond a radius 1.14 times the ground
  radius. Clear clouds leave the original background and ground unchanged;
  scientific layers remain unshaded with no cloud overlay.
- The two packed globe depth buffers use at most 2 MiB at High res. Its cloud
  alpha/shade/latitude-edge arrays use about 41 KiB. These are individual buffer
  checks, not measurements of total browser or device memory.
- The palette editor selects pixels, changes colors, opens a BMP, and preserves
  all twenty edited pixels when saving BMP or XPM. Editing during a model run
  leaves the run intact. Sprite row order, opacity checks and PNG dimension
  rejection pass. PNG decoding/encoding uses native browser image APIs and has
  not been exercised in an actual browser during this update.
- Existing terrain/C-noise agreement, cubemap seams, bounded replay and 5,000
  seeded random-world checks pass, as do 250 draws with High display selected.

Five loader/worker checks pass: both display settings download the same original
engine, invalid responses fail cleanly, cancellation releases the worker URL,
and a compiled-grid mismatch is rejected before allocating output arrays.
A sixth check executes the real retained engine with High display requested:
48 steps (one Earth day), 1,800-second timestep, 22 finite field updates,
pause/resume and no worker networking, in 2.7 seconds on this Linux environment.
The output land mask and Gaussian coordinates exactly match the original terrain;
elevation versus final surface pressure has a correlation of −0.928.

App checks use a JavaScript VM with represented DOM/canvas interfaces; the globe
geometry check inspects pixel arrays directly. No browser visual or physical phone
test was performed. The deliberately oversized cloud sphere and its noise detail
are appearance choices, not simulated cloud altitude or resolved cloud structure.

## Native comparison · 2026-09-10

Compiled the same adapted model with GCC/GFortran 13.2.0 (native x86-64) and
r-wasm Flang 21.1.8 + Emscripten + the descriptor-compatible runtime (WebAssembly).
Default single-precision computation, T21L10, same boundary data and namelists:
1367 W/m², 360 ppm CO₂, one Earth day rotation, 30-minute timesteps, KICK=0.
The native build includes the same calendar-call and hurricane initialization repairs.

After 48 timesteps (one simulated Earth day), across all 2,048 grid cells:

| Field | RMS difference | Maximum absolute difference |
|---|---:|---:|
| Surface air temperature | 0.00063435 K | 0.00534058 K |
| Total cloud fraction | 0.00015867 | 0.00484091 |
| Lowest-level eastward wind | 0.00032827 m/s | 0.00583076 m/s |
| Lowest-level northward wind | 0.00025756 m/s | 0.00451183 m/s |
| Surface pressure | 0.01747355 Pa | 0.30468750 Pa |

At the first timestep, temperature RMS difference was 0.00001723 K.
The two builds agreed on elapsed steps, 1,800-second timestep, and shutdown flag.
Small differences are expected across compilers; chaotic weather can diverge over
long integrations. This check is not proof of full physical equivalence.

## Worker integration

Executed the website's worker and generated engine in a JavaScript VM with the
browser worker interfaces represented locally and real bundled files served through
the fetch adapter. This tests computation and messaging, not browser layout or a
particular browser engine.

- Default ten-day run completed all 480 timesteps with finite output fields.
- Temperature range at completion: 227.51–300.16 K; cloud fractions: 0–1.
- Pause at step 12 held the model state; resume completed the run.
- 214 field updates; approximately 19.7 seconds of wall time on this test machine.
- Separate one-day experiment with 1500 W/m², 800 ppm CO₂, and two-day rotation
  completed successfully and produced different results from the default.
- Invalid configurations were rejected; stellar-flux, CO₂, and rotation controls
  were checked against their generated Fortran namelists.
- JavaScript syntax and local public asset references were checked.
- WebMCP is feature-detected; no supported browser context was available to validate
  registration. It is optional and ordinary UI operation does not depend on it.

## Limits

Long climate equilibration, the full parameter range, long-run energy balance,
all browser engines, memory limits, mobile suspension, and iPhone performance
have not been validated. Cold-start transients can be strong. JSON exports contain
only the displayed sampled fields, not a complete history or a restart checkpoint.

## Rocky Atmo interface update — 2026-09-10

Checked eight planet presets, nineteen atmosphere palettes, every planet/atmosphere
climate-eligibility combination, and 2,500 seeded random selections. All randomized
model configurations passed the existing ExoConfig bounds validator; duration
was preserved and all eight planet classes were reached. JavaScript syntax,
HTML control references, unique IDs, and local asset references passed. The
Fortran engine, worker and physical namelist generator are unchanged. No new
browser UI or mobile-device testing was performed for this interface update.

## Worker startup repair — 2026-09-10

The reported `The climate engine could not run: undefined` comes from the page's
worker error handler reading a missing event message. That message alone does not
identify why the user's browser rejected startup. Authenticated HTTP checks of the
deployed page, worker, configuration, engine script, Wasm and boundary data all
returned 200 with the expected content types and complete asset sizes.

The new loader removes worker-side authenticated script/data requests: the page
loads the assets through its own session, constructs a Blob worker, and transfers
the binary buffers. The compiled Fortran model and boundary data are unchanged.

`node --test scripts/test-engine.mjs` passed four regression/integration tests:

- All five assets loaded with same-origin credentials before worker creation.
- HTTP 401/404, a returned HTML login page and invalid Wasm produced actionable errors.
- Cancelled loading created no Blob URL; message-less events never displayed `undefined`.
- The actual compiled model completed 480 steps (ten days), with 190 finite field
  updates and pause/resume, in a VM worker context where `fetch` and `importScripts`
  throw. Transferred binary buffers were detached on the sending side.

This verifies the loading contract and model execution, not the reported device's
original failure cause. No browser UI or physical iPhone test was performed.


## Constrained random worlds and extreme surface fields

`node --test scripts/test-worlds.mjs` passed four checks:

- All 152 planet/atmosphere pairs are classified: 3 ExoPlaSim combinations,
  9 simplified surface-estimate combinations, and 140 appearance-only pairs.
- 5,000 seeded draws all selected a supported model and respected coupled bounds;
  all eight classes occurred within two percentage points of their authored priors.
- All extreme outputs had finite positive surface temperatures and finite
  nonnegative pressures. Unmodeled air temperature, cloud and wind channels stay
  unavailable and are omitted from exports. The discretized energy budget closes
  to a relative error below 1e-10 before Float32 output conversion.
- Every extreme reference, random endpoint, bounded fallback and targeted phase
  screen passed. Boundary testing caught and fixed a floating-point log-pressure
  sample just outside its lower bound. Higher sunlight raises ice temperatures;
  higher prescribed pressure raises the Venus-like grey greenhouse temperature.

Counts in the deterministic 5,000-draw check: temperate 1779, warm 725, cold 767,
airless ice 386, volatile ice 387, Venus-like 410, steam 294, silicate 252.

`node --test scripts/test-engine.mjs` passed six tests, including loader regression
checks and actual Wasm execution with worker networking disabled:

- Default 1367 W/m², 360 ppm, one-day rotation: all 480 steps (10 Earth days).
- Cold random boundary 1050 W/m², 400 ppm, 0.8-day rotation: 48 steps (one day).
- Warm random boundary 1500 W/m², 300 ppm, three-day rotation: 48 steps (one day).
- All runs produced finite fields and supported pause/resume.

JavaScript syntax, HTML IDs, app control references and local asset links passed.
These tests check the implementation and short model runs. They do not establish
extreme-climate realism, validate the grey opacity or vapor-pressure proxy, ensure
long-run ExoPlaSim stability, or test a browser UI or physical phone.

## RFL terrain, cubemap and playback — 2026-09-11

The engine/world suites passed 12 tests: protected asset loading (now six
assets), cancellation/errors, existing baseline and cold/warm boundary runs,
5,000 random worlds, and two actual Fortran runs over RFL-generated terrain.
The new default terrain completed 480 steps (ten days); seed 2468 with 5 km
relief scale completed 48 steps. Both returned exactly the generated land mask
at the expected Gaussian latitudes and supported pause/resume. A focused
one-day rerun verified elevation versus actual surface-pressure correlation
of −0.922, confirming that terrain affects physics rather than only appearance.

Five terrain/format/replay tests passed:
- 128 samples agree with original compiled RFL C noise to within 1e-7.
- Deterministic and changed-seed terrain, longitude wrap, Gaussian weights,
  geopotential units and bounded inputs.
- Edited BMP and XPM palettes round-trip; malformed palettes fail.
- Bounded replay keeps chronological frames and first/latest endpoints through
  5,000 updates; pause, seek, restart and return-to-live state are checked.
- All twelve cube edges and eight corners meet across adjacent face directions;
  neighboring front/east textures use identical edge samples.

Static HTML references, paired tabs, unique IDs, balanced sections, same-origin
assets and JavaScript syntax were checked. No browser UI or physical phone test
was performed. Cubemap display does not increase the 64 × 32 physical resolution;
long-run stability for arbitrary edited terrain is not established.
# Terrain Solver integration — 2026-09-11

- The C99 algorithm-2 core/header/knob definition match the previously delivered
  Terrain Solver source byte for byte. Emscripten 3.1.6 + LLVM 15 compile the core
  and a thin browser ABI, independently of the existing Fortran engine.
- Native C and Wasm agree at 64 world directions for both Balanced and Regional:
  heights within 1e-6 m, exact water/biome/palette classifications, and moisture
  within 1e-12. Identical browser inputs reproduce all sampled arrays and metadata.
- Balanced, Archipelago, Alpine and Regional produce finite samples, both land and
  water for seed 42, valid palette indices, normalized Gaussian weights, correct
  low/high/square dimensions and macro slope excess below 1e-6 m. Changing the seed
  changes the land mask; malformed configurations and boundary arrays are rejected.
- The actual solver worker instantiates Wasm and transfers its generated arrays in
  a VM context with worker downloads/importScripts forbidden. This is a numerical
  and worker-protocol check, not a physical-device browser test.
- Control integration verifies independent workspace/generator tabs, low/high
  display projection, original 64 × 32 climate inputs, cached solver reuse, restoring
  Quick, cancelled/late/error results, blocked stale climate starts, invalidation
  of completed/replayed fields, and unchanged palette/cloud controls.
- The actual bundled ExoPlaSim ran 48 steps (one day) over Balanced seed 42, with
  17 finite field updates and working pause/resume. The output land mask exactly
  matches Terrain Solver input and Gaussian coordinates agree within 1e-7.
  Elevation/surface-pressure correlation: -0.899. This validates the terrain handoff;
  it does not establish long-run stability for every procedural configuration.

## Saturn cutaway (2026-09-14)

`node --test scripts/test-saturn.mjs` verifies occlusion and section-wall depth,
all five exposed layers, rotation, both polygons through the water deck, flowing
textures, XPM geometry/defaults, responsive glass/reflection settings, context
controls, retained edits, reduced motion, inactive-tab scheduling, and animated
remove/restore returning to the identical paused image. Rendered pixel outputs
were inspected directly without running a browser. HTML IDs, local assets and
module imports were checked, alongside JavaScript syntax and the unchanged
shared MagIC UI checks. No live browser QA was performed.
## Jupiter layer preset — September 14, 2026

`node --test scripts/test-saturn.mjs`: all nine tests pass, including the five
existing Saturn checks and four Jupiter checks. They exercise the real renderer
and controller with a DOM adapter, without starting a browser or server.

- Every one of Jupiter's six layers is visible in the open cutaway. Closed,
  opaque outer clouds completely occlude changes to internal emission.
- The closed blue-green glass shell visibly transmits red-orange emission at
  the default maximum IOR (2.5) and midpoint scatter (0.5). Pixel-region checks
  distinguish the warm center, cool glass edge, and emission-off state.
- Jupiter textures animate without a longitude seam; the Great Red Spot has
  an independent strength control.
- Switching Saturn/Jupiter preserves independent layer edits, core emission,
  zoom and selected layer. Remove/restore recovers the same paused Jupiter view.
  Resetting Jupiter does not discard Saturn's edits. Hidden views stop drawing.

Direct renderer images at 512 × 448 were inspected for whole Jupiter, its six
layer cutaway, exposed glass, and reflective glowing center. Existing mobile
layout and controls are reused. No browser QA or numerical-model convergence
claim is made by these appearance checks.

## 2026-10-10 · Extreme-world weather and tidally locked super-Earths

Added diagnostic thermal-gradient/drag/Coriolis surface winds and condensable-supply
cloud potential to atmospheric extreme estimates; airless fields remain unavailable.
Wet and dry locked rocky presets expose radius, gravity, rotation/orbital period,
pressure, drag, fixed substellar longitude and condensable supply. The cloud shell,
streamlines, field units and exports preserve estimated-model provenance.

`node --test scripts/test-extreme-weather.mjs scripts/test-worlds.mjs
scripts/test-streamlines.mjs scripts/test-clouds.mjs scripts/test-resolution.mjs`
passed 37 tests, including 5,000 seeded random-world draws, seam/pole finiteness,
locked illumination shifts, wind response to drag/rotation, dry-cloud suppression,
equal-area cloud alignment, field rendering, export availability and existing
streamline transitions. Application integration uses a Node DOM/canvas harness.
No browser UI or physical-device QA was available. These checks verify implementation,
not physical calibration: diagnostic wind/cloud patterns are not a GCM solution.
