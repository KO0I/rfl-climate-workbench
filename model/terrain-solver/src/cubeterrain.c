#include "cubeterrain.h"
#include <errno.h>
#include <float.h>
#include <inttypes.h>
#include <math.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>

#define CT_PI 3.14159265358979323846
#define CT_NONE UINT32_MAX

typedef struct {
    const char *name;
    size_t offset;
    double def, lo, hi;
} knob;
static const knob knobs[] = {
#define CT_KNOB(name, value, lo, hi) {#name, offsetof(ct_config, name), value, lo, hi},
#include "ct_knobs.def"
#undef CT_KNOB
};
#define NK (sizeof(knobs) / sizeof(knobs[0]))

typedef struct {
    ct_vec3 dir;
    uint32_t nb[4];
    double length[4];
    unsigned degree;
    double shape, height, water;
    double region[CT_REGION_COUNT];
    uint32_t lake;
    uint8_t pinned;
} node;
struct ct_world {
    ct_config cfg;
    ct_stats stats;
    node *nodes;
    uint32_t *map;
    size_t map_count;
};

static int fail(char *out, size_t n, const char *fmt, ...)
{
    va_list ap;
    if (out && n) { va_start(ap, fmt); vsnprintf(out, n, fmt, ap); va_end(ap); }
    return 0;
}
static double clamp(double x, double a, double b) { return fmax(a, fmin(b, x)); }
static double lerp(double a, double b, double t) { return a + t * (b - a); }
static double smooth(double x) { x = clamp(x, 0, 1); return x*x*(3-2*x); }
static double dot(ct_vec3 a, ct_vec3 b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
static ct_vec3 sub(ct_vec3 a, ct_vec3 b) { return (ct_vec3){a.x-b.x,a.y-b.y,a.z-b.z}; }
static double norm(ct_vec3 a) { return sqrt(dot(a,a)); }
static int normalize(ct_vec3 *a)
{
    double m = fmax(fabs(a->x), fmax(fabs(a->y), fabs(a->z))), d;
    if (!isfinite(m) || m <= 0 || !isfinite(a->x) || !isfinite(a->y) || !isfinite(a->z)) return 0;
    a->x /= m; a->y /= m; a->z /= m;
    d = norm(*a); a->x /= d; a->y /= d; a->z /= d; return 1;
}
static uint64_t mix64(uint64_t x)
{
    x ^= x >> 30; x *= UINT64_C(0xbf58476d1ce4e5b9);
    x ^= x >> 27; x *= UINT64_C(0x94d049bb133111eb);
    return x ^ (x >> 31);
}
static double unit(uint64_t x) { return (double)(mix64(x) >> 11) * 0x1p-53; }
static uint64_t hash_u64(uint64_t h, uint64_t v)
{
    unsigned i;
    for (i=0;i<8;i++) { h ^= (v >> (8*i)) & 255u; h *= UINT64_C(1099511628211); }
    return h;
}
static uint64_t bits(double d) { uint64_t u; memcpy(&u,&d,8); return u; }
static double *cfg_ptr(ct_config *c, size_t i) { return (double *)((char *)c + knobs[i].offset); }
static double cfg_val(const ct_config *c, size_t i) { return *(const double *)((const char *)c + knobs[i].offset); }

void ct_config_defaults(ct_config *c)
{
    size_t i;
    if (!c) return;
    memset(c,0,sizeof(*c)); c->seed=42; c->planet_id=1; c->macro_resolution=64; c->surface_lod=6;
    for(i=0;i<NK;i++) *cfg_ptr(c,i)=knobs[i].def;
}
int ct_config_preset(ct_config *c, const char *name)
{
    if (!c || !name) return 0;
    ct_config_defaults(c);
    if (!strcmp(name,"balanced")) return 1;
    if (!strcmp(name,"walk")) { c->noise_mix=0; c->ridge_amplitude_m=0; c->detail_amplitude_m=0; return 1; }
    if (!strcmp(name,"noise")) { c->noise_mix=1; c->lake_max_fraction=0; return 1; }
    if (!strcmp(name,"archipelago")) {
        c->continent_frequency=6; c->sea_threshold=0.08; c->warp_strength=0.35;
        c->ridge_amplitude_m=900; c->land_relief_m=4500; c->land_step_m=200;
        c->land_jitter_m=180; c->humidity=0.8; return 1;
    }
    if (!strcmp(name,"alpine")) {
        c->sea_threshold=-0.18; c->ridge_amplitude_m=4200; c->land_step_m=600;
        c->land_jitter_m=500; c->max_macro_slope=0.025; c->treeline_m=1600;
        c->snowline_m=2900; return 1;
    }
    if (!strcmp(name,"dry")) { c->humidity=0.16; c->forest_threshold=0.8; c->snowline_m=5000; return 1; }
    if (!strcmp(name,"regional")) {
        c->region_strength=1; c->coast_detail_amplitude=0.14;
        c->macro_resolution=128; c->noise_mix=0.35; return 1;
    }
    return 0;
}
int ct_config_validate(const ct_config *c, char *e, size_t n)
{
    size_t i;
    if (!c) return fail(e,n,"NULL config");
    if (sizeof(double)!=8 || DBL_MANT_DIG!=53) return fail(e,n,"IEEE binary64 double is required");
    if(c->macro_resolution<8 || c->macro_resolution>256 || (c->macro_resolution & (c->macro_resolution-1)))
        return fail(e,n,"macro_resolution must be a power of two, 8..256");
    if(c->surface_lod>16) return fail(e,n,"surface_lod must be 0..16");
    for(i=0;i<NK;i++) {
        double v=cfg_val(c,i);
        if(!isfinite(v) || v<knobs[i].lo || v>knobs[i].hi) return fail(e,n,"%s must be in [%g,%g]",knobs[i].name,knobs[i].lo,knobs[i].hi);
    }
    if(floor(c->continent_octaves)!=c->continent_octaves || floor(c->detail_octaves)!=c->detail_octaves ||
       floor(c->front_delay_passes)!=c->front_delay_passes || floor(c->slope_constraints)!=c->slope_constraints)
        return fail(e,n,"octaves, front_delay_passes, and slope_constraints must be integers");
    if(c->land_jitter_m>c->land_step_m) return fail(e,n,"land_jitter_m must not exceed land_step_m (uphill increments)");
    if(c->snowline_m<c->treeline_m) return fail(e,n,"snowline_m must be >= treeline_m");
    return 1;
}
int ct_config_set(ct_config *c, const char *name, const char *value, char *e, size_t n)
{
    size_t i; char *end; double d; unsigned long long u;
    if(!c || !name || !value || !*value) return fail(e,n,"missing setting");
    if(!strcmp(name,"seed") || !strcmp(name,"planet_id") || !strcmp(name,"macro_resolution") || !strcmp(name,"surface_lod")) {
        if(*value=='-') return fail(e,n,"%s must be unsigned",name);
        errno=0; u=strtoull(value,&end,0);
        if(errno || end==value || *end) return fail(e,n,"invalid integer: %s",value);
        if(!strcmp(name,"seed")) c->seed=(uint64_t)u;
        else if(!strcmp(name,"planet_id")) c->planet_id=(uint64_t)u;
        else { if(u>UINT32_MAX) return fail(e,n,"integer too large: %s",name);
            if(!strcmp(name,"macro_resolution")) c->macro_resolution=(uint32_t)u; else c->surface_lod=(uint32_t)u;
        }
        return 1;
    }
    errno=0; d=strtod(value,&end);
    if(errno || end==value || *end || !isfinite(d)) return fail(e,n,"invalid finite number: %s",value);
    for(i=0;i<NK;i++) if(!strcmp(name,knobs[i].name)) {
        if(d<knobs[i].lo || d>knobs[i].hi) return fail(e,n,"%s must be in [%g,%g]",name,knobs[i].lo,knobs[i].hi);
        *cfg_ptr(c,i)=d; return 1;
    }
    return fail(e,n,"unknown knob: %s",name);
}
void ct_config_print(const ct_config *c, FILE *f)
{
    size_t i;
    fprintf(f,"seed=%" PRIu64 "\nplanet_id=%" PRIu64 "\nmacro_resolution=%u\nsurface_lod=%u\n",c->seed,c->planet_id,c->macro_resolution,c->surface_lod);
    for(i=0;i<NK;i++) fprintf(f,"%s=%.17g\n",knobs[i].name,cfg_val(c,i));
}
void ct_knobs_print(FILE *f)
{
    size_t i;
    fprintf(f,"seed / planet_id: uint64; macro_resolution: 8,16,32,64,128,256; surface_lod: 0..16\n");
    for(i=0;i<NK;i++) fprintf(f,"%-26s default %-10g range [%g, %g]\n",knobs[i].name,knobs[i].def,knobs[i].lo,knobs[i].hi);
}

const char *ct_face_name(ct_face f)
{
    static const char *names[]={"+X","-X","+Y","-Y","+Z","-Z"};
    return (unsigned)f<6 ? names[f] : "?";
}
int ct_face_parse(const char *s, ct_face *f)
{
    unsigned i;
    if(!s || !f) return 0;
    for(i=0;i<6;i++) if(!strcmp(s,ct_face_name((ct_face)i))) { *f=(ct_face)i; return 1; }
    return 0;
}
static ct_vec3 cube(ct_face f, double u, double v)
{
    switch(f) {
    case CT_PX:return (ct_vec3){1,-v,-u}; case CT_NX:return (ct_vec3){-1,-v,u};
    case CT_PY:return (ct_vec3){u,1,v}; case CT_NY:return (ct_vec3){u,-1,-v};
    case CT_PZ:return (ct_vec3){u,-v,1}; default:return (ct_vec3){-u,-v,-1};
    }
}
int ct_direction(ct_face f,double u,double v,ct_vec3 *out)
{
    if(!out || (unsigned)f>=6 || !isfinite(u) || !isfinite(v)) return 0;
    *out=cube(f,u,v); return normalize(out);
}
int ct_project(ct_vec3 d,ct_face *f,double *u,double *v)
{
    double ax=fabs(d.x),ay=fabs(d.y),az=fabs(d.z),m;
    if(!f || !u || !v || !isfinite(ax) || !isfinite(ay) || !isfinite(az)) return 0;
    m=fmax(ax,fmax(ay,az)); if(m==0) return 0;
    /* Stable half-open ownership: X wins ties, then Y, then Z. */
    if(ax>=ay && ax>=az) {
        *f=d.x>=0 ? CT_PX:CT_NX; *u=(d.x>=0 ? -d.z:d.z)/ax; *v=-d.y/ax;
    } else if(ay>=az) {
        *f=d.y>=0 ? CT_PY:CT_NY; *u=d.x/ay; *v=(d.y>=0 ? d.z:-d.z)/ay;
    } else {
        *f=d.z>=0 ? CT_PZ:CT_NZ; *u=(d.z>=0 ? d.x:-d.x)/az; *v=-d.y/az;
    }
    return 1;
}
static double lattice(int64_t x,int64_t y,int64_t z,uint64_t seed)
{
    return 2*unit(seed ^ mix64((uint64_t)x) ^ mix64((uint64_t)y+UINT64_C(0x12345678)) ^ mix64((uint64_t)z+UINT64_C(0x98765432)))-1;
}
static double fade(double x) { return x*x*x*(x*(x*6-15)+10); }
static double noise3(ct_vec3 p,uint64_t seed)
{
    int64_t ix=(int64_t)floor(p.x),iy=(int64_t)floor(p.y),iz=(int64_t)floor(p.z);
    double x=fade(p.x-floor(p.x)),y=fade(p.y-floor(p.y)),z=fade(p.z-floor(p.z));
    double a=lerp(lattice(ix,iy,iz,seed),lattice(ix+1,iy,iz,seed),x);
    double b=lerp(lattice(ix,iy+1,iz,seed),lattice(ix+1,iy+1,iz,seed),x);
    double c=lerp(lattice(ix,iy,iz+1,seed),lattice(ix+1,iy,iz+1,seed),x);
    double d=lerp(lattice(ix,iy+1,iz+1,seed),lattice(ix+1,iy+1,iz+1,seed),x);
    return lerp(lerp(a,b,y),lerp(c,d,y),z);
}
static ct_vec3 scale(ct_vec3 p,double f) { return (ct_vec3){p.x*f,p.y*f,p.z*f}; }
static double fbm(ct_vec3 p,double freq,int oct,double gain,double lac,uint64_t seed)
{
    double sum=0,weight=0,a=1; int k;
    for(k=0;k<oct;k++) {
        sum+=a*noise3(scale(p,freq),seed+UINT64_C(0x9e3779b97f4a7c15)*(unsigned)(k+1));
        weight+=a; a*=gain; freq*=lac;
    }
    return sum/weight;
}
static ct_vec3 warped(const ct_config *c,ct_vec3 d)
{
    ct_vec3 q=scale(d,c->warp_frequency),p=d;
    p.x+=c->warp_strength*noise3(q,c->seed+101);
    p.y+=c->warp_strength*noise3(q,c->seed+202);
    p.z+=c->warp_strength*noise3(q,c->seed+303);
    return p;
}
const char *ct_region_name(ct_region r)
{
    static const char *names[]={"plains","hills","ridges","broken"};
    return (unsigned)r<CT_REGION_COUNT ? names[r]:"?";
}
static void region_weights(const ct_config *c,ct_vec3 d,double weight[CT_REGION_COUNT])
{
    double score[CT_REGION_COUNT],best=-DBL_MAX,total=0; unsigned k;
    ct_vec3 p=warped(c,d);
    /* A smooth partition from four low-frequency fields. Subtracting the
     * largest score keeps exp bounded; no face or chunk identity enters. */
    for(k=0;k<CT_REGION_COUNT;k++) {
        score[k]=fbm(p,c->region_frequency,3,0.5,2,c->seed+1101+101*k);
        best=fmax(best,score[k]);
    }
    for(k=0;k<CT_REGION_COUNT;k++) {
        weight[k]=exp((score[k]-best)/c->region_blend); total+=weight[k];
    }
    for(k=0;k<CT_REGION_COUNT;k++) weight[k]/=total;
}
static void region_settings(const ct_config *c,const double weight[CT_REGION_COUNT],ct_region_sample *r)
{
    const double height[]={c->plains_height_scale,c->hills_height_scale,c->ridges_height_scale,c->broken_height_scale};
    const double rough[]={c->plains_roughness,c->hills_roughness,c->ridges_roughness,c->broken_roughness};
    const double ridge_scale[]={c->plains_ridge_scale,c->hills_ridge_scale,c->ridges_ridge_scale,c->broken_ridge_scale};
    const double delay[]={c->plains_delay_passes,c->hills_delay_passes,c->ridges_delay_passes,c->broken_delay_passes};
    unsigned k; double hs=0,rs=0,gs=0,ds=0;
    r->dominant=0;
    for(k=0;k<CT_REGION_COUNT;k++) {
        r->weight[k]=weight[k];
        if(weight[k]>weight[r->dominant]) r->dominant=k;
        hs+=weight[k]*height[k]; rs+=weight[k]*rough[k];
        gs+=weight[k]*ridge_scale[k]; ds+=weight[k]*delay[k];
    }
    r->height_scale=lerp(1,hs,c->region_strength);
    r->roughness=lerp(1,rs,c->region_strength);
    r->ridge_scale=lerp(1,gs,c->region_strength);
    r->delay_passes=c->region_strength*ds;
}
static double shape_noise(const ct_config *c,ct_vec3 d,double roughness)
{
    ct_vec3 p=warped(c,d);
    double s=fbm(p,c->continent_frequency,(int)c->continent_octaves,c->persistence,c->lacunarity,c->seed)-c->sea_threshold;
    return s+c->coast_detail_amplitude*roughness*fbm(p,c->coast_detail_frequency,2,0.5,2,c->seed+1501);
}
static double ridge(const ct_config *c,ct_vec3 d)
{
    double r=1-fabs(fbm(d,c->ridge_frequency,4,c->persistence,c->lacunarity,c->seed+707));
    double region=smooth((fbm(d,3,3,0.5,2,c->seed+708)+0.15)*2);
    return region*pow(r,c->ridge_sharpness)*c->ridge_amplitude_m;
}

static size_t midx(unsigned n,unsigned f,unsigned x,unsigned y)
{ return ((size_t)f*(n+1)+y)*(n+1)+x; }
static int add_edge(ct_world *w,uint32_t a,uint32_t b)
{
    node *p=&w->nodes[a],*q=&w->nodes[b]; unsigned k; double length;
    for(k=0;k<p->degree;k++) if(p->nb[k]==b) return 1;
    if(p->degree>=4 || q->degree>=4 || a==b) return 0;
    length=2*w->cfg.radius_m*asin(clamp(norm(sub(p->dir,q->dir))*0.5,0,1));
    p->nb[p->degree]=b; p->length[p->degree++]=length;
    q->nb[q->degree]=a; q->length[q->degree++]=length;
    return 1;
}
static ct_world *topology(const ct_config *cfg,char *error,size_t error_size)
{
    ct_world *w; unsigned n=cfg->macro_resolution,f,x,y; size_t i;
    if(!ct_config_validate(cfg,error,error_size)) return NULL;
    w=calloc(1,sizeof(*w)); if(!w) { fail(error,error_size,"world allocation failed"); return NULL; }
    w->cfg=*cfg; w->map_count=6u*(n+1u)*(n+1u);
    w->nodes=calloc(6u*n*n+2u,sizeof(node)); w->map=malloc(w->map_count*sizeof(uint32_t));
    if(!w->nodes || !w->map) goto bad;
    for(i=0;i<w->map_count;i++) w->map[i]=CT_NONE;
    for(f=0;f<6;f++) for(y=0;y<=n;y++) for(x=0;x<=n;x++) {
        ct_vec3 d=cube((ct_face)f,2.0*x/n-1,2.0*y/n-1);
        ct_face cf; double u,v; unsigned cx,cy; size_t ci; uint32_t id;
        ct_project(d,&cf,&u,&v);
        cx=(unsigned)llround((u+1)*n*0.5); cy=(unsigned)llround((v+1)*n*0.5);
        ci=midx(n,(unsigned)cf,cx,cy); id=w->map[ci];
        if(id==CT_NONE) {
            id=w->stats.vertices++; w->map[ci]=id; normalize(&d); w->nodes[id].dir=d;
        }
        w->map[midx(n,f,x,y)]=id;
    }
    if(w->stats.vertices!=6u*n*n+2u) goto bad;
    for(f=0;f<6;f++) for(y=0;y<=n;y++) for(x=0;x<=n;x++) {
        uint32_t a=w->map[midx(n,f,x,y)];
        if(x<n && !add_edge(w,a,w->map[midx(n,f,x+1,y)])) goto bad;
        if(y<n && !add_edge(w,a,w->map[midx(n,f,x,y+1)])) goto bad;
    }
    return w;
bad:
    fail(error,error_size,"cubemap graph allocation/topology failed"); ct_world_destroy(w); return NULL;
}
void ct_world_destroy(ct_world *w) { if(w) { free(w->nodes); free(w->map); free(w); } }
const ct_config *ct_world_config(const ct_world *w) { return w ? &w->cfg:NULL; }
ct_stats ct_world_stats(const ct_world *w) { ct_stats z={0}; return w ? w->stats:z; }

static int find_lakes(ct_world *w)
{
    uint32_t count=w->stats.vertices,*queue=malloc((size_t)count*sizeof(*queue));
    uint32_t *sizes=calloc(count,sizeof(*sizes)),*label=malloc((size_t)count*sizeof(*label));
    uint32_t components=0,biggest=CT_NONE,i,k,head,tail; unsigned n;
    if(!queue || !sizes || !label) { free(queue); free(sizes); free(label); return 0; }
    for(i=0;i<count;i++) label[i]=CT_NONE;
    for(i=0;i<count;i++) if(w->nodes[i].shape<0 && label[i]==CT_NONE) {
        queue[0]=i; head=0; tail=1; label[i]=components;
        while(head<tail) {
            node *p=&w->nodes[queue[head++]];
            for(n=0;n<p->degree;n++) { k=p->nb[n];
                if(w->nodes[k].shape<0 && label[k]==CT_NONE) { label[k]=components; queue[tail++]=k; }
            }
        }
        sizes[components]=tail;
        if(biggest==CT_NONE || tail>sizes[biggest]) biggest=components;
        components++;
    }
    /* Count is deliberately a node-fraction heuristic, not equal-area geography. */
    for(i=0;i<components;i++) {
        if(i!=biggest && sizes[i] <= count*w->cfg.lake_max_fraction && w->cfg.noise_mix<1)
            sizes[i]=++w->stats.lakes;
        else sizes[i]=0;
    }
    for(i=0;i<count;i++) w->nodes[i].lake=label[i]==CT_NONE ? 0:sizes[label[i]];
    free(queue); free(sizes); free(label); return 1;
}

typedef struct {
    uint32_t seed, depth, pass, due;
    double h;
    uint8_t state; /* 0 unseen, 1 growing, 2 terminal seam, 3 scheduled */
    unsigned arrivals;
    uint32_t arrival_seed[4];
    double arrival_height[4];
} walk;
static int land_side(const node *p,int second) { return p->shape>=0 || (!second && p->lake); }
static int meeting_pair(const ct_world *w,uint32_t cell,uint32_t a,uint32_t b,const walk *v)
{
    ct_vec3 da,db; double nd,sep,edge;
    if(v[a].seed==v[b].seed) return 0;
    da=sub(w->nodes[a].dir,w->nodes[cell].dir); db=sub(w->nodes[b].dir,w->nodes[cell].dir);
    nd=dot(da,db)/(norm(da)*norm(db));
    if(nd > -0.25) return 0; /* converging, not neighboring tangential expansion */
    edge=fmax(norm(da),norm(db));
    sep=norm(sub(w->nodes[v[a].seed].dir,w->nodes[v[b].seed].dir));
    return sep > w->cfg.meet_separation_cells*edge;
}
static double increment(const ct_world *w,uint32_t i,uint32_t depth,int inside)
{
    const ct_config *c=&w->cfg;
    ct_region_sample r; double mean,jitter;
    uint64_t salt=mix64(c->seed ^ ((uint64_t)depth<<32) ^ UINT64_C(0xdecafbad));
    double iid=2*unit(salt^i)-1;
    double coherent=noise3(scale(w->nodes[i].dir,c->walk_noise_frequency),salt);
    double n=lerp(iid,coherent,c->walk_coherence);
    region_settings(c,w->nodes[i].region,&r);
    mean=inside ? c->land_step_m*r.height_scale:c->sea_step_m;
    jitter=inside ? fmin(mean,c->land_jitter_m*r.height_scale*r.roughness):c->sea_jitter_m*r.roughness;
    return mean+jitter*n;
}
static int close_junctions(ct_world *w,walk *v,int second)
{
    uint32_t count=w->stats.vertices,*queue=malloc((size_t)count*sizeof(*queue));
    uint32_t *seen=calloc(count,sizeof(*seen)),*depth=calloc(count,sizeof(*depth));
    double *height=calloc(count,sizeof(*height)); uint32_t i,component=0;
    if(!queue || !seen || !depth || !height) { free(queue); free(seen); free(depth); free(height); return 0; }
    for(i=0;i<count;i++) if(v[i].state==0 || v[i].state==3) {
        uint32_t head=0,tail=1,k; int inside=land_side(&w->nodes[i],second); double sum=0; unsigned contributions=0;
        component++; queue[0]=i; v[i].state=4; /* collect one unsolved component */
        while(head<tail) {
            uint32_t a=queue[head++]; node *p=&w->nodes[a]; unsigned j;
            for(j=0;j<p->degree;j++) {
                uint32_t b=p->nb[j]; unsigned r;
                if(land_side(&w->nodes[b],second)!=inside) continue;
                if(v[b].state==0 || v[b].state==3) { queue[tail++]=b; v[b].state=4; }
                else if(v[b].state==2) for(r=0;r<v[b].arrivals;r++) {
                    uint32_t seed=v[b].arrival_seed[r];
                    if(seen[seed]!=component) { seen[seed]=component; depth[seed]=v[b].depth; height[seed]=v[b].arrival_height[r]; }
                    else if(v[b].depth>depth[seed]) { depth[seed]=v[b].depth; height[seed]=v[b].arrival_height[r]; }
                }
            }
        }
        for(k=0;k<count;k++) if(seen[k]==component) { sum+=height[k]; contributions++; }
        if(!contributions) { free(queue); free(seen); free(depth); free(height); return 0; }
        /* Raster closure of a collision event, no step and no onward walking.
         * Deduplicate original incoming seed contributions, never sum sums. */
        for(k=0;k<tail;k++) { v[queue[k]].h=sum; v[queue[k]].state=2; v[queue[k]].arrivals=0; }
        w->stats.junction_cells+=tail;
        if(second) w->stats.seams+=tail;
    }
    free(queue); free(seen); free(depth); free(height); return 1;
}
static int solve(ct_world *w,int second,char *error,size_t error_size)
{
    uint32_t count=w->stats.vertices,i,k,pass=0,remaining=count;
    walk *v=calloc(count,sizeof(*v)); uint32_t *pending=malloc((size_t)count*sizeof(*pending));
    if(!v || !pending) { free(v); free(pending); return fail(error,error_size,"walk allocation failed"); }
    for(i=0;i<count;i++) {
        node *p=&w->nodes[i]; double level=DBL_MAX; int boundary=0; unsigned j;
        p->pinned=0;
        for(j=0;j<p->degree;j++) {
            node *q=&w->nodes[p->nb[j]];
            if(land_side(p,second)!=land_side(q,second)) {
                node *water=land_side(p,second) ? q:p;
                level=fmin(level,second ? water->water:0); boundary=1;
            }
        }
        if(boundary) { v[i].state=1; v[i].seed=i; v[i].h=level; p->pinned=1; remaining--; }
    }
    if(remaining==count) {
        free(v); free(pending);
        return fail(error,error_size,"mask has no coast; change sea_threshold or use the noise preset");
    }
    while(remaining) {
        uint32_t np=0,future=0; pass++;
        for(i=0;i<count;i++) if(v[i].state==0 || v[i].state==3) {
            node *p=&w->nodes[i]; uint32_t parent[4],best; unsigned j,m=0;
            int inside=land_side(p,second); unsigned meet_mask=0;
            for(j=0;j<p->degree;j++) { k=p->nb[j];
                if(v[k].state==1 && v[k].pass<pass && inside==land_side(&w->nodes[k],second)) parent[m++]=k;
            }
            if(!m) continue;
            if(v[i].state==0) {
                ct_region_sample r; unsigned max_delay;
                region_settings(&w->cfg,p->region,&r);
                max_delay=(unsigned)w->cfg.front_delay_passes+(unsigned)floor(r.delay_passes+0.5);
                v[i].state=3;
                v[i].due=pass+(uint32_t)(mix64(w->cfg.seed ^ i ^ UINT64_C(0xabc123))%(max_delay+1u));
            }
            if(v[i].due>pass) { future++; continue; }
            best=parent[0];
            for(j=1;j<m;j++) if(v[parent[j]].depth<v[best].depth || (v[parent[j]].depth==v[best].depth && parent[j]<best)) best=parent[j];
            /* Evaluate against the previous pass; commit only after the scan. */
            for(j=0;j<m;j++) for(k=j+1;k<m;k++) if(meeting_pair(w,i,parent[j],parent[k],v)) meet_mask|=(1u<<j)|(1u<<k);
            v[i].seed=v[best].seed; v[i].depth=v[best].depth+1; v[i].pass=pass;
            if(meet_mask) {
                uint32_t used[4]; unsigned used_n=0;
                v[i].h=0;
                for(j=0;j<m;j++) if(meet_mask&(1u<<j)) {
                    unsigned t; int duplicate=0;
                    for(t=0;t<used_n;t++) if(used[t]==v[parent[j]].seed) duplicate=1;
                    if(!duplicate) {
                        used[used_n++]=v[parent[j]].seed; v[i].h+=v[parent[j]].h;
                        v[i].arrival_seed[v[i].arrivals]=v[parent[j]].seed;
                        v[i].arrival_height[v[i].arrivals++]=v[parent[j]].h;
                    }
                }
                /* Mark future terminal state in due; state remains scheduled. */
                v[i].due=CT_NONE;
            } else v[i].h=v[best].h+increment(w,i,v[i].depth,inside);
            pending[np++]=i;
        }
        for(i=0;i<np;i++) {
            k=pending[i]; v[k].state=v[k].due==CT_NONE ? 2:1;
            if(v[k].state==2 && second) w->stats.seams++;
        }
        remaining-=np;
        if(!np && !future) {
            if(!close_junctions(w,v,second)) {
                free(v); free(pending);
                return fail(error,error_size,"unreachable macro region or junction allocation failed");
            }
            remaining=0;
        }
    }
    for(i=0;i<count;i++) w->nodes[i].height=v[i].h;
    w->stats.passes[second]=pass;
    free(v); free(pending); return 1;
}

/* Multi-source Dijkstra computes min_j(initial[j] + slope * distance(i,j)).
 * An indexed heap has O(V) storage and O(E log V) work, with no solver library.
 * Initial costs may be negative; all graph edge costs remain nonnegative. */
typedef struct { uint32_t *id,*pos,size; double *cost; } heap;
static int less(const heap *h,uint32_t a,uint32_t b)
{ return h->cost[a]<h->cost[b] || (h->cost[a]==h->cost[b] && a<b); }
static void heap_swap(heap *h,uint32_t a,uint32_t b)
{
    uint32_t t=h->id[a]; h->id[a]=h->id[b]; h->id[b]=t; h->pos[h->id[a]]=a; h->pos[h->id[b]]=b;
}
static void heap_up(heap *h,uint32_t at)
{ while(at && less(h,h->id[at],h->id[(at-1)/2])) { uint32_t p=(at-1)/2; heap_swap(h,at,p); at=p; } }
static int envelope(const ct_world *w,double *cost,int flat_water)
{
    uint32_t i,count=w->stats.vertices; heap h;
    h.id=malloc((size_t)count*sizeof(*h.id)); h.pos=malloc((size_t)count*sizeof(*h.pos)); h.size=count; h.cost=cost;
    if(!h.id || !h.pos) { free(h.id); free(h.pos); return 0; }
    for(i=0;i<count;i++) { h.id[i]=i; h.pos[i]=i; heap_up(&h,i); }
    while(h.size) {
        uint32_t a=h.id[0],at=0; unsigned j; const node *p=&w->nodes[a];
        h.pos[a]=CT_NONE; h.size--;
        if(h.size) {
            h.id[0]=h.id[h.size]; h.pos[h.id[0]]=0;
            while(2*at+1<h.size) {
                uint32_t child=2*at+1;
                if(child+1<h.size && less(&h,h.id[child+1],h.id[child])) child++;
                if(!less(&h,h.id[child],h.id[at])) break;
                heap_swap(&h,at,child); at=child;
            }
        }
        if(cost[a]==DBL_MAX) break;
        for(j=0;j<p->degree;j++) {
            uint32_t b=p->nb[j]; double edge=w->cfg.max_macro_slope*p->length[j],candidate;
            /* Shoreline pins include the first land node. Zero-cost water
             * edges extend each flat water constraint to those shore nodes. */
            if(flat_water && (p->shape<0 || w->nodes[b].shape<0)) edge=0;
            candidate=cost[a]+edge;
            if(h.pos[b]!=CT_NONE && candidate<cost[b]) { cost[b]=candidate; heap_up(&h,h.pos[b]); }
        }
    }
    free(h.id); free(h.pos); return 1;
}
static int fit_lake_levels(ct_world *w)
{
    uint32_t i; double *upper;
    if(!w->cfg.slope_constraints || !w->stats.lakes) return 1;
    upper=malloc((size_t)w->stats.vertices*sizeof(*upper)); if(!upper) return 0;
    for(i=0;i<w->stats.vertices;i++) upper[i]=w->nodes[i].shape<0 ? w->nodes[i].water:DBL_MAX;
    if(!envelope(w,upper,1)) { free(upper); return 0; }
    for(i=0;i<w->stats.vertices;i++) if(w->nodes[i].shape<0) w->nodes[i].water=upper[i];
    free(upper); return 1;
}
static int settle(ct_world *w)
{
    uint32_t i,count=w->stats.vertices; unsigned j;
    double *lower=NULL,*upper=NULL,*next=NULL;
    if(w->cfg.slope_constraints) {
        lower=malloc((size_t)count*sizeof(*lower)); upper=malloc((size_t)count*sizeof(*upper)); next=malloc((size_t)count*sizeof(*next));
        if(!lower || !upper || !next) goto bad;
        for(i=0;i<count;i++) {
            lower[i]=w->nodes[i].pinned ? -w->nodes[i].height:DBL_MAX;
            upper[i]=w->nodes[i].pinned ? w->nodes[i].height:DBL_MAX;
        }
        if(!envelope(w,lower,0) || !envelope(w,upper,0)) goto bad;
        for(i=0;i<count;i++) {
            if(-lower[i]>upper[i]+1e-7) goto bad;
            next[i]=clamp(w->nodes[i].height,-lower[i],upper[i]);
        }
        if(!envelope(w,next,0)) goto bad;
        for(i=0;i<count;i++) w->nodes[i].height=next[i];
        w->stats.settle_passes=3;
    }
    free(lower); free(upper); free(next);
    for(i=0;i<count;i++) {
        node *p=&w->nodes[i];
        for(j=0;j<p->degree;j++) w->stats.max_macro_slope_excess_m=fmax(w->stats.max_macro_slope_excess_m,
            fabs(p->height-w->nodes[p->nb[j]].height)-w->cfg.max_macro_slope*p->length[j]);
    }
    return 1;
bad:
    free(lower); free(upper); free(next); return 0;
}
static uint64_t world_hash(const ct_world *w)
{
    uint64_t h=UINT64_C(14695981039346656037); size_t i;
    h=hash_u64(h,CT_ALGORITHM_VERSION); h=hash_u64(h,w->cfg.seed); h=hash_u64(h,w->cfg.planet_id);
    h=hash_u64(h,w->cfg.macro_resolution); h=hash_u64(h,w->cfg.surface_lod);
    for(i=0;i<NK;i++) h=hash_u64(h,bits(cfg_val(&w->cfg,i)));
    for(i=0;i<w->stats.vertices;i++) {
        unsigned k;
        h=hash_u64(h,bits(w->nodes[i].shape)); h=hash_u64(h,bits(w->nodes[i].height));
        h=hash_u64(h,bits(w->nodes[i].water)); h=hash_u64(h,w->nodes[i].lake);
        for(k=0;k<CT_REGION_COUNT;k++) h=hash_u64(h,bits(w->nodes[i].region[k]));
    }
    return h;
}
ct_world *ct_world_build(const ct_config *cfg,ct_shape_fn shape,void *ctx,char *error,size_t error_size)
{
    ct_world *w=topology(cfg,error,error_size); uint32_t i; double *levels=NULL;
    if(!w) return NULL;
    for(i=0;i<w->stats.vertices;i++) {
        ct_region_sample r; double s;
        region_weights(cfg,w->nodes[i].dir,w->nodes[i].region);
        region_settings(cfg,w->nodes[i].region,&r);
        s=shape ? shape(w->nodes[i].dir,ctx):shape_noise(cfg,w->nodes[i].dir,r.roughness);
        if(!isfinite(s) || fabs(s)>4) { fail(error,error_size,"shape callback must return finite values in [-4,4]"); goto bad; }
        w->nodes[i].shape=s;
    }
    if(!find_lakes(w)) { fail(error,error_size,"lake allocation failed"); goto bad; }
    if(cfg->noise_mix<1) {
        if(!solve(w,0,error,error_size)) goto bad;
        levels=malloc((w->stats.lakes+1u)*sizeof(*levels));
        if(!levels) { fail(error,error_size,"lake levels allocation failed"); goto bad; }
        for(i=0;i<=w->stats.lakes;i++) levels[i]=DBL_MAX;
        levels[0]=0;
        for(i=0;i<w->stats.vertices;i++) if(w->nodes[i].lake) {
            uint32_t j=w->nodes[i].lake; levels[j]=fmin(levels[j],w->nodes[i].height);
        }
        for(i=0;i<w->stats.vertices;i++) w->nodes[i].water=levels[w->nodes[i].lake];
        free(levels); levels=NULL;
        if(!fit_lake_levels(w)) { fail(error,error_size,"lake constraint allocation failed"); goto bad; }
        if(!solve(w,1,error,error_size)) goto bad;
    }
    for(i=0;i<w->stats.vertices;i++) {
        node *p=&w->nodes[i]; double s=p->shape,analytic; ct_region_sample r;
        /* Preserve nonzero lake constraints; noise is inserted as inland relief. */
        if(p->lake || p->pinned) continue;
        region_settings(cfg,p->region,&r);
        analytic=s>=0 ? cfg->land_relief_m*s*r.height_scale : cfg->ocean_depth_m*s;
        if(s>=0) analytic+=ridge(cfg,p->dir)*r.ridge_scale*smooth(s*8);
        p->height=lerp(p->height,analytic,cfg->noise_mix);
    }
    if(cfg->noise_mix==1) for(i=0;i<w->stats.vertices;i++) {
        node *p=&w->nodes[i]; unsigned j;
        for(j=0;j<p->degree;j++) if((p->shape>=0)!=(w->nodes[p->nb[j]].shape>=0)) { p->height=0; p->pinned=1; break; }
    }
    if(!settle(w)) { fail(error,error_size,"infeasible pinned slope constraints or allocation failure"); goto bad; }
    w->stats.generation=world_hash(w);
    return w;
bad:
    free(levels); ct_world_destroy(w); return NULL;
}

uint16_t ct_height_encode(double h,double q,int *clipped)
{
    double d=h/q+32768;
    int clip=!isfinite(d) || d<0 || d>65535;
    if(clipped) *clipped=clip;
    if(!isfinite(d)) return 32768;
    return (uint16_t)llround(clamp(d,0,65535));
}
double ct_height_decode(uint16_t v,double q) { return ((int)v-32768)*q; }
static int sample_cell(const ct_world *w,ct_vec3 *d,uint32_t ids[4],double weights[4])
{
    ct_face f; double u,v,x,y,tx,ty; unsigned n,ix,iy;
    if(!w || !normalize(d) || !ct_project(*d,&f,&u,&v)) return 0;
    n=w->cfg.macro_resolution; x=clamp((u+1)*0.5*n,0,n); y=clamp((v+1)*0.5*n,0,n);
    ix=(unsigned)fmin(floor(x),n-1); iy=(unsigned)fmin(floor(y),n-1); tx=x-ix; ty=y-iy;
    ids[0]=w->map[midx(n,f,ix,iy)]; ids[1]=w->map[midx(n,f,ix+1,iy)];
    ids[2]=w->map[midx(n,f,ix,iy+1)]; ids[3]=w->map[midx(n,f,ix+1,iy+1)];
    weights[0]=(1-tx)*(1-ty); weights[1]=tx*(1-ty); weights[2]=(1-tx)*ty; weights[3]=tx*ty;
    /* Isolate a lone land/water corner so coast triangles use only shoreline
     * pins. Split conflicting lake saddles along their land diagonal. These
     * triangulations preserve all cell edges and keep distinct lakes apart. */
    {
        const node *a=&w->nodes[ids[0]],*b=&w->nodes[ids[1]],*c=&w->nodes[ids[2]],*e=&w->nodes[ids[3]];
        unsigned mask=(a->shape<0 ? 1u:0u)|(b->shape<0 ? 2u:0u)|(c->shape<0 ? 4u:0u)|(e->shape<0 ? 8u:0u);
        if(mask==1 || mask==8 || mask==7 || mask==14 || (mask==9 && a->lake!=e->lake)) {
            if(tx+ty<=1) { weights[0]=1-tx-ty; weights[1]=tx; weights[2]=ty; weights[3]=0; }
            else { weights[0]=0; weights[1]=1-ty; weights[2]=1-tx; weights[3]=tx+ty-1; }
        } else if(mask==2 || mask==4 || mask==11 || mask==13 || (mask==6 && b->lake!=c->lake)) {
            if(tx>=ty) { weights[0]=1-tx; weights[1]=tx-ty; weights[2]=0; weights[3]=ty; }
            else { weights[0]=1-ty; weights[1]=0; weights[2]=ty-tx; weights[3]=tx; }
        }
    }
    return 1;
}
static double node_shore(const ct_world *w,const node *p)
{
    double level=DBL_MAX; unsigned j;
    if(p->shape<0) return p->water;
    for(j=0;j<p->degree;j++) {
        const node *q=&w->nodes[p->nb[j]];
        if(q->shape<0) level=fmin(level,q->water);
    }
    return level==DBL_MAX ? 0:level;
}
int ct_world_region(const ct_world *w,ct_vec3 d,ct_region_sample *out)
{
    double weights[4],region[CT_REGION_COUNT]={0}; uint32_t ids[4]; unsigned k,j;
    if(!out || !sample_cell(w,&d,ids,weights)) return 0;
    for(k=0;k<4;k++) for(j=0;j<CT_REGION_COUNT;j++) region[j]+=weights[k]*w->nodes[ids[k]].region[j];
    region_settings(&w->cfg,region,out); return 1;
}
int ct_world_sample(const ct_world *w,ct_vec3 d,ct_sample *out)
{
    double h,s,l=0,shore=0,detail,local_shore,weights[4],best=0,humidity,temp_scale;
    double rw[CT_REGION_COUNT]={0}; uint32_t ids[4],lake=0; unsigned k,j; int shade;
    if(!out || !sample_cell(w,&d,ids,weights)) return 0;
    h=0; s=0;
    for(k=0;k<4;k++) {
        const node *p=&w->nodes[ids[k]];
        h+=weights[k]*p->height; s+=weights[k]*p->shape;
        shore+=weights[k]*node_shore(w,p);
        if(w->cfg.region_strength>0) for(j=0;j<CT_REGION_COUNT;j++) rw[j]+=weights[k]*p->region[j];
        if(p->shape<0 && weights[k]>best) {
            best=weights[k]; l=p->water; lake=p->lake;
        }
    }
    /* Land is derived from the same interpolated macro mask in every view.
     * Fine relief fades to zero at the contour; it cannot create a new coast. */
    local_shore=smooth(fabs(s)*24);
    detail=fbm(d,w->cfg.detail_frequency,(int)w->cfg.detail_octaves,w->cfg.persistence,w->cfg.lacunarity,w->cfg.seed+809);
    detail*=w->cfg.detail_amplitude_m*local_shore;
    if(w->cfg.region_strength>0) { ct_region_sample r; region_settings(&w->cfg,rw,&r); detail*=r.roughness; }
    memset(out,0,sizeof(*out));
    out->is_water=(uint8_t)(s<0);
    if(s<0) h=fmin(h+detail,l-0.01*local_shore);
    else { l=shore; h=fmax(h+detail,l+0.01*local_shore); }
    out->height_m=h; out->water_m=l;
    humidity=clamp(w->cfg.humidity+0.4*fbm(d,w->cfg.moisture_frequency,3,0.5,2,w->cfg.seed+909),0,1);
    out->moisture=humidity;
    temp_scale=fmax(0.03,1-w->cfg.polar_cooling*pow(fabs(d.y),2));
    if(out->is_water) out->biome=(uint8_t)(lake ? CT_LAKE : l-h<w->cfg.shallow_depth_m ? CT_SHALLOWS:CT_DEEP_SEA);
    else if(h>=w->cfg.snowline_m*temp_scale) out->biome=CT_SNOW;
    else if(h>=w->cfg.treeline_m*temp_scale) out->biome=CT_ROCK;
    else if(h-l<w->cfg.beach_height_m || humidity<w->cfg.desert_threshold) out->biome=CT_SAND;
    else out->biome=(uint8_t)(humidity>w->cfg.forest_threshold ? CT_FOREST:CT_GRASS);
    /* Material IDs match current RFL: water, shore, grass, forest, rock, snow. */
    { static const uint8_t mat[]={0,0,0,1,2,3,4,5}; out->material=mat[out->biome]; }
    shade=(int)floor(clamp(2+1.5*detail/fmax(w->cfg.detail_amplitude_m,1)+0.7*(humidity-0.5),0,4));
    out->palette_index=(uint8_t)(out->biome*5+shade);
    return 1;
}

void ct_palette_default(uint32_t rgb[CT_PALETTE_SIZE])
{
    static const uint32_t base[8]={0x17496b,0x399caa,0x367d87,0xddbd82,0x79aa67,0x3b765e,0x9b9b98,0xe0e8dd};
    unsigned b,k;
    for(b=0;b<8;b++) for(k=0;k<5;k++) {
        double factor=0.72+0.14*k; unsigned r=(base[b]>>16)&255,g=(base[b]>>8)&255,a=base[b]&255;
        rgb[b*5+k]=((uint32_t)clamp(r*factor,0,255)<<16)|((uint32_t)clamp(g*factor,0,255)<<8)|(uint32_t)clamp(a*factor,0,255);
    }
}
int ct_palette_read(const char *path,uint32_t rgb[CT_PALETTE_SIZE])
{
    FILE *f=fopen(path,"r"); unsigned i,v; uint32_t temp[CT_PALETTE_SIZE]; char extra;
    if(!f) return 0;
    for(i=0;i<CT_PALETTE_SIZE;i++) if(fscanf(f,"%x",&v)!=1 || v>0xffffffu) { fclose(f); return 0; } else temp[i]=v;
    if(fscanf(f," %c",&extra)==1) { fclose(f); return 0; }
    if(fclose(f)) return 0;
    memcpy(rgb,temp,sizeof(temp)); return 1;
}
int ct_key_equal(ct_key a,ct_key b)
{ return a.planet_id==b.planet_id && a.generation==b.generation && a.face==b.face && a.lod==b.lod && a.x==b.x && a.y==b.y; }
int ct_key_valid(const ct_world *w,ct_key k)
{
    return w && k.planet_id==w->cfg.planet_id && k.generation==w->stats.generation &&
        k.face<6 && k.lod<=w->cfg.surface_lod && k.x<(1u<<k.lod) && k.y<(1u<<k.lod);
}
int ct_key_at(const ct_world *w,ct_vec3 d,unsigned lod,ct_key *out,double *lx,double *ly)
{
    ct_face f; double u,v,x,y; unsigned count,ix,iy;
    if(!w || !out || lod>w->cfg.surface_lod || !ct_project(d,&f,&u,&v)) return 0;
    count=1u<<lod; x=clamp((u+1)*0.5*count,0,count); y=clamp((v+1)*0.5*count,0,count);
    ix=(unsigned)fmin(floor(x),count-1); iy=(unsigned)fmin(floor(y),count-1);
    *out=(ct_key){w->cfg.planet_id,w->stats.generation,(uint32_t)f,lod,ix,iy};
    if(lx) *lx=(x-ix)*CT_CORE;
    if(ly) *ly=(y-iy)*CT_CORE;
    return 1;
}
int ct_key_direction(ct_key k,double lx,double ly,ct_vec3 *out)
{
    double count;
    if(k.lod>16 || k.face>=6 || k.x>=(1u<<k.lod) || k.y>=(1u<<k.lod)) return 0;
    count=(double)(1u<<k.lod);
    return ct_direction((ct_face)k.face,2*(k.x+lx/CT_CORE)/count-1,2*(k.y+ly/CT_CORE)/count-1,out);
}
int ct_key_metric(const ct_world *w,ct_key k,double lx,double ly,ct_vec3 *dx,ct_vec3 *dy)
{
    ct_vec3 d,a,b;
    if(!dx || !dy || !ct_key_valid(w,k) || !ct_key_direction(k,lx,ly,&d) ||
        !ct_key_direction(k,lx+0.5,ly,&a) || !ct_key_direction(k,lx-0.5,ly,&b)) return 0;
    *dx=scale(sub(a,b),w->cfg.radius_m);
    ct_key_direction(k,lx,ly+0.5,&a); ct_key_direction(k,lx,ly-0.5,&b);
    *dy=scale(sub(a,b),w->cfg.radius_m); return 1;
}
static uint64_t chunk_hash(const ct_chunk *c)
{
    size_t i; uint64_t h=UINT64_C(14695981039346656037);
    h=hash_u64(h,c->key.planet_id); h=hash_u64(h,c->key.generation);
    h=hash_u64(h,c->key.face); h=hash_u64(h,c->key.lod); h=hash_u64(h,c->key.x); h=hash_u64(h,c->key.y);
    h=hash_u64(h,bits(c->height_quantum_m)); h=hash_u64(h,c->clipped_samples);
    for(i=0;i<CT_SAMPLES;i++) {
        h=hash_u64(h,(uint64_t)c->height[i] | ((uint64_t)c->water[i]<<16) | ((uint64_t)c->biome[i]<<32) | ((uint64_t)c->palette[i]<<40));
    }
    return h;
}
int ct_chunk_generate(const ct_world *w,ct_key k,ct_chunk *out)
{
    unsigned x,y;
    if(!out || !ct_key_valid(w,k)) return 0;
    out->key=k; out->height_quantum_m=w->cfg.height_quantum_m; out->clipped_samples=0;
    for(y=0;y<CT_GRID;y++) for(x=0;x<CT_GRID;x++) {
        ct_vec3 d; ct_sample s; size_t i=(size_t)y*CT_GRID+x; int clip;
        ct_key_direction(k,x,y,&d); if(!ct_world_sample(w,d,&s)) return 0;
        out->height[i]=ct_height_encode(s.height_m,w->cfg.height_quantum_m,&clip); out->clipped_samples+=(unsigned)clip;
        out->water[i]=ct_height_encode(s.water_m,w->cfg.height_quantum_m,&clip); out->clipped_samples+=(unsigned)clip;
        out->biome[i]=s.biome; out->palette[i]=s.palette_index;
    }
    out->digest=chunk_hash(out); return 1;
}

/* Wire files use explicit little-endian fields, never fwrite(struct). */
static int put(FILE *f,uint64_t x,unsigned n)
{ unsigned i; for(i=0;i<n;i++) if(fputc((int)((x>>(8*i))&255),f)==EOF) return 0; return 1; }
static int get(FILE *f,uint64_t *v,unsigned n)
{ unsigned i; int c; *v=0; for(i=0;i<n;i++) { c=fgetc(f); if(c==EOF) return 0; *v|=(uint64_t)(unsigned)c<<(8*i); } return 1; }
static int put_double(FILE *f,double x) { return put(f,bits(x),8); }
static int get_double(FILE *f,double *d) { uint64_t u; if(!get(f,&u,8)) return 0; memcpy(d,&u,8); return isfinite(*d); }
static int save_config(FILE *f,const ct_config *c)
{
    size_t i;
    if(!put(f,c->seed,8)||!put(f,c->planet_id,8)||!put(f,c->macro_resolution,4)||!put(f,c->surface_lod,4)||!put(f,NK,4)) return 0;
    for(i=0;i<NK;i++) if(!put_double(f,cfg_val(c,i))) return 0;
    return 1;
}
static int load_config(FILE *f,ct_config *c)
{
    uint64_t v; size_t i;
    ct_config_defaults(c);
    if(!get(f,&c->seed,8)||!get(f,&c->planet_id,8)||!get(f,&v,4)) return 0;
    c->macro_resolution=(uint32_t)v; if(!get(f,&v,4)) return 0; c->surface_lod=(uint32_t)v;
    if(!get(f,&v,4)||v!=NK) return 0;
    for(i=0;i<NK;i++) if(!get_double(f,cfg_ptr(c,i))) return 0;
    return 1;
}
int ct_world_save(const ct_world *w,const char *path)
{
    FILE *f; uint32_t i; int ok;
    if(!w || !path || !(f=fopen(path,"wb"))) return 0;
    ok=fwrite("CTWORLD2",1,8,f)==8 && put(f,CT_ALGORITHM_VERSION,4) && save_config(f,&w->cfg) && put(f,w->stats.generation,8);
    for(i=0;ok && i<w->stats.vertices;i++) {
        const node *p=&w->nodes[i]; unsigned k;
        ok=put_double(f,p->shape)&&put_double(f,p->height)&&put_double(f,p->water)&&put(f,p->lake,4);
        for(k=0;ok && k<CT_REGION_COUNT;k++) ok=put_double(f,p->region[k]);
    }
    if(fclose(f)) ok=0;
    return ok;
}
ct_world *ct_world_load(const char *path,char *e,size_t n)
{
    FILE *f; char magic[8]; ct_config c; ct_world *w=NULL; uint64_t v,digest; uint32_t i;
    if(!path || !(f=fopen(path,"rb"))) { fail(e,n,"cannot open world snapshot"); return NULL; }
    if(fread(magic,1,8,f)!=8 || memcmp(magic,"CTWORLD2",8) || !get(f,&v,4) || v!=CT_ALGORITHM_VERSION ||
        !load_config(f,&c) || !get(f,&digest,8)) goto bad;
    w=topology(&c,e,n); if(!w) { fclose(f); return NULL; }
    for(i=0;i<w->stats.vertices;i++) {
        node *p=&w->nodes[i]; unsigned k; double total=0;
        if(!get_double(f,&p->shape)||fabs(p->shape)>4||!get_double(f,&p->height)||!get_double(f,&p->water)||!get(f,&v,4)||v>w->stats.vertices) goto bad;
        p->lake=(uint32_t)v; if(p->lake>w->stats.lakes) w->stats.lakes=p->lake;
        for(k=0;k<CT_REGION_COUNT;k++) {
            if(!get_double(f,&p->region[k]) || p->region[k]<0 || p->region[k]>1) goto bad;
            total+=p->region[k];
        }
        if(fabs(total-1)>1e-10) goto bad;
    }
    w->stats.generation=world_hash(w);
    if(w->stats.generation!=digest || fgetc(f)!=EOF || ferror(f)) goto bad;
    fclose(f); return w;
bad:
    fclose(f); ct_world_destroy(w); fail(e,n,"invalid, truncated, incompatible, or corrupt world snapshot"); return NULL;
}
static int put_key(FILE *f,ct_key k)
{ return put(f,k.planet_id,8)&&put(f,k.generation,8)&&put(f,k.face,4)&&put(f,k.lod,4)&&put(f,k.x,4)&&put(f,k.y,4); }
static int get_key(FILE *f,ct_key *k)
{
    uint64_t v;
    if(!get(f,&k->planet_id,8)||!get(f,&k->generation,8)||!get(f,&v,4)) return 0;
    k->face=(uint32_t)v; if(!get(f,&v,4)) return 0; k->lod=(uint32_t)v;
    if(!get(f,&v,4)) return 0;
    k->x=(uint32_t)v; if(!get(f,&v,4)) return 0; k->y=(uint32_t)v;
    return k->face<6 && k->lod<=16 && k->x<(1u<<k->lod) && k->y<(1u<<k->lod);
}
int ct_chunk_save(const ct_chunk *c,const char *path)
{
    FILE *f; size_t i; int ok;
    if(!c || !path || !(f=fopen(path,"wb"))) return 0;
    ok=fwrite("CTCHUNK1",1,8,f)==8 && put_key(f,c->key) && put_double(f,c->height_quantum_m) && put(f,c->digest,8) && put(f,c->clipped_samples,4);
    for(i=0;ok && i<CT_SAMPLES;i++) ok=put(f,c->height[i],2)&&put(f,c->water[i],2)&&put(f,c->biome[i],1)&&put(f,c->palette[i],1);
    if(fclose(f)) ok=0;
    return ok;
}
int ct_chunk_load(const char *path,ct_chunk *c)
{
    FILE *f; char magic[8]; size_t i; uint64_t v; int ok=0;
    if(!c || !path || !(f=fopen(path,"rb"))) return 0;
    if(fread(magic,1,8,f)!=8 || memcmp(magic,"CTCHUNK1",8) || !get_key(f,&c->key) ||
       !get_double(f,&c->height_quantum_m) || c->height_quantum_m<0.001 || c->height_quantum_m>100 ||
       !get(f,&c->digest,8) || !get(f,&v,4) || v>2*CT_SAMPLES) goto done;
    c->clipped_samples=(uint32_t)v;
    for(i=0;i<CT_SAMPLES;i++) {
        if(!get(f,&v,2)) goto done;
        c->height[i]=(uint16_t)v; if(!get(f,&v,2)) goto done;
        c->water[i]=(uint16_t)v; if(!get(f,&v,1)||v>=8) goto done;
        c->biome[i]=(uint8_t)v; if(!get(f,&v,1)||v>=CT_PALETTE_SIZE) goto done;
        c->palette[i]=(uint8_t)v;
    }
    ok=chunk_hash(c)==c->digest && fgetc(f)==EOF && !ferror(f);
done:
    fclose(f); return ok;
}
int ct_chunk_write_core_u16(const ct_chunk *c,const char *path)
{
    FILE *f=fopen(path,"wb"); unsigned x,y; int ok=1;
    if(!f) return 0;
    for(y=0;y<CT_CORE;y++) for(x=0;x<CT_CORE;x++) if(!put(f,c->height[y*CT_GRID+x],2)) ok=0;
    if(fclose(f)) ok=0;
    return ok;
}
int ct_chunk_write_ppm(const ct_chunk *c,const uint32_t pal[CT_PALETTE_SIZE],const char *path)
{
    FILE *f=fopen(path,"wb"); unsigned x,y; int ok=1;
    if(!f) return 0;
    if(fprintf(f,"P6\n256 256\n255\n")<0) ok=0;
    for(y=0;y<CT_CORE;y++) for(x=0;x<CT_CORE;x++) {
        unsigned idx=c->palette[y*CT_GRID+x]; uint32_t p=pal[idx<CT_PALETTE_SIZE ? idx:0];
        if(fputc((p>>16)&255,f)==EOF || fputc((p>>8)&255,f)==EOF || fputc(p&255,f)==EOF) ok=0;
    }
    if(fclose(f)) ok=0;
    return ok;
}
