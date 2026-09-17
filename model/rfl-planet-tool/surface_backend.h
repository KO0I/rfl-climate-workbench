#ifndef SURFACE_BACKEND_H
#define SURFACE_BACKEND_H

/* Runtime-switchable surface backends.
 *
 * The engine (raycaster_planet.c) talks to ONE surface through the
 * surface_mode_* API declared in surface_mode.h. This selector lets that
 * single API dispatch to different concrete surfaces depending on which
 * celestial body the player dropped into.
 *
 * Call surface_backend_select() BEFORE enter_detail_mode() (e.g. in the
 * start_* function or right when a collision is detected), so the first
 * surface_mode_init()/set_pose() routes to the correct backend.
 */

enum {
    SURFACE_BACKEND_EARTH = 0,   /* existing Comanche earthlike surface */
    SURFACE_BACKEND_GAS_GIANT,   /* layered cloud-deck gas giant        */
    NSURFACE_BACKENDS
};

void surface_backend_select(int backend);
int  surface_backend_current(void);

#endif
