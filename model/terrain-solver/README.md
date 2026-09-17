# RFL cubemap terrain — C99 prototype

One planet field supplies the space view, 256×256 surface chunks, biome/material
maps, and multiplayer chunk addresses. The core uses C99 and libm. The optional
bounded streaming cache uses POSIX threads. No C++ or external constraint solver
is required.

This is a working generator and streaming module, with a command-line tool and
tests. It has not been wired into or deployed with the live RFL game. The old
surface renderer's wrapped-map addressing needs to be replaced for continuous
travel through these chunks; changing its height callback alone is insufficient.

## Build and try it

```sh
make
make test
make sweep

./terrain --preset balanced --out out \
  --set seed=42 --set surface_lod=6 \
  --chunk +Z 6 22 52 --chunk +Z 6 23 52

./stream_demo out/world.ctw
./terrain --knobs

# Regional rules inspired by the paired region/height reference images:
./terrain --preset regional --out regional --diagnostics \
  --set walk_coherence=0.85 --set broken_roughness=1.8 \
  --chunk +Z 6 22 52
```

The default build uses `-std=c99 -O2 -Wall -Wextra -Werror -pedantic`.
The core can also be compiled into a C++ application through its `extern "C"`
header. Emscripten can use the core without the pthread cache; schedule chunk
generation in a Web Worker in that environment.

`samples/` includes a built world and sixteen adjoining chunks on face +Z,
LOD 6, x=22..29 and y=52..53. Each owns exactly **256×256 samples/cells**. The
additional positive edge row and column in `.ctc` files support interpolation.
Each `.u16le` file is exactly **131,072 bytes**, containing only the 256×256 core.

`previews/correspondence.png` shows the planet, the chosen face, the actual chunk
outputs, and a height transect. `previews/presets.png` compares the six presets.
`previews/regions.png` compares region labels, elevation, and surface colors.
`previews/walk_coherence.png` compares IID and coherent increments with the
same mask and seed. Recreate these with `python3 examples/reference_preview.py`.
The preview scripts need Pillow and NumPy; the generator needs neither.

## Generation model

The broad terrain is solved at world load, over one connected graph covering all
six cube faces. Edge and corner vertices are shared. Chunk requests never run a
separate coastline, lake, or slope solve.

1. Evaluate smoothly blended region weights and a warped 3D fBm field on sphere
   directions to obtain a signed land mask. Optional fine coastline noise is
   stronger in rough regions. A `ct_shape_fn` can supply a signed mask instead.
2. Find connected water bodies across face boundaries. The largest is ocean;
   sufficiently small other components are lakes. This size test uses vertex
   count, not exact equal-area surface measurements.
3. Temporarily fill lakes and solve signed additive walks from coastal nodes.
   Each coast vertex has its own provenance. A candidate collision must have
   opposing arrival directions and sufficiently separated source locations.
4. Set each lake's provisional level to the minimum first-pass height over its
   footprint. If slope constraints are enabled, lower levels as necessary to
   make the combined water/shore constraints feasible.
5. Solve again with sea and lake shores seeded simultaneously. Collision values
   are SUMs of distinct incoming, **uncombined** heights relative to sea level.
   Collisions are terminal: their summed values are never walking parents.
6. Mix in the requested fractal/ridged relief away from pinned water boundaries.
7. Project the macro heights onto the graph slope constraints, preserving the
   fitted shore elevations. Then freeze the macro field.
8. Generate chunks by sampling that field plus globally addressed fine noise.
   Assign water, sand, grass, forest, exposed rock, and snow from the same
   height/mask/moisture fields used by the space view.

This is a **Schmidt-inspired reconstruction**, not Loren Schmidt's source code or
a port of the unavailable `undulate2.c`. The primary reference is her
[Inverse Terrain Solver talk, Roguelike Celebration 2024](https://www.youtube.com/watch?v=FaLUhh_Vfmk),
especially 15:59–18:07 and 28:51–31:50. The source provenance identity, collision
predicate, exact lake minimum, relative-height arithmetic for different lake
baselines, and raster junction closure remain our explicit implementation choices.

The default steps reproduce the handoff's ranges at `walk_coherence=0`:
land `[0,700)` metres per accepted hop, sea `[-280,40)` metres per hop. The sea
walk has negative drift, not strictly negative increments. These are metre-scale
parameters in this package; `height_quantum_m` controls the uint16 encoding.

At higher coherence, increments mix IID samples with a spatially coherent noise
field freshly seeded at each causal depth. This keeps accumulation stochastic
between depths while neighboring cells share structure. Mixing changes the
increment variance; it does not preserve the IID marginal distribution.

Whole-loop IDs would miss an island's inward self-collision. Independent seed
IDs alone would collide almost immediately at the coast. The source-separation
and opposing-direction tests bridge these cases, but are a heuristic. A rare
enclosed raster pocket is resolved as one terminal junction from deduplicated
incoming contributions, without another walk step. `junction_cells` counts
those cells across both passes so this extension is visible.
The prototype uses four-neighbor macro graph edges. Coherent increments smooth
local variation but do not remove that graph's directional bias.

The input callback is a **filled signed field**, not a directed line drawing.
For contour art, first classify its faces with an explicit fill rule; the
generator cannot recover path orientation or closure of open spurs from pixels.

## Knobs

All settings are in `ct_config`; every numeric knob is listed by `--knobs` and
in `include/ct_knobs.def`. CLI configuration files use `name=value`. Presets reset
all settings; put overrides after `--preset`.

| Controls | Effect |
|---|---|
| `seed`, `planet_id` | Repeatable procedural world and its body identity |
| `continent_frequency`, `continent_octaves` | Number/scale of landmasses and coastline detail |
| `persistence`, `lacunarity` | Fine-octave strength and frequency spacing |
| `sea_threshold` | Higher values give less land |
| `warp_strength`, `warp_frequency` | Bend and complicate continent outlines |
| `noise_mix` | 0 = contour walks; 1 = noise relief; intermediate = hybrid |
| `land_step_m`, `land_jitter_m` | Average uphill increment and its variation |
| `sea_step_m`, `sea_jitter_m` | Mean offshore increment and its variation |
| `walk_coherence`, `walk_noise_frequency` | Spatial agreement of walk increments |
| `front_delay_passes` | Deterministic 0..N scheduling delay per cell; changes terrain as well as animation |
| `meet_separation_cells` | How far apart source locations must be to count as an opposing-front meeting |
| `land_relief_m`, `ocean_depth_m` | Noise-mode/hybrid relief scale |
| `ridge_amplitude_m`, `ridge_frequency`, `ridge_sharpness` | Strength, size, and sharpness of ridged noise |
| `lake_max_fraction` | Largest small water component to treat as an elevated lake; 0 disables lakes |
| `max_macro_slope`, `slope_constraints` | Graph height-difference bound in metres/metre; on/off |
| `detail_amplitude_m`, `detail_frequency`, `detail_octaves` | Local relief superimposed consistently on the macro field |
| `humidity`, `moisture_frequency`, `forest_threshold`, `desert_threshold` | Wet/dry regional character and vegetation classification |
| `treeline_m`, `snowline_m`, `polar_cooling` | Exposed alpine terrain and snow thresholds, reduced toward the poles |
| `beach_height_m`, `shallow_depth_m` | Coast and shallow-water bands |
| `macro_resolution` | 8..256 intervals per face edge for the global solve |
| `surface_lod`, `radius_m` | Physical chunk scale, independent of the global solve resolution |
| `height_quantum_m` | Metres per uint16 increment; controls range versus precision |
| `region_strength` | 0 = global rules; 1 = full regional modulation |
| `region_frequency`, `region_blend` | Region patch scale; higher blend makes broader transitions |
| `coast_detail_amplitude`, `coast_detail_frequency` | Extra signed-mask detail, allowing small islands and holes |
| `plains_*`, `hills_*`, `ridges_*`, `broken_*` | Four editable terrain profiles, described below |

`walk` turns off the hybrid noise and local detail to expose the contour process.
`noise` bypasses both walk passes and elevated lakes. `balanced`, `archipelago`,
`alpine`, and `dry` exercise the hybrid controls.
`regional` enables four profiles and extra coast detail, at macro resolution 128.

### Regional controls

The cyan/green/yellow/red reference image appears to show regional rule
assignments. That interpretation is an inference; our labels and values are
design choices, not recovered original parameters. Region IDs are separate from
biome/material IDs. All weights are calculated at shared planet vertices and
stored in the world snapshot. Each location blends four profiles continuously;
the dominant color is only a diagnostic label.

| Profile prefix | `height_scale` | `roughness` | `ridge_scale` | `delay_passes` |
|---|---:|---:|---:|---:|
| `plains_` | 0.35 | 0.20 | 0.05 | 0 |
| `hills_` | 0.80 | 0.60 | 0.45 | 1 |
| `ridges_` | 1.60 | 0.85 | 2.00 | 0 |
| `broken_` | 1.10 | 1.60 | 1.20 | 3 |

For example, `ridges_height_scale=2` doubles the base uphill step and analytic
land relief where the ridges profile dominates. `roughness` scales walk jitter,
fine relief, and the optional coast perturbation; uphill jitter is capped at
the mean to preserve nonnegative land increments. The sea mean remains the
global `sea_step_m`. `ridge_scale` multiplies ridged noise in hybrid/noise modes.
Weighted `delay_passes` is rounded and added to `front_delay_passes` as the
maximum deterministic per-cell delay. It changes propagation and collision
geometry, not just animation speed. Strength zero neutralizes all profile effects.

`region_frequency` sets the size of broad rule patches. `region_blend` changes
the softness of their transitions. These fields share the continent domain warp.
Very sharp boundaries are still limited by macro resolution. The added coast
noise changes the mask **before** lake identification and both solves; fine
surface noise never invents a different coastline inside a chunk.

```c
ct_config cfg;
ct_config_preset(&cfg, "regional");
cfg.seed = 42;
cfg.walk_coherence = 0.85;
cfg.broken_roughness = 1.8;
cfg.ridges_height_scale = 2.0;
char error[256];
ct_world *world = ct_world_build(&cfg, NULL, NULL, error, sizeof error);
/* Check world != NULL, then use ct_world_sample / ct_chunk_generate. */
```

`ct_world_region()` returns the weights and effective settings at a direction.
`--diagnostics` writes `regions_FACE.ppm` (dominant profile, water dark) and
`height_FACE.ppm` (the full uint16 purple-to-red scale). The reference preview
uses a separately labelled metre range and relief shading to make smaller
height differences visible. All of its terrain data comes from the C generator.
See `REFERENCE_NOTES.md` for the distinctions between evidence and reconstruction.

For a clean comparison, use the same seed and mask settings. Change one family
of knobs at a time. Increasing `macro_resolution` changes the discretized mask
and number of walk hops; scale per-hop increments down if you want similar
relief. High frequencies beyond that grid's resolution alias. Fine noise also
needs a suitable frequency for the chosen finest sample spacing.

## C constraint solving

For each macro graph edge `(a,b)` with spherical edge length `d`:

```text
abs(height[a] - height[b]) <= max_macro_slope * d
```

The implementation computes min-plus distance envelopes with an indexed binary
heap. This uses O(V) auxiliary storage and O(E log V) work per envelope. Feasible
lake levels are established first, including the shoreline pins. For terrain,
lower and upper envelopes from pinned heights bound the result. Clamping to those
bounds and applying a final lower envelope satisfies the edge inequalities.

This is a graph height constraint projection, **not volume-conserving erosion**.
It can raise values to satisfy pinned lower bounds and lower overpiled ridges.
`max_macro_slope_excess_m` measures the actual remaining edge violation. The
constraint is over macro graph edges; interpolation and added fine
noise are **not** covered by a guarantee on the continuous final slope. The
current code does not simulate rivers, erosion, vegetation meshes, or weather.

## Cubemap and scale

Face UV spans [-1,1], with v increasing down the image. These are exactly the
transforms inspected in RFL's `atlas_tool.c`:

| Face | Unnormalized direction |
|---|---|
| +X | `(1, -v, -u)` |
| -X | `(-1, -v, u)` |
| +Y / north | `(u, 1, v)` |
| -Y / south | `(u, -1, -v)` |
| +Z / front | `(u, -v, 1)` |
| -Z / back | `(-u, -v, -1)` |

Normalize the direction before sampling. The cubemap is storage/addressing;
the direction identifies the location on the physical body. The face projection
uses dominant-axis ownership, with X winning exact ties, then Y, then Z.

A LOD L face has `2^L × 2^L` chunks. Every chunk has a 256×256 core. Default L=6
therefore represents `6 × 64² = 24,576` finest chunks and 1,610,612,736 core cells
without allocating those cells at world load. The default macro graph has only
24,578 unique vertices.

At the center of a face, local sample spacing is approximately:

```text
2 * radius_m / (256 * 2^surface_lod)
```

For a 6,371 km radius and L=6 this is about 778 m/sample and 199 km/chunk near
face center. Spacing varies across each cube face; cube parameter squares are
not equal-area physical squares. `ct_key_metric()` returns local metre-scale
tangent vectors. Use those instead of assuming the current RFL 1 km cell unit
is valid everywhere. L=7 approximately halves the spacing. `macro_resolution`
does not determine the number of surface chunks.

The extra row/column is the positive interpolation border. Adjacent chunks
evaluate identical global coordinates at their shared border, including across
cube edges. Coarser LOD vertices are subsets of finer vertices. The library
provides samples; mixed-LOD mesh stitching, skirts, morphing, and view filtering
remain renderer responsibilities.

Sampling is bilinear inland. Shore cells with a lone land/water corner use a
triangle split through the shoreline pins. Saddles between different lake
components split along their land diagonal to keep the water bodies separate.
These splits preserve the shared cell edges. Land uses an interpolated shore
reference, avoiding abrupt lake-height changes at cube boundaries.

## Shared space/surface sampling

```c
ct_sample s;
ct_world_sample(world, body_fixed_direction, &s);
/* Space: choose palette[s.palette_index] and apply view lighting.
 * Surface: use s.height_m, s.material, s.biome, and the same palette.
 * Water: s.water_m is a separate surface, not the terrain bed height. */

ct_key key;
double local_x, local_y;
ct_key_at(world, body_fixed_direction,
          ct_world_config(world)->surface_lod,
          &key, &local_x, &local_y);
```

Apply the inverse body rotation before both calls. Camera rotation, day/night
lighting, local render origins, and player order must not enter generation seeds.
The low-resolution space image is a sampled view of the same field, so small
objects will disappear at distance. The supplied previews are point sampled;
production space textures should be filtered for their pixel footprint.

The supplied 40-color palette has five shades for each of eight biomes. Edit
`palette.txt` as exactly 40 hexadecimal RRGGBB values, then use `--palette`.
Palette changes do not change heights, masks, or chunk generation IDs. Share
the palette separately when multiplayer clients need identical appearance.
Existing planet_tool BMP rows can populate the corresponding grass, shore, sea,
and cloud-independent biome colors through a small importer; no BMP parsing is
needed in the runtime sampler.

## Streaming

```c
/* Loading/worker setup: world must remain immutable and outlive cache. */
ct_stream *cache = ct_stream_create(world, 9);

/* Frame update: request nearby/current and predicted route keys. */
if (ct_stream_request(cache, key) == 1) {
    const ct_chunk *chunk = ct_stream_acquire(cache, key);
    if (chunk) {
        /* Upload/use chunk, keeping it pinned as long as you retain it. */
        ct_stream_release(cache, chunk);
    }
    /* Otherwise retain the current valid terrain/LOD and poll next frame. */
}
```

Creation preallocates all cache storage. Request/acquire/release take a short
mutex, with no file reads, allocation, or terrain generation on that path.
A worker generates outside the mutex. Pinned slots cannot be evicted. A full
cache returns busy; the caller retries later. `ct_stream_wait()` is only for
the command-line demo, tests, or loading screens.

A serialized chunk is 396,354 bytes, including heights, water levels, biome and
palette indices with border samples. Nine in-memory slots take about 3.4 MiB.
The 64-resolution macro graph and mapping take about 3.5 MiB, plus temporary
world-build work arrays. This first cache has one worker and no disk cache or
priority scheduler; the chunk files can be loaded/saved by a separate IO worker.

For a 3×3 neighborhood near a cube edge, obtain directions using
`ct_key_direction(key, local_x + 256*dx, local_y + 256*dy, ...)`, then project
those directions with `ct_key_at()` and deduplicate keys. Beyond-face UV is
supported. Native neighbor axes can rotate across edges; render from body
directions or a local tangent basis rather than concatenating face arrays.

## RFL wiring

The inspected GitHub snapshot still has `WORLDW = WORLDH = 259`, a wrapped
lon/lat map, and `SURFACE_MODE_UNIT_METERS = 1000`. This package deliberately
targets the user's requested 256×256 chunk core. It does not assume that snapshot
is identical to the already-deployed browser build.

`examples/rfl_adapter.h` provides the existing callback signature and an explicit
axis conversion. The old source direction is Z-up; this cubemap is Y-up:
`world = {legacy.x, legacy.z, legacy.y}`. It also maps biome IDs to RFL's
existing sea/shore/grass/forest/rock/snow material values.

Actual streaming integration needs these coordinated changes:

1. Keep a body-fixed direction and altitude as the authoritative surface pose.
   Convert that pose to a chunk key and local offset; replace whole-world
   `wrapi`/`wrapd` behavior with chunk lookup and cross-face reprojection.
2. Bind the same frozen `ct_world` to the space surface sampler and terrain
   chunk producer. Replace the separate planet_tool terrain function for worlds
   using this generator; keep its palette and lighting controls.
3. Let the surface renderer, collision queries, minimap, shadows, and XPM
   placement read the same active chunk neighborhood. Keep old valid data
   until the requested neighborhood is ready. Never block on generation inside
   an active frame.
4. Use the local metric/tangent basis to keep close terrain flat around the
   player while retaining its place on the sphere. Convert metre heights at
   the renderer boundary, instead of rescaling the authoritative world data.
5. Carry each body's descriptor/generation and the player's canonical chunk
   address in multiplayer state. Transform heading/tangent axes on face changes.

The old callback path clamps negative elevations to zero and recolors terrain
later in `create_world()`. It cannot by itself display the exported sea floor,
elevated lake surface, or complete shared palette. Both field and material access
need to be connected before claiming full space/surface correspondence in-game.

## Multiplayer and file contracts

Logical chunk address:

```text
planet_id / generation / face / lod / chunk_x / chunk_y
```

For a location callout, use `ct_key_at()` at `surface_lod`, even while rendering
a coarser tile. LOD 6 +Z 22,52 always denotes the same finest chunk for that
world generation. Different bodies and parameter revisions have different keys.

`generation` hashes the algorithm version, seed, all configuration fields, and
the **actual solved macro field**. `digest` hashes the chunk key and payload.
These are noncryptographic FNV-1a checksums for cache identity and mismatch
detection, not security checks or proof of authenticity. Transfer an explicit
world descriptor/snapshot, not only a seed.

Generation is repeatable for the same binary/IEEE environment, independent of
chunk request order and worker scheduling. Integer RNG is stable, but floating
noise, math-library functions, and threshold decisions are not claimed bit-exact
across every compiler/CPU. Disable fast-math. Compare world and chunk checksums;
use authoritative server snapshots/tiles when clients disagree. Even a shared
macro snapshot does not eliminate possible fine-noise differences across CPUs.
Near an exact border, the server's key/local coordinates should be authoritative.

File formats are explicitly little endian and do not serialize native structs:

| File | Contents |
|---|---|
| `world.ctw` | Magic/version, complete config, generation checksum, macro heights/mask/water and region weights |
| `chunk_*.ctc` | Magic, complete key, quantum, checksum, clipping count, 257² records |
| `chunk_*.u16le` | Exactly 256² uint16 ground values, positive border omitted |
| `chunk_*.ppm` | Exactly 256² palette colors for quick inspection |
| `config.cfg` | Human-editable complete settings |

A `.ctc` record is `(height:u16, water:u16, biome:u8, palette:u8)`, six bytes.
The header is 60 bytes. `height = (encoded - 32768) * height_quantum_m`.
Sea level encodes as 32768. Default quantum 1 m spans -32,768..32,767 m.
Clipping is counted explicitly; increase the quantum for taller/deeper worlds.
World snapshots preserve terrain, not the transient convergence log; generation
pass counters are available on freshly built worlds.

This revision uses algorithm version 2 and `CTWORLD2` snapshots. Version 1
snapshots must be regenerated from their config; they are deliberately rejected.
The chunk record format is unchanged, but its generation ID changes. Regenerate
cached chunks alongside the world rather than mixing revisions.

Increment the algorithm version whenever published generation semantics change.
Do not mix chunks from different generation IDs in one neighborhood.

## Verification

`make test` exercises input rejection, exact height encoding, all face transforms,
same-loop SUM ridges, elevated lakes, feasible slope constraints, both sides of
all cube edges, identical chunk borders, LOD subsets, direct space/chunk sample
agreement, request-order and thread reproducibility, snapshot round trips,
corruption rejection, and pinned-cache behavior under capacity pressure.

`make sweep` also covers 27 worlds with varied seeds, front delays, coherence,
strict slopes, regional extremes, and macro resolutions through 256. `make thread-sanitize` runs
the main suite with ThreadSanitizer.

`make sanitize` builds AddressSanitizer + UndefinedBehaviorSanitizer. On hosts
where ptrace restrictions prevent LeakSanitizer from inspecting threads, run
`make sanitize ASAN_OPTIONS=detect_leaks=0`. See
`VALIDATION.txt` for the actual results from this delivery environment.
