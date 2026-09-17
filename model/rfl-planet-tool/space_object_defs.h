#ifndef RFL_SPACE_OBJECT_DEFS_H
#define RFL_SPACE_OBJECT_DEFS_H

#include <stdint.h>

#include "surface_backend.h"
#include "surface_mode.h"

/* Object behavior metadata belongs here, not in giant nested ternaries.
 * Keep this table boring: adding a landable body should mean adding one
 * kind/spec and then wiring the renderer/surface callbacks for that kind.
 */
#define SPACE_OBJECT_RADIUS_PLANET        1000000.0
#define SPACE_OBJECT_RADIUS_YELLOW_STAR   7600000.0
#define SPACE_OBJECT_RADIUS_WHITE_DWARF     42000.0
#define SPACE_OBJECT_RADIUS_RED_DWARF     4720000.0
#define SPACE_OBJECT_RADIUS_BLUE_WHITE    9200000.0
#define SPACE_OBJECT_RADIUS_NEUTRON_STAR    36000.0
#define SPACE_OBJECT_RADIUS_HERBIG_HARO   8600000.0
#define SPACE_OBJECT_RADIUS_ROCKY          680000.0
#define SPACE_OBJECT_RADIUS_MOON           288000.0
#define SPACE_OBJECT_RADIUS_GAS_GIANT     1360000.0
#define SPACE_OBJECT_RADIUS_GSV_SHIP     27000000.0
#define SPACE_OBJECT_RADIUS_SCOUNDREL_SHIP  25000.0
#define SPACE_OBJECT_ORBITAL_MAJOR_RADIUS 3680000.0
#define SPACE_OBJECT_ORBITAL_BAND_HALF_WIDTH 15000.0
#define SPACE_OBJECT_ORBITAL_HULL_HALF_HEIGHT 144000.0
#define SPACE_OBJECT_RADIUS_ORBITAL_OUTER \
	(SPACE_OBJECT_ORBITAL_MAJOR_RADIUS + SPACE_OBJECT_ORBITAL_BAND_HALF_WIDTH)
#define SPACE_OBJECT_RADIUS_KERR_LENS      360000.0

typedef enum {
	SPACE_OBJECT_LAND_STAGE_NONE = 0,
	SPACE_OBJECT_LAND_STAGE_SYSTEM,
	SPACE_OBJECT_LAND_STAGE_EARTHLIKE,
	SPACE_OBJECT_LAND_STAGE_ORBITAL,
	SPACE_OBJECT_LAND_STAGE_GAS_GIANT
} SpaceObjectLandStage;

typedef enum {
	SPACE_OBJECT_RENDER_NONE = 0,
	SPACE_OBJECT_RENDER_STAR,
	SPACE_OBJECT_RENDER_COMPACT_STAR,
	SPACE_OBJECT_RENDER_ROCKY,
	SPACE_OBJECT_RENDER_ORBITAL,
	SPACE_OBJECT_RENDER_GAS_GIANT,
	SPACE_OBJECT_RENDER_KERR_LENS,
	SPACE_OBJECT_RENDER_HERBIG_HARO,
	SPACE_OBJECT_RENDER_SHIP
} SpaceObjectRenderClass;

typedef struct {
	const char *short_label;
	uint32_t tint_rgb;
	uint32_t sky_glow_rgb;
	uint32_t fog_rgb;
	uint32_t core_rgb;
	uint32_t edge_rgb;
	uint32_t filament_rgb;
	double granulation;
	double corona;
	double preview_scale;
	int compact;
} SpaceStarSpec;

/* ---- unified gas-giant generation ---------------------------------------
 * One spec drives EVERY view of a gas giant: the space-mode banded sphere,
 * the limb atmosphere, the target preview / map inset, the projected ring +
 * pixel-line aurora overlays, and the descent decks (palette, layer count,
 * layer ceilings) of the gas surface backend. Adding a giant = one row here
 * plus a SpaceObjectSpec row; no renderer edits. */
typedef enum { GAS_VARIANT_STANDARD = 0, GAS_VARIANT_POLAR, GAS_VARIANT_ICE, NGAS_VARIANTS } GasVariant;

typedef struct {
	const char *label;
	uint32_t zone_rgb;        /* bright band + top descent deck            */
	uint32_t belt_rgb;        /* dark band + mid descent deck              */
	uint32_t atmo_low, atmo_mid, atmo_high, atmo_night;  /* limb scattering */
	int layers;               /* descent decks, 1..3                       */
	double layer_ceiling[3];  /* default punch-through ceilings, cells     */
	double aurora;            /* 0 = none; pixel-line aurora strength      */
	double ring_size;         /* 0 = no ring                               */
	double ring_density;
	uint32_t ring_rgb;
	double swirl;             /* 0..1 longitudinal band swirl              */
	double hex_storm;         /* 0..1 hexagonal polar storm + sheen        */
} GasGiantSpec;

static const GasGiantSpec gas_giant_specs[NGAS_VARIANTS] = {
	[GAS_VARIANT_STANDARD] = { "GAS GIANT",
		0xe8ce8cu, 0x966034u,
		0x4a2a12u, 0xd68e3au, 0xffdc7eu, 0x30203au,
		3, {160.0, 12.0, 12.0}, 0.0, 0.0, 8.0, 0xbe886eu, 0.0, 0.0 },
	[GAS_VARIANT_POLAR] = { "POLAR GAS GIANT",
		0x48b0e8u, 0x123680u,
		0x082676u, 0x2aacecu, 0x7effd6u, 0x1a1452u,
		2, {160.0, 12.0, 12.0}, 1.0, 1.0, 8.0, 0xa476aeu, 1.0, 1.0 },
	[GAS_VARIANT_ICE] = { "ICE GIANT",
		0xb8d6e4u, 0x4c7494u,
		0x16303cu, 0x6aa4bcu, 0xd8f2ffu, 0x101c30u,
		2, {120.0, 14.0, 12.0}, 0.45, 2.2, 14.0, 0xd2e1f0u, 0.40, 0.0 },
};

static inline const GasGiantSpec *gas_spec_for_variant(int v)
{
	if (v < 0 || v >= NGAS_VARIANTS) v = GAS_VARIANT_STANDARD;
	return &gas_giant_specs[v];
}

/* Examples for adding more object kinds:
 * - New star: add SPACE_OBJ_BLUE_STAR before N_SPACE_OBJ_KINDS, add a
 *   SO_STAR or SO_PROTOSTAR row in space_object_specs, then route any custom
 *   space-mode color/menu behavior in raycaster_planet.c.
 * - New rocky/landable planet: add SPACE_OBJ_CARBON_WORLD, add a SO_ROCK(...)
 *   spec row with surface style/gravity/colors, give it a space/zoo radius
 *   and preview color in raycaster_planet.c, and only add a custom renderer
 *   branch if the generic rocky path is not enough.
 * - New gas giant: add a GasVariant row above, then add a SO_GAS(...) spec row.
 */
typedef enum {
	SPACE_OBJ_NONE = 0,
	SPACE_OBJ_YELLOW_STAR,
	SPACE_OBJ_WHITE_DWARF,
	SPACE_OBJ_RED_DWARF,
	SPACE_OBJ_EARTHLIKE,
	SPACE_OBJ_METAL_WORLD,
	SPACE_OBJ_RUST_WORLD,
	SPACE_OBJ_ASH_WORLD,
	SPACE_OBJ_SCORIA_BODY,
	SPACE_OBJ_BLASTED_WORLD,
	SPACE_OBJ_MOON,
	SPACE_OBJ_SHEPARD_MOON,
	SPACE_OBJ_ORBITAL,
	SPACE_OBJ_POLAR_WORLD,
	SPACE_OBJ_GAS_GIANT,
	SPACE_OBJ_POLAR_GAS_GIANT,
	SPACE_OBJ_ICE_GIANT,
	SPACE_OBJ_GSV_SHIP,
	SPACE_OBJ_SCOUNDREL_SHIP,
	SPACE_OBJ_KERR_BLACK_HOLE,
	SPACE_OBJ_BLUE_WHITE_STAR,
	SPACE_OBJ_NEUTRON_STAR,
	SPACE_OBJ_HERBIG_HARO,
	/* Append IDs: saved object/replay identifiers retain their old values. */
	SPACE_OBJ_RED_DWARF_HABITABLE,
	SPACE_OBJ_K_STAR_HABITABLE,
	SPACE_OBJ_K_STAR,
	N_SPACE_OBJ_KINDS
} SpaceObjectKind;

typedef struct {
	const char *label;
	uint32_t map_color;
	int map_radius;
	int render_class;
	double radius_m;
	int star_like;
	int star_rank;
	SpaceStarSpec star;
	int landable;
	int land_stage;
	int surface_backend;
	int gas_variant;
	int gas_layers;
	int surface_style;
	uint32_t surface_flags;
	double atmo_density;
	double surface_gravity_kps;
	uint32_t surface_ground;
	uint32_t surface_accent;
	double great_distance_frequency;
} SpaceObjectSpec;

#define GRAV_EARTHLIKE 1.200
#define GRAV_ORBITAL 0.150
#define GRAV_MID_WORLD 0.085
#define GRAV_SMALL_BODY 0.025
#define GRAV_POLAR_WORLD 0.115

#define NO_STAR_SPEC { NULL, 0u, 0u, 0u, 0u, 0u, 0u, 0.0, 0.0, 1.0, 0 }
#define SO_NO_LAND(render, radius) \
	(render), (radius), 0, 0, NO_STAR_SPEC, \
	0, SPACE_OBJECT_LAND_STAGE_NONE, -1, -1, 0, SURFACE_STYLE_EARTHLIKE, 0u, 0.0, 0.0, 0u, 0u
#define SO_STAR(short_name, radius, rank, tint, glow, fog, core, edge, filament, gran, corona, preview, compact) \
	((compact) ? SPACE_OBJECT_RENDER_COMPACT_STAR : SPACE_OBJECT_RENDER_STAR), (radius), 1, (rank), \
	{ (short_name), (tint), (glow), (fog), (core), (edge), (filament), (gran), (corona), (preview), (compact) }, \
	0, SPACE_OBJECT_LAND_STAGE_NONE, -1, -1, 0, SURFACE_STYLE_EARTHLIKE, 0u, 0.0, 0.0, 0u, 0u
#define SO_PROTOSTAR(short_name, radius, rank, tint, glow, fog, core, edge, filament, gran, corona, preview) \
	SPACE_OBJECT_RENDER_HERBIG_HARO, (radius), 1, (rank), \
	{ (short_name), (tint), (glow), (fog), (core), (edge), (filament), (gran), (corona), (preview), 0 }, \
	0, SPACE_OBJECT_LAND_STAGE_NONE, -1, -1, 0, SURFACE_STYLE_EARTHLIKE, 0u, 0.0, 0.0, 0u, 0u
#define SO_ROCK(radius, style, flags, gravity, ground, accent) \
	SPACE_OBJECT_RENDER_ROCKY, (radius), 0, 0, NO_STAR_SPEC, \
	1, SPACE_OBJECT_LAND_STAGE_SYSTEM, SURFACE_BACKEND_EARTH, -1, 0, style, (flags), \
	((flags) & SURFACE_FLAG_NO_ATMO ? 0.0 : 0.55), (gravity), (ground), (accent)
#define SO_GAS(variant, layers) \
	SPACE_OBJECT_RENDER_GAS_GIANT, SPACE_OBJECT_RADIUS_GAS_GIANT, 0, 0, NO_STAR_SPEC, \
	1, SPACE_OBJECT_LAND_STAGE_GAS_GIANT, SURFACE_BACKEND_GAS_GIANT, variant, layers, \
	SURFACE_STYLE_EARTHLIKE, 0u, 2.60, 0.0, 0u, 0u

static const SpaceObjectSpec space_object_specs[N_SPACE_OBJ_KINDS] = {
	[SPACE_OBJ_NONE]            = {"NONE",             0x9098a0u, 2, SO_NO_LAND(SPACE_OBJECT_RENDER_NONE, 0.0)},
	[SPACE_OBJ_YELLOW_STAR]     = {"YELLOW STAR",      0xffd65cu, 4,
		SO_STAR("YELLOW", SPACE_OBJECT_RADIUS_YELLOW_STAR, 3,
		        0xfff2c8u, 0xffe2a8u, 0x00bed2u, 0xfff27eu, 0xffb530u, 0xffd246u,
		        1.00, 0.90, 1.05, 0)},
	[SPACE_OBJ_WHITE_DWARF]     = {"WHITE DWARF",      0xd2ecffu, 3,
		SO_STAR("WHITE DWARF", SPACE_OBJECT_RADIUS_WHITE_DWARF, 1,
		        0xdceeffu, 0xd2ecffu, 0xa06cffu, 0xfffce6u, 0xbad6ffu, 0xaad7ffu,
		        1.45, 1.25, 0.52, 1),
		.great_distance_frequency = 0.024},
	[SPACE_OBJ_RED_DWARF]       = {"RED DWARF",        0xff522au, 4,
		SO_STAR("RED DWARF", SPACE_OBJECT_RADIUS_RED_DWARF, 0,
		        0xff8a6au, 0xff765au, 0xf08a42u, 0xff7a3cu, 0x701e16u, 0xff5a36u,
		        0.85, 0.72, 0.88, 0)},

	/* Atmosphere-bearing Earthlike keeps the original baked terrain/cloud style. */
	[SPACE_OBJ_EARTHLIKE]       = {"EARTHLIKE",        0x70beffu, 2,
		SPACE_OBJECT_RENDER_ROCKY, SPACE_OBJECT_RADIUS_PLANET, 0, 0, NO_STAR_SPEC,
		1, SPACE_OBJECT_LAND_STAGE_EARTHLIKE, SURFACE_BACKEND_EARTH, -1, 0,
		SURFACE_STYLE_EARTHLIKE, 0u, 1.00, GRAV_EARTHLIKE, 0x2db464u, 0x506ebeu},

	/* The rest of the rocky system bodies are now independently landable.
	 * They deliberately use no-atmosphere surface skies: stars are always visible. */
	[SPACE_OBJ_METAL_WORLD]     = {"METAL WORLD",      0xccae84u, 2,
		SO_ROCK(SPACE_OBJECT_RADIUS_ROCKY, SURFACE_STYLE_METAL,   SURFACE_FLAG_NO_ATMO,      GRAV_MID_WORLD, 0x9a8d7au, 0xf0d09au)},
	[SPACE_OBJ_RUST_WORLD]      = {"RUST WORLD",       0xe27c4au, 2,
		SO_ROCK(SPACE_OBJECT_RADIUS_ROCKY, SURFACE_STYLE_RUST,    SURFACE_FLAG_NO_ATMO,      GRAV_MID_WORLD, 0x8f3f28u, 0xe27c4au)},
	[SPACE_OBJ_ASH_WORLD]       = {"ASH WORLD",        0xa6aab2u, 2,
		SO_ROCK(SPACE_OBJECT_RADIUS_ROCKY, SURFACE_STYLE_ASH,     SURFACE_FLAG_NO_ATMO,      GRAV_MID_WORLD, 0x60646cu, 0xc0c4ccu)},
	[SPACE_OBJ_SCORIA_BODY]     = {"SCORIA BODY",      0xb25240u, 2,
		SO_ROCK(SPACE_OBJECT_RADIUS_ROCKY, SURFACE_STYLE_SCORIA,  SURFACE_FLAG_NO_ATMO,      GRAV_MID_WORLD, 0x4d2b28u, 0xff7148u)},
	[SPACE_OBJ_BLASTED_WORLD]   = {"BLASTED WORLD",    0xd67e52u, 2,
		SO_ROCK(SPACE_OBJECT_RADIUS_ROCKY, SURFACE_STYLE_BLASTED, SURFACE_FLAG_NO_ATMO,      GRAV_MID_WORLD, 0x7d6658u, 0xffb070u)},
	[SPACE_OBJ_MOON]            = {"MOON",             0xc0c0c4u, 2,
		SO_ROCK(SPACE_OBJECT_RADIUS_MOON, SURFACE_STYLE_MOON,    SURFACE_FLAG_NO_ATMO,      GRAV_SMALL_BODY, 0x85858au, 0xd6d6dau)},
	[SPACE_OBJ_SHEPARD_MOON]    = {"SHEPARD MOON",    0xe8f8ffu, 2,
		SO_ROCK(SPACE_OBJECT_RADIUS_MOON, SURFACE_STYLE_SHEPARD_ICE, SURFACE_FLAG_TWO_LAYER_OCEAN,
		        GRAV_SMALL_BODY, 0xd8edf4u, 0xffffffu)},
	[SPACE_OBJ_ORBITAL]         = {"ORBITAL",          0xbeffd2u, 3,
		SPACE_OBJECT_RENDER_ORBITAL, SPACE_OBJECT_RADIUS_ORBITAL_OUTER, 0, 0, NO_STAR_SPEC,
		1, SPACE_OBJECT_LAND_STAGE_ORBITAL, SURFACE_BACKEND_EARTH, -1, 0,
		SURFACE_STYLE_EARTHLIKE, 0u, 0.70, GRAV_ORBITAL, 0x2db464u, 0x506ebeu},
	[SPACE_OBJ_POLAR_WORLD]     = {"POLAR WORLD",      0x70f4b0u, 3,
		SO_ROCK(SPACE_OBJECT_RADIUS_ROCKY, SURFACE_STYLE_POLAR_ICE, SURFACE_FLAG_NO_ATMO | SURFACE_FLAG_POLAR_AURORA,
		        GRAV_POLAR_WORLD, 0x6faeb8u, 0xe6fff8u)},

	[SPACE_OBJ_GAS_GIANT]       = {"GAS GIANT",        0xe0ae52u, 3, SO_GAS(GAS_VARIANT_STANDARD, 3)},
	[SPACE_OBJ_POLAR_GAS_GIANT] = {"POLAR GAS GIANT",  0x70f0d2u, 3, SO_GAS(GAS_VARIANT_POLAR, 2)},
	[SPACE_OBJ_ICE_GIANT]       = {"ICE GIANT",         0xc4dcecu, 3, SO_GAS(GAS_VARIANT_ICE, 2)},
	[SPACE_OBJ_GSV_SHIP]        = {"GSV",               0xa8c8e8u, 2,
		SPACE_OBJECT_RENDER_SHIP, SPACE_OBJECT_RADIUS_GSV_SHIP, 0, 0, NO_STAR_SPEC,
		0, SPACE_OBJECT_LAND_STAGE_SYSTEM, SURFACE_BACKEND_EARTH, -1, 0,
		SURFACE_STYLE_METAL, SURFACE_FLAG_NO_ATMO, 0.0, 0.020, 0x506070u, 0xd8f0ffu},
	[SPACE_OBJ_SCOUNDREL_SHIP]  = {"SCOUNDREL",         0xc0b2a0u, 2,
		SPACE_OBJECT_RENDER_SHIP, SPACE_OBJECT_RADIUS_SCOUNDREL_SHIP, 0, 0, NO_STAR_SPEC,
		0, SPACE_OBJECT_LAND_STAGE_SYSTEM, SURFACE_BACKEND_EARTH, -1, 0,
		SURFACE_STYLE_METAL, SURFACE_FLAG_NO_ATMO, 0.0, 0.020, 0x6c6258u, 0xf0d8b0u},
	[SPACE_OBJ_KERR_BLACK_HOLE] = {"KERR BLACK HOLE",  0x78a8ffu, 3, SO_NO_LAND(SPACE_OBJECT_RENDER_KERR_LENS, SPACE_OBJECT_RADIUS_KERR_LENS),
		.great_distance_frequency = 0.002},
	[SPACE_OBJ_BLUE_WHITE_STAR] = {"BLUE WHITE STAR",  0xb8d2ffu, 4,
		SO_STAR("BLUE WHITE", SPACE_OBJECT_RADIUS_BLUE_WHITE, 4,
		        0xb8d2ffu, 0xb8ceffu, 0x7aa8ffu, 0xf8fbffu, 0x82a8ffu, 0xb8d2ffu,
		        1.18, 1.02, 1.15, 0)},
	[SPACE_OBJ_NEUTRON_STAR]    = {"NEUTRON STAR",     0xcab8ffu, 3,
		SO_STAR("NEUTRON", SPACE_OBJECT_RADIUS_NEUTRON_STAR, 2,
		        0xcab8ffu, 0xd2c0ffu, 0xb46cffu, 0x7ad6ffu, 0x1c185cu, 0x7c5cffu,
		        1.75, 1.45, 0.40, 1),
		.great_distance_frequency = 0.004},
	[SPACE_OBJ_HERBIG_HARO]     = {"HERBIG-HARO",      0xffb05au, 4,
		SO_PROTOSTAR("HERBIG-HARO", SPACE_OBJECT_RADIUS_HERBIG_HARO, 2,
		             0xffc36au, 0xffa95au, 0xf08a42u, 0xffec9au, 0xb64520u, 0xffd070u,
		             1.18, 1.55, 1.12),
		.great_distance_frequency = 0.003},
	[SPACE_OBJ_RED_DWARF_HABITABLE] = {"RED DWARF HABITABLE", 0xa62582u, 2,
		SPACE_OBJECT_RENDER_ROCKY, SPACE_OBJECT_RADIUS_PLANET, 0, 0, NO_STAR_SPEC,
		1, SPACE_OBJECT_LAND_STAGE_EARTHLIKE, SURFACE_BACKEND_EARTH, -1, 0,
		SURFACE_STYLE_EARTHLIKE, SURFACE_FLAG_XPM_RED_DWARF, 1.00, GRAV_EARTHLIKE, 0xa62582u, 0x64131bu},
	[SPACE_OBJ_K_STAR_HABITABLE] = {"K STAR HABITABLE", 0xd35d20u, 2,
		SPACE_OBJECT_RENDER_ROCKY, SPACE_OBJECT_RADIUS_PLANET, 0, 0, NO_STAR_SPEC,
		1, SPACE_OBJECT_LAND_STAGE_EARTHLIKE, SURFACE_BACKEND_EARTH, -1, 0,
		SURFACE_STYLE_EARTHLIKE, SURFACE_FLAG_XPM_K_STAR, 1.00, GRAV_EARTHLIKE, 0x6c4630u, 0xd35d20u},
	[SPACE_OBJ_K_STAR] = {"K STAR", 0xffb96au, 4,
		SO_STAR("K STAR", 6000000.0, 2,
		        0xffe0b0u, 0xffbc78u, 0xc2a6a0u, 0xffd49au, 0xcb612du, 0xffa74eu,
		        0.95, 0.82, 1.00, 0)}
};

#undef SO_NO_LAND
#undef SO_STAR
#undef SO_PROTOSTAR
#undef SO_ROCK
#undef SO_GAS
#undef NO_STAR_SPEC
#undef GRAV_EARTHLIKE
#undef GRAV_ORBITAL
#undef GRAV_MID_WORLD
#undef GRAV_SMALL_BODY
#undef GRAV_POLAR_WORLD

static inline const SpaceObjectSpec *space_object_spec(int kind)
{
	if (kind < 0 || kind >= N_SPACE_OBJ_KINDS) kind = SPACE_OBJ_NONE;
	return &space_object_specs[kind];
}

static inline int space_object_kind_is_star_like(int kind)
{
	return space_object_spec(kind)->star_like;
}

static inline int space_object_is_habitable(int kind)
{
	return kind == SPACE_OBJ_EARTHLIKE || kind == SPACE_OBJ_RED_DWARF_HABITABLE ||
	       kind == SPACE_OBJ_K_STAR_HABITABLE;
}

static inline double space_object_radius(int kind)
{
	return space_object_spec(kind)->radius_m;
}

static inline double space_object_great_distance_frequency(int kind)
{
	const SpaceObjectSpec *sp = space_object_spec(kind);
	return sp->great_distance_frequency > 0.0 ? sp->great_distance_frequency : 0.0;
}

static inline const SpaceStarSpec *space_object_star_spec(int kind)
{
	const SpaceObjectSpec *sp = space_object_spec(kind);
	return sp->star_like ? &sp->star : &space_object_specs[SPACE_OBJ_YELLOW_STAR].star;
}

static inline int space_object_star_rank(int kind)
{
	const SpaceObjectSpec *sp = space_object_spec(kind);
	return sp->star_like ? sp->star_rank : 0;
}

static inline int space_object_default_star_for_kind(int kind)
{
	if (space_object_kind_is_star_like(kind)) return kind;
	switch (kind) {
	case SPACE_OBJ_RED_DWARF_HABITABLE: return SPACE_OBJ_RED_DWARF;
	case SPACE_OBJ_K_STAR_HABITABLE: return SPACE_OBJ_K_STAR;
	case SPACE_OBJ_ASH_WORLD:
	case SPACE_OBJ_BLASTED_WORLD:
	case SPACE_OBJ_POLAR_WORLD:
		return SPACE_OBJ_WHITE_DWARF;
	case SPACE_OBJ_METAL_WORLD:
	case SPACE_OBJ_SCORIA_BODY:
	case SPACE_OBJ_GAS_GIANT:
	case SPACE_OBJ_POLAR_GAS_GIANT:
	case SPACE_OBJ_ICE_GIANT:
		return SPACE_OBJ_RED_DWARF;
	case SPACE_OBJ_EARTHLIKE:
	case SPACE_OBJ_RUST_WORLD:
	case SPACE_OBJ_MOON:
	case SPACE_OBJ_SHEPARD_MOON:
	case SPACE_OBJ_ORBITAL:
	default:
		return SPACE_OBJ_YELLOW_STAR;
	}
}

#endif
