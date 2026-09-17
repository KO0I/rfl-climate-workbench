#ifndef RFL_PLANET_TOOL_H
#define RFL_PLANET_TOOL_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define PLANET_TOOL_PATH_MAX 512

typedef struct PlanetToolMenuState {
	int page;
	int selected;
	uint32_t seed;
	char system_name[64];
	char system_dir[PLANET_TOOL_PATH_MAX];
	char asset_dir[PLANET_TOOL_PATH_MAX];
	char status[160];
} PlanetToolMenuState;

int planet_tool_export_game_assets_to(const char *asset_dir);
int planet_tool_generate_system(const char *systems_root, const char *display_name,
                                int system_type, uint32_t seed,
                                char *out_system_dir, size_t out_system_dir_size,
                                char *out_asset_dir, size_t out_asset_dir_size);
void planet_tool_menu_init(PlanetToolMenuState *state, const char *system_name,
                           int system_type, uint32_t seed,
                           const char *system_dir, const char *asset_dir);
int planet_tool_menu_key(PlanetToolMenuState *state, int key);
void planet_tool_menu_render_argb(const PlanetToolMenuState *state, uint32_t *dst,
                                  int width, int height, float time_sec);

#ifdef __cplusplus
}
#endif

#endif
