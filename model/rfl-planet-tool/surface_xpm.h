#ifndef RFL_SURFACE_XPM_H
#define RFL_SURFACE_XPM_H
#include <stdint.h>

#define SURFACE_XPM_SIDE 32
#define SURFACE_XPM_COLORS 30
#define SURFACE_FLAG_XPM_RED_DWARF (1u << 3)
#define SURFACE_FLAG_XPM_K_STAR (1u << 4)
enum { SURFACE_XPM_TEMPERATE, SURFACE_XPM_RED_DWARF, SURFACE_XPM_K_STAR, SURFACE_XPM_BIOMES };
#define SURFACE_XPM_NEAR_CELLS 2.0
#define SURFACE_XPM_FAR_CELLS 6.0
#define SURFACE_XPM_TREE_FAR_CELLS 128.0
#define SURFACE_XPM_GRASS_FAR_CELLS 16.0
#define SURFACE_XPM_MAX_DISTANCE_CELLS 128.0
#define SURFACE_XPM_TRANSPARENT 255

enum { SURFACE_XPM_GRASS, SURFACE_XPM_BUSH, SURFACE_XPM_TREE, SURFACE_XPM_TREE_LOW,
       SURFACE_XPM_ROCK, SURFACE_XPM_FLOWER };
int surface_xpm_biome_for_flags(uint32_t flags);
void surface_xpm_set_biome(int biome);
uint32_t surface_xpm_biome_color(int biome, unsigned int index);
typedef struct {
	unsigned char width, height;
	/* Horizontal pivot measured from the left edge, in half source pixels. */
	unsigned char pivot2;
	const unsigned char *pixels;
} SurfaceXpmSprite;

/* Material ids match surface_mode.c: sea=0, grass=2, forest=3. */
int surface_xpm_material(int material);
/* Classify the FINAL coarse tile before night/star tint, never its flatness.
 * The planet's sea flag can describe green, clamped terrain in surface mode. */
int surface_xpm_classify(int material, uint32_t coarse_color);
const SurfaceXpmSprite *surface_xpm_sprite(int kind, int side);
uint32_t surface_xpm_cell_seed(int x, int y);
double surface_xpm_strength(double speed_cells_per_tick, double altitude_cells);
double surface_xpm_coverage(double depth, double strength);
void surface_xpm_prepare(unsigned long tick, double sun_azimuth);
uint32_t surface_xpm_palette_color(unsigned int index);
/* x/y are wrapped, nonnegative world coordinates. Heights are detail voxels. */
unsigned int surface_xpm_sample(int material, double x, double y, unsigned int *height);

#endif
