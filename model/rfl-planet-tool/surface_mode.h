#ifndef SURFACE_MODE_H
#define SURFACE_MODE_H
#include <stdint.h>
#include "surface_xpm.h"

enum {
    SURFACE_STYLE_EARTHLIKE = 0,
    SURFACE_STYLE_METAL,
    SURFACE_STYLE_RUST,
    SURFACE_STYLE_ASH,
    SURFACE_STYLE_SCORIA,
    SURFACE_STYLE_BLASTED,
    SURFACE_STYLE_MOON,
    SURFACE_STYLE_POLAR_ICE,
    SURFACE_STYLE_SHEPARD_ICE,
    NSURFACE_STYLES
};

#define SURFACE_FLAG_NO_ATMO       (1u << 0)
#define SURFACE_FLAG_POLAR_AURORA  (1u << 1)
#define SURFACE_FLAG_TWO_LAYER_OCEAN (1u << 2)

void surface_mode_init(void);
double surface_mode_unit_meters(void);
int surface_mode_width(void);
int surface_mode_height(void);
void surface_mode_set_pose(double x, double y, double altitude_m, double heading_rad);
void surface_mode_spawn_on_surface(double heading_rad);
void surface_mode_get_pose(double *x, double *y, double *altitude_m, double *heading_rad);
double surface_mode_altitude_m(void);
void surface_mode_set_controls(int forward, int backward, int left, int right,
                               int up, int down, int shift, int turn_left, int turn_right,
                               int pitch_up, int pitch_down);
void surface_mode_update(void);
/* Hold C to allow downhill sliding; releasing it clears slide momentum. */
void surface_mode_set_slide(int held);
/* Render-only walking eye offset; physical pose and collision remain stable. */
void surface_mode_set_first_person(int enabled);
double surface_mode_view_bob_m(void);
void surface_mode_mouse_look(double dyaw, double dpitch);
double surface_mode_view_pitch(void);
double surface_mode_sun_cloud_cover(double sun_elevation);
void surface_mode_set_cloud_amount(double amount);
double surface_mode_get_cloud_amount(void);
void surface_mode_set_city_density(double density);
/* Rocky-backend gravity in km-sized surface cells per second. Gas ignores this;
 * its deck physics keeps the old buoyant inward drift. */
void surface_mode_set_gravity(double gravity_k_per_sec);
/* Optional: bake the walkable terrain from a 3D body. fn returns height in
 * metres for a unit sphere direction n[3]; vscale scales the baked relief. */
void surface_mode_set_height_source(double (*fn)(const double n[3], int *material, void *user),
                                    void *user, double vscale);
void surface_mode_set_sun_angle(double angle_rad);
double surface_mode_get_sun_angle(void);
/* Lighting supplied by the outer day/night cycle. day_level=1 is full day,
 * night_level=1 is full night. Backends clamp/blend internally. */
void surface_mode_set_light_level(double day_level, double night_level);
void surface_mode_set_fog_distance(double cells);
double surface_mode_get_fog_distance(void);
void surface_mode_set_render_distance(double cells);
double surface_mode_get_render_distance(void);
double surface_mode_get_effective_render_distance(void);
double surface_mode_get_effective_solid_detail_distance(void);
double surface_mode_height_above_ground_cells(void);
double surface_mode_motion_speed_mps(void);
void surface_mode_set_solid_detail_distance(double cells);
double surface_mode_get_solid_detail_distance(void);
/* Carry residual orbital approach velocity into the surface backend.
 * Units are surface cells per simulation tick, in local heading-forward,
 * heading-right, and vertical/up components. */
void surface_mode_set_entry_effect(double speed_mps, double angle_deg);
void surface_mode_set_entry_velocity(double forward_cells, double right_cells, double up_cells);
void surface_mode_set_shadow_mask(uint32_t mask);
uint32_t surface_mode_get_shadow_mask(void);
void surface_mode_set_gas_layers(int layers);
void surface_mode_set_polar_effects(double aurora_strength, double ring_size);
void surface_mode_set_polar_ring_density(double density);
void surface_mode_set_layer_ceiling(int layer, double cells);
void surface_mode_set_planet_style(int style, uint32_t flags, uint32_t ground_rgb, uint32_t accent_rgb);
void surface_mode_set_atmosphere_density(double density);
void surface_mode_set_star_tint(uint32_t tint_rgb);
void surface_mode_set_fog_color(uint32_t fog_rgb);
int surface_mode_is_underwater(void);
void surface_mode_render_overlay(uint32_t *dst, const uint32_t *sky, int show_map_flag);

#endif
