/* The Linux-hosted flang-wasm compiler conflates int64_t with C long.
 * Emscripten uses 32-bit long. These adapters reconcile the declared ABI.
 * Only EXIST inquiries (hash 14119423, fully representable in uint32_t)
 * occur in this ExoPlaSim build. Integer64 output is resource diagnostics.
 */
#include <stdint.h>
#include <stdbool.h>
extern int64_t _FortranASystemClockCount(int);
extern bool _FortranAioOutputInteger64(void*,int64_t);
extern bool _FortranAioInquireLogical(void*,uint64_t,bool*);
int32_t exo_clock_count(int kind){return (int32_t)_FortranASystemClockCount(kind);}
bool exo_output_integer64(void*cookie,int32_t value){return _FortranAioOutputInteger64(cookie,(int64_t)value);}
bool exo_inquire_logical(void*cookie,uint32_t hash,bool*out){return _FortranAioInquireLogical(cookie,(uint64_t)hash,out);}
