/* Thin browser ABI. The Terrain Solver core is kept unchanged. */
#include "cubeterrain.h"
#include <inttypes.h>
#include <math.h>
#include <stdio.h>

static ct_config config;
static ct_world *world;
static char error[512], json[16384];
static double sample[7];

void ts_destroy(void) { ct_world_destroy(world); world = NULL; }
const char *ts_error(void) { return error; }
int ts_configure(const char *preset) {
    ts_destroy(); error[0] = 0;
    if (ct_config_preset(&config, preset)) return 1;
    snprintf(error, sizeof(error), "Unknown Terrain Solver preset."); return 0;
}
int ts_set(const char *key, const char *value) {
    return ct_config_set(&config, key, value, error, sizeof(error));
}
int ts_build(void) {
    ts_destroy(); error[0] = 0;
    world = ct_world_build(&config, NULL, NULL, error, sizeof(error));
    return world != NULL;
}
const double *ts_sample(double x, double y, double z) {
    ct_sample s;
    if (!ct_world_sample(world, (ct_vec3){x,y,z}, &s)) return NULL;
    sample[0]=s.height_m; sample[1]=s.water_m; sample[2]=s.is_water;
    sample[3]=s.biome; sample[4]=s.palette_index; sample[5]=s.material;
    sample[6]=s.moisture; return sample;
}
const char *ts_stats(void) {
    ct_stats s=ct_world_stats(world);
    snprintf(json,sizeof(json),"{\"algorithm_version\":%u,\"vertices\":%u,\"lakes\":%u,"
        "\"seams\":%u,\"junction_cells\":%u,\"settle_passes\":%u,"
        "\"max_macro_slope_excess_m\":%.17g,\"generation\":\"%016" PRIx64 "\"}",
        CT_ALGORITHM_VERSION,s.vertices,s.lakes,s.seams,s.junction_cells,s.settle_passes,
        s.max_macro_slope_excess_m,s.generation);
    return json;
}
const char *ts_config(void) {
    size_t used=(size_t)snprintf(json,sizeof(json),"{\"seed\":\"%" PRIu64 "\",\"planet_id\":\"%" PRIu64
        "\",\"macro_resolution\":%u,\"surface_lod\":%u",config.seed,config.planet_id,
        config.macro_resolution,config.surface_lod);
#define CT_KNOB(name, value, lo, hi) used+=(size_t)snprintf(json+used,sizeof(json)-used,",\"" #name "\":%.17g",config.name);
#include "ct_knobs.def"
#undef CT_KNOB
    snprintf(json+used,sizeof(json)-used,"}"); return json;
}
