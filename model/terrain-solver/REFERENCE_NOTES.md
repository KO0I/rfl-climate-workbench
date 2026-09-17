# Reference evidence and implementation choices

The supplied photographs are readable. IMG_3289 and IMG_3290 show matching
landform outlines: one in broad categorical colors, one with varying elevation
colors. IMG_2447 and IMG_2448 show a curved planet horizon and closer relief.
The photographs do not establish exact noise parameters, projection math, or
the meanings of the categorical colors. We use them as visual targets.

The public primary source is Loren Schmidt's
[Inverse Terrain Solver talk at Roguelike Celebration 2024](https://www.youtube.com/watch?v=FaLUhh_Vfmk).
The implementation is our C99 reconstruction; no original public source code
or copy of the user's `undulate2.c` was available for a direct port.

| Open question | Assessment and implementation |
|---|---|
| One front per loop? | A whole-loop identity suppresses opposing inward arrivals from that same island. The C demo's rectangular island has a 1400 m SUM ridge between 700 m incoming walks. We track boundary-vertex provenance, then require opposing arrivals and sufficiently separated seeds. This predicate is a heuristic; smooth early bands and bucket counters cannot establish the source's identity scheme. |
| Open branches/right-hand side? | A raster spur alone cannot specify a unique filled face or its orientation. Supply a signed filled mask through `ct_shape_fn`, using an explicit winding/fill rule upstream. Do not infer elevation or silently invent closure from the line pixels. |
| IID or coherent increments? | Additive randomness does not specify spatial covariance. The implementation keeps additive walks but lets `walk_coherence` blend independent values with a spatial noise field at each causal depth. Use 0 for the literal IID baseline; 0.75–0.9 is a useful starting range for smoother neighboring gradients. This is a visual tuning suggestion, not a measured source parameter. The blend reduces variance and changes the marginal distribution. |
| Lake composite/order? | At 15:59–17:21 the talk describes hiding lakes for a first solve, deriving lake heights, then solving again with sea and lakes together. That supports a second constrained solve rather than an assumed `min(first, lake_field)` composite. Our provisional minimum over each lake footprint and feasibility adjustment are reconstruction choices. |
| Region rules and slopes? | At 28:51–29:51 the talk discusses variation in front propagation; at 30:20–31:50 it discusses overpiling and settling slopes. Our four blended rule profiles are an extension motivated by those remarks and the region photograph. Our final graph projection is not claimed to reproduce her erosion/settling algorithm. |

The implementation applies SUM to distinct uncombined arrivals, with terminal
collisions. N-way sums, source-separation distance, and closure of rare enclosed
raster pockets remain explicit assumptions. For elevated lake fronts, the
current sum is of sea-relative heights; alternate baseline arithmetic remains
an open reverse-engineering question.

The lake and slope stages run globally across the cubemap before streaming.
Running them independently per 256×256 chunk would give neighboring chunks
different boundary conditions and potentially different ridges or lake levels.
Chunks sample the frozen result and globally addressed fine noise. Renderer
filtering, mixed-LOD mesh stitching, vegetation geometry, and atmospheric effects
are separate integration work, not inferred terrain-generation mechanics.
