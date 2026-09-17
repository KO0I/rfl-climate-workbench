#include <emscripten.h>
#include <stdint.h>
extern int64_t _FortranASystemClockCountRate(int);
extern int64_t _FortranASystemClockCountMax(int);
extern void _FortranAAllocatableSetBounds(void*,int,int64_t,int64_t);
extern void _FortranAPointerSetBounds(void*,int,int64_t,int64_t);
int32_t magic_clock_rate(int kind){return (int32_t)_FortranASystemClockCountRate(kind);}
int32_t magic_clock_max(int kind){return (int32_t)_FortranASystemClockCountMax(kind);}
void magic_alloc_bounds(void*d,int dim,int32_t lo,int32_t hi){_FortranAAllocatableSetBounds(d,dim,lo,hi);}
void magic_pointer_bounds(void*d,int dim,int32_t lo,int32_t hi){_FortranAPointerSetBounds(d,dim,lo,hi);}

/* Yield between numerical timesteps so worker pause messages can be handled.
 * No solver values, timesteps or numerical operations are altered here. */
void magic_tick_(const int *step) {
  EM_ASM({ Module.currentStep = $0; }, *step);
  if ((*step-1)%10) return;
  EM_ASM({ if (Module.onStep) Module.onStep($0); }, *step);
  emscripten_sleep(1);
  while (EM_ASM_INT({ return Module.paused ? 1 : 0; })) emscripten_sleep(50);
}

/* The graph is closed before JavaScript reads and removes the local file. */
void magic_graph_ready_(void) {
  EM_ASM({ if (Module.onGraph) Module.onGraph(); });
}
