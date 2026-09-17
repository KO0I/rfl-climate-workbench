#ifndef CUBETERRAIN_H
#define CUBETERRAIN_H

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CT_ALGORITHM_VERSION 2u
#define CT_CORE 256u
#define CT_GRID (CT_CORE + 1u) /* positive border, not an extra owned cell */
#define CT_SAMPLES (CT_GRID * CT_GRID)
#define CT_PALETTE_SIZE 40u

/* Exactly the face ordering and transforms in RFL's atlas_tool.c. */
typedef enum { CT_PX, CT_NX, CT_PY, CT_NY, CT_PZ, CT_NZ } ct_face;
typedef struct { double x, y, z; } ct_vec3;
typedef enum {
    CT_DEEP_SEA, CT_SHALLOWS, CT_LAKE, CT_SAND,
    CT_GRASS, CT_FOREST, CT_ROCK, CT_SNOW
} ct_biome;
typedef enum { CT_PLAINS, CT_HILLS, CT_RIDGES, CT_BROKEN, CT_REGION_COUNT } ct_region;
typedef struct {
    double weight[CT_REGION_COUNT]; /* continuous partition, sum = 1 */
    double height_scale, roughness, ridge_scale, delay_passes;
    unsigned dominant; /* diagnostic category; never switches generation abruptly */
} ct_region_sample;

typedef struct {
    uint64_t seed, planet_id;
    uint32_t macro_resolution; /* power of 2: 8..256, intervals per cube edge */
    uint32_t surface_lod;      /* 0..16: chunks per face edge = 2^surface_lod */
#define CT_KNOB(name, value, lo, hi) double name;
#include "ct_knobs.def"
#undef CT_KNOB
} ct_config;

typedef struct ct_world ct_world;
typedef struct {
    uint32_t vertices, lakes, seams, junction_cells, passes[2], settle_passes;
    double max_macro_slope_excess_m;
    uint64_t generation; /* hashes config and actual macro field */
} ct_stats;

typedef struct {
    double height_m;       /* ground / lake bed / sea floor; sea datum = 0 */
    double water_m;        /* water surface; meaningful only if is_water */
    double moisture;
    uint8_t is_water, biome, material, palette_index;
} ct_sample;

typedef struct {
    uint64_t planet_id, generation;
    uint32_t face, lod, x, y;
} ct_key;

typedef struct {
    ct_key key;
    double height_quantum_m;
    uint64_t digest;
    uint32_t clipped_samples;
    /* Row-major [j * CT_GRID + i]. Core = i,j in [0,255]. */
    uint16_t height[CT_SAMPLES], water[CT_SAMPLES];
    uint8_t biome[CT_SAMPLES], palette[CT_SAMPLES];
} ct_chunk;

/* Optional shape override: positive land, negative water, zero contour.
 * Evaluated during build only. Must be deterministic for a direction and
 * use the same field at cube seams. ctx remains caller-owned. */
typedef double (*ct_shape_fn)(ct_vec3 direction, void *ctx);

void ct_config_defaults(ct_config *cfg);
int ct_config_preset(ct_config *cfg, const char *name);
int ct_config_set(ct_config *cfg, const char *name, const char *value,
                  char *error, size_t error_size);
int ct_config_validate(const ct_config *cfg, char *error, size_t error_size);
void ct_config_print(const ct_config *cfg, FILE *out);
void ct_knobs_print(FILE *out);

const char *ct_face_name(ct_face face);
int ct_face_parse(const char *name, ct_face *face);
int ct_direction(ct_face face, double u, double v, ct_vec3 *out);
int ct_project(ct_vec3 direction, ct_face *face, double *u, double *v);

/* Heavy preprocessing; run at world load or on a worker, never per frame.
 * No external constraint solver is needed. Error returns NULL with reason. */
ct_world *ct_world_build(const ct_config *cfg, ct_shape_fn shape, void *ctx,
                         char *error, size_t error_size);
void ct_world_destroy(ct_world *world);
const ct_config *ct_world_config(const ct_world *world);
ct_stats ct_world_stats(const ct_world *world);
int ct_world_save(const ct_world *world, const char *path);
ct_world *ct_world_load(const char *path, char *error, size_t error_size);

/* Immutable world: these calls are reentrant and allocate nothing. */
int ct_world_sample(const ct_world *world, ct_vec3 direction, ct_sample *out);
int ct_world_region(const ct_world *world, ct_vec3 direction, ct_region_sample *out);
const char *ct_region_name(ct_region region);
uint16_t ct_height_encode(double height_m, double quantum_m, int *clipped);
double ct_height_decode(uint16_t value, double quantum_m);
void ct_palette_default(uint32_t rgb[CT_PALETTE_SIZE]);
int ct_palette_read(const char *path, uint32_t rgb[CT_PALETTE_SIZE]);

int ct_key_at(const ct_world *world, ct_vec3 direction, unsigned lod,
              ct_key *out, double *local_x, double *local_y);
int ct_key_equal(ct_key a, ct_key b);
int ct_key_valid(const ct_world *world, ct_key key);
/* Unbounded local coordinates work across faces via reprojection. */
int ct_key_direction(ct_key key, double local_x, double local_y, ct_vec3 *out);
/* World-space tangent vectors per one local sample at this position. */
int ct_key_metric(const ct_world *world, ct_key key, double local_x,
                   double local_y, ct_vec3 *dx_m, ct_vec3 *dy_m);

int ct_chunk_generate(const ct_world *world, ct_key key, ct_chunk *out);
int ct_chunk_save(const ct_chunk *chunk, const char *path);
int ct_chunk_load(const char *path, ct_chunk *out);
int ct_chunk_write_core_u16(const ct_chunk *chunk, const char *path);
int ct_chunk_write_ppm(const ct_chunk *chunk, const uint32_t palette[CT_PALETTE_SIZE],
                        const char *path);

#ifdef __cplusplus
}
#endif
#endif
